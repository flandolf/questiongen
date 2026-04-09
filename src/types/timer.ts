export interface QuestionTiming {
  marks: number;
  elapsedSeconds: number;
  runningSinceMs: number | null;
  answeredAt: number | null;
  lastUpdatedAt: number;
  isWarning: boolean;
}

export interface TimerState {
  questions: Record<string, QuestionTiming>;
  activeQuestionId: string | null;
  isPaused: boolean;
  sessionStartedAt: number | null;
  sessionFinishedAt: number | null;
}

export function createEmptyTimer(): TimerState {
  return {
    questions: {},
    activeQuestionId: null,
    isPaused: false,
    sessionStartedAt: null,
    sessionFinishedAt: null,
  };
}

export function createQuestionTiming(marks: number): QuestionTiming {
  return {
    marks,
    elapsedSeconds: 0,
    runningSinceMs: null,
    answeredAt: null,
    lastUpdatedAt: Date.now(),
    isWarning: false,
  };
}
