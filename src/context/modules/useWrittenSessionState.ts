import { useState } from "react";
import {
  GeneratedQuestion,
  GenerationTelemetry,
  MarkAnswerResponse,
  QuestionHistoryEntry,
  StudentAnswerImage,
} from "../../types";
import { EMPTY_PERSISTED_APP_STATE } from "../../lib/persistence";

export function useWrittenSessionState() {
  const [questions, setQuestions] = useState<GeneratedQuestion[]>(
    EMPTY_PERSISTED_APP_STATE.writtenSession.questions,
  );
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(
    EMPTY_PERSISTED_APP_STATE.writtenSession.activeQuestionIndex,
  );
  const [writtenQuestionPresentedAtById, setWrittenQuestionPresentedAtById] = useState<Record<string, number>>(
    EMPTY_PERSISTED_APP_STATE.writtenSession.presentedAtByQuestionId,
  );
  const [answersByQuestionId, setAnswersByQuestionId] = useState<Record<string, string>>(
    EMPTY_PERSISTED_APP_STATE.writtenSession.answersByQuestionId,
  );
  const [imagesByQuestionId, setImagesByQuestionId] = useState<
    Record<string, StudentAnswerImage | undefined>
  >(EMPTY_PERSISTED_APP_STATE.writtenSession.imagesByQuestionId);
  const [feedbackByQuestionId, setFeedbackByQuestionId] = useState<Record<string, MarkAnswerResponse>>(
    EMPTY_PERSISTED_APP_STATE.writtenSession.feedbackByQuestionId,
  );
  const [questionHistory, setQuestionHistory] = useState<QuestionHistoryEntry[]>(
    EMPTY_PERSISTED_APP_STATE.questionHistory,
  );
  const [writtenRawModelOutput, setWrittenRawModelOutput] = useState(
    EMPTY_PERSISTED_APP_STATE.writtenSession.rawModelOutput,
  );
  const [writtenGenerationTelemetry, setWrittenGenerationTelemetry] = useState<GenerationTelemetry | null>(
    EMPTY_PERSISTED_APP_STATE.writtenSession.generationTelemetry ?? null,
  );
  const [activeWrittenSavedSetId, setActiveWrittenSavedSetId] = useState<string | null>(
    EMPTY_PERSISTED_APP_STATE.writtenSession.savedSetId ?? null,
  );

  return {
    questions,
    setQuestions,
    activeQuestionIndex,
    setActiveQuestionIndex,
    writtenQuestionPresentedAtById,
    setWrittenQuestionPresentedAtById,
    answersByQuestionId,
    setAnswersByQuestionId,
    imagesByQuestionId,
    setImagesByQuestionId,
    feedbackByQuestionId,
    setFeedbackByQuestionId,
    questionHistory,
    setQuestionHistory,
    writtenRawModelOutput,
    setWrittenRawModelOutput,
    writtenGenerationTelemetry,
    setWrittenGenerationTelemetry,
    activeWrittenSavedSetId,
    setActiveWrittenSavedSetId,
  };
}
