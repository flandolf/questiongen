/// <reference types="bun-types" />

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { createChatGPTProxyProvider } from '@opencoredev/loginwithchatgpt-ai';
import {
  type LanguageModelUsage,
  type ModelMessage,
  Output,
  jsonSchema,
  streamText,
} from 'ai';
import type {
  RateLimitBucket,
  StoredSession,
} from '@opencoredev/loginwithchatgpt-server';
import { createChatGPTAuth, handleChatGPTRequest } from './chatgpt';
import { SqliteKeyValueStore } from './local-store';

const DEFAULT_PORT = 41_732;
const ALLOWED_ORIGINS = [
  'http://localhost:1420',
  'http://tauri.localhost',
  'https://tauri.localhost',
  'tauri://localhost',
].join(',');

interface CompletionBody {
  model: string;
  instructions: string;
  input?: unknown;
  messages?: Array<{ role: string; content: unknown }>;
  responseFormat?: {
    type?: string;
    json_schema?: { name?: string; schema?: Record<string, unknown> };
  };
  maxOutputTokens?: number;
  temperature?: number;
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
}

interface UsagePayload {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  reasoningTokens: number;
}

function port(): number {
  const value = Number(process.env.QUESTIONGEN_CHATGPT_PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(value) || value < 1024 || value > 65_535) {
    throw new Error(
      'QUESTIONGEN_CHATGPT_PORT must be an integer between 1024 and 65535',
    );
  }
  return value;
}

async function loadOrCreateSecret(dataDirectory: string): Promise<string> {
  const path = join(dataDirectory, 'chatgpt.secret');
  try {
    const value = (await readFile(path, 'utf8')).trim();
    if (/^[a-f0-9]{64}$/i.test(value)) return value;
  } catch {
    // Create the per-installation secret below.
  }
  const value = randomBytes(32).toString('hex');
  await writeFile(path, value, { encoding: 'utf8', flag: 'w' });
  return value;
}

function authorized(request: Request, secret: string): boolean {
  const supplied = request.headers.get('x-questiongen-sidecar-secret') ?? '';
  const left = Buffer.from(supplied);
  const right = Buffer.from(secret);
  return left.length === right.length && timingSafeEqual(left, right);
}

function toUserMessage(input: unknown): ModelMessage {
  if (typeof input === 'string') return { role: 'user', content: input };
  if (!Array.isArray(input)) {
    return { role: 'user', content: JSON.stringify(input) };
  }

  const content = input.flatMap((part) => {
    if (!part || typeof part !== 'object') return [];
    const value = part as Record<string, unknown>;
    if (value.type === 'text' && typeof value.text === 'string') {
      return [{ type: 'text' as const, text: value.text }];
    }
    if (value.type === 'image_url') {
      const image = value.image_url as Record<string, unknown> | undefined;
      if (typeof image?.url === 'string') {
        return [{ type: 'image' as const, image: image.url }];
      }
    }
    if (value.type === 'file') {
      const file = value.file as Record<string, unknown> | undefined;
      if (typeof file?.file_data === 'string') {
        return [{
          type: 'file' as const,
          data: file.file_data,
          mediaType: 'application/pdf',
          filename:
            typeof file.filename === 'string' ? file.filename : 'document.pdf',
        }];
      }
    }
    return [];
  });
  return { role: 'user', content };
}

function toMessages(body: CompletionBody): ModelMessage[] {
  if (!body.messages?.length) return [toUserMessage(body.input ?? '')];
  return body.messages.flatMap((message) => {
    if (message.role === 'system') return [];
    if (message.role === 'assistant') {
      const content =
        typeof message.content === 'string'
          ? message.content
          : JSON.stringify(message.content);
      return [{ role: 'assistant' as const, content }];
    }
    return [toUserMessage(message.content)];
  });
}

function usagePayload(usage: LanguageModelUsage): UsagePayload {
  return {
    promptTokens: usage.inputTokens ?? 0,
    completionTokens: usage.outputTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
    reasoningTokens: usage.outputTokenDetails.reasoningTokens ?? 0,
  };
}

const dataDirectory =
  process.env.QUESTIONGEN_CHATGPT_DATA_DIR ??
  join(process.cwd(), '.questiongen-chatgpt');
await mkdir(dataDirectory, { recursive: true });
const secret = await loadOrCreateSecret(dataDirectory);
process.env.NODE_ENV = 'production';
process.env.LWC_SECRET = secret;
process.env.LWC_ALLOWED_ORIGINS ??= ALLOWED_ORIGINS;

const database = new Database(join(dataDirectory, 'chatgpt.sqlite'));
database.run('PRAGMA busy_timeout = 5000');
database.run('PRAGMA journal_mode = WAL');
const sessionStore = new SqliteKeyValueStore<StoredSession>(database, 'session');
const rateLimitStore = new SqliteKeyValueStore<RateLimitBucket>(database, 'rate');
const localStore = new SqliteKeyValueStore<string>(database, 'local');
const auth = createChatGPTAuth({ sessionStore, rateLimitStore });

async function chatgptRequest(request: Request): Promise<Response> {
  const response = await handleChatGPTRequest(request, auth);
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    const pair = setCookie.split(';', 1)[0];
    if (pair && !pair.endsWith('=')) localStore.set('cookie', pair);
  }
  if (new URL(request.url).pathname.endsWith('/logout') && response.ok) {
    localStore.delete('cookie');
  }
  return response;
}

async function completion(request: Request): Promise<Response> {
  if (!authorized(request, secret)) {
    return Response.json({ error: 'unauthorized' }, { status: 403 });
  }
  const cookie = localStore.get('cookie');
  if (!cookie) {
    return Response.json(
      { error: 'Connect a ChatGPT account in Settings first.' },
      { status: 401 },
    );
  }

  const body = (await request.json()) as CompletionBody;
  if (!body.model?.trim()) {
    return Response.json({ error: 'Model required.' }, { status: 400 });
  }

  const sessionRequest = new Request(
    `http://127.0.0.1:${port()}/api/chatgpt/session`,
    { headers: { cookie } },
  );
  const chatgpt = createChatGPTProxyProvider({
    fetch: auth.proxyFetch(sessionRequest),
    defaultModel: body.model,
  });
  const schema = body.responseFormat?.json_schema;

  try {
    const result = streamText({
      model: chatgpt(body.model),
      instructions: body.instructions,
      messages: toMessages(body),
      ...(schema?.schema
        ? {
            output: Output.object({
              name: schema.name ?? 'response',
              schema: jsonSchema(schema.schema),
            }),
          }
        : {}),
      ...(body.maxOutputTokens
        ? { maxOutputTokens: body.maxOutputTokens }
        : {}),
      ...(typeof body.temperature === 'number'
        ? { temperature: body.temperature }
        : {}),
      ...(body.reasoningEffort
        ? {
            headers: {
              'x-login-with-chatgpt-reasoning-effort': body.reasoningEffort,
            },
          }
        : {}),
    });
    const text = schema?.schema
      ? JSON.stringify(await result.output)
      : await result.text;
    return Response.json({ text, usage: usagePayload(await result.usage) });
  } catch (error) {
    const responseBody =
      error && typeof error === 'object' && 'responseBody' in error
        ? error.responseBody
        : undefined;
    const message =
      (error instanceof Error && error.message.trim()) ||
      (typeof responseBody === 'string' && responseBody.trim()) ||
      'ChatGPT request failed.';
    return Response.json({ error: message }, { status: 502 });
  }
}

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: port(),
  fetch: (request) => {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/health') return new Response('ok');
    if (pathname === '/internal/completion' && request.method === 'POST') {
      return completion(request);
    }
    return chatgptRequest(request);
  },
});

console.warn(
  `[questiongen-chatgpt] listening on http://localhost:${server.port}`,
);

async function shutdown(): Promise<void> {
  await server.stop();
  database.close();
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
