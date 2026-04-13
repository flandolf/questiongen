import type {
  Difficulty,
  GenerationRecord,
  QuestionMode,
  TechMode,
  Topic,
} from '../types';

export interface EstimatedTokensAndCost {
  totalTokensPerQuestion: number;
  promptTokensPerQuestion: number;
  completionTokensPerQuestion: number;
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  promptCost: number | null;
  completionCost: number | null;
  totalCost: number;
  confidence?: number;
}

/**
 * Fixed token overhead for the system prompt sent once per generation request,
 * regardless of how many questions are generated.
 */
const SYSTEM_PROMPT_TOKENS = 2000;

/**
 * Baseline per-question prompt tokens (question text, context, instructions).
 * Added once per question on top of the fixed system prompt.
 */
const PER_QUESTION_PROMPT_TOKENS = 500;

/**
 * Topic-specific token adjustments applied to the per-question prompt budget.
 */
const TOPIC_BASE_TOKENS: Record<string, number> = {
  'Mathematical Methods': 850,
  'Specialist Mathematics': 950,
  Chemistry: 800,
  'Physical Education': 700,
};

const DEFAULT_TOPIC_BASE_TOKENS = 800;

const DIFFICULTY_MULTIPLIERS: Record<string, number> = {
  'Essential Skills': 0.7,
  Easy: 0.85,
  Medium: 1.0,
  Hard: 1.25,
  Extreme: 1.5,
};

const TECH_MODE_MULTIPLIERS: Record<string, number> = {
  'tech-free': 0.9,
  mix: 1.0,
  'tech-active': 1.1,
};

const QUESTION_MODE_RATIOS = {
  'multiple-choice': { prompt: 0.6, completion: 0.4 },
  written: { prompt: 0.35, completion: 0.65 },
};

const PARAMETER_WEIGHTS = {
  topic: 0.4,
  difficulty: 0.3,
  questionMode: 0.2,
  techMode: 0.1,
};

const TOKENS_PER_MARK = 40;
const DEFAULT_MARKS = 4;

export interface LogRegressionCoefficients {
  bias: number;
  logQuestionCount: number;
  questionCount: number;
  logTotalMarks: number;
  totalMarks: number;
  topicCoefficients: Record<string, number>;
  difficultyCoefficients: Record<string, number>;
  questionModeCoefficients: Record<string, number>;
  techModeCoefficients: Record<string, number>;
  subtopicsCoefficient: number;
  hasCustomFocusCoefficient: number;
  multiPassCoefficient: number;
  modelVersion: string;
  trainedAt: number;
  sampleSize: number;
  rSquared: number;
}

const DEFAULT_LOG_REGRESSION_COEFFICIENTS: LogRegressionCoefficients = {
  bias: 7.5,
  logQuestionCount: 0.5,
  questionCount: 15,
  logTotalMarks: 0.3,
  totalMarks: 0,
  topicCoefficients: {
    'Mathematical Methods': 0.05,
    'Specialist Mathematics': 0.12,
    Chemistry: -0.02,
    'Physical Education': -0.1,
  },
  difficultyCoefficients: {
    'Essential Skills': -0.15,
    Easy: -0.05,
    Medium: 0,
    Hard: 0.1,
    Extreme: 0.2,
  },
  questionModeCoefficients: {
    'multiple-choice': -0.2,
    written: 0.15,
  },
  techModeCoefficients: {
    'tech-free': -0.05,
    mix: 0,
    'tech-active': 0.03,
  },
  subtopicsCoefficient: 0.02,
  hasCustomFocusCoefficient: 0.05,
  multiPassCoefficient: 0.3,
  modelVersion: '1.0.0',
  trainedAt: 0,
  sampleSize: 0,
  rSquared: 0,
};

const LOG_REGRESSION_STORAGE_KEY = 'token-estimation-log-reg-v1';

export function persistLogRegressionCoefficients(
  coeffs: LogRegressionCoefficients,
): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        LOG_REGRESSION_STORAGE_KEY,
        JSON.stringify(coeffs),
      );
    }
  } catch {
    // best-effort only
  }
}

/**
 * Persist log-regression coefficients into localStorage (best-effort).
 * @param coeffs - Coefficients object to persist
 */

export function loadLogRegressionCoefficients(): LogRegressionCoefficients {
  try {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem(LOG_REGRESSION_STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'bias' in parsed &&
          'logQuestionCount' in parsed &&
          typeof (parsed as Record<string, unknown>).bias === 'number' &&
          typeof (parsed as Record<string, unknown>).logQuestionCount ===
            'number'
        ) {
          return {
            ...DEFAULT_LOG_REGRESSION_COEFFICIENTS,
            ...(parsed as Record<string, number>),
          };
        }
      }
    }
  } catch {
    // fall through to defaults
  }
  return { ...DEFAULT_LOG_REGRESSION_COEFFICIENTS };
}

/**
 * Train a simple log-linear regression model on historical generation records.
 * Returns updated coefficients and an R^2 fit metric. If insufficient data
 * the function returns defaults with `sampleSize` set.
 */

function extractLogRegressionFeatures(
  questionCount: number,
  averageMarksPerQuestion: number | undefined,
  topic: string,
  difficulty: Difficulty,
  questionMode: QuestionMode,
  techMode: TechMode,
  subtopics?: string[],
  customFocusArea?: string,
  generationStrategy: 'single-pass' | 'multi-pass' = 'multi-pass',
  coeffs: LogRegressionCoefficients = DEFAULT_LOG_REGRESSION_COEFFICIENTS,
): Record<string, number> {
  const totalMarks = (averageMarksPerQuestion ?? DEFAULT_MARKS) * questionCount;
  const logQuestionCount = Math.log(Math.max(questionCount, 1));
  const logTotalMarks = Math.log(Math.max(totalMarks, 1));

  return {
    logQuestionCount,
    questionCount,
    logTotalMarks,
    totalMarks,
    topicCoeff: coeffs.topicCoefficients[topic] ?? 0,
    difficultyCoeff: coeffs.difficultyCoefficients[difficulty] ?? 0,
    questionModeCoeff: coeffs.questionModeCoefficients[questionMode] ?? 0,
    techModeCoeff: coeffs.techModeCoefficients[techMode] ?? 0,
    subtopicsLog: Math.log((subtopics?.length ?? 0) + 1),
    hasCustomFocus:
      customFocusArea && customFocusArea.trim().length > 0 ? 1 : 0,
    isMultiPass: generationStrategy === 'multi-pass' ? 1 : 0,
  };
}

function predictTokensLogRegression(
  coeffs: LogRegressionCoefficients,
  features: Record<string, number>,
): number {
  let linearPrediction = coeffs.bias;
  linearPrediction += coeffs.logQuestionCount * features.logQuestionCount;
  linearPrediction += coeffs.questionCount * features.questionCount;
  linearPrediction += coeffs.logTotalMarks * features.logTotalMarks;
  linearPrediction += coeffs.totalMarks * features.totalMarks;
  linearPrediction += features.topicCoeff;
  linearPrediction += features.difficultyCoeff;
  linearPrediction += features.questionModeCoeff;
  linearPrediction += features.techModeCoeff;
  linearPrediction += coeffs.subtopicsCoefficient * features.subtopicsLog;
  linearPrediction +=
    coeffs.hasCustomFocusCoefficient * features.hasCustomFocus;
  if ('multiPassCoefficient' in coeffs && 'isMultiPass' in features) {
    linearPrediction +=
      (coeffs.multiPassCoefficient ?? 0.3) * features.isMultiPass;
  }

  return Math.round(Math.exp(linearPrediction));
}

// eslint-disable-next-line complexity
export function trainLogRegressionModel(
  records: GenerationRecord[],
  existingCoeffs?: LogRegressionCoefficients,
): { coefficients: LogRegressionCoefficients; rSquared: number } {
  const validRecords = records.filter(
    (r) =>
      r.outputs.totalTokens != null &&
      r.outputs.totalTokens > 0 &&
      r.inputs.questionCount > 0,
  );

  if (validRecords.length < 5) {
    return {
      coefficients: {
        ...DEFAULT_LOG_REGRESSION_COEFFICIENTS,
        trainedAt: Date.now(),
        sampleSize: validRecords.length,
      },
      rSquared: 0,
    };
  }

  const coeffs = existingCoeffs
    ? { ...existingCoeffs }
    : { ...DEFAULT_LOG_REGRESSION_COEFFICIENTS };
  coeffs.topicCoefficients = { ...coeffs.topicCoefficients };
  coeffs.difficultyCoefficients = { ...coeffs.difficultyCoefficients };
  coeffs.questionModeCoefficients = { ...coeffs.questionModeCoefficients };
  coeffs.techModeCoefficients = { ...coeffs.techModeCoefficients };

  const buildTrainingData = () =>
    validRecords.map((record) => ({
      record,
      features: extractLogRegressionFeatures(
        record.inputs.questionCount,
        record.inputs.averageMarksPerQuestion,
        record.inputs.topic,
        record.inputs.difficulty,
        record.inputs.questionMode,
        record.inputs.techMode,
        record.inputs.subtopics,
        record.inputs.customFocusArea,
        record.inputs.generationStrategy ?? 'multi-pass',
        coeffs,
      ),
      target: Math.log(record.outputs.totalTokens!),
    }));

  const learningRate = 0.01;
  const iterations = 200;

  for (let iter = 0; iter < iterations; iter++) {
    const trainingData = buildTrainingData();

    let gradBias = 0,
      gradLogQ = 0,
      gradQ = 0,
      gradLogM = 0,
      gradM = 0;
    let gradSub = 0,
      gradFocus = 0,
      gradMultiPass = 0;

    const gradTopic: Record<string, number> = {};
    const gradDiff: Record<string, number> = {};
    const gradMode: Record<string, number> = {};
    const gradTech: Record<string, number> = {};

    for (const { record, features, target } of trainingData) {
      let pred = coeffs.bias;
      pred += coeffs.logQuestionCount * features.logQuestionCount;
      pred += coeffs.questionCount * features.questionCount;
      pred += coeffs.logTotalMarks * features.logTotalMarks;
      pred += coeffs.totalMarks * features.totalMarks;
      pred += features.topicCoeff;
      pred += features.difficultyCoeff;
      pred += features.questionModeCoeff;
      pred += features.techModeCoeff;
      pred += coeffs.subtopicsCoefficient * features.subtopicsLog;
      pred += coeffs.hasCustomFocusCoefficient * features.hasCustomFocus;

      const error = pred - target;

      gradBias += error;
      gradLogQ += error * features.logQuestionCount;
      gradQ += error * features.questionCount;
      gradLogM += error * features.logTotalMarks;
      gradM += error * features.totalMarks;
      gradSub += error * features.subtopicsLog;
      gradFocus += error * features.hasCustomFocus;
      gradMultiPass += error * features.isMultiPass;

      const t = record.inputs.topic;
      const d = record.inputs.difficulty as string;
      const qm = record.inputs.questionMode as string;
      const tm = record.inputs.techMode as string;
      gradTopic[t] = (gradTopic[t] ?? 0) + error;
      gradDiff[d] = (gradDiff[d] ?? 0) + error;
      gradMode[qm] = (gradMode[qm] ?? 0) + error;
      gradTech[tm] = (gradTech[tm] ?? 0) + error;
    }

    const n = trainingData.length;
    const scale = learningRate / n;

    coeffs.bias -= gradBias * scale;
    coeffs.logQuestionCount -= gradLogQ * scale;
    coeffs.questionCount -= gradQ * scale * 0.001;
    coeffs.logTotalMarks -= gradLogM * scale;
    coeffs.totalMarks -= gradM * scale * 0.001;
    coeffs.subtopicsCoefficient -= gradSub * scale;
    coeffs.hasCustomFocusCoefficient -= gradFocus * scale;
    coeffs.multiPassCoefficient -= gradMultiPass * scale;

    const catScale = scale * 0.1;
    for (const [level, grad] of Object.entries(gradTopic)) {
      coeffs.topicCoefficients[level] =
        (coeffs.topicCoefficients[level] ?? 0) - grad * catScale;
    }
    for (const [level, grad] of Object.entries(gradDiff)) {
      coeffs.difficultyCoefficients[level] =
        (coeffs.difficultyCoefficients[level] ?? 0) - grad * catScale;
    }
    for (const [level, grad] of Object.entries(gradMode)) {
      coeffs.questionModeCoefficients[level] =
        (coeffs.questionModeCoefficients[level] ?? 0) - grad * catScale;
    }
    for (const [level, grad] of Object.entries(gradTech)) {
      coeffs.techModeCoefficients[level] =
        (coeffs.techModeCoefficients[level] ?? 0) - grad * catScale;
    }
  }

  const finalData = buildTrainingData();
  const meanTarget =
    finalData.reduce((sum, d) => sum + d.target, 0) / finalData.length;
  let ssRes = 0,
    ssTot = 0;
  for (const { features, target } of finalData) {
    const pred = Math.log(predictTokensLogRegression(coeffs, features));
    ssRes += (pred - target) ** 2;
    ssTot += (target - meanTarget) ** 2;
  }
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return {
    coefficients: {
      ...coeffs,
      modelVersion: '1.0.0',
      trainedAt: Date.now(),
      sampleSize: validRecords.length,
      rSquared: Math.max(0, rSquared),
    },
    rSquared: Math.max(0, rSquared),
  };
}

function estimateTokensLogRegression(
  questionCount: number,
  averageMarksPerQuestion: number | undefined,
  topic: Topic,
  difficulty: Difficulty,
  questionMode: QuestionMode,
  techMode: TechMode,
  subtopics?: string[],
  customFocusArea?: string,
  generationStrategy: 'single-pass' | 'multi-pass' = 'multi-pass',
  historyRecords?: GenerationRecord[],
): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  confidence: number;
} {
  let coeffs = loadLogRegressionCoefficients();

  if (historyRecords && historyRecords.length > coeffs.sampleSize + 10) {
    const { coefficients, rSquared } = trainLogRegressionModel(
      historyRecords,
      coeffs,
    );
    if (rSquared > coeffs.rSquared) {
      coeffs = coefficients;
      persistLogRegressionCoefficients(coeffs);
    }
  }

  const features = extractLogRegressionFeatures(
    questionCount,
    averageMarksPerQuestion,
    topic,
    difficulty,
    questionMode,
    techMode,
    subtopics,
    customFocusArea,
    generationStrategy,
    coeffs,
  );

  const ratios = QUESTION_MODE_RATIOS[questionMode];
  const totalTokens = predictTokensLogRegression(coeffs, features);

  const promptTokens = Math.round(totalTokens * ratios.prompt);
  const completionTokens = Math.round(totalTokens * ratios.completion);

  const confidence = Math.min(
    0.95,
    coeffs.rSquared * Math.min(1, coeffs.sampleSize / 50),
  );

  return { promptTokens, completionTokens, totalTokens, confidence };
}

function calculateSimilarity(
  record: GenerationRecord,
  topic: Topic,
  difficulty: Difficulty,
  questionMode: QuestionMode,
  techMode: TechMode,
  averageMarksPerQuestion?: number,
  subtopics?: string[],
  customFocusArea?: string,
): number {
  let score = 0;

  if (record.inputs.topic === topic) score += PARAMETER_WEIGHTS.topic;
  if (record.inputs.difficulty === difficulty)
    score += PARAMETER_WEIGHTS.difficulty;
  if (record.inputs.questionMode === questionMode)
    score += PARAMETER_WEIGHTS.questionMode;
  if (record.inputs.techMode === techMode) score += PARAMETER_WEIGHTS.techMode;

  const marksMatch =
    (averageMarksPerQuestion == null &&
      record.inputs.averageMarksPerQuestion == null) ||
    (averageMarksPerQuestion != null &&
      record.inputs.averageMarksPerQuestion === averageMarksPerQuestion);
  if (marksMatch) score += 0.1;

  if (subtopics && record.inputs.subtopics) {
    const overlap = subtopics.filter((s) =>
      record.inputs.subtopics!.includes(s),
    ).length;
    const maxLength = Math.max(
      subtopics.length,
      record.inputs.subtopics.length,
    );
    if (maxLength > 0) {
      score += 0.05 * (overlap / maxLength);
    }
  }

  const focusMatch =
    (customFocusArea && record.inputs.customFocusArea) ||
    (!customFocusArea && !record.inputs.customFocusArea);
  if (focusMatch) score += 0.05;

  return score;
}

function projectTokensForCount(
  recordTotalTokens: number,
  recordQuestionCount: number,
  requestedQuestionCount: number,
): number {
  const n = Math.max(recordQuestionCount, 1);
  const perQuestion = (recordTotalTokens - SYSTEM_PROMPT_TOKENS) / n;
  const safePerQuestion = Math.max(
    perQuestion,
    PER_QUESTION_PROMPT_TOKENS * 0.5,
  );
  return SYSTEM_PROMPT_TOKENS + requestedQuestionCount * safePerQuestion;
}

function estimateTokensAdvanced(
  generationHistory: GenerationRecord[],
  topic: Topic,
  difficulty: Difficulty,
  questionCount: number,
  questionMode: QuestionMode,
  techMode: TechMode,
  averageMarksPerQuestion?: number,
  subtopics?: string[],
  customFocusArea?: string,
  generationStrategy: 'single-pass' | 'multi-pass' = 'multi-pass',
): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  confidence: number;
} {
  const logRegResult = estimateTokensLogRegression(
    questionCount,
    averageMarksPerQuestion,
    topic,
    difficulty,
    questionMode,
    techMode,
    subtopics,
    customFocusArea,
    generationStrategy,
    generationHistory,
  );

  if (logRegResult.confidence >= 0.3) {
    return logRegResult;
  }

  const validRecords = generationHistory.filter(
    (record) =>
      record.outputs.totalTokens != null &&
      record.outputs.promptTokens != null &&
      record.outputs.completionTokens != null,
  );

  if (validRecords.length === 0) {
    return estimateStaticTokens(
      topic,
      difficulty,
      questionCount,
      questionMode,
      techMode,
      averageMarksPerQuestion,
      subtopics,
      customFocusArea,
      generationStrategy,
    );
  }

  const recordsWithSimilarity = validRecords
    .map((record) => ({
      record,
      similarity: calculateSimilarity(
        record,
        topic,
        difficulty,
        questionMode,
        techMode,
        averageMarksPerQuestion,
        subtopics,
        customFocusArea,
      ),
      recencyWeight: Math.exp(
        -0.1 *
          ((Date.now() - new Date(record.timestamp).getTime()) /
            (1000 * 60 * 60 * 24)),
      ),
    }))
    .filter((item) => item.similarity > 0.3);

  if (recordsWithSimilarity.length === 0) {
    return estimateStaticTokens(
      topic,
      difficulty,
      questionCount,
      questionMode,
      techMode,
      averageMarksPerQuestion,
      subtopics,
      customFocusArea,
      generationStrategy,
    );
  }

  recordsWithSimilarity.sort(
    (a, b) => b.similarity * b.recencyWeight - a.similarity * a.recencyWeight,
  );

  const topMatches = recordsWithSimilarity.slice(0, 5);
  let totalWeight = 0;
  let weightedTotalTokens = 0;
  let weightedPromptRatio = 0;
  let weightedCompletionRatio = 0;

  for (const { record, similarity, recencyWeight } of topMatches) {
    const combinedWeight = similarity * recencyWeight;
    totalWeight += combinedWeight;

    const recordQuestionCount = record.inputs.questionCount ?? 1;
    const projectedTotal = projectTokensForCount(
      record.outputs.totalTokens!,
      recordQuestionCount,
      questionCount,
    );

    weightedTotalTokens += projectedTotal * combinedWeight;

    const recordPromptRatio =
      record.outputs.promptTokens! / record.outputs.totalTokens!;
    const recordCompletionRatio =
      record.outputs.completionTokens! / record.outputs.totalTokens!;
    weightedPromptRatio += recordPromptRatio * combinedWeight;
    weightedCompletionRatio += recordCompletionRatio * combinedWeight;
  }

  const projectedTotal = weightedTotalTokens / totalWeight;
  const avgPromptRatio = weightedPromptRatio / totalWeight;
  const avgCompletionRatio = weightedCompletionRatio / totalWeight;

  const avgSimilarity =
    topMatches.reduce((sum, m) => sum + m.similarity, 0) / topMatches.length;
  const avgRecency =
    topMatches.reduce((sum, m) => sum + m.recencyWeight, 0) / topMatches.length;
  const confidence = Math.min(
    1.0,
    (topMatches.length / 3) * avgSimilarity * avgRecency,
  );

  return {
    promptTokens: Math.round(projectedTotal * avgPromptRatio),
    completionTokens: Math.round(projectedTotal * avgCompletionRatio),
    totalTokens: Math.round(projectedTotal),
    confidence,
  };
}

function estimateStaticTokens(
  topic: Topic,
  difficulty: Difficulty,
  questionCount: number,
  questionMode: QuestionMode,
  techMode: TechMode,
  averageMarksPerQuestion?: number,
  subtopics?: string[],
  customFocusArea?: string,
  generationStrategy: 'single-pass' | 'multi-pass' = 'multi-pass',
): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  confidence: number;
} {
  const topicBase = TOPIC_BASE_TOKENS[topic] ?? DEFAULT_TOPIC_BASE_TOKENS;
  const difficultyMultiplier = DIFFICULTY_MULTIPLIERS[difficulty] ?? 1.0;
  const techMultiplier = TECH_MODE_MULTIPLIERS[techMode] ?? 1.0;

  const marks = averageMarksPerQuestion ?? DEFAULT_MARKS;
  const marksTokens = marks * TOKENS_PER_MARK;

  const subtopicsBonus =
    subtopics && subtopics.length > 0 ? (subtopics.length - 1) * 15 : 0;

  const focusBonus =
    customFocusArea && customFocusArea.trim().length > 0 ? 60 : 0;

  const perQuestionPromptBase =
    (topicBase + marksTokens + subtopicsBonus + focusBonus) *
      difficultyMultiplier *
      techMultiplier +
    PER_QUESTION_PROMPT_TOKENS;

  const ratios = QUESTION_MODE_RATIOS[questionMode];

  const apiCallsCount =
    generationStrategy === 'single-pass'
      ? 1
      : !subtopics || subtopics.length === 0
        ? 1
        : Math.min(questionCount, subtopics.length);

  const totalPromptTokens = Math.round(
    SYSTEM_PROMPT_TOKENS * apiCallsCount +
      questionCount * perQuestionPromptBase,
  );

  const perQuestionCompletion =
    (perQuestionPromptBase * ratios.completion) / ratios.prompt;
  const totalCompletionTokens = Math.round(
    questionCount * perQuestionCompletion,
  );

  return {
    promptTokens: totalPromptTokens,
    completionTokens: totalCompletionTokens,
    totalTokens: totalPromptTokens + totalCompletionTokens,
    confidence: 0.5,
  };
}

export function estimateTokensAndCost(
  generationHistory: GenerationRecord[],
  topic: Topic,
  difficulty: Difficulty,
  questionCount: number,
  questionMode: QuestionMode,
  techMode: TechMode,
  averageMarksPerQuestion?: number,
  subtopics?: string[],
  customFocusArea?: string,
  promptPricePerToken?: number | null,
  completionPricePerToken?: number | null,
  generationStrategy: 'single-pass' | 'multi-pass' = 'multi-pass',
): EstimatedTokensAndCost {
  const { promptTokens, completionTokens, totalTokens, confidence } =
    estimateTokensAdvanced(
      generationHistory,
      topic,
      difficulty,
      questionCount,
      questionMode,
      techMode,
      averageMarksPerQuestion,
      subtopics,
      customFocusArea,
      generationStrategy,
    );

  const apiCallsCount =
    generationStrategy === 'single-pass'
      ? 1
      : !subtopics || subtopics.length === 0
        ? 1
        : Math.min(questionCount, subtopics.length);

  const variablePromptTokens = Math.max(
    promptTokens - SYSTEM_PROMPT_TOKENS * apiCallsCount,
    0,
  );
  const promptTokensPerQuestion = Math.round(
    (SYSTEM_PROMPT_TOKENS * apiCallsCount) / questionCount +
      variablePromptTokens / questionCount,
  );
  const completionTokensPerQuestion = Math.round(
    completionTokens / questionCount,
  );
  const totalTokensPerQuestion =
    promptTokensPerQuestion + completionTokensPerQuestion;

  const promptCost =
    promptPricePerToken != null ? promptPricePerToken * promptTokens : null;
  const completionCost =
    completionPricePerToken != null
      ? completionPricePerToken * completionTokens
      : null;
  const totalCost = (promptCost ?? 0) + (completionCost ?? 0);

  return {
    totalTokensPerQuestion,
    promptTokensPerQuestion,
    completionTokensPerQuestion,
    totalTokens,
    totalPromptTokens: promptTokens,
    totalCompletionTokens: completionTokens,
    promptCost,
    completionCost,
    totalCost,
    confidence,
  };
}
