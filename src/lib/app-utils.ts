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
  // Always use the authoritative question max marks; the model sometimes
  // returns maxMarks:10 (copied from the example in the prompt) regardless
  // of the actual question value.
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
 * Normalise math delimiters and fix LaTeX rendering issues for MathJax 3.
 *
 * Pipeline (applied outside code spans/fences):
 *
 * 1. normalizePseudoMathDelimiters  — \(...\) → $...$, \[...\] → $$...$$
 *    Kept for backwards-compat with data stored before the Rust sanitise_latex
 *    pass was added. New data arriving from the backend is already normalised.
 *
 * 2. renderCurrencyEscapes  — \$ → $ outside math spans.
 *    The Rust backend emits \$ for currency dollar signs so they don't confuse
 *    the MathJax delimiter scanner. This step converts them back to a visible $
 *    for display. Must run AFTER step 1 so pseudo-delimiters are resolved first,
 *    and BEFORE steps 3–4 so math spans are correctly identified.
 *
 * 3. normalizeEscapedLatexCommandsInMath  — \\sin → \sin inside math spans.
 *    Fixes double-escaped backslashes that survive JSON decode.
 *
 * 4. escapeBarePercentInMath  — % → \% inside math spans.
 */
export function normalizeMathDelimiters(content: string): string {
  const cached = normalizedMathCache.get(content);
  if (cached !== undefined) {
    return cached;
  }

  const normalized = transformOutsideCode(content, (segment) =>
    escapeBarePercentInMath(
      normalizeEscapedLatexCommandsInMath(
        renderCurrencyEscapes(
          normalizePseudoMathDelimiters(segment),
        ),
      ),
    ),
  );

  if (normalizedMathCache.size >= NORMALIZED_MATH_CACHE_MAX_ENTRIES) {
    const firstKey = normalizedMathCache.keys().next().value;
    if (firstKey !== undefined) {
      normalizedMathCache.delete(firstKey);
    }
  }

  normalizedMathCache.set(content, normalized);
  return normalized;
}

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

// Backwards-compat: convert \[...\] and \(...\) delimiters to $$...$$ / $...$
// that MathJax 3 understands. New data from the backend is already normalised by
// the Rust sanitise_latex pass, but stored history may predate that.
function normalizePseudoMathDelimiters(content: string): string {
  return content
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, expression: string) => `$$${expression.trim()}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, expression: string) => `$${expression.trim()}$`);
}

/**
 * Convert \$ (escaped dollar, emitted by the Rust backend for currency amounts)
 * back to a literal $ outside math spans, so it renders correctly on screen.
 *
 * Must run after normalizePseudoMathDelimiters (so all math spans use $ delimiters)
 * and before escapeBarePercentInMath / normalizeEscapedLatexCommandsInMath
 * (which identify math spans by their $ delimiters).
 *
 * A \$ inside a math span is left untouched — LaTeX itself uses \$ to render
 * a literal dollar sign in math mode, so MathJax handles it correctly already.
 */
function renderCurrencyEscapes(content: string): string {
  // Walk the string, replacing \$ that falls outside a math span.
  // We identify math spans ($...$ and $$...$$) to skip over them.
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

function escapeBarePercentInMath(content: string): string {
  return content.replace(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g, (mathSegment: string) => {
    const delimiter = mathSegment.startsWith("$$") ? "$$" : "$";
    const inner = mathSegment.slice(delimiter.length, -delimiter.length);
    return `${delimiter}${escapeUnescapedPercent(inner)}${delimiter}`;
  });
}

function normalizeEscapedLatexCommandsInMath(content: string): string {
  return content.replace(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g, (mathSegment: string) => {
    const delimiter = mathSegment.startsWith("$$") ? "$$" : "$";
    const inner = mathSegment.slice(delimiter.length, -delimiter.length);
    // Some model outputs provide "\text" with a single slash in JSON strings.
    // JSON decoding interprets "\t" as a tab, so recover that tab + command pattern.
    const recoveredTabEscapes = inner.replace(/\t(?=[A-Za-z])/g, "\\t");
    // Model responses sometimes include JSON-escaped LaTeX commands (e.g. \\sin).
    const normalizedInner = recoveredTabEscapes.replace(/\\\\([A-Za-z]+)/g, "\\$1");
    return `${delimiter}${normalizedInner}${delimiter}`;
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

  // Native confirm dialogs can be unavailable or return unreliable values in Tauri WebViews.
  // In that runtime, prefer non-blocking behavior so destructive actions still execute.
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
  confidence?: number; // Optional confidence score (0-1)
}

// Constants for advanced estimation
const TOPIC_BASE_TOKENS: Record<string, number> = {
  "Mathematical Methods": 1800,
  "Specialist Mathematics": 2200,
  "Chemistry": 1600,
  "Physical Education": 1200,
};

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

const QUESTION_MODE_RATIOS = {
  "multiple-choice": { prompt: 0.6, completion: 0.4 },
  "written": { prompt: 0.35, completion: 0.65 },
};

// Parameter weights for fuzzy matching
const PARAMETER_WEIGHTS = {
  topic: 0.4,
  difficulty: 0.3,
  questionMode: 0.2,
  techMode: 0.1,
};

// Calculate similarity score between current params and historical record
function calculateSimilarity(
  record: GenerationRecord,
  topic: Topic,
  difficulty: Difficulty,
  questionMode: QuestionMode,
  techMode: TechMode,
  maxMarksPerQuestion?: number,
  subtopics?: string[],
  customFocusArea?: string
): number {
  let score = 0;

  if (record.inputs.topic === topic) score += PARAMETER_WEIGHTS.topic;
  if (record.inputs.difficulty === difficulty) score += PARAMETER_WEIGHTS.difficulty;
  if (record.inputs.questionMode === questionMode) score += PARAMETER_WEIGHTS.questionMode;
  if (record.inputs.techMode === techMode) score += PARAMETER_WEIGHTS.techMode;

  // For maxMarksPerQuestion, consider it matching if both are undefined or equal
  const marksMatch = (maxMarksPerQuestion == null && record.inputs.maxMarksPerQuestion == null) ||
                     (maxMarksPerQuestion != null && record.inputs.maxMarksPerQuestion === maxMarksPerQuestion);
  if (marksMatch) score += 0.1; // Small weight for marks matching

  // Subtopics similarity (if both have subtopics, check overlap)
  if (subtopics && record.inputs.subtopics) {
    const overlap = subtopics.filter(s => record.inputs.subtopics!.includes(s)).length;
    const maxLength = Math.max(subtopics.length, record.inputs.subtopics!.length);
    if (maxLength > 0) {
      score += 0.05 * (overlap / maxLength); // Small weight for subtopic overlap
    }
  }

  // Custom focus area similarity (simple presence check)
  const focusMatch = (customFocusArea && record.inputs.customFocusArea) ||
                     (!customFocusArea && !record.inputs.customFocusArea);
  if (focusMatch) score += 0.05; // Small weight for focus area matching

  return score;
}

// Advanced estimation with fuzzy matching and sophisticated static model
function estimateTokensAdvanced(
  generationHistory: GenerationRecord[],
  topic: Topic,
  difficulty: Difficulty,
  questionCount: number,
  questionMode: QuestionMode,
  techMode: TechMode,
  maxMarksPerQuestion?: number,
  subtopics?: string[],
  customFocusArea?: string
): { totalTokensPerQuestion: number; promptRatio: number; completionRatio: number; confidence: number } {
  // Filter valid historical records
  const validRecords = generationHistory.filter(record =>
    record.outputs.totalTokens != null &&
    record.outputs.promptTokens != null &&
    record.outputs.completionTokens != null
  );

  if (validRecords.length === 0) {
    // No historical data, use sophisticated static model
    return estimateStaticTokens(topic, difficulty, questionCount, questionMode, techMode, subtopics, customFocusArea);
  }

  // Calculate similarities and find best matches
  const recordsWithSimilarity = validRecords.map(record => ({
    record,
    similarity: calculateSimilarity(record, topic, difficulty, questionMode, techMode, maxMarksPerQuestion, subtopics, customFocusArea),
    // Calculate recency weight (exponential decay over time)
    ageInDays: (Date.now() - new Date(record.timestamp).getTime()) / (1000 * 60 * 60 * 24),
    recencyWeight: Math.exp(-0.1 * ((Date.now() - new Date(record.timestamp).getTime()) / (1000 * 60 * 60 * 24))), // Decay over days
  })).filter(item => item.similarity > 0.3); // Minimum similarity threshold

  if (recordsWithSimilarity.length === 0) {
    // No similar records, fallback to static
    return estimateStaticTokens(topic, difficulty, questionCount, questionMode, techMode, subtopics, customFocusArea);
  }

  // Sort by combined score (similarity * recency weight) descending
  recordsWithSimilarity.sort((a, b) => (b.similarity * b.recencyWeight) - (a.similarity * a.recencyWeight));

  // Use weighted average of top matches (up to 5)
  const topMatches = recordsWithSimilarity.slice(0, 5);
  let totalWeight = 0;
  let weightedTotalTokens = 0;
  let weightedPromptRatio = 0;
  let weightedCompletionRatio = 0;

  for (const { record, similarity, recencyWeight } of topMatches) {
    const combinedWeight = similarity * recencyWeight;
    totalWeight += combinedWeight;
    weightedTotalTokens += record.outputs.totalTokens! * combinedWeight;
    const recordPromptRatio = record.outputs.promptTokens! / record.outputs.totalTokens!;
    const recordCompletionRatio = record.outputs.completionTokens! / record.outputs.totalTokens!;
    weightedPromptRatio += recordPromptRatio * combinedWeight;
    weightedCompletionRatio += recordCompletionRatio * combinedWeight;
  }

  const avgTotalTokens = weightedTotalTokens / totalWeight;
  const avgPromptRatio = weightedPromptRatio / totalWeight;
  const avgCompletionRatio = weightedCompletionRatio / totalWeight;

  // Calculate confidence based on number of matches, average similarity, and recency
  const avgSimilarity = topMatches.reduce((sum, m) => sum + m.similarity, 0) / topMatches.length;
  const avgRecency = topMatches.reduce((sum, m) => sum + m.recencyWeight, 0) / topMatches.length;
  const confidence = Math.min(1.0, (topMatches.length / 3) * avgSimilarity * avgRecency);

  return {
    totalTokensPerQuestion: avgTotalTokens,
    promptRatio: avgPromptRatio,
    completionRatio: avgCompletionRatio,
    confidence,
  };
}

// Sophisticated static estimation model
function estimateStaticTokens(
  topic: Topic,
  difficulty: Difficulty,
  questionCount: number,
  questionMode: QuestionMode,
  techMode: TechMode,
  subtopics?: string[],
  customFocusArea?: string
): { totalTokensPerQuestion: number; promptRatio: number; completionRatio: number; confidence: number } {
  // Base tokens for topic
  const baseTokens = TOPIC_BASE_TOKENS[topic] ?? 1800;

  // Apply multipliers
  const difficultyMultiplier = DIFFICULTY_MULTIPLIERS[difficulty] ?? 1.0;
  const techMultiplier = TECH_MODE_MULTIPLIERS[techMode] ?? 1.0;

  // Subtopics complexity multiplier (more subtopics = more complex)
  const subtopicsMultiplier = subtopics && subtopics.length > 0 ? 1 + (subtopics.length - 1) * 0.1 : 1.0;

  // Custom focus area multiplier (additional complexity)
  const focusMultiplier = customFocusArea && customFocusArea.trim().length > 0 ? 1.15 : 1.0;

  // Calculate base tokens per question with multipliers
  let tokensPerQuestion = baseTokens * difficultyMultiplier * techMultiplier * subtopicsMultiplier * focusMultiplier;

  // Apply question count scaling (diminishing returns)
  // For multiple questions, there's overhead but less per additional question
  if (questionCount > 1) {
    const baseOverhead = tokensPerQuestion * 0.3; // 30% overhead for first question
    const additionalPerQuestion = tokensPerQuestion * 0.2; // 20% of base for each additional
    tokensPerQuestion = (baseOverhead + (questionCount - 1) * additionalPerQuestion) / questionCount;
  }

  const ratios = QUESTION_MODE_RATIOS[questionMode];

  return {
    totalTokensPerQuestion: tokensPerQuestion,
    promptRatio: ratios.prompt,
    completionRatio: ratios.completion,
    confidence: 0.5, // Lower confidence for static estimates
  };
}

export function estimateTokensAndCost(
  generationHistory: GenerationRecord[],
  topic: Topic,
  difficulty: Difficulty,
  questionCount: number,
  questionMode: QuestionMode,
  techMode: TechMode,
  maxMarksPerQuestion?: number,
  subtopics?: string[],
  customFocusArea?: string,
  promptPricePerToken?: number | null,
  completionPricePerToken?: number | null
): EstimatedTokensAndCost {
  // Use the advanced estimation
  const advancedResult = estimateTokensAdvanced(
    generationHistory,
    topic,
    difficulty,
    questionCount,
    questionMode,
    techMode,
    maxMarksPerQuestion,
    subtopics,
    customFocusArea
  );

  const { totalTokensPerQuestion, promptRatio, completionRatio } = advancedResult;

  const promptTokensPerQuestion = Math.round(totalTokensPerQuestion * promptRatio);
  const completionTokensPerQuestion = Math.round(totalTokensPerQuestion * completionRatio);
  const totalTokens = Math.round(totalTokensPerQuestion * questionCount);
  const totalPromptTokens = promptTokensPerQuestion * questionCount;
  const totalCompletionTokens = completionTokensPerQuestion * questionCount;

  const promptCost = promptPricePerToken != null ? promptPricePerToken * totalPromptTokens : null;
  const completionCost = completionPricePerToken != null ? completionPricePerToken * totalCompletionTokens : null;
  const totalCost = (promptCost ?? 0) + (completionCost ?? 0);

  return {
    totalTokensPerQuestion: Math.round(totalTokensPerQuestion),
    promptTokensPerQuestion,
    completionTokensPerQuestion,
    totalTokens,
    totalPromptTokens,
    totalCompletionTokens,
    promptCost,
    completionCost,
    totalCost,
    confidence: advancedResult.confidence,
  };
}
