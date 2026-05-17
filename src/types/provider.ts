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

export interface ProviderState {
  config: ProviderConfig;
  apiKey: string;
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
  return {
    config,
    apiKey: '',
    modelSelections: {
      model: 'openai/gpt-5.4-mini',
      markingModel: 'openai/gpt-5.4-mini',
      useSeparateMarkingModel: false,
      imageMarkingModel: 'openai/gpt-5.4-mini',
      useSeparateImageMarkingModel: false,
      tutorModel: 'openai/gpt-5.4-mini',
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
