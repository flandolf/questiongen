import { useState } from "react";
import { GenerationTelemetry, McHistoryEntry, McQuestion } from "../../types";
import { EMPTY_PERSISTED_APP_STATE } from "../../lib/persistence";

export function useMultipleChoiceSessionState() {
  const [mcQuestions, setMcQuestions] = useState<McQuestion[]>(
    EMPTY_PERSISTED_APP_STATE.mcSession.questions,
  );
  const [activeMcQuestionIndex, setActiveMcQuestionIndex] = useState(
    EMPTY_PERSISTED_APP_STATE.mcSession.activeQuestionIndex,
  );
  const [mcQuestionPresentedAtById, setMcQuestionPresentedAtById] = useState<Record<string, number>>(
    EMPTY_PERSISTED_APP_STATE.mcSession.presentedAtByQuestionId,
  );
  const [mcAnswersByQuestionId, setMcAnswersByQuestionId] = useState<Record<string, string>>(
    EMPTY_PERSISTED_APP_STATE.mcSession.answersByQuestionId,
  );
  const [mcHistory, setMcHistory] = useState<McHistoryEntry[]>(
    EMPTY_PERSISTED_APP_STATE.mcHistory,
  );
  const [mcRawModelOutput, setMcRawModelOutput] = useState(
    EMPTY_PERSISTED_APP_STATE.mcSession.rawModelOutput,
  );
  const [mcGenerationTelemetry, setMcGenerationTelemetry] = useState<GenerationTelemetry | null>(
    EMPTY_PERSISTED_APP_STATE.mcSession.generationTelemetry ?? null,
  );
  const [activeMcSavedSetId, setActiveMcSavedSetId] = useState<string | null>(
    EMPTY_PERSISTED_APP_STATE.mcSession.savedSetId ?? null,
  );

  return {
    mcQuestions,
    setMcQuestions,
    activeMcQuestionIndex,
    setActiveMcQuestionIndex,
    mcQuestionPresentedAtById,
    setMcQuestionPresentedAtById,
    mcAnswersByQuestionId,
    setMcAnswersByQuestionId,
    mcHistory,
    setMcHistory,
    mcRawModelOutput,
    setMcRawModelOutput,
    mcGenerationTelemetry,
    setMcGenerationTelemetry,
    activeMcSavedSetId,
    setActiveMcSavedSetId,
  };
}
