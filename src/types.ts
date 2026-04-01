import SUBTOPIC_CATALOG from './shared/subtopic-catalog.json';

// ─── Shared subtopic catalog (frontend + backend) ───────────────────────────

type CatalogSubtopicEntry = {
  name: string;
  instruction: string | null;
  group?: string;
};

type CatalogTopicEntry = {
  name: string;
  icon?: string;
  examPdfs?: string[];
  reportPdfs?: string[];
  examGuidance?: string;
  subtopics: CatalogSubtopicEntry[];
};

const CATALOG = SUBTOPIC_CATALOG as {
  topics: CatalogTopicEntry[];
};

export function getSubtopics(topicName: string): readonly string[] {
  const topic = CATALOG.topics.find((entry) => entry.name === topicName);
  return topic ? topic.subtopics.map((subtopic) => subtopic.name) : [];
}

export function getTopicIcon(topicName: string): string {
  const topic = CATALOG.topics.find((entry) => entry.name === topicName);
  return topic?.icon ?? 'BookOpen';
}

export function getTopicExamPdfs(topicName: string): string[] {
  const topic = CATALOG.topics.find((entry) => entry.name === topicName);
  return topic?.examPdfs ?? [];
}

export function getTopicReportPdfs(topicName: string): string[] {
  const topic = CATALOG.topics.find((entry) => entry.name === topicName);
  return topic?.reportPdfs ?? [];
}

export function getTopicExamGuidance(topicName: string): string {
  const topic = CATALOG.topics.find((entry) => entry.name === topicName);
  return topic?.examGuidance ?? '';
}

export function getTopicNames(): string[] {
  return CATALOG.topics.map((t) => t.name);
}

// ─── PE subtopic groups (derived from catalog group field, NOT index slicing) ─

const PE_GROUP_LABELS: Record<string, { unit: string; aos: string }> = {
  'unit3-skill-acquisition': { unit: 'Unit 3', aos: 'Skill Acquisition' },
  'unit3-biomechanics': { unit: 'Unit 3', aos: 'Biomechanics' },
  'unit3-energy-systems': { unit: 'Unit 3', aos: 'Energy Systems' },
  'unit4-foundations': { unit: 'Unit 4', aos: 'Foundations' },
  'unit4-training': { unit: 'Unit 4', aos: 'Training Principles and Methods' },
  'unit4-adaptations': { unit: 'Unit 4', aos: 'Adaptations and Monitoring' },
  'unit4-integration': { unit: 'Unit 4', aos: 'Integration and Application' },
};

export type PhysicalEducationSubtopicGroup = {
  unit: string;
  aos: string;
  label: string;
  subtopics: readonly string[];
};

function derivePEGroups(): PhysicalEducationSubtopicGroup[] {
  const pe = CATALOG.topics.find((t) => t.name === 'Physical Education');
  if (!pe) return [];

  const groups = new Map<string, string[]>();
  for (const sub of pe.subtopics) {
    if (sub.group) {
      if (!groups.has(sub.group)) groups.set(sub.group, []);
      groups.get(sub.group)!.push(sub.name);
    }
  }

  const result: PhysicalEducationSubtopicGroup[] = [];
  for (const [groupId, subs] of groups) {
    const meta = PE_GROUP_LABELS[groupId] ?? {
      unit: groupId.split('-')[0].replace(/^unit/, 'Unit '),
      aos: groupId.split('-').slice(1).join(' '),
    };
    result.push({
      unit: meta.unit,
      aos: meta.aos,
      label: `${meta.unit} — ${meta.aos}`,
      subtopics: subs,
    });
  }

  return result;
}

export const PE_SUBTOPIC_GROUPS: readonly PhysicalEducationSubtopicGroup[] =
  derivePEGroups();

// ─── Generator Parameter Preset ─────────────────────────────────────────────

export type Preset = {
  id: string; // UUID or Firestore doc id
  name: string; // User-facing name
  preferences: PersistedGeneratorPreferences;
  createdAt: string; // ISO date
  updatedAt: string; // ISO date
  lastModified?: number;
};
export type Difficulty =
  | 'Essential Skills'
  | 'Easy'
  | 'Medium'
  | 'Hard'
  | 'Extreme';

export type TechMode = 'tech-free' | 'tech-active' | 'mix';

export const MATH_METHODS_SUBTOPICS = getSubtopics('Mathematical Methods');

export type MathMethodsSubtopic = string;

export const SPECIALIST_MATH_SUBTOPICS = getSubtopics('Specialist Mathematics');

export type SpecialistMathSubtopic = string;

export const PHYSICAL_EDUCATION_SUBTOPICS = getSubtopics('Physical Education');

export type PhysicalEducationSubtopic = string;

export const CHEMISTRY_SUBTOPICS = getSubtopics('Chemistry');

export type ChemistrySubtopic = string;

export type Topic =
  | 'Mathematical Methods'
  | 'Specialist Mathematics'
  | 'Chemistry'
  | 'Physical Education';

export type GeneratedQuestion = {
  id: string;
  topic: string;
  subtopic?: string;
  promptMarkdown: string;
  maxMarks: number;
  techAllowed?: boolean;
  distinctnessScore?: number;
  multiStepDepth?: number;
};

export type GenerationTelemetry = {
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  distinctnessAvg?: number;
  multiStepDepthAvg?: number;
};

export type GenerationRecord = {
  id: string;
  timestamp: string;
  inputs: {
    topic: Topic;
    difficulty: Difficulty;
    questionCount: number;
    questionMode: QuestionMode;
    techMode: TechMode;
    averageMarksPerQuestion?: number;
    subtopics?: string[]; // Array of selected subtopics
    customFocusArea?: string; // Custom focus area text
  };
  outputs: GenerationTelemetry;
};

export type GenerationStatusStage =
  | 'preparing'
  | 'generating'
  | 'parsing'
  | 'completed'
  | 'failed';

export type GenerationStatusEvent = {
  mode: QuestionMode;
  stage: GenerationStatusStage;
  message: string;
  attempt: number;
  // Fields present only in the "completed" event:
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  estimatedCostUsd?: number;
  durationMs?: number;
};

/** Fired for every SSE token chunk during streaming generation. */
export type GenerationTokenEvent = {
  text: string;
};

export type GenerateQuestionsResponse = {
  questions: GeneratedQuestion[];
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  distinctnessAvg?: number;
  multiStepDepthAvg?: number;
};

export type MarkAnswerResponse = {
  verdict: string;
  achievedMarks: number;
  maxMarks: number;
  scoreOutOf10: number;
  vcaaMarkingScheme: MarkingCriterion[];
  comparisonToSolutionMarkdown: string;
  feedbackMarkdown: string;
  workedSolutionMarkdown: string;
  exemplarResponseMarkdown?: string;
};

export type MarkingCriterion = {
  criterion: string;
  achievedMarks: number;
  maxMarks: number;
  rationale: string;
};

export type StudentAnswerImage = {
  name: string;
  dataUrl: string;
};

export type WrittenAttemptKind = 'initial' | 'appeal' | 'override';
export type McAttemptKind = 'initial' | 'appeal' | 'override';

export type AnswerAnalytics = {
  attemptSequence: number;
  answerCharacterCount: number;
  answerWordCount: number;
  usedImageUpload: boolean;
  responseLatencyMs?: number;
};

export type WrittenAnswerAnalytics = AnswerAnalytics & {
  attemptKind: WrittenAttemptKind;
  markingLatencyMs?: number;
};

export type McAnswerAnalytics = AnswerAnalytics & {
  attemptKind?: McAttemptKind;
  finalAnswerChangedAtMs?: number;
};

export type QuestionHistoryEntry = {
  id: string;
  createdAt: string;
  lastModified?: number;
  question: GeneratedQuestion;
  uploadedAnswer: string;
  uploadedAnswerImage?: StudentAnswerImage;
  workedSolutionMarkdown: string;
  markResponse: MarkAnswerResponse;
  generationTelemetry?: GenerationTelemetry;
  analytics?: WrittenAnswerAnalytics;
};

export type BackendError = {
  code?: string;
  message?: string;
};

export const TOPICS: Topic[] = CATALOG.topics.map(
  (topic) => topic.name as Topic
);

export const API_KEY_STORAGE_KEY = 'questiongen.openrouterApiKey';
export const QUESTION_HISTORY_STORAGE_KEY = 'questiongen.history';
export const MC_HISTORY_STORAGE_KEY = 'questiongen.mcHistory';
export const DEBUG_MODE_STORAGE_KEY = 'questiongen.debugMode';
export const APP_STATE_STORAGE_KEY = 'questiongen.appState';

export const PERSISTED_APP_STATE_VERSION = 2;

export type QuestionMode = 'written' | 'multiple-choice';
export type GenerationMode = 'practice' | 'exam';

export type McOption = {
  label: string;
  text: string;
};

export type McQuestion = {
  id: string;
  topic: string;
  subtopic?: string;
  promptMarkdown: string;
  options: McOption[];
  correctAnswer: string;
  explanationMarkdown: string;
  techAllowed?: boolean;
  distinctnessScore?: number;
  multiStepDepth?: number;
};

export type GenerateMcQuestionsResponse = {
  questions: McQuestion[];
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  distinctnessAvg?: number;
  multiStepDepthAvg?: number;
};

export type McHistoryEntry = {
  type: 'multiple-choice';
  id: string;
  createdAt: string;
  lastModified?: number;
  question: McQuestion;
  selectedAnswer: string;
  correct: boolean;
  awardedMarks?: number;
  maxMarks?: number;
  generationTelemetry?: GenerationTelemetry;
  analytics?: McAnswerAnalytics;
};

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
  generationMode?: GenerationMode;
  examTimeLimitMinutes?: number;
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
  examHistory?: ExamRecord[];
  generationHistory?: GenerationRecord[];
  presets?: Preset[];
  writtenTimerState?: PersistedTimerState | null;
  mcTimerState?: PersistedTimerState | null;
  deletionTombstones?: Record<string, Record<string, number>>;
};

// ─── Per-Question Timing ──────────────────────────────────────────────────────

/** Public timing snapshot for a single question. Returned by useQuestionTimer. */
export type PerQuestionTiming = {
  /** Allocated seconds (may grow after bank redistribution) */
  timeLimitSeconds: number;
  /** Original par-time before any redistribution */
  originalTimeLimitSeconds: number;
  /** Wall-clock ms when question was first presented */
  startedAt: number | null;
  /** Wall-clock ms when question was answered / submitted */
  answeredAt: number | null;
  /** Effective seconds used (pauses excluded; frozen once answered) */
  timeUsedSeconds: number;
  /** True once the per-question clock hits zero in exam mode */
  isExpired: boolean;
  /** True when the user finished before their allocation ran out */
  finishedEarly: boolean;
  /** Snapshot of global pausedDurationMs at the moment this question was presented */
  pausedDurationMsAtPresentation: number;
};

/** Session-level timer state shape (mirrors the hook's internal state). */
export type QuestionTimerState = {
  byQuestionId: Record<string, PerQuestionTiming>;
  totalTimeLimitSeconds: number;
  sessionStartedAt: number | null;
  sessionFinishedAt: number | null;
  bankedSeconds: number;
  parTimeSeconds: number;
  isPaused: boolean;
  pausedDurationMs: number;
  activeQuestionIndex: number;
  mode: GenerationMode;
};

/** Serializable timer state for persistence (survives app restarts). */
export type PersistedTimerState = {
  byQuestionId: Record<string, PerQuestionTiming>;
  totalTimeLimitSeconds: number;
  sessionStartedAt: number | null;
  sessionFinishedAt: number | null;
  bankedSeconds: number;
  parTimeSeconds: number;
  isPaused: boolean;
  pausedDurationMs: number;
  activeQuestionIndex: number;
  mode: GenerationMode;
};

// ─── ExamRecord ─────────────────────────────────────────────────────────────

export type ExamRecord = {
  id: string;
  createdAt: string;
  topic: string;
  difficulty: Difficulty;
  questionMode: 'written' | 'multiple-choice';
  techMode: TechMode;
  questionCount: number;
  timeUsedSeconds: number;
  totalScore: number;
  totalMax: number;
  questionResults: ExamQuestionResult[];
  /** Per-question timing breakdown (populated by the new timing system) */
  perQuestionTiming?: Array<{
    questionId: string;
    timeUsedSeconds: number;
    timeLimitSeconds: number;
    finishedEarly: boolean;
  }>;
};

// ─── Spaced Repetition (SM-2) ─────────────────────────────────────────────────

export type SpacedRepetitionCard = {
  /** SM-2 easiness factor (≥ 1.3, starts at 2.5) */
  easinessFactor: number;
  /** Current interval in days */
  intervalDays: number;
  /** Number of consecutive correct reviews */
  repetitions: number;
  /** ISO date of the next scheduled review */
  nextReviewDate: string;
  /** ISO date of the last review */
  lastReviewDate: string;
  /** Quality of last review (0-5 SM-2 scale) */
  lastQuality: number;
  /** Total number of reviews */
  totalReviews: number;
  /** Number of correct reviews */
  correctReviews: number;
};

export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;

// ─── Study Goals & Streaks ────────────────────────────────────────────────────

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
  /** Map of date string (YYYY-MM-DD) → questions completed that day */
  dailyCompletions: Record<
    string,
    { total: number; written: number; mc: number }
  >;
};

// ─── Exam Simulation ──────────────────────────────────────────────────────────

export type ExamConfig = {
  topic: Topic;
  questionCount: number;
  /** Time limit in minutes */
  timeLimitMinutes: number;
  difficulty: Difficulty;
  techMode: TechMode;
  /** Whether questions must be answered sequentially (no skipping) */
  sequentialMode: boolean;
  /** Whether to show results only at the end */
  hideResultsUntilEnd: boolean;
};

export type ExamSessionState = {
  config: ExamConfig;
  questions: GeneratedQuestion[];
  answersByQuestionId: Record<string, string>;
  imagesByQuestionId: Record<string, StudentAnswerImage | undefined>;
  feedbackByQuestionId: Record<string, MarkAnswerResponse>;
  currentQuestionIndex: number;
  startedAt: number;
  /** null means time is still running */
  finishedAt: number | null;
  /** Seconds remaining */
  timeRemainingSeconds: number;
  isActive: boolean;
};

export type ExamQuestionResult = {
  questionId: string;
  topic: string;
  subtopic?: string;
  promptMarkdown: string;
  achievedMarks: number;
  maxMarks: number;
  correct: boolean;
  /** MC only */
  selectedAnswer?: string;
  /** MC only */
  correctAnswer?: string;
};

export interface BatchTopicProgress {
  topic: Topic;
  questionCount: number;
  status: 'waiting' | 'active' | 'done' | 'error';
  stage?: string;
  message?: string;
  errorMessage?: string;
}
