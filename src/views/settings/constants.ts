import type { PresetModel } from '@/types/provider';

export const PRESET_MODELS = [
  {
    id: 'google/gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    providerId: 'openrouter',
  },
  {
    id: 'google/gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    providerId: 'openrouter',
  },
  { id: 'openai/gpt-5.5', name: 'GPT-5.5', providerId: 'openrouter' },
  { id: 'openai/gpt-5.4-nano', name: 'GPT-5.4 Nano', providerId: 'openrouter' },
  { id: 'openai/gpt-5.4-mini', name: 'GPT-5.4 Mini', providerId: 'openrouter' },
];

export const PRESET_IMAGE_MODELS = [
  {
    id: 'google/gemini-3.1-flash-lite-preview',
    name: 'Gemini 3.1 Flash Lite',
    providerId: 'openrouter',
  },
  {
    id: 'google/gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    providerId: 'openrouter',
  },
  { id: 'openai/gpt-5.4-nano', name: 'GPT-5.4 Nano', providerId: 'openrouter' },
  { id: 'openai/gpt-5.4-mini', name: 'GPT-5.4 Mini', providerId: 'openrouter' },
  { id: 'x-ai/grok-4.20', name: 'Grok 4.20', providerId: 'openrouter' },
  { id: 'x-ai/grok-4.1-fast', name: 'Grok 4.1 Fast', providerId: 'openrouter' },
  {
    id: 'xiaomi/mimo-v2.5-omni:nitro',
    name: 'MiMo V2.5 Omni',
    providerId: 'openrouter',
  },
  {
    id: 'minimax/minimax-m2.7:nitro',
    name: 'Minimax M2.7',
    providerId: 'openrouter',
  },
  {
    id: 'qwen/qwen3.6-plus:nitro',
    name: 'Qwen 3.6 Plus',
    providerId: 'openrouter',
  },
  { id: 'custom', name: 'Custom…' },
];

/** Model presets for the DeepSeek API. */
export const DEEPSEEK_PRESET_MODELS = [
  {
    id: 'deepseek/deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    providerId: 'deepseek',
  },
  {
    id: 'deepseek/deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    providerId: 'deepseek',
  },
];

export const DEEPSEEK_PRESET_IMAGE_MODELS = [
  {
    id: 'deepseek/deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    providerId: 'deepseek',
  },
  { id: 'custom', name: 'Custom…' },
];

/**
 * Model presets for the NVIDIA NIM API. The leading `nvidia/`
 * is an app-side provider prefix; it is stripped before requests.
 *
 * Models with `:thinking` or `-thinking` suffix expose chain-of-thought
 * tokens natively — left here for users who want to copy them as-is.
 */
export const NVIDIA_PRESET_MODELS = [
  {
    id: 'nvidia/moonshotai/kimi-k2.6',
    name: 'Kimi K 2.6',
    providerId: 'nvidia',
  },
  {
    id: 'nvidia/mistralai/mistral-large-3-675b-instruct-2512',
    name: 'Mistral Large 3 675B Instruct 2512',
    providerId: 'nvidia',
  },
  { id: 'custom', name: 'Custom…' },
];

export const NVIDIA_PRESET_IMAGE_MODELS = [
  {
    id: 'nvidia/moonshotai/kimi-k2.6',
    name: 'Kimi K 2.6',
    providerId: 'nvidia',
  },
  {
    id: 'nvidia/mistralai/mistral-large-3-675b-instruct-2512',
    name: 'Mistral Large 3 675B Instruct 2512',
    providerId: 'nvidia',
  },
  { id: 'custom', name: 'Custom…' },
];

/**
 * Extract a human-readable API provider label from a model id.
 *
 * The legacy shape-only logic has been preserved for places that
 * don't have access to the providers store. Prefer
 * `getProviderLabelForModel` from `@/types/provider` for accurate
 * routing. This helper is kept as a fallback for render layers that
 * only have the model id and an active provider id.
 */
export function getProviderLabel(
  modelId: string,
  activeProviderId?: string,
): string {
  if (!modelId || modelId === 'custom') return '';
  if (modelId.startsWith('deepseek/')) {
    return 'DeepSeek';
  }
  if (modelId.split('/')[0] === 'nvidia' && modelId.split('/').length >= 3) {
    return 'NVIDIA NIM';
  }
  if (modelId.includes('/')) {
    if (activeProviderId === 'nvidia') return 'NVIDIA NIM';
    return 'OpenRouter';
  }
  return '';
}

/** Preset text models for the active provider. */
export function getModelsForProvider(
  providerId = 'openrouter',
): PresetModel[] {
  if (providerId === 'nvidia') return NVIDIA_PRESET_MODELS;
  if (providerId === 'deepseek') return DEEPSEEK_PRESET_MODELS;
  if (providerId !== 'openrouter') {
    return [{ id: 'custom', name: 'Custom…', providerId }];
  }
  return PRESET_MODELS;
}

export function getImageModelsForProvider(
  _providerId?: string,
): typeof PRESET_IMAGE_MODELS {
  return PRESET_IMAGE_MODELS;
}

export const TUTOR_PERSONA_PRESETS = [
  {
    id: 'socratic',
    name: 'Socratic Tutor',
    description: 'Guides step-by-step without giving answers.',
    prompt:
      'You are a helpful VCE tutor. Guide the student step-by-step using the Socratic method. Ask leading questions to help them discover the solution themselves. Do not give away the final answer immediately. Focus on conceptual understanding.',
  },
  {
    id: 'examiner',
    name: 'Strict Examiner',
    description: 'Focuses on marking criteria and exam technique.',
    prompt:
      'You are a strict VCE examiner. Focus heavily on marking criteria, specific terminology required by GLFW, and exam technique. Be concise and direct. Point out exactly where marks would be lost in a real exam scenario.',
  },
  {
    id: 'explainer',
    name: 'Concept Explainer',
    description: 'Provides deep intuitive explanations.',
    prompt:
      'You are an expert educator who excels at simplifying complex concepts. Use analogies and clear, intuitive language to explain the underlying theory. Ensure the student understands the "why" behind the formulas and steps.',
  },
  {
    id: 'encouraging',
    name: 'Supportive Coach',
    description: 'High encouragement and positive reinforcement.',
    prompt:
      'You are a supportive and encouraging study coach. Maintain a positive, motivating tone. Break tasks into manageable chunks and celebrate progress. Help the student build confidence while correcting errors gently.',
  },
];

export const MARKER_STYLES = [
  'strict',
  'relaxed',
  'targeted',
  'custom',
] as const;

export const MARKER_STYLE_OPTIONS = [
  {
    id: 'strict',
    name: 'Strict',
    description: 'Criterion-based, penalizes errors strictly.',
  },
  {
    id: 'relaxed',
    name: 'Relaxed',
    description: 'Flexible, encourages partial understanding.',
  },
  {
    id: 'targeted',
    name: 'Targeted',
    description: 'Focuses on specific syllabus outcomes.',
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Define your own marking style.',
  },
];
