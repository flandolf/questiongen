import { MarkAnswerResponse, BackendError, GenerationRecord, Topic, Difficulty, QuestionMode, TechMode } from "../types"

const NORMALIZED_MATH_CACHE_MAX_ENTRIES = 200;
const normalizedMathCache = new Map<string, string>();

export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }
  return date.toLocaleString();
}

export function formatPercent(value: number, fractionDigits = 1): string {
  return `${value.toFixed(fractionDigits)}%`;
}

export function formatDurationMs(value?: number): string {
  if (value === undefined || value <= 0) {
    return "n/a";
  }

  if (value < 1000) {
    return `${Math.round(value)}ms`;
  }

  const seconds = value / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

export function clampWholeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const rounded = Math.round(parsed);
  return Math.min(max, Math.max(min, rounded));
}

export function normalizeMarkResponse(raw: unknown, questionMaxMarks: number): MarkAnswerResponse {
  const data = (raw ?? {}) as Partial<MarkAnswerResponse>;
  const maxMarks = questionMaxMarks > 0 ? questionMaxMarks : clampWholeNumber(data.maxMarks, 10, 1, 30);
  const achievedMarks = clampWholeNumber(data.achievedMarks, 0, 0, maxMarks);
  const scoreOutOf10 = clampWholeNumber(data.scoreOutOf10, Math.round((achievedMarks / maxMarks) * 10), 0, 10);
  const vcaaMarkingScheme = Array.isArray(data.vcaaMarkingScheme)
    ? data.vcaaMarkingScheme.map((item) => ({
      criterion: item.criterion || "Criterion",
      achievedMarks: clampWholeNumber(item.achievedMarks, 0, 0, maxMarks),
      maxMarks: clampWholeNumber(item.maxMarks, maxMarks, 1, maxMarks),
      rationale: item.rationale || "No rationale provided.",
    }))
    : [];

  return {
    verdict: data.verdict || "Unrated",
    achievedMarks,
    maxMarks,
    scoreOutOf10,
    vcaaMarkingScheme,
    comparisonToSolutionMarkdown:
      data.comparisonToSolutionMarkdown || "Comparison was not returned for this response.",
    feedbackMarkdown: data.feedbackMarkdown || "No feedback returned.",
    workedSolutionMarkdown: data.workedSolutionMarkdown || "No worked solution returned.",
  };
}

/**
 * Prepare a string field from the Rust backend for MathJax rendering.
 *
 * The Rust backend (`parsing.rs`) now owns the full sanitization pipeline:
 *   - `protect_latex_in_raw_json`  — preserves \frac, \text, \beta etc. through JSON parsing
 *   - `decode_escapes`             — resolves literal \n artefacts
 *   - `sanitise_latex`             — converts \(...\)/\[...\] → $/$$ delimiters, protects \$
 *   - `normalise_typography`       — smart quotes, em-dashes, ellipsis → ASCII
 *
 * By the time a field reaches the frontend it is already clean. This function
 * handles two residual cases that only arise for data written to the database
 * *before* the Rust pipeline was updated (backwards compatibility):
 *
 *   1. renderCurrencyEscapes  — converts \$ (Rust-emitted currency escape) back
 *      to a visible $ for display, skipping over real math spans.
 *
 *   2. escapeBarePercentInMath — adds \% inside math spans so MathJax doesn't
 *      treat % as a comment character.
 *
 * Everything else (form feed recovery, \t tab recovery, pseudo-delimiter
 * conversion, double-backslash normalisation) is handled by Rust and is
 * intentionally removed here to avoid double-processing.
 */
export function normalizeMathDelimiters(content: string): string {
  const cached = normalizedMathCache.get(content);
  if (cached !== undefined) {
    return cached;
  }

  const normalized = transformOutsideCode(content, (segment) => {
    return escapeBarePercentInMath(renderCurrencyEscapes(segment));
  });

  if (normalizedMathCache.size >= NORMALIZED_MATH_CACHE_MAX_ENTRIES) {
    const firstKey = normalizedMathCache.keys().next().value;
    if (firstKey !== undefined) {
      normalizedMathCache.delete(firstKey);
    }
  }

  normalizedMathCache.set(content, normalized);
  return normalized;
}

/**
 * Apply `transform` to every segment of `content` that is not inside a
 * fenced code block (``` ... ```) or an inline code span (` ... `).
 */
function transformOutsideCode(content: string, transform: (segment: string) => string): string {
  return content
    .split(/(```[\s\S]*?```)/g)
    .map((fencedOrPlainChunk) => {
      if (fencedOrPlainChunk.startsWith("```")) {
        return fencedOrPlainChunk;
      }
      return fencedOrPlainChunk
        .split(/(`[^`\n]*`)/g)
        .map((inlineCodeOrPlain) => {
          if (inlineCodeOrPlain.startsWith("`") && inlineCodeOrPlain.endsWith("`")) {
            return inlineCodeOrPlain;
          }
          return transform(inlineCodeOrPlain);
        })
        .join("");
    })
    .join("");
}

/**
 * Convert `\$` (escaped dollar, emitted by the Rust backend for currency
 * amounts) back to a literal `$` outside math spans, so it renders correctly.
 *
 * A `\$` inside a math span is left untouched — LaTeX itself uses `\$` to
 * render a literal dollar sign in math mode, so MathJax handles it correctly.
 */
function renderCurrencyEscapes(content: string): string {
  let result = "";
  let i = 0;
  while (i < content.length) {
    // Display math: $$...$$
    if (content[i] === "$" && content[i + 1] === "$") {
      const close = content.indexOf("$$", i + 2);
      if (close !== -1) {
        result += content.slice(i, close + 2);
        i = close + 2;
        continue;
      }
    }
    // Inline math: $...$  (not preceded by \)
    if (content[i] === "$" && content[i - 1] !== "\\") {
      const close = content.indexOf("$", i + 1);
      if (close !== -1) {
        result += content.slice(i, close + 1);
        i = close + 1;
        continue;
      }
    }
    // Currency escape: \$ outside math → literal $
    if (content[i] === "\\" && content[i + 1] === "$") {
      result += "$";
      i += 2;
      continue;
    }
    result += content[i];
    i += 1;
  }
  return result;
}

/**
 * Ensure `%` inside math spans is escaped as `\%` so MathJax does not treat
 * it as a LaTeX comment character, discarding the rest of the math expression.
 */
function escapeBarePercentInMath(content: string): string {
  return content.replace(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g, (mathSegment: string) => {
    const delimiter = mathSegment.startsWith("$$") ? "$$" : "$";
    const inner = mathSegment.slice(delimiter.length, -delimiter.length);
    return `${delimiter}${escapeUnescapedPercent(inner)}${delimiter}`;
  });
}

function escapeUnescapedPercent(content: string): string {
  let result = "";
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    if (char !== "%") {
      result += char;
      continue;
    }
    let backslashCount = 0;
    for (let j = i - 1; j >= 0 && content[j] === "\\"; j -= 1) {
      backslashCount += 1;
    }
    result += backslashCount % 2 === 0 ? "\\%" : "%";
  }
  return result;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

export function readBackendError(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && error !== null) {
    const maybeError = error as BackendError;
    if (typeof maybeError.message === "string") {
      return maybeError.message;
    }
    if (typeof (error as { toString?: () => string }).toString === "function") {
      const text = (error as { toString: () => string }).toString();
      if (text && text !== "[object Object]") {
        return text;
      }
    }
  }
  return "Unknown error. Please try again.";
}

export function confirmAction(message: string): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  if (isTauriRuntime()) {
    return true;
  }

  try {
    if (typeof window.confirm === "function") {
      return window.confirm(message);
    }
  } catch {
    // Some embedded runtimes do not support native confirm dialogs.
  }

  return true;
}

function isTauriRuntime(): boolean {
  const runtimeWindow = window as Window & {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };

  return typeof runtimeWindow.__TAURI__ !== "undefined"
    || typeof runtimeWindow.__TAURI_INTERNALS__ !== "undefined";
}

export function formatCostUsd(costUsd: number | null | undefined): string {
  if (costUsd == null) return "n/a";
  if (costUsd === 0) return "$0.00";
  if (costUsd < 0.00001) return "<$0.00001";
  if (costUsd < 0.01) return `$${costUsd.toFixed(5)}`;
  return `$${costUsd.toFixed(4)}`;
}

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
 * Subjects with denser notation (e.g. Specialist Maths) need more tokens for
 * question bodies, worked solutions, and marking criteria.
 */
const TOPIC_BASE_TOKENS: Record<string, number> = {
  "Mathematical Methods": 850,
  "Specialist Mathematics": 950,
  "Chemistry": 800,
  "Physical Education": 700,
};

/** Default per-question token budget for topics not listed above. */
const DEFAULT_TOPIC_BASE_TOKENS = 800;

const DIFFICULTY_MULTIPLIERS: Record<string, number> = {
  "Essential Skills": 0.7,
  "Easy": 0.85,
  "Medium": 1.0,
  "Hard": 1.25,
  "Extreme": 1.5,
};

const TECH_MODE_MULTIPLIERS: Record<string, number> = {
  "tech-free": 0.9,
  "mix": 1.0,
  "tech-active": 1.1,
};

/**
 * Prompt/completion split by question mode.
 * Multiple-choice: more prompt (question stem + distractors), shorter completion.
 * Written: shorter prompt, much longer completion (worked solution + marking scheme).
 */
const QUESTION_MODE_RATIOS = {
  "multiple-choice": { prompt: 0.6, completion: 0.4 },
  "written": { prompt: 0.35, completion: 0.65 },
};

const PARAMETER_WEIGHTS = {
  topic: 0.4,
  difficulty: 0.3,
  questionMode: 0.2,
  techMode: 0.1,
};

/**
 * Tokens added per mark for questions with an explicit mark cap.
 * Higher-mark questions require more detailed worked solutions and marking criteria.
 */
const TOKENS_PER_MARK = 40;

/** Default assumed marks when averageMarksPerQuestion is not specified. */
const DEFAULT_MARKS = 4;

// =============================================================================
// LOG REGRESSION MODEL FOR TOKEN ESTIMATION
// =============================================================================

/**
 * Log regression coefficients for predicting total tokens.
 * Model: log(totalTokens) = bias + sum(coef_i * feature_i)
 * Using log transformation captures the diminishing returns of certain factors.
 *
 * ADDITIONAL FACTORS FOR IMPROVING PREDICTION ACCURACY:
 * ====================================================
 *
 * 1. MODEL-SPECIFIC FEATURES
 *    - Model name/version: Different models (GPT-4, Claude, etc.) have different tokenization
 *    - Temperature setting: Higher temperature may generate more diverse/varied responses
 *    - Max tokens limit: Hard cap on completion length
 *
 * 2. CONTENT COMPLEXITY METRICS
 *    - Average question stem length (character count)
 *    - Number of images/figures per question
 *    - Presence of LaTeX equations (count of $ delimiters)
 *    - Mathematical notation density (symbols per question)
 *    - Number of distractors (for multiple choice: typically 4)
 *
 * 3. GENERATION PARAMETERS
 *    - Retry count: Multiple generation attempts may indicate complexity
 *    - Generation duration: Longer generation times correlate with more complex outputs
 *    - Parsing failures: Failed parsing attempts suggest complex content
 *
 * 4. CONTEXTUAL FEATURES
 *    - Previous question similarity: Similar questions may have correlated token usage
 *    - Time of day: Model API may have variable latency/behavior
 *    - API version: Updates to API may change tokenization
 *
 * 5. HISTORICAL PATTERNS
 *    - Per-topic token variance: Track standard deviation per topic
 *    - Seasonality: Exam periods may have different question complexity
 *    - Model drift: API models may change behavior over time
 *
 * 6. OUTPUT STRUCTURE
 *    - Include worked solution: Boolean flag adds significant tokens
 *    - Include marking criteria: VCAA-style marking adds tokens
 *    - Include feedback: Detailed feedback adds tokens
 *    - Number of alternative solutions: Multiple approaches increase length
 */
export interface LogRegressionCoefficients {
  /** Intercept term */
  bias: number;
  /** Coefficient for log(questionCount) */
  logQuestionCount: number;
  /** Coefficient for questionCount (linear term for small batch effects) */
  questionCount: number;
  /** Coefficient for log(totalMarks) */
  logTotalMarks: number;
  /** Coefficient for totalMarks (linear) */
  totalMarks: number;
  /** Topic-specific coefficients */
  topicCoefficients: Record<string, number>;
  /** Difficulty coefficients */
  difficultyCoefficients: Record<string, number>;
  /** Question mode coefficients */
  questionModeCoefficients: Record<string, number>;
  /** Tech mode coefficients */
  techModeCoefficients: Record<string, number>;
  /** Subtopics feature (log of subtopic count) */
  subtopicsCoefficient: number;
  /** Custom focus area feature */
  hasCustomFocusCoefficient: number;
  /** Model metadata */
  modelVersion: string;
  trainedAt: number;
  sampleSize: number;
  rSquared: number;
}

/** Default coefficients for cold-start (no training data) */
const DEFAULT_LOG_REGRESSION_COEFFICIENTS: LogRegressionCoefficients = {
  bias: 7.5, // log(~1800) base
  logQuestionCount: 0.5,
  questionCount: 15,
  logTotalMarks: 0.3,
  totalMarks: 0,
  topicCoefficients: {
    "Mathematical Methods": 0.05,
    "Specialist Mathematics": 0.12,
    "Chemistry": -0.02,
    "Physical Education": -0.1,
  },
  difficultyCoefficients: {
    "Essential Skills": -0.15,
    "Easy": -0.05,
    "Medium": 0,
    "Hard": 0.1,
    "Extreme": 0.2,
  },
  questionModeCoefficients: {
    "multiple-choice": -0.2,
    "written": 0.15,
  },
  techModeCoefficients: {
    "tech-free": -0.05,
    "mix": 0,
    "tech-active": 0.03,
  },
  subtopicsCoefficient: 0.02,
  hasCustomFocusCoefficient: 0.05,
  modelVersion: "1.0.0",
  trainedAt: 0,
  sampleSize: 0,
  rSquared: 0,
};

const LOG_REGRESSION_STORAGE_KEY = "token-estimation-log-reg-v1";

/**
 * Persist log regression coefficients to localStorage.
 */
export function persistLogRegressionCoefficients(coeffs: LogRegressionCoefficients): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LOG_REGRESSION_STORAGE_KEY, JSON.stringify(coeffs));
    }
  } catch {
    // best-effort only
  }
}

/**
 * Load log regression coefficients from localStorage.
 */
export function loadLogRegressionCoefficients(): LogRegressionCoefficients {
  try {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(LOG_REGRESSION_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Validate basic structure
        if (typeof parsed.bias === "number" && typeof parsed.logQuestionCount === "number") {
          return { ...DEFAULT_LOG_REGRESSION_COEFFICIENTS, ...parsed };
        }
      }
    }
  } catch {
    // fall through to defaults
  }
  return { ...DEFAULT_LOG_REGRESSION_COEFFICIENTS };
}

/**
 * Extract features from generation parameters for log regression.
 */
function extractLogRegressionFeatures(
  questionCount: number,
  averageMarksPerQuestion: number | undefined,
  topic: Topic,
  difficulty: Difficulty,
  questionMode: QuestionMode,
  techMode: TechMode,
  subtopics?: string[],
  customFocusArea?: string,
  // Accept trained coefficients so categorical lookups reflect learned values,
  // not the frozen defaults. Falls back to defaults when not supplied.
  coeffs: LogRegressionCoefficients = DEFAULT_LOG_REGRESSION_COEFFICIENTS
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
    hasCustomFocus: customFocusArea && customFocusArea.trim().length > 0 ? 1 : 0,
  };
}

/**
 * Predict total tokens using log regression model.
 */
function predictTokensLogRegression(
  coeffs: LogRegressionCoefficients,
  features: Record<string, number>
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
  linearPrediction += coeffs.hasCustomFocusCoefficient * features.hasCustomFocus;

  return Math.round(Math.exp(linearPrediction));
}

/**
 * Train log regression coefficients from historical data using gradient descent.
 * Returns updated coefficients and R² score.
 */
export function trainLogRegressionModel(
  records: GenerationRecord[],
  existingCoeffs?: LogRegressionCoefficients
): { coefficients: LogRegressionCoefficients; rSquared: number } {
  const validRecords = records.filter(
    r =>
      r.outputs.totalTokens != null &&
      r.outputs.totalTokens > 0 &&
      r.inputs.questionCount > 0
  );

  if (validRecords.length < 5) {
    // Not enough data to train
    return {
      coefficients: { ...DEFAULT_LOG_REGRESSION_COEFFICIENTS, trainedAt: Date.now(), sampleSize: validRecords.length },
      rSquared: 0,
    };
  }

  // Initialize coefficients
  const coeffs = existingCoeffs ? { ...existingCoeffs } : { ...DEFAULT_LOG_REGRESSION_COEFFICIENTS };
  // Deep-clone mutable nested objects so training doesn't mutate the input
  coeffs.topicCoefficients = { ...coeffs.topicCoefficients };
  coeffs.difficultyCoefficients = { ...coeffs.difficultyCoefficients };
  coeffs.questionModeCoefficients = { ...coeffs.questionModeCoefficients };
  coeffs.techModeCoefficients = { ...coeffs.techModeCoefficients };

  // Prepare training data — features must use the *current* coefficients so that
  // categorical lookups (topicCoeff, difficultyCoeff, …) reflect any pre-trained
  // values rather than the frozen defaults.
  const buildTrainingData = () =>
    validRecords.map(record => ({
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
        coeffs
      ),
      target: Math.log(record.outputs.totalTokens!),
    }));

  // Gradient descent optimization
  const learningRate = 0.01;
  const iterations = 200;

  for (let iter = 0; iter < iterations; iter++) {
    // Rebuild features each iteration so they reflect the latest coefficients
    // for the categorical terms that change during training.
    const trainingData = buildTrainingData();

    let gradBias = 0, gradLogQ = 0, gradQ = 0, gradLogM = 0, gradM = 0;
    let gradSub = 0, gradFocus = 0;

    // Per-category gradients: track each level independently
    const gradTopic: Record<string, number> = {};
    const gradDiff: Record<string, number> = {};
    const gradMode: Record<string, number> = {};
    const gradTech: Record<string, number> = {};

    for (const { record, features, target } of trainingData) {
      // Predict using current coefficients
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

      // Accumulate scalar gradients
      gradBias += error;
      gradLogQ += error * features.logQuestionCount;
      gradQ += error * features.questionCount;
      gradLogM += error * features.logTotalMarks;
      gradM += error * features.totalMarks;
      gradSub += error * features.subtopicsLog;
      gradFocus += error * features.hasCustomFocus;

      // Accumulate per-level categorical gradients (gradient = error * 1 for the active level)
      const t = record.inputs.topic as string;
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

    // Update scalar coefficients
    coeffs.bias -= gradBias * scale;
    coeffs.logQuestionCount -= gradLogQ * scale;
    coeffs.questionCount -= gradQ * scale * 0.001; // dampen linear term
    coeffs.logTotalMarks -= gradLogM * scale;
    coeffs.totalMarks -= gradM * scale * 0.001;
    coeffs.subtopicsCoefficient -= gradSub * scale;
    coeffs.hasCustomFocusCoefficient -= gradFocus * scale;

    // Update every observed category level — not just one reference level
    const catScale = scale * 0.1;
    for (const [level, grad] of Object.entries(gradTopic)) {
      coeffs.topicCoefficients[level] = (coeffs.topicCoefficients[level] ?? 0) - grad * catScale;
    }
    for (const [level, grad] of Object.entries(gradDiff)) {
      coeffs.difficultyCoefficients[level] = (coeffs.difficultyCoefficients[level] ?? 0) - grad * catScale;
    }
    for (const [level, grad] of Object.entries(gradMode)) {
      coeffs.questionModeCoefficients[level] = (coeffs.questionModeCoefficients[level] ?? 0) - grad * catScale;
    }
    for (const [level, grad] of Object.entries(gradTech)) {
      coeffs.techModeCoefficients[level] = (coeffs.techModeCoefficients[level] ?? 0) - grad * catScale;
    }
  }

  // Calculate R² score on final predictions using the shared prediction helper
  const finalData = buildTrainingData();
  const meanTarget = finalData.reduce((sum, d) => sum + d.target, 0) / finalData.length;
  let ssRes = 0, ssTot = 0;
  for (const { features, target } of finalData) {
    const pred = Math.log(predictTokensLogRegression(coeffs, features));

    ssRes += (pred - target) ** 2;
    ssTot += (target - meanTarget) ** 2;
  }
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return {
    coefficients: {
      ...coeffs,
      modelVersion: "1.0.0",
      trainedAt: Date.now(),
      sampleSize: validRecords.length,
      rSquared: Math.max(0, rSquared),
    },
    rSquared: Math.max(0, rSquared),
  };
}

/**
 * Estimate tokens using log regression model.
 * Falls back to static estimation if model is not trained or insufficient confidence.
 */
function estimateTokensLogRegression(
  questionCount: number,
  averageMarksPerQuestion: number | undefined,
  topic: Topic,
  difficulty: Difficulty,
  questionMode: QuestionMode,
  techMode: TechMode,
  subtopics?: string[],
  customFocusArea?: string,
  historyRecords?: GenerationRecord[]
): { promptTokens: number; completionTokens: number; totalTokens: number; confidence: number } {
  // Load or train coefficients
  let coeffs = loadLogRegressionCoefficients();

  // Retrain if we have new data and model needs updating
  if (historyRecords && historyRecords.length > coeffs.sampleSize + 10) {
    const { coefficients, rSquared } = trainLogRegressionModel(historyRecords, coeffs);
    if (rSquared > coeffs.rSquared) {
      coeffs = coefficients;
      persistLogRegressionCoefficients(coeffs);
    }
  }

  // Extract features using the (possibly retrained) coefficients so categorical lookups reflect learned values.
  const features = extractLogRegressionFeatures(
    questionCount,
    averageMarksPerQuestion,
    topic,
    difficulty,
    questionMode,
    techMode,
    subtopics,
    customFocusArea,
    coeffs
  );

  // For prompt/completion split, use question mode ratios
  const ratios = QUESTION_MODE_RATIOS[questionMode];
  const totalTokens = predictTokensLogRegression(coeffs, features);

  // Apply prompt/completion split
  const promptTokens = Math.round(totalTokens * ratios.prompt);
  const completionTokens = Math.round(totalTokens * ratios.completion);

  // Confidence based on R² and sample size
  const confidence = Math.min(0.95, coeffs.rSquared * Math.min(1, coeffs.sampleSize / 50));

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
  customFocusArea?: string
): number {
  let score = 0;

  if (record.inputs.topic === topic) score += PARAMETER_WEIGHTS.topic;
  if (record.inputs.difficulty === difficulty) score += PARAMETER_WEIGHTS.difficulty;
  if (record.inputs.questionMode === questionMode) score += PARAMETER_WEIGHTS.questionMode;
  if (record.inputs.techMode === techMode) score += PARAMETER_WEIGHTS.techMode;

  const marksMatch =
    (averageMarksPerQuestion == null && record.inputs.averageMarksPerQuestion == null) ||
    (averageMarksPerQuestion != null && record.inputs.averageMarksPerQuestion === averageMarksPerQuestion);
  if (marksMatch) score += 0.1;

  if (subtopics && record.inputs.subtopics) {
    const overlap = subtopics.filter(s => record.inputs.subtopics!.includes(s)).length;
    const maxLength = Math.max(subtopics.length, record.inputs.subtopics!.length);
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

/**
 * Decompose a historical record's total tokens into fixed + per-question parts,
 * normalise to a per-question figure comparable across different questionCounts,
 * then re-project for the requested questionCount.
 *
 * Token structure: total = SYSTEM_PROMPT + N * perQuestion
 *   → perQuestion = (total - SYSTEM_PROMPT) / N
 *   → projectedTotal = SYSTEM_PROMPT + requestedN * perQuestion
 */
function projectTokensForCount(
  recordTotalTokens: number,
  recordQuestionCount: number,
  requestedQuestionCount: number
): number {
  const n = Math.max(recordQuestionCount, 1);
  const perQuestion = (recordTotalTokens - SYSTEM_PROMPT_TOKENS) / n;
  // Guard against malformed records where perQuestion ends up negative
  const safePerQuestion = Math.max(perQuestion, PER_QUESTION_PROMPT_TOKENS * 0.5);
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
  customFocusArea?: string
): { promptTokens: number; completionTokens: number; totalTokens: number; confidence: number } {
  // Primary: Use log regression model if available (trained or has defaults)
  const logRegResult = estimateTokensLogRegression(
    questionCount,
    averageMarksPerQuestion,
    topic,
    difficulty,
    questionMode,
    techMode,
    subtopics,
    customFocusArea,
    generationHistory
  );

  // If log regression has decent confidence (R² >= 0.3), use it
  if (logRegResult.confidence >= 0.3) {
    return logRegResult;
  }

  // Fallback to history-based estimation if available
  const validRecords = generationHistory.filter(
    record =>
      record.outputs.totalTokens != null &&
      record.outputs.promptTokens != null &&
      record.outputs.completionTokens != null
  );

  if (validRecords.length === 0) {
    return estimateStaticTokens(topic, difficulty, questionCount, questionMode, techMode, averageMarksPerQuestion, subtopics, customFocusArea);
  }

  const recordsWithSimilarity = validRecords
    .map(record => ({
      record,
      similarity: calculateSimilarity(record, topic, difficulty, questionMode, techMode, averageMarksPerQuestion, subtopics, customFocusArea),
      recencyWeight: Math.exp(
        -0.1 * ((Date.now() - new Date(record.timestamp).getTime()) / (1000 * 60 * 60 * 24))
      ),
    }))
    .filter(item => item.similarity > 0.3);

  if (recordsWithSimilarity.length === 0) {
    return estimateStaticTokens(topic, difficulty, questionCount, questionMode, techMode, averageMarksPerQuestion, subtopics, customFocusArea);
  }

  recordsWithSimilarity.sort(
    (a, b) => b.similarity * b.recencyWeight - a.similarity * a.recencyWeight
  );

  const topMatches = recordsWithSimilarity.slice(0, 5);
  let totalWeight = 0;
  let weightedTotalTokens = 0;
  let weightedPromptRatio = 0;
  let weightedCompletionRatio = 0;

  for (const { record, similarity, recencyWeight } of topMatches) {
    const combinedWeight = similarity * recencyWeight;
    totalWeight += combinedWeight;

    // Project the historical total to the requested question count before weighting,
    // so records from different-sized batches are comparable.
    const recordQuestionCount = record.inputs.questionCount ?? 1;
    const projectedTotal = projectTokensForCount(
      record.outputs.totalTokens!,
      recordQuestionCount,
      questionCount
    );

    weightedTotalTokens += projectedTotal * combinedWeight;

    const recordPromptRatio = record.outputs.promptTokens! / record.outputs.totalTokens!;
    const recordCompletionRatio = record.outputs.completionTokens! / record.outputs.totalTokens!;
    weightedPromptRatio += recordPromptRatio * combinedWeight;
    weightedCompletionRatio += recordCompletionRatio * combinedWeight;
  }

  const projectedTotal = weightedTotalTokens / totalWeight;
  const avgPromptRatio = weightedPromptRatio / totalWeight;
  const avgCompletionRatio = weightedCompletionRatio / totalWeight;

  const avgSimilarity = topMatches.reduce((sum, m) => sum + m.similarity, 0) / topMatches.length;
  const avgRecency = topMatches.reduce((sum, m) => sum + m.recencyWeight, 0) / topMatches.length;
  const confidence = Math.min(1.0, (topMatches.length / 3) * avgSimilarity * avgRecency);

  return {
    promptTokens: Math.round(projectedTotal * avgPromptRatio),
    completionTokens: Math.round(projectedTotal * avgCompletionRatio),
    totalTokens: Math.round(projectedTotal),
    confidence,
  };
}

/**
 * Static (no-history) token estimator.
 *
 * Token model:
 *   totalPrompt     = SYSTEM_PROMPT_TOKENS + N * perQuestionPrompt
 *   totalCompletion = N * perQuestionCompletion
 *   total           = totalPrompt + totalCompletion
 *
 * perQuestionPrompt is built from:
 *   - Topic base tokens (subject-specific notation density)
 *   - PER_QUESTION_PROMPT_TOKENS (shared instruction overhead per question)
 *   - Difficulty multiplier
 *   - Tech mode multiplier
 *   - Marks multiplier (more marks → longer question + solution)
 *   - Minor boosts for subtopics and custom focus areas
 */
function estimateStaticTokens(
  topic: Topic,
  difficulty: Difficulty,
  questionCount: number,
  questionMode: QuestionMode,
  techMode: TechMode,
  averageMarksPerQuestion?: number,
  subtopics?: string[],
  customFocusArea?: string
): { promptTokens: number; completionTokens: number; totalTokens: number; confidence: number } {
  const topicBase = TOPIC_BASE_TOKENS[topic] ?? DEFAULT_TOPIC_BASE_TOKENS;
  const difficultyMultiplier = DIFFICULTY_MULTIPLIERS[difficulty] ?? 1.0;
  const techMultiplier = TECH_MODE_MULTIPLIERS[techMode] ?? 1.0;

  // More marks = longer question stem, worked solution, and marking criteria
  const marks = averageMarksPerQuestion ?? DEFAULT_MARKS;
  const marksTokens = marks * TOKENS_PER_MARK;

  // Each additional subtopic adds a small routing context overhead
  const subtopicsBonus = subtopics && subtopics.length > 0
    ? (subtopics.length - 1) * 15
    : 0;

  // Custom focus area adds a brief extra instruction block
  const focusBonus = customFocusArea && customFocusArea.trim().length > 0 ? 60 : 0;

  // Per-question prompt tokens: topic base, scaled by difficulty + tech mode, plus fixed overhead
  const perQuestionPromptBase =
    (topicBase + marksTokens + subtopicsBonus + focusBonus) *
    difficultyMultiplier *
    techMultiplier +
    PER_QUESTION_PROMPT_TOKENS;

  const ratios = QUESTION_MODE_RATIOS[questionMode];

  // The system prompt is paid once; per-question content scales linearly
  const totalPromptTokens = Math.round(SYSTEM_PROMPT_TOKENS + questionCount * perQuestionPromptBase);

  // Completion scales purely per-question
  const perQuestionCompletion = (perQuestionPromptBase * ratios.completion) / ratios.prompt;
  const totalCompletionTokens = Math.round(questionCount * perQuestionCompletion);

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
  completionPricePerToken?: number | null
): EstimatedTokensAndCost {
  const { promptTokens, completionTokens, totalTokens, confidence } = estimateTokensAdvanced(
    generationHistory,
    topic,
    difficulty,
    questionCount,
    questionMode,
    techMode,
    averageMarksPerQuestion,
    subtopics,
    customFocusArea
  );

  // Per-question breakdowns exclude the one-time system prompt overhead
  const variablePromptTokens = Math.max(promptTokens - SYSTEM_PROMPT_TOKENS, 0);
  const promptTokensPerQuestion = Math.round(
    SYSTEM_PROMPT_TOKENS / questionCount + variablePromptTokens / questionCount
  );
  const completionTokensPerQuestion = Math.round(completionTokens / questionCount);
  const totalTokensPerQuestion = promptTokensPerQuestion + completionTokensPerQuestion;

  const promptCost = promptPricePerToken != null ? promptPricePerToken * promptTokens : null;
  const completionCost = completionPricePerToken != null ? completionPricePerToken * completionTokens : null;
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