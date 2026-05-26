export type MarkingCriterion = {
  criterion: string;
  achievedMarks: number;
  maxMarks: number;
  rationale: string;
  markType?: 'M' | 'A' | 'C';
};

export type ExemplarAnnotation = {
  part: string;
  marksEarned: number;
  marksAvailable: number;
  note: string;
};

export type MarkAnswerResponse = {
  verdict: string;
  achievedMarks: number;
  maxMarks: number;
  partialReason?: string;
  vcaaMarkingScheme: MarkingCriterion[];
  comparisonToSolutionMarkdown: string;
  feedbackMarkdown: string;
  workedSolutionMarkdown: string;
  exemplarResponseMarkdown?: string;
  indicativeContentMarkdown?: string;
  exemplarAnnotations?: ExemplarAnnotation[];
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type MarkPdfPageMapping = {
  questionIndex: number;
  pageIndices: number[];
};

export type MarkPdfResultItem = {
  questionId: string;
  response?: MarkAnswerResponse;
  error?: string;
};

export type MarkPdfResponse = {
  results: MarkPdfResultItem[];
};

export type DiscoveredQuestion = {
  topic: string;
  promptMarkdown: string;
  maxMarks: number;
  pageIndices: number[];
};

export type DiscoverPdfQuestionsResponse = {
  questions: DiscoveredQuestion[];
};
