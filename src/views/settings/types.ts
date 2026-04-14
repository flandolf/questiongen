export interface ModelStats {
  tpsP50: number | null;
  promptPricePerToken: number | null;
  completionPricePerToken: number | null;
  contextLength: number | null;
  supportsStructuredOutput: boolean;
  name: string | null;
  latencyP50: number | null;
  uptimeLast30m: number | null;
  supportsImages: boolean | null;
  supportsFiles: boolean | null;
}

export interface CreditsInfo {
  totalCredits: number;
  totalUsage: number;
  remaining: number;
}

export interface ModelSearchResult {
  id: string;
  name: string;
  tpsP50: number | null;
  uptimeLast30m: number | null;
  promptPricePerToken: number | null;
  completionPricePerToken: number | null;
  contextLength: number | null;
  latencyP50: number | null;
  supportsStructuredOutput: boolean;
  supportsImages: boolean;
}

export type SortKey =
  | 'speed'
  | 'priceIn'
  | 'priceOut'
  | 'priceCombined'
  | 'latency'
  | 'context';
export type SortDir = 'asc' | 'desc';
export type Section =
  | 'api'
  | 'models'
  | 'credits'
  | 'appearance'
  | 'goals'
  | 'generation'
  | 'tutor'
  | 'time-allocation'
  | 'debug'
  | 'sync'
  | 'cleanup'
  | 'import-export'
  | 'logs';

export type ImageValidationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'supported' }
  | { status: 'unsupported' }
  | { status: 'error'; message: string };

export interface StatsColumn {
  stats: ModelStats | null;
  label: string;
  loading: boolean;
}

export const APP_VERSION = '3.4.0';
