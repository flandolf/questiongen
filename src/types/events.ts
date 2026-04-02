import type { QuestionMode } from './generator';

export type GenerationStatusStage =
  | 'preparing'
  | 'generating'
  | 'parsing'
  | 'completed'
  | 'failed';

export type GenerationStatusEvent = {
  mode: QuestionMode;
  stage: GenerationStatusStage;
  message: string;
  attempt: number;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  estimatedCostUsd?: number;
  durationMs?: number;
};

export type GenerationTokenEvent = {
  text: string;
};

export interface BatchTopicProgress {
  topic: import('./catalog').Topic;
  questionCount: number;
  status: 'waiting' | 'active' | 'done' | 'error';
  stage?: string;
  message?: string;
  errorMessage?: string;
}
