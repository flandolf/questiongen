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
  reasoningTokens?: number;
  estimatedCostUsd?: number;
  durationMs?: number;
};

export type GenerationTokenEvent = {
  text: string;
  topic?: string;
};

export interface BatchTopicProgress {
  topic: Topic;
  questionCount: number;
  status: 'waiting' | 'active' | 'done' | 'error';
  stage?: string;
  message?: string;
  errorMessage?: string;
}

// ─── Unified LLM Stream Events (backend → frontend) ─────────────────────────

export type ModelRoute = {
  providerId: string;
  modelId: string;
};

export type CostQuality =
  | 'actual'
  | 'priced'
  | 'manual'
  | 'estimated'
  | 'unknown';

export type LlmStreamEvent =
  | {
      event: 'start';
      requestId: string;
      task: string;
      route: ModelRoute;
      topic?: string;
      questionId?: string;
    }
  | {
      event: 'token';
      requestId: string;
      text: string;
    }
  | {
      event: 'usage';
      requestId: string;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      reasoningTokens: number;
      costUsd?: number;
      costQuality: CostQuality;
    }
  | {
      event: 'end';
      requestId: string;
    }
  | {
      event: 'error';
      requestId: string;
      code: string;
      message: string;
    };
