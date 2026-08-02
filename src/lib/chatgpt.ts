import { createChatGPTProxyProvider } from '@opencoredev/loginwithchatgpt-ai';

const CHATGPT_BASE_PATH = 'http://localhost:41732/api/chatgpt';

export function getChatGPTBasePath(): string {
  return CHATGPT_BASE_PATH;
}

export const chatGPTFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, credentials: 'include' });

export async function listChatGPTModels(): Promise<string[]> {
  return createChatGPTProxyProvider({
    basePath: CHATGPT_BASE_PATH,
    credentials: 'include',
    fetch: chatGPTFetch,
  }).listModels();
}
