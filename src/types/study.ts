import type {
  ChemistrySubtopic,
  MathMethodsSubtopic,
  PhysicalEducationSubtopic,
  SpecialistMathSubtopic,
  Topic,
} from './catalog';
import type { Difficulty, QuestionMode, TechMode } from './generator';

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
  preferences: PresetPreferences;
  createdAt: string;
  updatedAt: string;
  lastModified?: number;
};

export type PresetPreferences = {
  selectedTopics: Topic[];
  difficulty: Difficulty;
  techMode: TechMode;
  avoidSimilarQuestions: boolean;
  mathMethodsSubtopics?: MathMethodsSubtopic[];
  specialistMathSubtopics?: SpecialistMathSubtopic[];
  chemistrySubtopics?: ChemistrySubtopic[];
  physicalEducationSubtopics?: PhysicalEducationSubtopic[];
  questionCount: number;
  averageMarksPerQuestion: number;
  questionMode: QuestionMode;
};
