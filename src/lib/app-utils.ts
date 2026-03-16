import { MarkAnswerResponse, BackendError } from "../types"

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

export function normalizeMathDelimiters(content: string): string {
  const cached = normalizedMathCache.get(content);
  if (cached !== undefined) {
    return cached;
  }

  const normalized = transformOutsideCode(content, (segment) =>
    escapeBarePercentInMath(
      normalizeEscapedLatexCommandsInMath(
        normalizePseudoMathDelimiters(segment),
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

function normalizePseudoMathDelimiters(content: string): string {
  return content
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, expression: string) => `$$${expression.trim()}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, expression: string) => `$${expression.trim()}$`)
  ;
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
    // Model responses sometimes include JSON-escaped LaTeX commands (e.g. \\sin).
    const normalizedInner = inner.replace(/\\\\([A-Za-z]+)/g, "\\$1");
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
