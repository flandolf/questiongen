import type { GeneratedQuestion, McQuestion } from './questions';

export type GenerationQualityDiagnostics = {
  selectedSubtopics: string[];
  coveredSubtopics: string[];
  uncoveredSubtopics: string[];
  outOfScopeSubtopics: string[];
  latexIssueCount: number;
  latexIssueExamples: string[];
};

export type GenerationTelemetry = {
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  distinctnessAvg?: number;
  multiStepDepthAvg?: number;
  qualityDiagnostics?: GenerationQualityDiagnostics;
};

export type GenerateQuestionsResponse = {
  questions: GeneratedQuestion[];
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  distinctnessAvg?: number;
  multiStepDepthAvg?: number;
  qualityDiagnostics?: GenerationQualityDiagnostics;
};

export type GenerateMcQuestionsResponse = {
  questions: McQuestion[];
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  distinctnessAvg?: number;
  multiStepDepthAvg?: number;
  qualityDiagnostics?: GenerationQualityDiagnostics;
};
