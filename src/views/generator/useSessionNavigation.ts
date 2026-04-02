/**
 * useSessionNavigation
 *
 * Encapsulates question navigation, cancellation, and keyboard shortcuts
 * for both written and MC sessions.
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import type {
  GeneratedQuestion,
  McQuestion,
  QuestionHistoryEntry,
  McHistoryEntry,
  StudentAnswerImage,
  MarkAnswerResponse,
} from '@/types';

interface UseSessionNavigationParams {
  questionMode: 'written' | 'multiple-choice';
  questions: GeneratedQuestion[];
  mcQuestions: McQuestion[];
  activeQuestionIndex: number;
  activeMcQuestionIndex: number;
  canAdvanceWritten: boolean;
  canAdvanceMc: boolean;
  isMarking: boolean;
  canSubmitAnswer: boolean;
  answersByQuestionId: Record<string, string>;
  imagesByQuestionId: Record<string, StudentAnswerImage | undefined>;
  feedbackByQuestionId: Record<string, MarkAnswerResponse>;
  mcAnswersByQuestionId: Record<string, string>;
  writtenTimer: {
    finishSession: () => void;
    removeQuestion: (id: string) => void;
  };
  mcTimer: { finishSession: () => void; removeQuestion: (id: string) => void };
  setActiveQuestionIndex: (idx: number) => void;
  setActiveMcQuestionIndex: (idx: number) => void;
  setShowCompletionScreen: (show: boolean) => void;
  setQuestions: (qs: GeneratedQuestion[]) => void;
  setMcQuestions: (qs: McQuestion[]) => void;
  setWrittenQuestionPresentedAtById: (
    fn: (prev: Record<string, number>) => Record<string, number>
  ) => void;
  setAnswersByQuestionId: (
    fn: (prev: Record<string, string>) => Record<string, string>
  ) => void;
  setImagesByQuestionId: (
    fn: (
      prev: Record<string, StudentAnswerImage | undefined>
    ) => Record<string, StudentAnswerImage | undefined>
  ) => void;
  setFeedbackByQuestionId: (
    fn: (
      prev: Record<string, MarkAnswerResponse>
    ) => Record<string, MarkAnswerResponse>
  ) => void;
  setQuestionHistory: (
    fn: (prev: QuestionHistoryEntry[]) => QuestionHistoryEntry[]
  ) => void;
  setMcQuestionPresentedAtById: (
    fn: (prev: Record<string, number>) => Record<string, number>
  ) => void;
  setMcAnswersByQuestionId: (
    fn: (prev: Record<string, string>) => Record<string, string>
  ) => void;
  setMcHistory: (fn: (prev: McHistoryEntry[]) => McHistoryEntry[]) => void;
  setActiveWrittenSavedSetId: (id: string | null) => void;
  setActiveMcSavedSetId: (id: string | null) => void;
  setErrorMessage: (msg: string | null) => void;
  onSubmitAnswer?: () => void;
}

function removeKey<T>(
  record: Record<string, T>,
  key: string
): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

export function useSessionNavigation({
  questionMode,
  questions,
  mcQuestions,
  activeQuestionIndex,
  activeMcQuestionIndex,
  canAdvanceWritten,
  canAdvanceMc,
  isMarking,
  canSubmitAnswer,
  writtenTimer,
  mcTimer,
  setActiveQuestionIndex,
  setActiveMcQuestionIndex,
  setShowCompletionScreen,
  setQuestions,
  setMcQuestions,
  setWrittenQuestionPresentedAtById,
  setAnswersByQuestionId,
  setImagesByQuestionId,
  setFeedbackByQuestionId,
  setQuestionHistory,
  setMcQuestionPresentedAtById,
  setMcAnswersByQuestionId,
  setMcHistory,
  setActiveWrittenSavedSetId,
  setActiveMcSavedSetId,
  setErrorMessage,
  onSubmitAnswer,
}: UseSessionNavigationParams) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [pendingCancelType, setPendingCancelType] = useState<
    null | 'written' | 'mc'
  >(null);

  const handleNextWrittenQuestion = useCallback(() => {
    if (!canAdvanceWritten) return;
    const isAtLast = activeQuestionIndex === questions.length - 1;
    if (isAtLast) {
      writtenTimer.finishSession();
      setShowCompletionScreen(true);
      return;
    }
    setActiveQuestionIndex(
      Math.min(questions.length - 1, activeQuestionIndex + 1)
    );
  }, [
    canAdvanceWritten,
    activeQuestionIndex,
    questions.length,
    setActiveQuestionIndex,
    writtenTimer,
    setShowCompletionScreen,
  ]);

  const handleNextMcQuestion = useCallback(() => {
    if (!canAdvanceMc) return;
    const isAtLast = activeMcQuestionIndex === mcQuestions.length - 1;
    if (isAtLast) {
      mcTimer.finishSession();
      setShowCompletionScreen(true);
      return;
    }
    setActiveMcQuestionIndex(
      Math.min(mcQuestions.length - 1, activeMcQuestionIndex + 1)
    );
  }, [
    canAdvanceMc,
    activeMcQuestionIndex,
    mcQuestions.length,
    setActiveMcQuestionIndex,
    mcTimer,
    setShowCompletionScreen,
  ]);

  const activeQuestion = questions[activeQuestionIndex];
  const activeMcQuestion = mcQuestions[activeMcQuestionIndex];

  const handleCancelWrittenQuestion = useCallback(() => {
    if (!activeQuestion) return;
    setConfirmMessage(
      `Remove question ${activeQuestionIndex + 1} ("${activeQuestion.topic}")? It will be taken out of your current set.`
    );
    setPendingCancelType('written');
    setConfirmOpen(true);
  }, [activeQuestion, activeQuestionIndex]);

  const handleCancelMcQuestion = useCallback(() => {
    if (!activeMcQuestion) return;
    setConfirmMessage(
      `Remove question ${activeMcQuestionIndex + 1} ("${activeMcQuestion.topic}")? It will be taken out of your current set.`
    );
    setPendingCancelType('mc');
    setConfirmOpen(true);
  }, [activeMcQuestion, activeMcQuestionIndex]);

  const performConfirmedCancel = useCallback(() => {
    if (pendingCancelType === 'written' && activeQuestion) {
      const id = activeQuestion.id;
      const next = questions.filter((q) => q.id !== id);
      setQuestions(next);
      setActiveWrittenSavedSetId(null);
      setShowCompletionScreen(false);
      setActiveQuestionIndex(
        Math.min(activeQuestionIndex, Math.max(0, next.length - 1))
      );
      setWrittenQuestionPresentedAtById((p) => removeKey(p, id));
      setAnswersByQuestionId((p) => removeKey(p, id));
      setImagesByQuestionId((p) => removeKey(p, id));
      setFeedbackByQuestionId((p) => removeKey(p, id));
      setQuestionHistory((prev) =>
        prev.filter((e: QuestionHistoryEntry) => e.question.id !== id)
      );
      writtenTimer.removeQuestion(id);
      setErrorMessage(null);
    }
    if (pendingCancelType === 'mc' && activeMcQuestion) {
      const id = activeMcQuestion.id;
      const next = mcQuestions.filter((q) => q.id !== id);
      setMcQuestions(next);
      setActiveMcSavedSetId(null);
      setShowCompletionScreen(false);
      setActiveMcQuestionIndex(
        Math.min(activeMcQuestionIndex, Math.max(0, next.length - 1))
      );
      setMcQuestionPresentedAtById((p) => removeKey(p, id));
      setMcAnswersByQuestionId((p) => removeKey(p, id));
      setMcHistory((prev) =>
        prev.filter((e: McHistoryEntry) => e.question.id !== id)
      );
      mcTimer.removeQuestion(id);
      setErrorMessage(null);
    }
    setPendingCancelType(null);
    setConfirmOpen(false);
    setConfirmMessage(null);
  }, [
    pendingCancelType,
    activeQuestion,
    activeQuestionIndex,
    activeMcQuestion,
    activeMcQuestionIndex,
    questions,
    mcQuestions,
    setQuestions,
    setActiveWrittenSavedSetId,
    setActiveQuestionIndex,
    setWrittenQuestionPresentedAtById,
    setAnswersByQuestionId,
    setImagesByQuestionId,
    setFeedbackByQuestionId,
    setQuestionHistory,
    writtenTimer,
    setMcQuestions,
    setActiveMcSavedSetId,
    setActiveMcQuestionIndex,
    setMcQuestionPresentedAtById,
    setMcAnswersByQuestionId,
    setMcHistory,
    mcTimer,
    setErrorMessage,
    setShowCompletionScreen,
  ]);

  // Keyboard shortcuts
  const isInSession = questions.length > 0 || mcQuestions.length > 0;
  const submitRef = useRef<() => void>(() => {});

  useEffect(() => {
    submitRef.current = onSubmitAnswer ?? (() => {});
  }, [onSubmitAnswer]);

  useEffect(() => {
    if (!isInSession) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable = (e.target as HTMLElement)?.isContentEditable;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || isEditable) return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (questionMode === 'written' && canSubmitAnswer && !isMarking) {
          submitRef.current();
        }
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'n') {
        e.preventDefault();
        if (questionMode === 'written') handleNextWrittenQuestion();
        else handleNextMcQuestion();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'p') {
        e.preventDefault();
        if (questionMode === 'written')
          setActiveQuestionIndex(Math.max(0, activeQuestionIndex - 1));
        else setActiveMcQuestionIndex(Math.max(0, activeMcQuestionIndex - 1));
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (activeQuestion) handleCancelWrittenQuestion();
        else if (activeMcQuestion) handleCancelMcQuestion();
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isInSession,
    questionMode,
    canSubmitAnswer,
    isMarking,
    activeQuestionIndex,
    activeMcQuestionIndex,
    handleNextWrittenQuestion,
    handleNextMcQuestion,
    setActiveQuestionIndex,
    setActiveMcQuestionIndex,
    activeQuestion,
    activeMcQuestion,
    handleCancelWrittenQuestion,
    handleCancelMcQuestion,
  ]);

  return {
    confirmOpen,
    confirmMessage,
    pendingCancelType,
    setConfirmOpen,
    setConfirmMessage,
    handleNextWrittenQuestion,
    handleNextMcQuestion,
    handleCancelWrittenQuestion,
    handleCancelMcQuestion,
    performConfirmedCancel,
    submitRef,
  };
}
