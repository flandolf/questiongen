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
  'Functions and Graphs',
  'Transformation of Graphs',
  'Algebra and Structure',
  'Trigonometric Functions',
  'Exponential and Logarithmic Functions',
  'Differentiation',
  'Integration',
  'Probability and Statistics',
  'Discrete Random Variables',
  'Continuous Random Variables',
] as const;

export type MathMethodsSubtopic = (typeof MATH_METHODS_SUBTOPICS)[number];

export const SPECIALIST_MATH_SUBTOPICS = [
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
  'Skill Acquisition: Classification, Stages of Learning, and Practice Scheduling',
  'Coaching and Feedback: Theories of Acquisition and Psychological Strategies',
  'Applied Biomechanics: Forces, Momentum, Impulse, Newton’s Laws, Projectile Motion, and Levers',
  'Movement Analysis: Qualitative Analysis and Equilibrium in Sport',
  'Energy System Interplay: ATP-CP, Anaerobic Glycolysis, and Aerobic Systems',
  'Cardiorespiratory Dynamics: Oxygen Uptake, EPOC, and VO2 Max/LIP',
  'Physiological Responses: Acute Responses and Fatigue Mechanisms',
  'Recovery and Nutrition: Hydration and Nutritional Strategies for Homeostasis',
  'Training Foundation: Activity Analysis, Fitness Components, and Testing',
  'Program Design: Training Principles, Methods, and Chronic Adaptations',
] as const;

export type PhysicalEducationSubtopic =
  (typeof PHYSICAL_EDUCATION_SUBTOPICS)[number];

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

export const SUBTOPIC_INSTRUCTIONS: Record<string, string> = {
  // ─────────────────────────────────────────────
  // MATHEMATICAL METHODS
  // Only exam technique notes NOT in Study Design key knowledge
  // ─────────────────────────────────────────────

  'Functions and Graphs': `
NOTATION (mandatory):
- Write functions as f : domain → R, f(x) = ...
- Domain/range: interval notation [a, b] or set notation {x ∈ R : condition}
- Composite: (f ∘ g)(x) = f(g(x)) — state domain requires range(g) ⊆ domain(f)
EXAM STYLE:
- Vary: identify features from equation, sketch graphs, find domains/ranges, composite/inverse rules
- Multi-part: identification → manipulation → application
- NEVER omit domain specification
`,

  'Transformation of Graphs': `
NOTATION (mandatory):
- General form: y = a·f(b(x − h)) + k
- Describe each transformation as a numbered sequence in plain language
EXAM STYLE:
- Include non-trivial combined transformations (all four parameters a, b, h, k)
- Test: parameter identification from graphs, equation comparison, coordinate tracking
- Common errors to probe: x-axis vs y-axis dilation confusion, translation sign errors
`,

  'Algebra and Structure': `
EXAM STYLE:
- Vary: composition/inverse → parametric simultaneous equations → substitution reduction
- Always specify domain for composite/inverse questions
- Algorithm tracing: define termination condition; track variable values in a table
`,

  'Trigonometric Functions': `
NOTATION (mandatory):
- Write as y = a·sin(b(x − h)) + k or y = a·cos(b(x − h)) + k
- Period: 2π/b (sin/cos), π/b (tan); Amplitude: |a|
EXAM STYLE:
- Solve equations: list ALL solutions using periodicity and CAST rule; express in terms of π
- Periodicity questions: find smallest positive period; determine largest valid interval
`,

  'Exponential and Logarithmic Functions': `
NOTATION (mandatory):
- VCARD uses log_e; log_e and ln both acceptable
- For d/dx[a·log_e(bx)]: the b cancels → result is a/x
EXAM STYLE:
- Exam 1: exact answers using log/exponential laws only, no CAS
- Multi-step: set up → apply log laws → solve → verify domain (f(x) > 0)
`,

  Differentiation: `
NOTATION (mandatory):
- Gradient table format: columns = x values (either side + at point); rows = sign of f′(x) + arrows
- Tangent: y − f(a) = f′(a)(x − a); Normal: y − f(a) = −1/f′(a)(x − a)
EXAM STYLE:
- Multi-part chain: differentiate → stationary points → classify → global max/min on closed interval
- Exam 1: exact answers ONLY — no decimal approximations
`,

  Integration: `
NOTATION (mandatory):
- Write ∫f(x) dx = F(x) + c (indefinite); ∫_a^b f(x) dx = [F(x)]_a^b = F(b) − F(a) (definite)
- Average value: (1/(b−a))∫_a^b f(x) dx
EXAM STYLE:
- Area between curves: identify which function is greater; split at intersection points
- Exam 1: exact answers — express in terms of log_e, π, etc.
`,

  'Probability and Statistics': `
NOTATION (mandatory):
- Pr(A|B) = Pr(A ∩ B) / Pr(B); Independence: Pr(A|B) = Pr(A)
- 95% CI: p̂ ± 1.96√(p̂(1−p̂)/n)
EXAM STYLE:
- Bayes questions: draw probability tree first; show all branch calculations
- Exam 1 normal dist: use symmetry and given values only, no CAS
- Confidence intervals: recover p̂ = (L+U)/2; solve for n = (2·1.96·SE/MOE)²
`,

  'Discrete Random Variables': `
NOTATION (mandatory):
- p(x) = Pr(X = x); E(X) = Σx·p(x); Var(X) = E(X²) − μ²
- Binomial: X ~ Bi(n, p), Pr(X=x) = C(n,x)pˣ(1−p)ⁿ⁻ˣ
EXAM STYLE:
- Exam 1: exact fractional answers required (e.g. a/4⁶ or a/2ᵇ)
- Use small n ≤ 8 for exact arithmetic feasibility
`,

  'Continuous Random Variables': `
NOTATION (mandatory):
- PDF: f(x) ≥ 0, ∫_{−∞}^{∞} f(x) dx = 1
- Pr(a < X < b) = ∫_a^b f(x) dx; for continuous: Pr(X = a) = 0
EXAM STYLE:
- Exam 1: hand-manageable integrands only (polynomials, sin/cos, simple exponentials)
- ALWAYS state the support of the pdf explicitly
`,

  // ─────────────────────────────────────────────
  // PHYSICAL EDUCATION
  // Only exam technique notes NOT in Study Design key knowledge
  // ─────────────────────────────────────────────

  'Skill Acquisition: Classification, Stages of Learning, and Practice Scheduling': `
EXAM STYLE:
- Classification: ALWAYS justify using BOTH category name AND defining features
- Stage identification: present a coach observation scenario; require stage + two supporting evidences
- Practice scheduling: recommend AND justify; link learner characteristics to schedule advantages
- Multi-part progression: single-classification → multi-classification → athlete comparison → practice plan
`,

  'Coaching and Feedback: Theories of Acquisition and Psychological Strategies': `
EXAM STYLE:
- Theory questions: apply named theory to described scenario — NOT mere definition
- Feedback: identify type AND justify appropriateness for learner's stage
- Arousal: specify skill complexity + athlete's state; justify strategy linking theory to outcome
- Multi-part: identify theory → explain mechanism → recommend intervention → justify with theory
`,

  "Applied Biomechanics: Forces, Momentum, Impulse, Newton's Laws, Projectile Motion, and Levers": `
EXAM STYLE:
- Newton's Laws: name the law AND explain it in the specific context — generic definitions score zero
- Always name the object on which forces act; forces act on DIFFERENT objects (action-reaction)
- Projectile: specify sport context; explain variable effects with reference to underlying principles
- FOCUS on conceptual understanding and application — NOT pure calculations
`,

  'Movement Analysis: Qualitative Analysis and Equilibrium in Sport': `
EXAM STYLE:
- Planes/axes: require BOTH plane AND axis — never accept one without the other
- Equilibrium: present two contrasting positions; compare stability using ≥2 factors with justification
- Multi-part: observe error → identify critical feature violated → name plane/axis → recommend drill
`,

  'Energy System Interplay: ATP-CP, Anaerobic Glycolysis, and Aerobic Systems': `
EXAM STYLE:
- ALWAYS anchor to specific sporting context; justify system dominance using intensity, duration, oxygen
- Include: ATP resynthesis reactions, by-product identification, ATP yield comparison, recovery times
- Interplay questions: describe changing game situation; explain system dominance shifts
`,

  'Cardiorespiratory Dynamics: Oxygen Uptake, EPOC, and VO2 Max/LIP': `
EXAM STYLE:
- EPOC: explain BOTH fast (alactic) AND slow (lactic) components with specific physiological processes
- VO₂ max: explain one limiting factor AND one training adaptation; link mechanism to performance
- LIP: use graph interpretation format; explain what happens above LIP; justify why training shifts it
`,

  'Physiological Responses: Acute Responses and Fatigue Mechanisms': `
EXAM STYLE:
- Describe specific exercise bout (intensity, duration, modality); explain ONE system's response
- Fatigue: specify exercise type — high-intensity/brief (H⁺/PC focus) vs prolonged moderate (glycogen/central)
- AVOID: asking students to list responses without mechanism explanation
`,

  'Recovery and Nutrition: Hydration and Nutritional Strategies for Homeostasis': `
EXAM STYLE:
- Recovery: specify exercise type; justify strategy linking physiological mechanism to recovery need
- Hydration: describe performance decrement; explain physiological chain from dehydration to effect
- Nutrition: design pre/during/post plan; justify each component with reference to energy systems
`,

  'Training Foundation: Activity Analysis, Fitness Components, and Testing': `
EXAM STYLE:
- Activity analysis: identify dominant energy systems (with justification), top 3 fitness components, appropriate tests
- Fitness components: define AND justify importance to named sport using activity analysis reasoning
- Testing: evaluate test's validity/reliability for specific athlete/sport; justify test selection
`,

  'Program Design: Training Principles, Methods, and Chronic Adaptations': `
EXAM STYLE:
- Principles: present training scenario (e.g. athlete plateauing 6 weeks); identify violated principle
- Method selection: specify athlete profile (sport, training phase, goal); recommend AND justify TWO methods
- Adaptations: explain specific chronic adaptation including mechanism AND performance effect
`,
};

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
  subtopicInstructions: Record<string, string>;
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
