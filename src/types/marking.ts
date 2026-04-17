export type MarkingCriterion = {
  criterion: string;
  achievedMarks: number;
  maxMarks: number;
  rationale: string;
};

export type MarkAnswerResponse = {
  verdict: string;
  achievedMarks: number;
  maxMarks: number;
  vcaaMarkingScheme: MarkingCriterion[];
  comparisonToSolutionMarkdown: string;
  feedbackMarkdown: string;
  workedSolutionMarkdown: string;
  exemplarResponseMarkdown?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};
