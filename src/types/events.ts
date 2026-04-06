import type { Topic } from './catalog';
import type { QuestionMode } from './generator';

export type GenerationStatusStage =
  | 'allocating_subtopics'
  | 'preparing'
  | 'generating'
  | 'parsing'
  | 'completed'
  | 'failed';

/** Shown when the client splits generation into multiple API calls (per focus subtopic). */
export type GenerationSubCallProgress = {
  current: number;
  total: number;
};

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
  topic: Topic;
  questionCount: number;
  status: 'waiting' | 'active' | 'done' | 'error';
  stage?: string;
  message?: string;
  errorMessage?: string;
}
