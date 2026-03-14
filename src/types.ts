export type Difficulty = "Easy" | "Medium" | "Hard";

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

export const CHEMISTRY_SUBTOPICS = [
  "Periodic table organisation by structure and trends (electronegativity, ionisation energy, reactivity); some elements are critical or endangered.",
  "Lewis structures and VSEPR predict covalent molecular shape, polarity, and intermolecular forces (dispersion, dipole–dipole, hydrogen bonding).",
  "Metals form conductive, malleable metallic lattices; the reactivity series is determined via reactions with water, acids, and oxygen.",
  "Ionic compounds form by electron transfer; precipitation reactions and solubility tables identify ions in solution.",
  "Chromatography separates mixture components and identifies them using Rf values.",
  "Mole calculations include molar mass, percentage composition, and empirical/molecular formulas.",
  "Organic compounds are classified (alkanes, alkenes, alcohols, carboxylic acids, haloalkanes) and named using IUPAC rules.",
  "Polymers form via addition or condensation polymerisation; plastics include fossil-based and bioplastics with recycling considerations.",
  "Sustainability in chemistry involves green chemistry, sustainable development goals, and circular economy principles.",
  "Water’s properties (high specific heat capacity, lower ice density, high latent heat) arise from hydrogen bonding.",
  "Brønsted–Lowry acid–base theory covers strong/weak acids and bases, neutralisation, pH, and applications like ocean acidification.",
  "Redox reactions involve electron transfer; half-equations describe displacement and corrosion using the reactivity series.",
  "Solution concentration units (mol L⁻¹, g L⁻¹, ppm, %) and solubility predictions use tables and graphs.",
  "Volumetric analysis (acid–base titration) determines solution concentration using standard solutions and indicators.",
  "The ideal gas equation relates gas quantities; CO₂, CH₄, and H₂O are major greenhouse gases.",
  "Salts in water or soil are analysed using electrical conductivity, stoichiometry, and colorimetry/UV–Vis spectroscopy."
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
  distinctnessAvg?: number;
  multiStepDepthAvg?: number;
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

export type QuestionHistoryEntry = {
  id: string;
  createdAt: string;
  question: GeneratedQuestion;
  uploadedAnswer: string;
  uploadedAnswerImage?: StudentAnswerImage;
  workedSolutionMarkdown: string;
  markResponse: MarkAnswerResponse;
  generationTelemetry?: GenerationTelemetry;
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
  generationTelemetry?: GenerationTelemetry;
};
