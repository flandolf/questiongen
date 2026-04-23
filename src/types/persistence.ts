import type { Topic } from './catalog';
import type {
  Difficulty,
  DiversityStrictness,
  GenerationStrategy,
  QuestionMode,
  TechMode,
} from './generator';
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
import type { Preset, StreakData, StudyGoals } from './study';
import type { GenerationTelemetry } from './telemetry';
import type { TimeAllocationConfig } from './time-allocation';
import type { TimerState } from './timer';

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
  syncApiKey?: boolean;
  /** Absolute path to a user-chosen folder for timed JSON exports (desktop app). */
  localBackupFolderPath?: string;
  /** Minutes between automatic exports; 0 disables. */
  localBackupIntervalMinutes?: number;
  /** Theme preference (design theme name from src/themes/designThemes.ts). */
  theme?: string;
  /** Custom persona prompt for the AI Tutor */
  tutorPersona?: string;
  /** Model ID for the AI Tutor */
  tutorModel?: string;
  customThemeSeedColor?: string;
  globalRounding?: 'sm' | 'md' | 'lg' | 'xl';
  interfaceFont?: string;
  headingFont?: string;
  shuffleSubtopics?: boolean;
  shuffleQuestions?: boolean;
  /** Marker style preset: strict, relaxed, targeted, or custom */
  markerStyle?: 'strict' | 'relaxed' | 'targeted' | 'custom';
  /** Custom marker style instructions (used when markerStyle is 'custom') */
  customMarkerStyle?: string;
};

export type PersistedGeneratorPreferences = {
  selectedTopics: Topic[];
  difficulty: Difficulty;
  techMode: TechMode;
  avoidSimilarQuestions: boolean;
  selectedSubtopics: Record<string, string[]>;
  questionCount: number;
  averageMarksPerQuestion: number;
  questionMode: QuestionMode;
  aiDifficultyScalingEnabled?: boolean;
  difficultyThresholds?: { increase: number; decrease: number };
  diversityStrictness: DiversityStrictness;
  strictLatexValidation: boolean;
  generationStrategy?: GenerationStrategy;
};

export type PersistedWrittenSession = {
  questions: GeneratedQuestion[];
  activeQuestionIndex: number;
  presentedAtByQuestionId: Record<string, number>;
  answersByQuestionId: Record<string, string>;
  imagesByQuestionId: Record<string, StudentAnswerImage | undefined>;
  activeTabByQuestionId?: Record<string, 'response' | 'upload' | 'sketchpad'>;
  feedbackByQuestionId: Record<string, MarkAnswerResponse>;
  rawModelOutput: string;
  generationTelemetry?: GenerationTelemetry | null;
  savedSetId?: string | null;
};

export type PersistedMcSession = {
  questions: McQuestion[];
  activeQuestionIndex: number;
  presentedAtByQuestionId: Record<string, number>;
  answersByQuestionId: Record<string, string>;
  rawModelOutput: string;
  generationTelemetry?: GenerationTelemetry | null;
  savedSetId?: string | null;
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
  studyGoals?: StudyGoals;
  streakData?: StreakData;
  generationHistory?: GenerationRecord[];
  presets?: Preset[];
  writtenTimer?: TimerState | null;
  mcTimer?: TimerState | null;
  timeAllocations: TimeAllocationConfig;
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
