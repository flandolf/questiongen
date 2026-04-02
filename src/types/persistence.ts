import type {
  Topic,
  MathMethodsSubtopic,
  SpecialistMathSubtopic,
  ChemistrySubtopic,
  PhysicalEducationSubtopic,
} from './catalog';
import type { Difficulty, TechMode, QuestionMode } from './generator';
import type {
  GeneratedQuestion,
  McQuestion,
  StudentAnswerImage,
} from './questions';
import type { MarkAnswerResponse } from './marking';
import type { GenerationTelemetry } from './telemetry';
import type {
  QuestionHistoryEntry,
  McHistoryEntry,
  GenerationRecord,
} from './history';
import type { SpacedRepetitionCard } from './spaced-repetition';
import type { StudyGoals, StreakData, Preset } from './study';
import type { PersistedTimerState } from './timer';

export type PersistedSettings = {
  apiKey: string;
  model: string;
  markingModel: string;
  useSeparateMarkingModel: boolean;
  imageMarkingModel: string;
  useSeparateImageMarkingModel: boolean;
  debugMode: boolean;
  questionTextSize?: number;
  responseTextSize?: number;
  includeExamContext?: boolean;
  autoSyncIntervalMinutes?: number;
};

export type PersistedGeneratorPreferences = {
  selectedTopics: Topic[];
  difficulty: Difficulty;
  techMode: TechMode;
  avoidSimilarQuestions: boolean;
  mathMethodsSubtopics: MathMethodsSubtopic[];
  specialistMathSubtopics: SpecialistMathSubtopic[];
  chemistrySubtopics: ChemistrySubtopic[];
  physicalEducationSubtopics: PhysicalEducationSubtopic[];
  questionCount: number;
  averageMarksPerQuestion: number;
  questionMode: QuestionMode;
  aiDifficultyScalingEnabled?: boolean;
  difficultyThresholds?: { increase: number; decrease: number };
};

export type PersistedWrittenSession = {
  questions: GeneratedQuestion[];
  activeQuestionIndex: number;
  presentedAtByQuestionId: Record<string, number>;
  answersByQuestionId: Record<string, string>;
  imagesByQuestionId: Record<string, StudentAnswerImage | undefined>;
  feedbackByQuestionId: Record<string, MarkAnswerResponse>;
  rawModelOutput: string;
  generationTelemetry?: GenerationTelemetry | null;
  savedSetId?: string | null;
  timerState?: PersistedTimerState;
};

export type PersistedMcSession = {
  questions: McQuestion[];
  activeQuestionIndex: number;
  presentedAtByQuestionId: Record<string, number>;
  answersByQuestionId: Record<string, string>;
  rawModelOutput: string;
  generationTelemetry?: GenerationTelemetry | null;
  savedSetId?: string | null;
  timerState?: PersistedTimerState;
};

export type SavedQuestionSet = {
  id: string;
  title: string;
  questionMode: QuestionMode;
  createdAt: string;
  updatedAt: string;
  lastModified?: number;
  preferences: PersistedGeneratorPreferences;
  writtenSession?: PersistedWrittenSession;
  mcSession?: PersistedMcSession;
};

export type PersistedAppState = {
  version: number;
  settings: PersistedSettings;
  preferences: PersistedGeneratorPreferences;
  writtenSession: PersistedWrittenSession;
  mcSession: PersistedMcSession;
  questionHistory: QuestionHistoryEntry[];
  mcHistory: McHistoryEntry[];
  savedSets: SavedQuestionSet[];
  spacedRepetition?: Record<string, SpacedRepetitionCard>;
  studyGoals?: StudyGoals;
  streakData?: StreakData;
  generationHistory?: GenerationRecord[];
  presets?: Preset[];
  writtenTimerState?: PersistedTimerState | null;
  mcTimerState?: PersistedTimerState | null;
  deletionTombstones?: Record<string, Record<string, number>>;
};

export type SyncCollection =
  | 'questionHistory'
  | 'mcHistory'
  | 'savedSets'
  | 'presets'
  | 'studyGoals'
  | 'streakData';

export type SyncOpType = 'upsert' | 'delete';

export type SyncOperation = {
  id: string;
  collection: SyncCollection;
  opType: SyncOpType;
  entityId?: string;
  createdAt: number;
};

export type SyncQueueState = {
  operations: SyncOperation[];
  updatedAt: number;
};

export const PERSISTED_APP_STATE_VERSION = 2;

export const API_KEY_STORAGE_KEY = 'questiongen.openrouterApiKey';
export const QUESTION_HISTORY_STORAGE_KEY = 'questiongen.history';
export const MC_HISTORY_STORAGE_KEY = 'questiongen.mcHistory';
export const DEBUG_MODE_STORAGE_KEY = 'questiongen.debugMode';
export const APP_STATE_STORAGE_KEY = 'questiongen.appState';
