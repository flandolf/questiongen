export type ProviderId = 'openrouter' | 'deepseek' | 'custom';

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
}

export interface ProviderModelSelections {
  model: string;
  markingModel: string;
  useSeparateMarkingModel: boolean;
  imageMarkingModel: string;
  useSeparateImageMarkingModel: boolean;
  tutorModel: string;
}

export type KeyStatus = 'untested' | 'valid' | 'invalid';

export interface ProviderState {
  config: ProviderConfig;
  apiKey: string;
  keyStatus: KeyStatus;
  keyLastTestedAt: number | null;
  modelSelections: ProviderModelSelections;
}

export const BUILTIN_PROVIDERS: Record<string, ProviderConfig> = {
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
  },
};

export const DEFAULT_PROVIDER_ID = 'openrouter';

export function createDefaultProviderState(
  config: ProviderConfig,
): ProviderState {
  const defaultModel =
    config.id === 'deepseek' ? 'deepseek-v4-flash' : 'openai/gpt-5.4-mini';
  return {
    config,
    apiKey: '',
    keyStatus: 'untested',
    keyLastTestedAt: null,
    modelSelections: {
      model: defaultModel,
      markingModel: defaultModel,
      useSeparateMarkingModel: false,
      imageMarkingModel: defaultModel,
      useSeparateImageMarkingModel: false,
      tutorModel: defaultModel,
    },
  };
}

/** DeepSeek preset models (plain model IDs, no provider prefix needed). */
export const DEEPSEEK_PRESET_MODELS = [
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
];

export const DEEPSEEK_PRESET_IMAGE_MODELS = [
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
];

/** Determine which provider to use based on model ID. */
export function getProviderForModel(
  modelId: string,
  providers: Record<string, ProviderState>,
): string | null {
  // DeepSeek models are plain IDs without provider prefix
  const deepseekModelIds = ['deepseek-v4-flash', 'deepseek-v4-pro'];
  if (deepseekModelIds.includes(modelId)) {
    return providers['deepseek'] ? 'deepseek' : null;
  }
  // OpenRouter models have provider prefixes like 'openai/', 'google/', etc.
  return providers['openrouter'] ? 'openrouter' : null;
}

/** Get API credentials for a given model ID. */
export function getModelCredentials(
  modelId: string,
  providers: Record<string, ProviderState>,
): { apiKey: string; baseUrl: string } | null {
  const providerId = getProviderForModel(modelId, providers);
  if (!providerId) return null;
  const provider = providers[providerId];
  if (!provider?.apiKey) return null;
  return {
    apiKey: provider.apiKey,
    baseUrl: provider.config.baseUrl,
  };
}
