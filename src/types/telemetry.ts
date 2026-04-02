export type GenerationTelemetry = {
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  distinctnessAvg?: number;
  multiStepDepthAvg?: number;
};

export type GenerateQuestionsResponse = {
  questions: import('./questions').GeneratedQuestion[];
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  distinctnessAvg?: number;
  multiStepDepthAvg?: number;
};

export type GenerateMcQuestionsResponse = {
  questions: import('./questions').McQuestion[];
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  distinctnessAvg?: number;
  multiStepDepthAvg?: number;
};
