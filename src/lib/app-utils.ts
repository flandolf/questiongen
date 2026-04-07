import type { BackendError, MarkAnswerResponse } from '../types';

export { normalizeMathDelimiters } from './math-normalization';
export {
  type EstimatedTokensAndCost,
  estimateTokensAndCost,
  loadLogRegressionCoefficients,
  type LogRegressionCoefficients,
  persistLogRegressionCoefficients,
  trainLogRegressionModel,
} from './token-estimation';

export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown time';
  }
  return date.toLocaleString();
}

export function formatPercent(value: number, fractionDigits = 1): string {
  return `${value.toFixed(fractionDigits)}%`;
}

export function formatDurationMs(value?: number): string {
  if (value === undefined || value <= 0) {
    return 'n/a';
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

export function clampWholeNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const rounded = Math.round(parsed);
  return Math.min(max, Math.max(min, rounded));
}

export function normalizeMarkResponse(
  raw: unknown,
  questionMaxMarks: number
): MarkAnswerResponse {
  const data = (raw ?? {}) as Partial<MarkAnswerResponse>;
  const maxMarks =
    questionMaxMarks > 0
      ? questionMaxMarks
      : clampWholeNumber(data.maxMarks, 10, 1, 30);
  const achievedMarks = clampWholeNumber(data.achievedMarks, 0, 0, maxMarks);
  const scoreOutOf10 = clampWholeNumber(
    data.scoreOutOf10,
    Math.round((achievedMarks / maxMarks) * 10),
    0,
    10
  );
  const vcaaMarkingScheme = Array.isArray(data.vcaaMarkingScheme)
    ? data.vcaaMarkingScheme.map((item) => ({
        criterion: item.criterion || 'Criterion',
        achievedMarks: clampWholeNumber(item.achievedMarks, 0, 0, maxMarks),
        maxMarks: clampWholeNumber(item.maxMarks, maxMarks, 1, maxMarks),
        rationale: item.rationale || 'No rationale provided.',
      }))
    : [];

  return {
    verdict: data.verdict || 'Unrated',
    achievedMarks,
    maxMarks,
    scoreOutOf10,
    vcaaMarkingScheme,
    comparisonToSolutionMarkdown:
      data.comparisonToSolutionMarkdown ||
      'Comparison was not returned for this response.',
    feedbackMarkdown: data.feedbackMarkdown || 'No feedback returned.',
    workedSolutionMarkdown:
      data.workedSolutionMarkdown || 'No worked solution returned.',
    exemplarResponseMarkdown: data.exemplarResponseMarkdown || undefined,
  };
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('FileReader result is not a string'));
      }
    };
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

export function readBackendError(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'object' && error !== null) {
    const maybeError = error as BackendError;
    if (typeof maybeError.message === 'string') {
      return maybeError.message;
    }
    if (typeof (error as { toString?: () => string }).toString === 'function') {
      const text = (error as { toString: () => string }).toString();
      if (text && text !== '[object Object]') {
        return text;
      }
    }
  }
  return 'Unknown error. Please try again.';
}

export function formatCostUsd(costUsd: number | null | undefined): string {
  if (costUsd == null) return 'n/a';
  if (costUsd === 0) return '$0.00';
  if (costUsd < 0.00001) return '<$0.00001';
  if (costUsd < 0.01) return `$${costUsd.toFixed(5)}`;
  return `$${costUsd.toFixed(4)}`;
}

/**
 * Recursively removes all undefined keys from an object.
 * Required for Firestore, which throws an error if an object contains 'undefined'.
 */
export function removeUndefined<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => removeUndefined(item)) as unknown as T;
  }

  const result: any = {};
  Object.keys(obj as any).forEach((key) => {
    const value = (obj as any)[key];
    if (value !== undefined) {
      result[key] = removeUndefined(value);
    }
  });
  return result as T;
}
