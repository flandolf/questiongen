import type { PersistedGeneratorPreferences } from './persistence';

export type StudyGoals = {
  dailyQuestionGoal: number;
  dailyWrittenGoal: number;
  dailyMcGoal: number;
  weeklyStreakGoal: number;
};

export type StreakData = {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;
  dailyCompletions: Record<
    string,
    { total: number; written: number; mc: number }
  >;
};

export type Preset = {
  id: string;
  name: string;
  preferences: PersistedGeneratorPreferences;
  createdAt: string;
  updatedAt: string;
  lastModified?: number;
};
