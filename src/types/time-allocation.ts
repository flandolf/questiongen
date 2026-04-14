import type { Difficulty, QuestionMode } from './generator';

export type TimeAllocation = {
  difficulty: Difficulty;
  questionMode?: QuestionMode; // undefined means applies to both modes
  minutesPerMark: number;
};

export type TimeAllocationConfig = TimeAllocation[];
