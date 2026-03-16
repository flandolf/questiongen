export type Difficulty = "Essential Skills" | "Easy" | "Medium" | "Hard" | "Extreme";

export type TechMode = "tech-free" | "tech-active" | "mix";

export const MATH_METHODS_SUBTOPICS = [
  "Functions and Graphs",
  "Transformation of Graphs",
  "Algebra and Structure",
  "Trigonometric Functions",
  "Exponential and Logarithmic Functions",
  "Differentiation",
  "Integration",
  "Probability and Statistics",
  "Discrete Random Variables",
  "Continuous Random Variables",
] as const;

export type MathMethodsSubtopic = typeof MATH_METHODS_SUBTOPICS[number];

export const SPECIALIST_MATH_SUBTOPICS = [
  "Additional Algebra and Number Systems",
  "Sequences and Series",
  "Reciprocals and Rational Functions",
  "Combinatorics and Matrices",
  "Trigonometric Functions and Identities",
  "Proof",
  "Modulus",
  "Algorithms and Graph Theory",
  "Graphing relations",
  "Complex numbers",
  "Transformations and Vectors in the plane",
] as const;

export type SpecialistMathSubtopic = typeof SPECIALIST_MATH_SUBTOPICS[number];

export const PHYSICAL_EDUCATION_SUBTOPICS = [
  "Skill Acquisition: Classification, Stages of Learning, and Practice Scheduling",
  "Coaching and Feedback: Theories of Acquisition and Psychological Strategies",
  "Applied Biomechanics: Newton’s Laws, Projectile Motion, and Levers",
  "Movement Analysis: Qualitative Analysis and Equilibrium in Sport",
  "Energy System Interplay: ATP-CP, Anaerobic Glycolysis, and Aerobic Systems",
  "Cardiorespiratory Dynamics: Oxygen Uptake, EPOC, and VO2 Max/LIP",
  "Physiological Responses: Acute Responses and Fatigue Mechanisms",
  "Recovery and Nutrition: Hydration and Nutritional Strategies for Homeostasis",
  "Training Foundation: Activity Analysis, Fitness Components, and Testing",
  "Program Design: Training Principles, Methods, and Chronic Adaptations",
] as const;

export type PhysicalEducationSubtopic = typeof PHYSICAL_EDUCATION_SUBTOPICS[number];

export const VCE_COMMAND_TERMS = [
  "Identify",
  "Describe",
  "Explain",
  "Compare",
  "Analyse",
  "Discuss",
  "Evaluate",
  "Justify",
] as const;

export type VceCommandTerm = typeof VCE_COMMAND_TERMS[number];

export const VCE_COMMAND_TERMS_LOWER_THAN_EVALUATE: VceCommandTerm[] = [
  "Identify",
  "Describe",
  "Explain",
  "Compare",
  "Analyse",
  "Discuss",
];

export const CHEMISTRY_SUBTOPICS = [
  "Periodic Trends: Structure, Periodic Organisation, and Critical or Endangered Elements",
  "Molecular Structure: Lewis Structures, VSEPR Geometry, Polarity, and Intermolecular Forces",
  "Metallic Bonding: Metallic Lattices and the Reactivity Series",
  "Ionic Chemistry: Ionic Bonding, Precipitation Reactions, and Solubility Tables",
  "Chemical Quantities: Moles, Molar Mass, Percentage Composition, and Empirical/Molecular Formulas",
  "Separation Techniques: Chromatography and Rf Value Identification",
  "Organic Classification: Alkanes, Alkenes, Alcohols, Carboxylic Acids, Haloalkanes, and IUPAC Naming",
  "Polymer Chemistry: Addition and Condensation Polymerisation, Plastics, and Recycling",
  "Sustainability: Green Chemistry, Circular Economy, and Sustainable Development",
  "Water Chemistry: Hydrogen Bonding and Unique Physical Properties of Water",
  "Acid–Base Chemistry: Brønsted–Lowry Theory, pH, Neutralisation, and Applications",
  "Redox Chemistry: Electron Transfer, Half-Equations, Displacement, and Corrosion",
  "Solutions: Concentration Units and Solubility Relationships",
  "Volumetric Analysis: Acid–Base Titration, Standard Solutions, and Indicators",
  "Gas Chemistry: Ideal Gas Equation and Greenhouse Gases",
  "Analytical Techniques: Electrical Conductivity, Stoichiometry, and Colorimetry/UV–Vis Spectroscopy"
] as const;

export type ChemistrySubtopic = typeof CHEMISTRY_SUBTOPICS[number];
  
export type Topic =
  | "Mathematical Methods"
  | "Specialist Mathematics"
  | "Chemistry"
  | "Physical Education";

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
  difficulty: string;
  totalAttempts: number;
  repairAttempts: number;
  constrainedRegenerationUsed: boolean;
  repairPath: string[];
  durationMs: number;
  structuredOutputStatus?: "used" | "not-supported-fallback" | "not-requested";
  distinctnessAvg?: number;
  multiStepDepthAvg?: number;
};

export type GenerationStatusStage =
  | "preparing"
  | "generating"
  | "validating"
  | "repairing"
  | "regenerating"
  | "completed"
  | "failed";

export type GenerationStatusEvent = {
  mode: QuestionMode;
  stage: GenerationStatusStage;
  message: string;
  attempt: number;
};

export type GenerateQuestionsResponse = {
  questions: GeneratedQuestion[];
  rawModelOutput?: string;
  telemetry?: GenerationTelemetry;
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

export type WrittenAttemptKind = "initial" | "appeal" | "override";
export type McAttemptKind = "initial" | "appeal" | "override";

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
};

export type QuestionHistoryEntry = {
  id: string;
  createdAt: string;
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
  "Mathematical Methods",
  "Specialist Mathematics",
  "Chemistry",
  "Physical Education",
];

export const API_KEY_STORAGE_KEY = "questiongen.openrouterApiKey";
export const QUESTION_HISTORY_STORAGE_KEY = "questiongen.history";
export const MC_HISTORY_STORAGE_KEY = "questiongen.mcHistory";
export const DEBUG_MODE_STORAGE_KEY = "questiongen.debugMode";
export const APP_STATE_STORAGE_KEY = "questiongen.appState";
export const HISTORY_ENTRY_LIMIT = 200;
export const SAVED_SET_LIMIT = 100;
export const PERSISTED_APP_STATE_VERSION = 2;

export type QuestionMode = "written" | "multiple-choice";

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
  rawModelOutput?: string;
  telemetry?: GenerationTelemetry;
};

export type McHistoryEntry = {
  type: "multiple-choice";
  id: string;
  createdAt: string;
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
  debugMode: boolean;
  useStructuredOutput: boolean;
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
  maxMarksPerQuestion: number;
  prioritizedCommandTerms: VceCommandTerm[];
  questionMode: QuestionMode;
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
};
