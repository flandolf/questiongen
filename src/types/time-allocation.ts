import type { Difficulty, QuestionMode } from './generator';

export type TimeAllocation = {
  difficulty: Difficulty;
  questionMode?: QuestionMode; // undefined means applies to both modes
  minutesPerQuestion: number;
  marksPerQuestion: number;
};

export type TimeAllocationConfig = TimeAllocation[];
