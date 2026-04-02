/**
 * useDerivedSessionValues
 *
 * Computes all derived/memoized values from session state.
 * Extracted from GeneratorView to reduce component complexity.
 */

import { useMemo } from 'react';
import type {
  GeneratedQuestion,
  McQuestion,
  MarkAnswerResponse,
} from '@/types';

interface Params {
  questionMode: 'written' | 'multiple-choice';
  questions: GeneratedQuestion[];
  mcQuestions: McQuestion[];
  activeQuestionIndex: number;
  activeMcQuestionIndex: number;
  answersByQuestionId: Record<string, string>;
  imagesByQuestionId: Record<
    string,
    { name: string; dataUrl: string } | undefined
  >;
  feedbackByQuestionId: Record<string, MarkAnswerResponse>;
  mcAnswersByQuestionId: Record<string, string>;
  mcAwardedMarksByQuestionId: Record<string, number>;
  showSetup: boolean;
  showCompletionScreen: boolean;
  hasShownCompletionScreen: boolean;
  getMcAwardedMarks: (qId: string, selected: string, correct: string) => number;
  formattedSessionTime: string;
}

export function useDerivedSessionValues({
  questionMode,
  questions,
  mcQuestions,
  activeQuestionIndex,
  activeMcQuestionIndex,
  answersByQuestionId,
  imagesByQuestionId,
  feedbackByQuestionId,
  mcAnswersByQuestionId,
  mcAwardedMarksByQuestionId,
  showSetup,
  showCompletionScreen,
  hasShownCompletionScreen,
  getMcAwardedMarks,
  formattedSessionTime,
}: Params) {
  const activeQuestion = questions[activeQuestionIndex];
  const activeQuestionAnswer = activeQuestion
    ? (answersByQuestionId[activeQuestion.id] ?? '')
    : '';
  const activeQuestionImage = activeQuestion
    ? imagesByQuestionId[activeQuestion.id]
    : undefined;
  const activeFeedback = activeQuestion
    ? feedbackByQuestionId[activeQuestion.id]
    : undefined;

  const activeMcQuestion = mcQuestions[activeMcQuestionIndex];
  const activeMcAnswer = activeMcQuestion
    ? (mcAnswersByQuestionId[activeMcQuestion.id] ?? '')
    : '';

  const isWrittenSetComplete = useMemo(() => {
    if (questionMode !== 'written' || questions.length === 0) return false;
    return Object.keys(feedbackByQuestionId).length === questions.length;
  }, [questionMode, questions.length, feedbackByQuestionId]);

  const isMcSetComplete = useMemo(() => {
    if (questionMode !== 'multiple-choice' || mcQuestions.length === 0)
      return false;
    return Object.keys(mcAnswersByQuestionId).length === mcQuestions.length;
  }, [questionMode, mcQuestions.length, mcAnswersByQuestionId]);

  const isSetComplete = isWrittenSetComplete || isMcSetComplete;
  const isReviewingCompletedSet =
    isSetComplete && !showCompletionScreen && hasShownCompletionScreen;

  const canAdvanceWritten = useMemo(() => {
    if (questions.length === 0) return false;
    const isAtLast = activeQuestionIndex === questions.length - 1;
    return !isAtLast || isWrittenSetComplete;
  }, [questions.length, activeQuestionIndex, isWrittenSetComplete]);

  const canAdvanceMc = useMemo(() => {
    if (mcQuestions.length === 0) return false;
    const isAtLast = activeMcQuestionIndex === mcQuestions.length - 1;
    return !isAtLast || isMcSetComplete;
  }, [mcQuestions.length, activeMcQuestionIndex, isMcSetComplete]);

  const writtenAccuracyPercent = useMemo(() => {
    if (!isWrittenSetComplete) return null;
    const total = questions.reduce((s, q) => s + q.maxMarks, 0);
    if (total === 0) return 0;
    return (
      (questions.reduce(
        (s, q) => s + (feedbackByQuestionId[q.id]?.achievedMarks ?? 0),
        0
      ) /
        total) *
      100
    );
  }, [feedbackByQuestionId, isWrittenSetComplete, questions]);

  const mcAccuracyPercent = useMemo(() => {
    if (!isMcSetComplete || mcQuestions.length === 0) return null;
    const achieved = mcQuestions.reduce((s, q) => {
      const sel = mcAnswersByQuestionId[q.id];
      return sel ? s + getMcAwardedMarks(q.id, sel, q.correctAnswer) : s;
    }, 0);
    return (achieved / mcQuestions.length) * 100;
  }, [
    isMcSetComplete,
    mcAnswersByQuestionId,
    mcQuestions,
    getMcAwardedMarks,
    mcAwardedMarksByQuestionId,
  ]);

  const completionAccuracyPercent =
    questionMode === 'written' ? writtenAccuracyPercent : mcAccuracyPercent;

  const sessionWrittenResults = useMemo(() => {
    return questions
      .filter((q) => feedbackByQuestionId[q.id])
      .map((q) => {
        const fb = feedbackByQuestionId[q.id]!;
        const answer = answersByQuestionId[q.id] ?? '';
        return {
          id: q.id,
          topic: q.topic,
          subtopic: q.subtopic,
          scorePercent:
            fb.maxMarks > 0 ? (fb.achievedMarks / fb.maxMarks) * 100 : 0,
          achieved: fb.achievedMarks,
          max: fb.maxMarks,
          wordCount: answer.split(/\s+/).filter(Boolean).length,
          criterionBreakdown: fb.vcaaMarkingScheme?.map((c) => ({
            criterion: c.criterion,
            achieved: c.achievedMarks,
            available: c.maxMarks,
          })),
        };
      });
  }, [questions, feedbackByQuestionId, answersByQuestionId]);

  const sessionMcResults = useMemo(() => {
    return mcQuestions.map((q) => {
      const selected = mcAnswersByQuestionId[q.id] ?? '';
      const awarded = getMcAwardedMarks(q.id, selected, q.correctAnswer);
      return {
        id: q.id,
        topic: q.topic,
        subtopic: q.subtopic,
        correct: awarded >= 1,
        selected,
        correctAnswer: q.correctAnswer,
      };
    });
  }, [mcQuestions, mcAnswersByQuestionId, getMcAwardedMarks]);

  const completionSetKey = useMemo(() => {
    if (questionMode === 'written') return questions.map((q) => q.id).join('|');
    return mcQuestions.map((q) => q.id).join('|');
  }, [questionMode, questions, mcQuestions]);

  return {
    activeQuestion,
    activeQuestionAnswer,
    activeQuestionImage,
    activeFeedback,
    activeMcQuestion,
    activeMcAnswer,
    isWrittenSetComplete,
    isMcSetComplete,
    isSetComplete,
    isReviewingCompletedSet,
    canAdvanceWritten,
    canAdvanceMc,
    writtenAccuracyPercent,
    mcAccuracyPercent,
    completionAccuracyPercent,
    sessionWrittenResults,
    sessionMcResults,
    completionSetKey,
    formattedSessionTime,
    showSetup,
  };
}
