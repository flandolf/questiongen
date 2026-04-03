export type PerQuestionTiming = {
  timeLimitSeconds: number;
  originalTimeLimitSeconds: number;
  startedAt: number | null;
  answeredAt: number | null;
  timeUsedSeconds: number;
  isExpired: boolean;
  finishedEarly: boolean;
  pausedDurationMsAtPresentation: number;
};

export type QuestionTimerState = {
  byQuestionId: Record<string, PerQuestionTiming>;
  totalTimeLimitSeconds: number;
  sessionStartedAt: number | null;
  sessionFinishedAt: number | null;
  isPaused: boolean;
  pausedDurationMs: number;
  activeQuestionIndex: number;
};

export type PersistedTimerState = {
  byQuestionId: Record<string, PerQuestionTiming>;
  totalTimeLimitSeconds: number;
  sessionStartedAt: number | null;
  sessionFinishedAt: number | null;
  isPaused: boolean;
  pausedDurationMs: number;
  activeQuestionIndex: number;
};
