import type {
  GeneratedQuestion,
  McQuestion,
  StudentAnswerImage,
} from './questions';
import type { MarkAnswerResponse } from './marking';
import type { GenerationTelemetry } from './telemetry';
import type { Difficulty, TechMode, QuestionMode } from './generator';

export type WrittenAttemptKind = 'initial' | 'appeal' | 'override';
export type McAttemptKind = 'initial' | 'appeal' | 'override';

export type AnswerAnalytics = {
  attemptSequence: number;
  answerCharacterCount: number;
  answerWordCount: number;
  usedImageUpload: boolean;
  responseLatencyMs?: number;
};

export type WrittenAnswerAnalytics = AnswerAnalytics & {
  attemptKind: WrittenAttemptKind;
  markingLatencyMs?: number;
};

export type McAnswerAnalytics = AnswerAnalytics & {
  attemptKind?: McAttemptKind;
  finalAnswerChangedAtMs?: number;
};

export type QuestionHistoryEntry = {
  id: string;
  createdAt: string;
  lastModified?: number;
  question: GeneratedQuestion;
  uploadedAnswer: string;
  uploadedAnswerImage?: StudentAnswerImage;
  workedSolutionMarkdown: string;
  markResponse: MarkAnswerResponse;
  generationTelemetry?: GenerationTelemetry;
  analytics?: WrittenAnswerAnalytics;
  difficulty?: Difficulty;
};

export type McHistoryEntry = {
  type: 'multiple-choice';
  id: string;
  createdAt: string;
  lastModified?: number;
  question: McQuestion;
  selectedAnswer: string;
  correct: boolean;
  awardedMarks?: number;
  maxMarks?: number;
  generationTelemetry?: GenerationTelemetry;
  analytics?: McAnswerAnalytics;
  difficulty?: Difficulty;
};

export type GenerationRecord = {
  id: string;
  timestamp: string;
  inputs: {
    topic: string;
    difficulty: Difficulty;
    questionCount: number;
    questionMode: QuestionMode;
    techMode: TechMode;
    averageMarksPerQuestion?: number;
    subtopics?: string[];
    customFocusArea?: string;
  };
  outputs: GenerationTelemetry;
};
