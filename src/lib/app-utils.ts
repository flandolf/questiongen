import { MarkAnswerResponse, BackendError } from "../types"

const LATEX_FUNCTIONS = [
  "arcsinh",
  "arccosh",
  "arctanh",
  "arcsin",
  "arccos",
  "arctan",
  "cosec",
  "sinh",
  "cosh",
  "tanh",
  "asin",
  "acos",
  "atan",
  "sin",
  "cos",
  "tan",
  "csc",
  "sec",
  "cot",
  "ln",
  "log",
  "exp",
].join("|");

export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }
  return date.toLocaleString();
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
  const fallbackMax = questionMaxMarks > 0 ? questionMaxMarks : 10;
  const data = (raw ?? {}) as Partial<MarkAnswerResponse>;
  const maxMarks = clampWholeNumber(data.maxMarks, fallbackMax, 1, 30);
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
  return normalizeBareLatexSegments(normalizePseudoMathDelimiters(normalizeLatexFunctionSpacing(content)));
}

function normalizeLatexFunctionSpacing(content: string): string {
  const functionPattern = new RegExp(`\\\\(${LATEX_FUNCTIONS})(?=[A-Za-z0-9(])`, "g");
  return content.replace(functionPattern, (_match, fn: string) => `\\${fn} `);
}

function normalizePseudoMathDelimiters(content: string): string {
  return content
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, expression: string) => `$$${expression.trim()}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, expression: string) => `$${expression.trim()}$`)
    .replace(/(^|[\s:;,.!?])\[\s*([^\[\]\n]*[=^\\][^\[\]\n]*)\s*\](?=($|[\s:;,.!?]))/gm, (_match, prefix: string, expression: string) => {
      return `${prefix}$$${expression.trim()}$$`;
    })
    .replace(/(^|[\s:;,.!?])\(\s*([^()\n]*[=^\\][^()\n]*)\s*\)(?=($|[\s:;,.!?]))/gm, (_match, prefix: string, expression: string) => {
      return `${prefix}$${expression.trim()}$`;
    });
}

function normalizeBareLatexSegments(content: string): string {
  return content.replace(
    /(^|[\s:;,.!?])([A-Za-z][A-Za-z0-9']*(?:\([^()\n]*\))?(?:\s*[=<>+\-]\s*|\s*=\s*)\\[A-Za-z][^\n]*?)(?=([.;,!?](?:\s|$)|$))/gm,
    (_match, prefix: string, expression: string) => `${prefix}$${expression.trim()}$`,
  );
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
