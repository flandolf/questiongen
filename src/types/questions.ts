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

export type StudentAnswerImage = {
  name: string;
  dataUrl: string;
};
