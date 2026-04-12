import type {
  ChemistrySubtopic,
  Difficulty,
  GeneratedQuestion,
  GenerationRecord,
  GenerationStatusEvent,
  GenerationStrategy,
  GenerationTelemetry,
  LogEntry,
  MarkAnswerResponse,
  MathMethodsSubtopic,
  McHistoryEntry,
  McQuestion,
  PersistedAppState,
  PhysicalEducationSubtopic,
  Preset,
  QuestionHistoryEntry,
  QuestionMode,
  ReviewQuality,
  SavedQuestionSet,
  SpacedRepetitionCard,
  SpecialistMathSubtopic,
  StreakData,
  StudentAnswerImage,
  StudyGoals,
  TechMode,
  TimeAllocationConfig,
  Topic,
} from '@/types';
import type { TimerState } from '@/types/timer';

export interface AppState {
  // ── Hydration ──────────────────────────────────────────────────────────────
  isHydrated: boolean;

  // ── Settings ───────────────────────────────────────────────────────────────
  apiKey: string;
  showApiKey: boolean;
  model: string;
  markingModel: string;
  useSeparateMarkingModel: boolean;
  imageMarkingModel: string;
  useSeparateImageMarkingModel: boolean;
  debugMode: boolean;
  questionTextSize: number;
  responseTextSize: number;
  includeExamContext: boolean;
  autoSyncIntervalMinutes: number;
  syncApiKey: boolean;
  localBackupFolderPath: string;
  localBackupIntervalMinutes: number;
  theme: string;
  tutorPersona: string;
  tutorModel: string;

  // ── Preferences ────────────────────────────────────────────────────────────
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

  // ── AI Difficulty Scaling ──────────────────────────────────────────────────
  aiDifficultyScalingEnabled: boolean;
  difficultyThresholds: { increase: number; decrease: number };
  // ── Generation flags ─────────────────────────────────────────────────────
  diversityStrictness: 'lenient' | 'moderate' | 'strict';
  strictLatexValidation: boolean;
  strictSubtopicCoverage: boolean;
  minSubtopicCoverageRatio: number;
  shuffleSubtopics: boolean;
  generationStrategy: GenerationStrategy;

  // ── Written session ────────────────────────────────────────────────────────
  questions: GeneratedQuestion[];
  activeQuestionIndex: number;
  writtenQuestionPresentedAtById: Record<string, number>;
  answersByQuestionId: Record<string, string>;
  imagesByQuestionId: Record<string, StudentAnswerImage | undefined>;
  feedbackByQuestionId: Record<string, MarkAnswerResponse>;
  questionHistory: QuestionHistoryEntry[];
  writtenRawModelOutput: string;
  writtenGenerationTelemetry: GenerationTelemetry | null;
  activeWrittenSavedSetId: string | null;

  // ── MC session ─────────────────────────────────────────────────────────────
  mcQuestions: McQuestion[];
  activeMcQuestionIndex: number;
  mcQuestionPresentedAtById: Record<string, number>;
  mcAnswersByQuestionId: Record<string, string>;
  mcHistory: McHistoryEntry[];
  mcRawModelOutput: string;
  mcGenerationTelemetry: GenerationTelemetry | null;
  activeMcSavedSetId: string | null;

  // ── Saved sets ─────────────────────────────────────────────────────────────
  savedSets: SavedQuestionSet[];

  // ── Generation / marking status ────────────────────────────────────────────
  isGenerating: boolean;
  generationStatus: GenerationStatusEvent | null;
  generationStartedAt: number | null;
  isMarking: boolean;
  errorMessage: string | null;

  // ── Spaced repetition ─────────────────────────────────────────────────────
  spacedRepetitionCards: Record<string, SpacedRepetitionCard>;

  // ── Study goals & streaks ─────────────────────────────────────────────────
  studyGoals: StudyGoals;
  streakData: StreakData;

  // ── Time allocations ───────────────────────────────────────────────────────
  timeAllocations: TimeAllocationConfig;

  generationHistory: GenerationRecord[];

  // ─── Generator Parameter Presets (Firebase-synced) ─────────────
  presets: Preset[];

  // ── Timer v2 ───────────────────────────────────────────────────
  writtenTimer: TimerState | null;
  mcTimer: TimerState | null;

  // ── Logs ──────────────────────────────────────────────────────
  logs: LogEntry[];
}

export interface AppActions {
  // Preset management (Firebase-synced)
  setPresets: (presets: Preset[]) => void;
  addPreset: (preset: Preset) => void;
  updatePreset: (preset: Preset) => void;
  deletePreset: (id: string) => void;
  // Settings
  setApiKey: (key: string) => void;
  setShowApiKey: (show: boolean) => void;
  setModel: (model: string) => void;
  setMarkingModel: (model: string) => void;
  setUseSeparateMarkingModel: (enabled: boolean) => void;
  setImageMarkingModel: (model: string) => void;
  setUseSeparateImageMarkingModel: (enabled: boolean) => void;
  setDebugMode: (enabled: boolean) => void;
  clearApiKey: () => void;
  setQuestionTextSize: (size: number) => void;
  setResponseTextSize: (size: number) => void;
  setIncludeExamContext: (enabled: boolean) => void;
  setAutoSyncIntervalMinutes: (minutes: number) => void;
  setSyncApiKey: (enabled: boolean) => void;
  setLocalBackupFolderPath: (path: string) => void;
  setLocalBackupIntervalMinutes: (minutes: number) => void;
  setTheme: (theme: string) => void;
  setTutorPersona: (persona: string) => void;
  setTutorModel: (model: string) => void;

  // Preferences
  setSelectedTopics: (topics: Topic[] | ((prev: Topic[]) => Topic[])) => void;
  setDifficulty: (level: Difficulty) => void;
  setTechMode: (mode: TechMode) => void;
  setAvoidSimilarQuestions: (enabled: boolean) => void;
  setMathMethodsSubtopics: (
    subtopics:
      | MathMethodsSubtopic[]
      | ((prev: MathMethodsSubtopic[]) => MathMethodsSubtopic[]),
  ) => void;
  setSpecialistMathSubtopics: (
    subtopics:
      | SpecialistMathSubtopic[]
      | ((prev: SpecialistMathSubtopic[]) => SpecialistMathSubtopic[]),
  ) => void;
  setChemistrySubtopics: (
    subtopics:
      | ChemistrySubtopic[]
      | ((prev: ChemistrySubtopic[]) => ChemistrySubtopic[]),
  ) => void;
  setPhysicalEducationSubtopics: (
    subtopics:
      | PhysicalEducationSubtopic[]
      | ((prev: PhysicalEducationSubtopic[]) => PhysicalEducationSubtopic[]),
  ) => void;
  setQuestionCount: (count: number) => void;
  setAverageMarksPerQuestion: (marks: number) => void;
  setQuestionMode: (mode: QuestionMode) => void;

  // AI Difficulty Scaling
  setAiDifficultyScalingEnabled: (enabled: boolean) => void;
  setDifficultyThresholds: (thresholds: {
    increase: number;
    decrease: number;
  }) => void;
  // Generation flags
  setDiversityStrictness: (level: 'lenient' | 'moderate' | 'strict') => void;
  setStrictLatexValidation: (enabled: boolean) => void;
  setStrictSubtopicCoverage: (enabled: boolean) => void;
  setMinSubtopicCoverageRatio: (ratio: number) => void;
  setShuffleSubtopics: (enabled: boolean) => void;
  setGenerationStrategy: (strategy: GenerationStrategy) => void;

  // Written session
  setQuestions: (questions: GeneratedQuestion[]) => void;
  setActiveQuestionIndex: (idx: number) => void;
  setWrittenQuestionPresentedAtById: (
    presentedAt:
      | Record<string, number>
      | ((prev: Record<string, number>) => Record<string, number>),
  ) => void;
  setAnswersByQuestionId: (
    answers:
      | Record<string, string>
      | ((prev: Record<string, string>) => Record<string, string>),
  ) => void;
  setImagesByQuestionId: (
    images:
      | Record<string, StudentAnswerImage | undefined>
      | ((
          prev: Record<string, StudentAnswerImage | undefined>,
        ) => Record<string, StudentAnswerImage | undefined>),
  ) => void;
  setFeedbackByQuestionId: (
    feedback:
      | Record<string, MarkAnswerResponse>
      | ((
          prev: Record<string, MarkAnswerResponse>,
        ) => Record<string, MarkAnswerResponse>),
  ) => void;
  setQuestionHistory: (
    history:
      | QuestionHistoryEntry[]
      | ((prev: QuestionHistoryEntry[]) => QuestionHistoryEntry[]),
  ) => void;
  setWrittenRawModelOutput: (output: string) => void;
  setWrittenGenerationTelemetry: (
    telemetry: GenerationTelemetry | null,
  ) => void;
  setActiveWrittenSavedSetId: (id: string | null) => void;

  // MC session
  setMcQuestions: (questions: McQuestion[]) => void;
  setActiveMcQuestionIndex: (idx: number) => void;
  setMcQuestionPresentedAtById: (
    presentedAt:
      | Record<string, number>
      | ((prev: Record<string, number>) => Record<string, number>),
  ) => void;
  setMcAnswersByQuestionId: (
    answers:
      | Record<string, string>
      | ((prev: Record<string, string>) => Record<string, string>),
  ) => void;
  setMcHistory: (
    history: McHistoryEntry[] | ((prev: McHistoryEntry[]) => McHistoryEntry[]),
  ) => void;
  setMcRawModelOutput: (output: string) => void;
  setMcGenerationTelemetry: (telemetry: GenerationTelemetry | null) => void;
  setActiveMcSavedSetId: (id: string | null) => void;

  // Generation / marking status
  setIsGenerating: (is: boolean) => void;
  setGenerationStatus: (status: GenerationStatusEvent | null) => void;
  setGenerationStartedAt: (startedAt: number | null) => void;
  setIsMarking: (is: boolean) => void;
  setErrorMessage: (msg: string | null) => void;

  // Saved sets
  saveCurrentSet: () => string | null;
  loadSavedSet: (savedSetId: string) => void;
  needsSaveBeforeLoad: (savedSetId: string) => boolean;
  deleteSavedSet: (savedSetId: string) => void;
  deleteAllSavedSets: () => void;
  deleteQuestionHistoryEntry: (id: string) => void;
  deleteMcHistoryEntry: (id: string) => void;
  addQuestionHistoryEntry: (entry: QuestionHistoryEntry) => void;
  addMcHistoryEntry: (entry: McHistoryEntry) => void;
  updateQuestionHistoryEntry: (entry: QuestionHistoryEntry) => void;
  updateMcHistoryEntry: (entry: McHistoryEntry) => void;
  clearQuestionHistory: () => void;
  clearMcHistory: () => void;

  // Spaced repetition
  reviewSpacedCard: (questionId: string, quality: ReviewQuality) => void;
  getDueCards: () => Array<{ questionId: string; card: SpacedRepetitionCard }>;

  // Study goals & streaks
  setStudyGoals: (goals: Partial<StudyGoals>) => void;
  recordCompletion: (mode: QuestionMode) => void;
  getTodayCompletions: () => { total: number; written: number; mc: number };

  // Time allocations
  setTimeAllocations: (allocations: TimeAllocationConfig) => void;

  // Persistence
  hydrate: () => Promise<void>;

  addGenerationRecord: (record: GenerationRecord) => void;

  // Timer v2
  setWrittenTimer: (state: TimerState | null) => void;
  setMcTimer: (state: TimerState | null) => void;

  // Logs
  addLog: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;

  // Import / Export
  importState: (imported: PersistedAppState) => void;
}

export type Updater<T> = T | ((prev: T) => T);
