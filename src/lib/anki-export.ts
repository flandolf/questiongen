// ─── Anki export helper ──────────────────────────────────────────────────────
// Shared between HistoryView, WrongQuestionView, PDFMarkingResultsView.
// Builds the `answer` Markdown from a history entry and invokes the
// `export_question_to_anki` Tauri command. Callers are responsible for
// surfacing toasts / error UI; this helper just returns a normalised
// result so the duplicated logic lives in one place.

import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

import type {
  ExportQuestionToAnkiResponse,
  GeneratedQuestion,
  MarkAnswerResponse,
  McHistoryEntry,
  McQuestion,
  QuestionHistoryEntry,
} from '@/types';

export interface AnkiExportPayload {
  id: string;
  question: string;
  answer: string;
  topic: string;
  subtopic: string;
  options?: McQuestion['options'];
}

/**
 * Result of an Anki export attempt.
 *
 * The failure variant carries a `source` discriminator so callers can
 * preserve their existing wording for the two distinct failure modes:
 *   - `rejected`: the backend successfully ran the command but reported
 *     a failure (e.g. Anki not installed, file write denied). Rendered
 *     as `"Export failed: …"` to match the legacy inline UI.
 *   - `thrown`: the Tauri call itself threw (network/IPC error, panic).
 *     Rendered as `"Export error: …"` to match the legacy inline UI.
 */
export type AnkiExportResult =
  | { ok: true; filePath: string; warning?: string }
  | { ok: false; source: 'rejected'; error: string }
  | { ok: false; source: 'thrown'; error: string };

/** Build the answer Markdown body for a written-history entry. */
export function buildWrittenAnswerText(
  mr: MarkAnswerResponse | undefined,
  workedSolutionMarkdown: string | undefined,
): string {
  return `${mr?.feedbackMarkdown ?? 'No feedback provided'}\n\n### Worked Solution\n${workedSolutionMarkdown ?? ''}`;
}

/** Build the answer Markdown body for a multiple-choice history entry. */
export function buildMcAnswerText(
  item: Pick<McHistoryEntry, 'question'>,
): string {
  return `Correct Answer: ${item.question.correctAnswer}\n\n${item.question.explanationMarkdown}`;
}

export type WrittenExportableEntry = Pick<
  QuestionHistoryEntry,
  'id' | 'question' | 'workedSolutionMarkdown' | 'markResponse'
>;

export type McExportableEntry = Pick<McHistoryEntry, 'id' | 'question'>;

/** Build the Anki payload for a written-history entry. */
export function buildWrittenAnkiPayload(
  entry: WrittenExportableEntry,
): AnkiExportPayload {
  const answer = buildWrittenAnswerText(
    entry.markResponse,
    entry.workedSolutionMarkdown,
  );
  return {
    id: entry.id,
    question: entry.question.promptMarkdown,
    answer,
    topic: entry.question.topic,
    subtopic: entry.question.subtopic ?? '',
  };
}

/** Build the Anki payload for a multiple-choice history entry. */
export function buildMcAnkiPayload(
  entry: McExportableEntry,
): AnkiExportPayload {
  return {
    id: entry.id,
    question: entry.question.promptMarkdown,
    answer: buildMcAnswerText(entry),
    topic: entry.question.topic,
    subtopic: entry.question.subtopic ?? '',
    options: entry.question.options,
  };
}

/** Build the Anki payload for a PDF-marking result entry. */
export function buildPdfMarkingAnkiPayload(
  question: GeneratedQuestion,
  result: MarkAnswerResponse,
): AnkiExportPayload {
  const answer = `${result.feedbackMarkdown}\n\n### Worked Solution\n${result.workedSolutionMarkdown}`;
  return {
    id: question.id,
    question: question.promptMarkdown,
    answer,
    topic: question.topic,
    subtopic: question.subtopic ?? '',
  };
}

/**
 * Invoke the Tauri command that writes a question to Anki.
 *
 * The caller still owns user-facing messaging; this helper normalises the
 * union so views can handle success/failure with one render path.
 */
export async function exportQuestionToAnki(
  payload: AnkiExportPayload,
): Promise<AnkiExportResult> {
  try {
    const res = await invoke<ExportQuestionToAnkiResponse>(
      'export_question_to_anki',
      {
        request: { ...payload },
      },
    );

    if (res.success) {
      return {
        ok: true,
        filePath: res.filePath ?? '',
        ...(res.errorMessage ? { warning: res.errorMessage } : {}),
      };
    }

    return {
      ok: false,
      source: 'rejected',
      error: res.errorMessage ?? 'Unknown export failure',
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, source: 'thrown', error: message };
  }
}

/**
 * Surface an `AnkiExportResult` to the user via Sonner toasts.
 *
 * Centralises the wording that used to be inlined in HistoryView and
 * WrongQuestionView so the two views stay in lock-step:
 *   - Success → "Exported to Anki: <path>" + optional warning toast.
 *   - Rejected (backend reported failure) → "Export failed: <message>".
 *   - Thrown (IPC/network exception) → "Export error: <message>".
 */
export function surfaceAnkiExportToast(result: AnkiExportResult): void {
  if (result.ok) {
    toast.success(`Exported to Anki: ${result.filePath}`);
    if (result.warning) toast.warning(result.warning);
    return;
  }
  if (result.source === 'rejected') {
    toast.error(`Export failed: ${result.error}`);
  } else {
    toast.error(`Export error: ${result.error}`);
  }
}
