import { createChatGPTProxyProvider } from '@opencoredev/loginwithchatgpt-ai';

const CHATGPT_BASE_PATH = 'http://localhost:41732/api/chatgpt';

export function getChatGPTBasePath(): string {
  return CHATGPT_BASE_PATH;
}

export const chatGPTFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, credentials: 'include' });

export async function hasChatGPTSession(): Promise<boolean> {
  try {
    const response = await chatGPTFetch(`${CHATGPT_BASE_PATH}/session`);
    if (!response.ok) return false;

    const session = (await response.json()) as { status?: string };
    return session.status === 'authenticated';
  } catch {
    return false;
  }
}

export async function listChatGPTModels(): Promise<string[]> {
  if (!(await hasChatGPTSession())) return [];

  return createChatGPTProxyProvider({
    basePath: CHATGPT_BASE_PATH,
    credentials: 'include',
    fetch: chatGPTFetch,
  }).listModels();
}
