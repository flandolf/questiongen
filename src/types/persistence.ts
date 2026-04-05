import type {
  ChemistrySubtopic,
  MathMethodsSubtopic,
  PhysicalEducationSubtopic,
  SpecialistMathSubtopic,
  Topic,
} from './catalog';
import type { Difficulty, QuestionMode, TechMode } from './generator';
import type {
  GenerationRecord,
  McHistoryEntry,
  QuestionHistoryEntry,
} from './history';
import type { MarkAnswerResponse } from './marking';
import type {
  GeneratedQuestion,
  McQuestion,
  StudentAnswerImage,
} from './questions';
import type { SpacedRepetitionCard } from './spaced-repetition';
import type { Preset, StreakData, StudyGoals } from './study';
import type { GenerationTelemetry } from './telemetry';
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

export const SYNC_COLLECTIONS = [
  'questionHistory',
  'mcHistory',
  'savedSets',
  'settings',
] as const;

export type SyncCollection = (typeof SYNC_COLLECTIONS)[number];

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
