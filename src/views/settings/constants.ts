export const PRESET_MODELS = [
  { id: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro' },
  { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash' },
  { id: 'google/gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite' },
  { id: 'openai/gpt-5.4', name: 'GPT-5.4' },
  { id: 'openai/gpt-5.4-nano', name: 'GPT-5.4 Nano' },
  { id: 'openai/gpt-5.4-mini', name: 'GPT-5.4 Mini' },
  { id: 'x-ai/grok-4.20', name: 'Grok 4.20' },
  { id: 'x-ai/grok-4.1-fast', name: 'Grok 4.1 Fast' },
  { id: 'xiaomi/mimo-v2.5-pro', name: 'MiMo V2.5 Pro' },
  { id: 'xiaomi/mimo-v2.5-omni', name: 'MiMo V2.5 Omni' },
  { id: 'minimax/minimax-m2.7', name: 'Minimax M2.7' },
  { id: 'qwen/qwen3.6-plus', name: 'Qwen 3.6 Plus' },
  { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
  { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
  { id: 'openai/gpt-oss-120b:nitro', name: 'GPT-OSS 120B (Nitro)' },
  { id: 'custom', name: 'Custom…' },
];

export const PRESET_IMAGE_MODELS = [
  { id: 'google/gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite' },
  { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash' },
  { id: 'openai/gpt-5.4-nano', name: 'GPT-5.4 Nano' },
  { id: 'openai/gpt-5.4-mini', name: 'GPT-5.4 Mini' },
  { id: 'x-ai/grok-4.20', name: 'Grok 4.20' },
  { id: 'x-ai/grok-4.1-fast', name: 'Grok 4.1 Fast' },
  { id: 'xiaomi/mimo-v2.5-omni', name: 'MiMo V2.5 Omni' },
  { id: 'minimax/minimax-m2.7', name: 'Minimax M2.7' },
  { id: 'qwen/qwen3.6-plus', name: 'Qwen 3.6 Plus' },
  { id: 'custom', name: 'Custom…' },
];

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
