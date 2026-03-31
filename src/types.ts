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

export const MATH_METHODS_SUBTOPICS = [
  // Unit 3 - Functions and Graphs
  'Functions and Graphs',
  'Transformation of Graphs',
  'Algebra and Structure',
  'Trigonometric Functions',
  'Exponential and Logarithmic Functions',
  'Differentiation',
  'Integration',
  // Unit 4 - Probability and Statistics
  'Probability and Statistics',
  'Discrete Random Variables',
  'Continuous Random Variables',
] as const;

export type MathMethodsSubtopic = (typeof MATH_METHODS_SUBTOPICS)[number];

export const SPECIALIST_MATH_SUBTOPICS = [
  // Unit 1 - Number and Algebra
  'Additional Algebra and Number Systems',
  'Sequences and Series',
  'Reciprocals and Rational Functions',
  'Combinatorics and Matrices',
  'Trigonometric Functions and Identities',
  'Proof',
  'Modulus',
  'Algorithms and Graph Theory',
  'Graphing relations',
  'Complex numbers',
  'Transformations and Vectors in the plane',
] as const;

export type SpecialistMathSubtopic = (typeof SPECIALIST_MATH_SUBTOPICS)[number];

export const PHYSICAL_EDUCATION_SUBTOPICS = [
  // UNIT 3: Movement Skills and Energy - Skill Acquisition
  'Movement Skill Classification: Fundamental, Sport-Specific, Open/Closed, Gross/Fine',
  'Discrete, Serial, and Continuous Motor Skills: Temporal Characteristics',
  'Stages of Learning: Cognitive, Associative, and Autonomous Stages',
  'Skill Acquisition Theories: Linear vs. Non-Linear Learning Models',
  'Learning Approaches: Direct Instruction vs. Constraint-Based Methods',
  'Practice Scheduling: Type (Whole/Part), Distribution (Massed/Distributed), and Variability (Blocked/Random)',
  'Feedback in Skill Acquisition: Intrinsic, Augmented, and Timing Optimization',
  'Psychological Factors in Learning: Confidence, Motivation, Arousal, and Concentration',
  'Coaching Strategies: Tailoring Instruction to Learner Needs and Performance Requirements',

  // UNIT 3: Movement Skills and Energy - Biomechanics
  'Linear and Angular Motion: Distance, Velocity, Force, and Torque in Movement',
  'Momentum and Impulse: Conservation and Application in Physical Activities',
  "Newton's Laws of Motion: Inertia, Acceleration, and Action-Reaction in Sport",
  'Projectile Motion: Release Angle, Height, Speed, and Optimal Performance Trajectories',
  'Center of Gravity, Base of Support, and Equilibrium: Balance and Stability Principles',
  'Third Class Lever Systems: Mechanical Advantage and Force Application',
  'Qualitative Movement Analysis: Systematic Observation, Evaluation, and Error Correction',
  'Video Analysis and Biomechanical Assessment: Tools for Movement Improvement',

  // UNIT 3: Movement Skills and Energy - Energy Systems
  'ATP-CP System: High-Intensity Energy Supply and Recovery Characteristics',
  'Anaerobic Glycolysis: Glucose Breakdown, Lactate Production, and Duration Capacity',
  'Aerobic System: Oxidative Phosphorylation and Sustained Energy Production',
  'Energy System Interplay: ATP-CP to Anaerobic to Aerobic Transition by Intensity and Duration',
  'Oxygen Uptake: Oxygen Deficit, Steady State, and EPOC Recovery',
  'VO2 Max and Lactate Inflection Point: Aerobic Capacity and Anaerobic Threshold',
  'Fatigue Mechanisms: Metabolic, Muscular, Thermoregulatory, and Central Fatigue',
  'Nutrition and Hydration Strategies: Fueling Performance and Enhancing Recovery',

  // UNIT 4: Training to Improve Performance - Foundations
  'Activity Analysis: Identifying Skill Frequencies, Movement Patterns, and Physiological Demands',
  'Fitness Assessment: Testing Aerobic, Anaerobic, Strength, Endurance, Flexibility, Speed, and Agility',
  'Test Reliability, Validity, and Accuracy: Standardized Protocols and Error Minimization',
  'Pre-Participation Screening and Informed Consent',

  // UNIT 4: Training to Improve Performance - Training Principles and Methods
  'Training Principles: Frequency, Intensity, Time/Duration, Type, and Progression',
  'Training Adaptation: Specificity, Individuality, Variety, and Diminishing Returns',
  'Periodization and Planning: Macrocycles, Mesocycles, Microcycles, Tapering, and Detraining',
  'Continuous and Interval Training: Steady-Intensity vs. High-Intensity Work-Rest Intervals',
  'Specialized Training Methods: Fartlek, Circuit, Weight/Resistance, Flexibility, and Plyometric Training',
  'Training Components: Warm-Up, Conditioning Phase, and Cool-Down Structure',
  'Overtraining Syndrome: Prevention, Recognition, and Management',

  // UNIT 4: Training to Improve Performance - Adaptations and Monitoring
  'Cardiovascular Adaptations: Increased Stroke Volume, Cardiac Output, and VO2 Max',
  'Respiratory Adaptations: Enhanced Oxygen Extraction and Capillarization',
  'Muscular Adaptations: Strength Gains, Hypertrophy, Power Development, and Fiber Type Changes',
  'Aerobic vs. Anaerobic Training Adaptations: Differential System Responses',
  'Lactate Threshold and Metabolic Efficiency: Improved Lactate Tolerance and Fat Oxidation',
  'Training Monitoring: Physiological, Psychological, and Sociological Data Collection',
  'Training Diaries, Digital Tools, and Wearable Technology: Tracking Progress and Adjustments',
  'Program Evaluation and Modification: Effectiveness Assessment and Data-Driven Adjustments',

  // UNIT 4: Training to Improve Performance - Integration and Application
  'Skill Acquisition and Training Integration: Combining Practice Scheduling With Training Methods',
  'Biomechanical Optimization Within Training: Movement Efficiency and Technique Refinement',
  'Energy System Alignment: Matching Training Methods to Physiological Activity Demands',
  'Sport-Specific Performance Analysis: Integrated Assessment of Skill, Fitness, and Technique',
  'Holistic Athlete Development: Physical, Psychological, and Social Integration',
  'Recovery Strategies: Sleep, Nutrition, Active Recovery, and Regeneration Techniques',
  'Fatigue Management: Balancing Training Stimulus With Recovery',
  'Interdisciplinary Performance Optimization: Connecting Biomechanics, Physiology, and Psychology',
] as const;

export type PhysicalEducationSubtopic =
  (typeof PHYSICAL_EDUCATION_SUBTOPICS)[number];

export type PhysicalEducationSubtopicGroup = {
  unit: string;
  aos: string;
  label: string;
  subtopics: readonly PhysicalEducationSubtopic[];
};

export const PE_SUBTOPIC_GROUPS: readonly PhysicalEducationSubtopicGroup[] = [
  {
    unit: 'Unit 3',
    aos: 'Skill Acquisition',
    label: 'Unit 3 — Skill Acquisition',
    subtopics: PHYSICAL_EDUCATION_SUBTOPICS.slice(0, 9),
  },
  {
    unit: 'Unit 3',
    aos: 'Biomechanics',
    label: 'Unit 3 — Biomechanics',
    subtopics: PHYSICAL_EDUCATION_SUBTOPICS.slice(9, 17),
  },
  {
    unit: 'Unit 3',
    aos: 'Energy Systems',
    label: 'Unit 3 — Energy Systems',
    subtopics: PHYSICAL_EDUCATION_SUBTOPICS.slice(17, 25),
  },
  {
    unit: 'Unit 4',
    aos: 'Foundations of Training',
    label: 'Unit 4 — Foundations of Training',
    subtopics: PHYSICAL_EDUCATION_SUBTOPICS.slice(25, 29),
  },
  {
    unit: 'Unit 4',
    aos: 'Training Principles and Methods',
    label: 'Unit 4 — Training Principles and Methods',
    subtopics: PHYSICAL_EDUCATION_SUBTOPICS.slice(29, 36),
  },
  {
    unit: 'Unit 4',
    aos: 'Adaptations and Monitoring',
    label: 'Unit 4 — Adaptations and Monitoring',
    subtopics: PHYSICAL_EDUCATION_SUBTOPICS.slice(36, 44),
  },
  {
    unit: 'Unit 4',
    aos: 'Integration and Application',
    label: 'Unit 4 — Integration and Application',
    subtopics: PHYSICAL_EDUCATION_SUBTOPICS.slice(44, 53),
  },
] as const;

export const CHEMISTRY_SUBTOPICS = [
  'Periodic Trends: Structure, Periodic Organisation, and Critical or Endangered Elements',
  'Molecular Structure: Lewis Structures, VSEPR Geometry, Polarity, and Intermolecular Forces',
  'Metallic Bonding: Metallic Lattices and the Reactivity Series',
  'Ionic Chemistry: Ionic Bonding, Precipitation Reactions, and Solubility Tables',
  'Chemical Quantities: Moles, Molar Mass, Percentage Composition, and Empirical/Molecular Formulas',
  'Separation Techniques: Chromatography and Rf Value Identification',
  'Organic Classification: Alkanes, Alkenes, Alcohols, Carboxylic Acids, Haloalkanes, and IUPAC Naming',
  'Polymer Chemistry: Addition and Condensation Polymerisation, Plastics, and Recycling',
  'Sustainability: Green Chemistry, Circular Economy, and Sustainable Development',
  'Water Chemistry: Hydrogen Bonding and Unique Physical Properties of Water',
  'Acid–Base Chemistry: Brønsted–Lowry Theory, pH, Neutralisation, and Applications',
  'Redox Chemistry: Electron Transfer, Half-Equations, Displacement, and Corrosion',
  'Solutions: Concentration Units and Solubility Relationships',
  'Volumetric Analysis: Acid–Base Titration, Standard Solutions, and Indicators',
  'Gas Chemistry: Ideal Gas Equation and Greenhouse Gases',
  'Analytical Techniques: Electrical Conductivity, Stoichiometry, and Colorimetry/UV–Vis Spectroscopy',
] as const;

export type ChemistrySubtopic = (typeof CHEMISTRY_SUBTOPICS)[number];

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

export const TOPICS: Topic[] = [
  'Mathematical Methods',
  'Specialist Mathematics',
  'Chemistry',
  'Physical Education',
];

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
