import type {
  BatchTopicProgress,
  CustomSubtopic,
  Difficulty,
  GeneratedQuestion,
  GenerationRecord,
  GenerationStatusEvent,
  GenerationStrategy,
  GenerationSubCallProgress,
  GenerationTelemetry,
  LogEntry,
  MarkAnswerResponse,
  McHistoryEntry,
  McQuestion,
  PdfMarkerHistoryEntry,
  PersistedAppState,
  Preset,
  PresetPreferences,
  QuestionHistoryEntry,
  QuestionMode,
  SavedQuestionSet,
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
  customThemeSeedColor: string;
  interfaceFont: string;
  headingFont: string;
  tutorPersona: string;
  tutorModel: string;
  markerStyle: 'strict' | 'relaxed' | 'targeted' | 'custom';
  customMarkerStyle: string;
  modelReasoningEnabled: boolean;
  modelReasoningEffort:
    | 'xhigh'
    | 'high'
    | 'medium'
    | 'low'
    | 'minimal'
    | 'none';

  // ── Preferences ────────────────────────────────────────────────────────────
  selectedTopics: Topic[];
  difficulty: Difficulty;
  techMode: TechMode;
  avoidSimilarQuestions: boolean;
  selectedSubtopics: Record<string, string[]>;
  questionCount: number;
  averageMarksPerQuestion: number;
  questionMode: QuestionMode;
  customFocusArea: string;

  // ── AI Difficulty Scaling ──────────────────────────────────────────────────
  aiDifficultyScalingEnabled: boolean;
  difficultyThresholds: { increase: number; decrease: number };
  // ── Generation flags ─────────────────────────────────────────────────────
  diversityStrictness: 'lenient' | 'moderate' | 'strict';
  strictLatexValidation: boolean;
  shuffleSubtopics: boolean;
  shuffleQuestions: boolean;
  generationStrategy: GenerationStrategy;

  // ── Written session ────────────────────────────────────────────────────────
  questions: GeneratedQuestion[];
  activeQuestionIndex: number;
  writtenQuestionPresentedAtById: Record<string, number>;
  answersByQuestionId: Record<string, string>;
  imagesByQuestionId: Record<string, StudentAnswerImage | undefined>;
  activeTabByQuestionId: Record<string, 'response' | 'upload' | 'sketchpad'>;
  feedbackByQuestionId: Record<string, MarkAnswerResponse>;
  questionHistory: QuestionHistoryEntry[];
  writtenRawModelOutput: string;
  writtenGenerationTelemetry: GenerationTelemetry | null;
  activeWrittenSavedSetId: string | null;
  markAppealByQuestionId: Record<string, string>;
  markOverrideInputByQuestionId: Record<string, string>;
  writtenMarkingDurationMsByQuestionId: Record<string, number>;
  writtenResponseEnteredAtById: Record<string, number>;

  // ── MC session ─────────────────────────────────────────────────────────────
  mcQuestions: McQuestion[];
  activeMcQuestionIndex: number;
  mcQuestionPresentedAtById: Record<string, number>;
  mcAnswersByQuestionId: Record<string, string>;
  mcHistory: McHistoryEntry[];
  mcRawModelOutput: string;
  mcGenerationTelemetry: GenerationTelemetry | null;
  activeMcSavedSetId: string | null;
  mcMarkOverrideInputByQuestionId: Record<string, string>;
  mcAwardedMarksByQuestionId: Record<string, number>;

  // ── Saved sets ─────────────────────────────────────────────────────────────
  savedSets: SavedQuestionSet[];

  // ── Generation / marking status ────────────────────────────────────────────
  isGenerating: boolean;
  generationStatus: GenerationStatusEvent | null;
  generationStartedAt: number | null;
  isMarking: boolean;
  errorMessage: string | null;
  isKeyboardShortcutsOpen: boolean;

  batchProgress: BatchTopicProgress[];
  generationSubCallProgress: GenerationSubCallProgress | null;
  streamTexts: Record<string, string>;

  // ── Study goals & streaks ─────────────────────────────────────────────────
  studyGoals: StudyGoals;
  streakData: StreakData;

  // ── Time allocations ───────────────────────────────────────────────────────
  timeAllocations: TimeAllocationConfig;

  generationHistory: GenerationRecord[];

  // ─── Generator Parameter Presets (Firebase-synced) ─────────────
  presets: Preset[];

  // ── Custom Subtopics ──────────────────────────────────────────────────────
  customSubtopics: Record<Topic, CustomSubtopic[]>;
  isLoadingCustomSubtopics: boolean;
  customSubtopicsSynced: boolean;

  // ── Timer v2 ───────────────────────────────────────────────────
  writtenTimer: TimerState | null;
  mcTimer: TimerState | null;

  // ── Logs ──────────────────────────────────────────────────────
  logs: LogEntry[];

  // ── PDF Marker ─────────────────────────────────────────────────────────────
  pdfMarkerPdfBase64: string | null;
  pdfMarkerQuestions: GeneratedQuestion[];
  pdfMarkerPageMapping: { questionIndex: number; pageIndices: number[] }[];
  pdfMarkerResultsByQuestionId: Record<string, MarkAnswerResponse>;
  pdfMarkerErrorsByQuestionId: Record<string, string>;
  pdfMarkerHistory: PdfMarkerHistoryEntry[];
  isPdfMarkerMarking: boolean;
  isPdfMarkerDiscovering: boolean;
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
  setCustomThemeSeedColor: (color: string) => void;
  setInterfaceFont: (font: string) => void;
  setHeadingFont: (font: string) => void;
  setTutorPersona: (persona: string) => void;
  setTutorModel: (model: string) => void;
  setMarkerStyle: (style: 'strict' | 'relaxed' | 'targeted' | 'custom') => void;
  setCustomMarkerStyle: (style: string) => void;
  setModelReasoningEnabled: (enabled: boolean) => void;
  setModelReasoningEffort: (
    effort: 'xhigh' | 'high' | 'medium' | 'low' | 'minimal' | 'none',
  ) => void;

  // Preferences
  setSelectedTopics: (topics: Topic[] | ((prev: Topic[]) => Topic[])) => void;
  setDifficulty: (level: Difficulty) => void;
  setTechMode: (mode: TechMode) => void;
  setAvoidSimilarQuestions: (enabled: boolean) => void;
  setSelectedSubtopics: (
    topic: Topic,
    subtopics: string[] | ((prev: string[]) => string[]),
  ) => void;
  toggleSubtopic: (topic: Topic, subtopic: string | string[]) => void;
  setQuestionCount: (count: number) => void;
  setAverageMarksPerQuestion: (marks: number) => void;
  setQuestionMode: (mode: QuestionMode) => void;
  setCustomFocusArea: (area: string) => void;

  // AI Difficulty Scaling
  setAiDifficultyScalingEnabled: (enabled: boolean) => void;
  setDifficultyThresholds: (thresholds: {
    increase: number;
    decrease: number;
  }) => void;
  // Generation flags
  setDiversityStrictness: (level: 'lenient' | 'moderate' | 'strict') => void;
  setStrictLatexValidation: (enabled: boolean) => void;
  setShuffleSubtopics: (enabled: boolean) => void;
  setShuffleQuestions: (enabled: boolean) => void;
  setGenerationStrategy: (strategy: GenerationStrategy) => void;
  applyPreferences: (prefs: Partial<PresetPreferences>) => void;
  resetPreferences: () => void;

  // Custom Subtopics
  customSubtopics: Record<Topic, CustomSubtopic[]>;
  isLoadingCustomSubtopics: boolean;
  customSubtopicsSynced: boolean;
  syncCustomSubtopics: () => Promise<void>;
  addCustomSubtopic: (topic: Topic, subtopic: CustomSubtopic) => Promise<void>;
  updateCustomSubtopic: (
    topic: Topic,
    subtopic: CustomSubtopic,
  ) => Promise<void>;
  deleteCustomSubtopic: (topic: Topic, subtopicId: string) => Promise<void>;

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
  setActiveTabByQuestionId: (
    questionId: string,
    tab: 'response' | 'upload' | 'sketchpad',
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
  setMarkAppealByQuestionId: (update: Updater<Record<string, string>>) => void;
  setMarkOverrideInputByQuestionId: (
    update: Updater<Record<string, string>>,
  ) => void;
  setWrittenMarkingDurationMsByQuestionId: (
    update: Updater<Record<string, number>>,
  ) => void;
  setWrittenResponseEnteredAtById: (
    update: Updater<Record<string, number>>,
  ) => void;

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
  setMcMarkOverrideInputByQuestionId: (
    update: Updater<Record<string, string>>,
  ) => void;
  setMcAwardedMarksByQuestionId: (
    update: Updater<Record<string, number>>,
  ) => void;

  // Generation / marking status
  setIsGenerating: (is: boolean) => void;
  setGenerationStatus: (status: GenerationStatusEvent | null) => void;
  setGenerationStartedAt: (startedAt: number | null) => void;
  setIsMarking: (is: boolean) => void;
  setErrorMessage: (msg: string | null) => void;
  setIsKeyboardShortcutsOpen: (isOpen: boolean) => void;

  setBatchProgress: (
    progress:
      | BatchTopicProgress[]
      | ((prev: BatchTopicProgress[]) => BatchTopicProgress[]),
  ) => void;
  setGenerationSubCallProgress: (
    progress: GenerationSubCallProgress | null,
  ) => void;
  setStreamText: (
    text: string | ((prev: string) => string),
    topic?: string,
  ) => void;

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
  deleteGenerationHistoryEntry: (id: string) => void;
  clearQuestionHistory: () => void;
  clearMcHistory: () => void;

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

  // Marking Actions
  submitWrittenAnswer: (markingModel: string) => Promise<void>;
  argueForWrittenMark: (markingModel: string) => Promise<void>;
  overrideWrittenMark: () => void;
  submitMcAnswer: (selectedLabel: string) => void;
  overrideMcMark: () => void;

  // Navigation Actions
  nextQuestion: () => void;
  prevQuestion: () => void;

  abortGeneration: () => Promise<void>;

  // Import / Export
  importState: (imported: PersistedAppState) => void;

  // PDF Marker Actions
  setPdfMarkerPdfBase64: (pdfBase64: string | null) => void;
  setPdfMarkerQuestions: (questions: GeneratedQuestion[]) => void;
  reorderPdfMarkerQuestions: (fromIndex: number, toIndex: number) => void;
  setPdfMarkerPageMapping: (
    mapping: { questionIndex: number; pageIndices: number[] }[],
  ) => void;
  markPdf: () => Promise<void>;
  markPdfSingle: (questionId: string) => Promise<void>;
  discoverPdfQuestions: () => Promise<void>;
  resetPdfMarker: () => void;
  clearPdfMarkerResults: () => void;
  deletePdfMarkerHistoryEntry: (id: string) => void;
  clearPdfMarkerHistory: () => void;
  loadPdfMarkerHistoryEntry: (id: string) => void;
}

export type Updater<T> = T | ((prev: T) => T);
