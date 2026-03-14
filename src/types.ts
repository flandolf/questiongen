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
  "Movement Skill Classification",
  "Stages of Learning",
  "Theories of Skill Acquisition",
  "Coaching Strategies and Feedback",
  "Psychological Skills for Performance",
  "Practice Scheduling",
  "Biomechanical Principles of Movement",
  "Newton's Laws and Projectile Motion",
  "Levers and Equilibrium",
  "Qualitative Movement Analysis",
  "Oxygen Uptake and EPOC",
  "Acute Responses to Exercise",
  "ATP-CP, Anaerobic Glycolysis and Aerobic Systems",
  "Energy System Interplay",
  "Fatigue Mechanisms",
  "Nutrition and Hydration for Recovery",
  "Activity Analysis and Physiological Requirements",
  "Fitness Components and Testing",
  "Test Reliability, Validity and Accuracy",
  "Training Data Monitoring",
  "Components of a Training Session",
  "Training Principles",
  "Training Methods",
  "Chronic Adaptations to Training",
  "VO2 Max, LIP and Lactate Tolerance",
  "Integrated Movement Analysis (Units 3/4)",
  "Interrelationships: Skill, Biomechanics, Energy, Training",
] as const;

export type PhysicalEducationSubtopic = typeof PHYSICAL_EDUCATION_SUBTOPICS[number];

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
};

export type GenerateQuestionsResponse = {
  questions: GeneratedQuestion[];
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
};

export type GenerateMcQuestionsResponse = {
  questions: McQuestion[];
};

export type McHistoryEntry = {
  type: "multiple-choice";
  id: string;
  createdAt: string;
  question: McQuestion;
  selectedAnswer: string;
  correct: boolean;
};
