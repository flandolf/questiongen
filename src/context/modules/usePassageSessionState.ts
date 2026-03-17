import { useState } from "react";
import {
  GeneratedPassage,
  GenerationTelemetry,
  MarkAnswerResponse,
} from "../../types";
import { EMPTY_PERSISTED_APP_STATE } from "../../lib/persistence";

export function usePassageSessionState() {
  const [passage, setPassage] = useState<GeneratedPassage | null>(
    EMPTY_PERSISTED_APP_STATE.passageSession.passage,
  );
  const [activePassageQuestionIndex, setActivePassageQuestionIndex] = useState(
    EMPTY_PERSISTED_APP_STATE.passageSession.activeQuestionIndex,
  );
  const [passageQuestionPresentedAtById, setPassageQuestionPresentedAtById] = useState<Record<string, number>>(
    EMPTY_PERSISTED_APP_STATE.passageSession.presentedAtByQuestionId,
  );
  const [passageAnswersByQuestionId, setPassageAnswersByQuestionId] = useState<Record<string, string>>(
    EMPTY_PERSISTED_APP_STATE.passageSession.answersByQuestionId,
  );
  const [passageFeedbackByQuestionId, setPassageFeedbackByQuestionId] = useState<Record<string, MarkAnswerResponse>>(
    EMPTY_PERSISTED_APP_STATE.passageSession.feedbackByQuestionId,
  );
  const [passageRawModelOutput, setPassageRawModelOutput] = useState(
    EMPTY_PERSISTED_APP_STATE.passageSession.rawModelOutput,
  );
  const [passageGenerationTelemetry, setPassageGenerationTelemetry] = useState<GenerationTelemetry | null>(
    EMPTY_PERSISTED_APP_STATE.passageSession.generationTelemetry ?? null,
  );

  return {
    passage,
    setPassage,
    activePassageQuestionIndex,
    setActivePassageQuestionIndex,
    passageQuestionPresentedAtById,
    setPassageQuestionPresentedAtById,
    passageAnswersByQuestionId,
    setPassageAnswersByQuestionId,
    passageFeedbackByQuestionId,
    setPassageFeedbackByQuestionId,
    passageRawModelOutput,
    setPassageRawModelOutput,
    passageGenerationTelemetry,
    setPassageGenerationTelemetry,
  };
}