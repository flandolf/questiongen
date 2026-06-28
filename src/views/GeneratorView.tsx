import { X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';

import {
  useAppPreferences,
  useAppSettings,
  useGenerationStatus,
  useMultipleChoiceSession,
  useWrittenSession,
} from '@/AppContext';
import { MarkdownMath } from '@/components/MarkdownMath';
import { UnifiedMcqOptionsGrid } from '@/components/question/UnifiedQuestionBlocks';
import { TutorPanel } from '@/components/tutor/TutorPanel';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { useTimer } from '@/hooks/useTimer';
import { fileToDataUrl, readBackendError } from '@/lib/app-utils';
import {
  generateQuestionsOrchestrator,
  getCanGenerate,
} from '@/lib/generation-orchestrator';
import {
  getDifficultyBadgeClasses,
  isMathTopic,
  removeKey,
} from '@/lib/generator-helpers';
import { buildSketchpadSessionKey } from '@/lib/sketchpad-session-keys';
import { useAppStore } from '@/store';
import { useTutorStore } from '@/store/tutor';
import type {
  MarkAnswerResponse,
  MarkingCriterion,
  PresetPreferences,
  StudentAnswerImage,
  Topic,
} from '@/types';
import {
  BIOLOGY_SUBTOPICS,
  CHEMISTRY_SUBTOPICS,
  GENERAL_MATHEMATICS_SUBTOPICS,
  MATH_METHODS_SUBTOPICS,
  PHYSICAL_EDUCATION_SUBTOPICS,
  SPECIALIST_MATH_SUBTOPICS,
  TOPICS,
} from '@/types';
import { CompletionScreen } from '@/views/generator/CompletionScreen';
import { useGeneratorConfirmModals } from '@/views/generator/hooks/useGeneratorConfirmModals';
import { useGeneratorStreamSubscription } from '@/views/generator/hooks/useGeneratorStreamSubscription';
import { useTimerAutoPause } from '@/views/generator/hooks/useTimerAutoPause';
import { McAnswerCard } from '@/views/generator/McAnswerCard';
import { SetupPanel } from '@/views/generator/SetupPanel';
import { WrittenFeedbackPanel } from '@/views/generator/WrittenFeedbackPanel';

import { QuestionSplitLayout } from './generator/QuestionSplitLayout';
import { SessionHeader } from './generator/SessionHeader';
import { WrittenAnswerCard } from './generator/WrittenAnswerCard';

// ─── Component ────────────────────────────────────────────────────────────────

// eslint-disable-next-line complexity
export function GeneratorView() {
  const location = useLocation();

  const [showCompletionScreen, setShowCompletionScreen] = useState(false);
  const [hasShownCompletionScreen, setHasShownCompletionScreen] =
    useState(false);
  const [, setShowMarkingScreen] = useState(false);

  const [showKeyboardHint, setShowKeyboardHint] = useState(() => {
    try {
      return !localStorage.getItem('keyboard-hint-dismissed');
    } catch {
      return true;
    }
  });

  const [, setWrittenSketchpadActive] = useState(false);
  const [mcSketchpadActive, setMcSketchpadActive] = useState(false);

  const {
    apiKey,
    markingModel,
    useSeparateMarkingModel,
    imageMarkingModel,
    useSeparateImageMarkingModel,
  } = useAppSettings();

  const appStore = useAppStore();

  const {
    selectedTopics,
    setSelectedTopics,
    selectedSubtopics,
    toggleSubtopic,
    difficulty,
    setDifficulty,
    techMode,
    setTechMode,
    questionCount,
    setQuestionCount,
    averageMarksPerQuestion,
    setAverageMarksPerQuestion,
    questionMode,
    setQuestionMode,
    customFocusArea,
    setCustomFocusArea,
    avoidSimilarQuestions,
    setAvoidSimilarQuestions,
    diversityEnabled,
    setDiversityEnabled,
    strictLatexValidation,
    setStrictLatexValidation,
    generationStrategy,
    resetPreferences,
  } = useAppPreferences();

  const {
    questions,
    setQuestions,
    activeQuestionIndex,
    setActiveQuestionIndex,
    answersByQuestionId,
    setAnswersByQuestionId,
    imagesByQuestionId,
    setImagesByQuestionId,
    feedbackByQuestionId,
    setFeedbackByQuestionId,
    questionHistory,
    updateQuestionHistoryEntry,
    activeWrittenSavedSetId,
    setActiveWrittenSavedSetId,
    setWrittenQuestionPresentedAtById,
    markAppealByQuestionId,
    setMarkAppealByQuestionId,
    markOverrideInputByQuestionId,
    setMarkOverrideInputByQuestionId,
    writtenMarkingDurationMsByQuestionId,
    setWrittenResponseEnteredAtById,
    submitWrittenAnswer,
    argueForWrittenMark,
    overrideWrittenMark,
    nextQuestion,
    prevQuestion,
    writtenGenerationTelemetry,
  } = useWrittenSession();

  const {
    mcQuestions,
    mcHistory,
    setMcQuestions,
    activeMcQuestionIndex,
    setActiveMcQuestionIndex,
    mcAnswersByQuestionId,
    setMcAnswersByQuestionId,
    activeMcSavedSetId,
    setActiveMcSavedSetId,
    setMcQuestionPresentedAtById,
    mcAwardedMarksByQuestionId,
    setMcAwardedMarksByQuestionId,
    submitMcAnswer,
    overrideMcMark,
    mcGenerationTelemetry,
  } = useMultipleChoiceSession();

  const {
    isGenerating,
    generationStatus,
    generationStartedAt,
    isMarking,
    setErrorMessage,
    batchProgress,
    generationSubCallProgress,
    streamTexts,
    setStreamText,
  } = useGenerationStatus();

  const {
    cancelOpen,
    cancelMessage,
    openWrittenCancel,
    openMcCancel,
    cancelCancel,
    confirmCancel,
    bindRemoveHandler,
    failureOpen,
    reportFailure,
    dismissFailure,
    confirmFailure,
    bindFailureHandler,
    clearFailure,
  } = useGeneratorConfirmModals();

  const aggregatedStreamText = useMemo(() => {
    return Object.values(streamTexts).filter(Boolean).join('\n\n');
  }, [streamTexts]);

  const deleteSavedSet = useAppStore((s) => s.deleteSavedSet);

  const writtenTimer = useTimer(questions, activeQuestionIndex, 'written');
  const mcTimer = useTimer(mcQuestions, activeMcQuestionIndex, 'mc');

  const { resetLocalBuffer } = useGeneratorStreamSubscription(setStreamText);

  useTimerAutoPause(isMarking, writtenTimer, mcTimer);

  // ── Derived values ───────────────────────────────────────────────────────────
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
  const activeMarkAppeal = activeQuestion
    ? (markAppealByQuestionId[activeQuestion.id] ?? '')
    : '';
  const activeOverrideInput = activeQuestion
    ? (markOverrideInputByQuestionId[activeQuestion.id] ??
      (activeFeedback ? String(activeFeedback.achievedMarks) : ''))
    : '';

  const activeMcQuestion = mcQuestions[activeMcQuestionIndex];
  const activeMcAnswer = activeMcQuestion
    ? (mcAnswersByQuestionId[activeMcQuestion.id] ?? '')
    : '';

  const activeWrittenSketchSessionKey = useMemo(() => {
    if (!activeQuestion) return undefined;
    return buildSketchpadSessionKey('written', activeQuestion);
  }, [activeQuestion]);

  const activeMcSketchSessionKey = useMemo(() => {
    if (!activeMcQuestion) return undefined;
    return buildSketchpadSessionKey('multiple-choice', activeMcQuestion);
  }, [activeMcQuestion]);

  useEffect(() => {
    setMcSketchpadActive(false);
  }, [activeMcQuestion?.id]);

  const getMcAwardedMarks = useCallback(
    (qId: string, selectedAnswer: string, correctAnswer: string) => {
      const ov = mcAwardedMarksByQuestionId[qId];
      return typeof ov === 'number' && Number.isFinite(ov)
        ? Math.max(0, Math.min(1, ov))
        : selectedAnswer === correctAnswer
          ? 1
          : 0;
    },
    [mcAwardedMarksByQuestionId],
  );

  const markModel = (() => {
    if (
      activeQuestionImage &&
      useSeparateImageMarkingModel &&
      imageMarkingModel &&
      imageMarkingModel.trim().length > 0
    ) {
      return imageMarkingModel;
    }
    if (
      useSeparateMarkingModel &&
      markingModel &&
      markingModel.trim().length > 0
    ) {
      return markingModel;
    }
    return appStore.model;
  })();

  const showSetup =
    questionMode === 'written'
      ? questions.length === 0
      : mcQuestions.length === 0;

  const canGenerate = getCanGenerate(appStore);

  const completedCount = useMemo(
    () => questions.filter((q) => feedbackByQuestionId[q.id]).length,
    [feedbackByQuestionId, questions],
  );
  const mcCompletedCount = useMemo(
    () => mcQuestions.filter((q) => mcAnswersByQuestionId[q.id]).length,
    [mcAnswersByQuestionId, mcQuestions],
  );

  const isWrittenSetComplete =
    questionMode === 'written' &&
    questions.length > 0 &&
    completedCount === questions.length;
  const isMcSetComplete =
    questionMode === 'multiple-choice' &&
    mcQuestions.length > 0 &&
    mcCompletedCount === mcQuestions.length;
  const isSetComplete = isWrittenSetComplete || isMcSetComplete;
  const isReviewingCompletedSet =
    isSetComplete && !showCompletionScreen && hasShownCompletionScreen;
  const isAtLastWrittenQuestion = activeQuestionIndex === questions.length - 1;
  const isAtLastMcQuestion = activeMcQuestionIndex === mcQuestions.length - 1;
  const canAdvanceWritten =
    questions.length > 0 && (!isAtLastWrittenQuestion || isWrittenSetComplete);
  const canAdvanceMc =
    mcQuestions.length > 0 && (!isAtLastMcQuestion || isMcSetComplete);

  const completionSetKey = useMemo(() => {
    if (questionMode === 'written') return questions.map((q) => q.id).join('|');
    return mcQuestions.map((q) => q.id).join('|');
  }, [questionMode, questions, mcQuestions]);

  const completionAccuracyPercent = useMemo(() => {
    if (questionMode === 'written') {
      if (!isWrittenSetComplete) return 0;
      const total = questions.reduce((s, q) => s + q.maxMarks, 0);
      if (total === 0) return 0;
      return (
        (questions.reduce(
          (s, q) => s + (feedbackByQuestionId[q.id]?.achievedMarks ?? 0),
          0,
        ) /
          total) *
        100
      );
    } else {
      if (!isMcSetComplete || mcQuestions.length === 0) return 0;
      const achieved = mcQuestions.reduce((s, q) => {
        const sel = mcAnswersByQuestionId[q.id];
        return sel ? s + getMcAwardedMarks(q.id, sel, q.correctAnswer) : s;
      }, 0);
      return (achieved / mcQuestions.length) * 100;
    }
  }, [
    questionMode,
    questions,
    mcQuestions,
    feedbackByQuestionId,
    mcAnswersByQuestionId,
    isWrittenSetComplete,
    isMcSetComplete,
    getMcAwardedMarks,
  ]);

  const sessionWrittenResults = useMemo(() => {
    return questions
      .filter((q) => feedbackByQuestionId[q.id])
      .map((q) => {
        const fb = feedbackByQuestionId[q.id];
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
          criterionBreakdown: fb.vcaaMarkingScheme?.map(
            (c: MarkingCriterion) => ({
              criterion: c.criterion,
              achieved: c.achievedMarks,
              available: c.maxMarks,
            }),
          ),
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

  const activeTimer = questionMode === 'written' ? writtenTimer : mcTimer;
  const activeTutorQuestionId = activeQuestion?.id ?? activeMcQuestion?.id;
  const activeTutorContextPrompt =
    questionMode === 'written'
      ? (activeQuestion?.promptMarkdown ?? '')
      : (activeMcQuestion?.promptMarkdown ?? '');
  const activeTutorStudentAnswer =
    questionMode === 'written' ? activeQuestionAnswer : activeMcAnswer;
  const activeTutorImage =
    questionMode === 'written' ? activeQuestionImage : undefined;
  const activeTutorSketchSessionKey =
    questionMode === 'written'
      ? activeWrittenSketchSessionKey
      : activeMcSketchSessionKey;

  useEffect(() => {
    setShowCompletionScreen(false);
    setHasShownCompletionScreen(false);
    setShowMarkingScreen(false);
  }, [completionSetKey]);

  useEffect(() => {
    if (showCompletionScreen) setHasShownCompletionScreen(true);
  }, [showCompletionScreen]);

  useEffect(() => {
    if (!isSetComplete) return;
    const activeId =
      questionMode === 'written' ? activeWrittenSavedSetId : activeMcSavedSetId;
    if (!activeId) return;
    deleteSavedSet(activeId);
  }, [
    isSetComplete,
    questionMode,
    activeWrittenSavedSetId,
    activeMcSavedSetId,
    deleteSavedSet,
  ]);

  const applyPreferences = useAppStore((s) => s.applyPreferences);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const topic = params.get('topic');
    const subtopic = params.get('subtopic');
    if (topic && TOPICS.includes(topic as Topic)) {
      const prefs: Partial<PresetPreferences> = {
        selectedTopics: [topic as Topic],
      };
      if (subtopic) {
        if (
          topic === 'Mathematical Methods' &&
          MATH_METHODS_SUBTOPICS.includes(subtopic)
        ) {
          prefs.selectedSubtopics = { [topic]: [subtopic] };
        } else if (
          topic === 'Specialist Mathematics' &&
          SPECIALIST_MATH_SUBTOPICS.includes(subtopic)
        ) {
          prefs.selectedSubtopics = { [topic]: [subtopic] };
        } else if (
          topic === 'Chemistry' &&
          CHEMISTRY_SUBTOPICS.includes(subtopic)
        ) {
          prefs.selectedSubtopics = { [topic]: [subtopic] };
        } else if (
          topic === 'Biology' &&
          BIOLOGY_SUBTOPICS.includes(subtopic)
        ) {
          prefs.selectedSubtopics = { [topic]: [subtopic] };
        } else if (
          topic === 'General Mathematics' &&
          GENERAL_MATHEMATICS_SUBTOPICS.includes(subtopic)
        ) {
          prefs.selectedSubtopics = { [topic]: [subtopic] };
        } else if (
          topic === 'Physical Education' &&
          PHYSICAL_EDUCATION_SUBTOPICS.includes(subtopic)
        ) {
          prefs.selectedSubtopics = { [topic]: [subtopic] };
        }
      }
      applyPreferences(prefs);
    }
  }, [location.search, applyPreferences]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleWrittenAnswerChange = useCallback(
    (value: string) => {
      if (!activeQuestion) return;
      const questionId = activeQuestion.id;
      setAnswersByQuestionId((prev) => ({
        ...prev,
        [questionId]: value,
      }));
      if (value.trim().length > 0) {
        setWrittenResponseEnteredAtById((prev) =>
          prev[questionId] !== undefined
            ? prev
            : { ...prev, [questionId]: Date.now() },
        );
      }
    },
    [activeQuestion, setAnswersByQuestionId, setWrittenResponseEnteredAtById],
  );

  const handleWrittenImageDrop = useCallback(
    (files: File[]) => {
      if (!activeQuestion) return;
      const file = files[0];
      if (!file) return;
      const questionId = activeQuestion.id;
      const imageId = crypto.randomUUID();
      const timestamp = new Date().toISOString();

      void fileToDataUrl(file)
        .then((dataUrl) => {
          setImagesByQuestionId((prev) => ({
            ...prev,
            [questionId]: { id: imageId, dataUrl, timestamp },
          }));
          setWrittenResponseEnteredAtById((prev) =>
            prev[questionId] !== undefined
              ? prev
              : { ...prev, [questionId]: Date.now() },
          );
        })
        .catch(() => {
          setErrorMessage('Unable to read the selected image file.');
        });
    },
    [
      activeQuestion,
      setErrorMessage,
      setImagesByQuestionId,
      setWrittenResponseEnteredAtById,
    ],
  );

  const handleWrittenImageRemove = useCallback(() => {
    if (!activeQuestion) return;
    setImagesByQuestionId((prev) => removeKey(prev, activeQuestion.id));
  }, [activeQuestion, setImagesByQuestionId]);

  const handleAppealChange = useCallback(
    (value: string) => {
      if (!activeQuestion) return;
      setMarkAppealByQuestionId((prev) => ({
        ...prev,
        [activeQuestion.id]: value,
      }));
    },
    [activeQuestion, setMarkAppealByQuestionId],
  );

  const handleOverrideInputChange = useCallback(
    (value: string) => {
      if (!activeQuestion) return;
      setMarkOverrideInputByQuestionId((prev) => ({
        ...prev,
        [activeQuestion.id]: value,
      }));
    },
    [activeQuestion, setMarkOverrideInputByQuestionId],
  );

  const startStopwatch = useCallback(() => {
    writtenTimer.reset();
    mcTimer.reset();
  }, [writtenTimer, mcTimer]);

  const togglePause = useCallback(() => {
    if (questionMode === 'written') writtenTimer.togglePause();
    else if (questionMode === 'multiple-choice') mcTimer.togglePause();
  }, [questionMode, writtenTimer, mcTimer]);

  const resetCurrentQuestionTimer = useCallback(() => {
    if (questionMode === 'written') {
      writtenTimer.resetCurrentQuestion();
    } else if (questionMode === 'multiple-choice') {
      mcTimer.resetCurrentQuestion();
    }
  }, [questionMode, writtenTimer, mcTimer]);

  const toggleTopic = useCallback(
    (topic: Topic) => {
      setSelectedTopics(
        selectedTopics.includes(topic)
          ? selectedTopics.filter((t: Topic) => t !== topic)
          : [...selectedTopics, topic],
      );
    },
    [selectedTopics, setSelectedTopics],
  );

  const dismissKeyboardHint = useCallback(() => {
    setShowKeyboardHint(false);
    localStorage.setItem('keyboard-hint-dismissed', '1');
  }, [setShowKeyboardHint]);

  const handleNextWrittenQuestion = useCallback(() => {
    if (!canAdvanceWritten) return;
    if (isAtLastWrittenQuestion) {
      writtenTimer.complete();
      setShowCompletionScreen(true);
      return;
    }
    nextQuestion();
  }, [canAdvanceWritten, isAtLastWrittenQuestion, nextQuestion, writtenTimer]);

  const handleNextMcQuestion = useCallback(() => {
    if (!canAdvanceMc) return;
    if (isAtLastMcQuestion) {
      mcTimer.complete();
      setShowCompletionScreen(true);
      return;
    }
    nextQuestion();
  }, [canAdvanceMc, isAtLastMcQuestion, nextQuestion, mcTimer]);

  const handlePrevWritten = useCallback(() => {
    prevQuestion();
  }, [prevQuestion]);

  const handlePrevMc = useCallback(() => {
    prevQuestion();
  }, [prevQuestion]);

  const handleCancelWrittenQuestion = useCallback(() => {
    if (!activeQuestion) return;
    openWrittenCancel(activeQuestion, activeQuestionIndex);
  }, [activeQuestion, activeQuestionIndex, openWrittenCancel]);

  const handleCancelMcQuestion = useCallback(() => {
    if (!activeMcQuestion) return;
    openMcCancel(activeMcQuestion, activeMcQuestionIndex);
  }, [activeMcQuestion, activeMcQuestionIndex, openMcCancel]);

  const handleExitSession = useCallback(() => {
    setShowMarkingScreen(false);
    if (isSetComplete) {
      activeTimer.complete();
      setShowCompletionScreen(true);
    } else {
      // Uncompleted session - save and return to setup
      const activeSavedSetId =
        questionMode === 'written'
          ? activeWrittenSavedSetId
          : activeMcSavedSetId;
      const savedId = appStore.saveCurrentSet();
      if (savedId && !activeSavedSetId) {
        toast.success("Session saved for later in 'Saved Sets'");
      }

      // Clear session state to return to SetupPanel
      if (questionMode === 'written') {
        setQuestions([]);
        setActiveQuestionIndex(0);
        setAnswersByQuestionId({});
        setImagesByQuestionId({});
        setFeedbackByQuestionId({});
        setWrittenQuestionPresentedAtById({});
        setActiveWrittenSavedSetId(null);
      } else {
        setMcQuestions([]);
        setActiveMcQuestionIndex(0);
        setMcAnswersByQuestionId({});
        setMcQuestionPresentedAtById({});
        setActiveMcSavedSetId(null);
      }
      activeTimer.reset();
      setShowCompletionScreen(false);
    }
  }, [
    isSetComplete,
    activeTimer,
    appStore,
    questionMode,
    activeWrittenSavedSetId,
    activeMcSavedSetId,
    setQuestions,
    setActiveQuestionIndex,
    setAnswersByQuestionId,
    setImagesByQuestionId,
    setFeedbackByQuestionId,
    setActiveWrittenSavedSetId,
    setWrittenQuestionPresentedAtById,
    setMcQuestions,
    setActiveMcQuestionIndex,
    setMcAnswersByQuestionId,
    setMcQuestionPresentedAtById,
    setActiveMcSavedSetId,
  ]);

  const deleteQuestionHistoryEntry = useAppStore(
    (s) => s.deleteQuestionHistoryEntry,
  );
  const deleteMcHistoryEntry = useAppStore((s) => s.deleteMcHistoryEntry);

  // Bound into the cancel-confirmation hook so the latest store setters
  // are always reachable when the user confirms removal of a question.
  const performRemoveByType = useCallback(
    (type: 'written' | 'mc' | null) => {
      if (type === 'written' && activeQuestion) {
        const id = activeQuestion.id;
        const next = questions.filter((q) => q.id !== id);
        setQuestions(next);
        setActiveWrittenSavedSetId(null);
        setShowCompletionScreen(false);
        setActiveQuestionIndex(
          Math.min(activeQuestionIndex, Math.max(0, next.length - 1)),
        );
        setAnswersByQuestionId((p) => removeKey(p, id));
        setImagesByQuestionId((p) => removeKey(p, id));
        setFeedbackByQuestionId((p) => removeKey(p, id));
        setMarkAppealByQuestionId((p) => removeKey(p, id));
        setMarkOverrideInputByQuestionId((p) => removeKey(p, id));
        setWrittenResponseEnteredAtById((p) => removeKey(p, id));
        writtenTimer.removeQuestion(id);
        const historyEntry = questionHistory.find(
          (e) => e.question.id === id,
        );
        if (historyEntry) deleteQuestionHistoryEntry(historyEntry.id);
        setErrorMessage(null);
      }
      if (type === 'mc' && activeMcQuestion) {
        const id = activeMcQuestion.id;
        const next = mcQuestions.filter((q) => q.id !== id);
        setMcQuestions(next);
        setActiveMcSavedSetId(null);
        setShowCompletionScreen(false);
        setActiveMcQuestionIndex(
          Math.min(activeMcQuestionIndex, Math.max(0, next.length - 1)),
        );
        setMcAnswersByQuestionId((p) => removeKey(p, id));
        setMcAwardedMarksByQuestionId((p) => removeKey(p, id));
        mcTimer.removeQuestion(id);
        const mcHistoryEntry = mcHistory.find((e) => e.question.id === id);
        if (mcHistoryEntry) deleteMcHistoryEntry(mcHistoryEntry.id);
        setErrorMessage(null);
      }
    },
    [
      activeQuestion,
      activeQuestionIndex,
      activeMcQuestion,
      activeMcQuestionIndex,
      questions,
      mcQuestions,
      setQuestions,
      setActiveWrittenSavedSetId,
      setActiveMcSavedSetId,
      setActiveQuestionIndex,
      setAnswersByQuestionId,
      setImagesByQuestionId,
      setFeedbackByQuestionId,
      writtenTimer,
      setMcQuestions,
      setActiveMcQuestionIndex,
      setMcAnswersByQuestionId,
      mcTimer,
      setErrorMessage,
      setMarkAppealByQuestionId,
      setMarkOverrideInputByQuestionId,
      setWrittenResponseEnteredAtById,
      setMcAwardedMarksByQuestionId,
      questionHistory,
      deleteQuestionHistoryEntry,
      mcHistory,
      deleteMcHistoryEntry,
    ],
  );

  // Bind the actual removal callback so the latest store setters are
  // always reachable when the user confirms a cancel. Refs inside the
  // hook guarantee this never causes re-renders.
  useEffect(() => {
    bindRemoveHandler(performRemoveByType);
  }, [bindRemoveHandler, performRemoveByType]);

  const handleGenerateQuestions = useCallback(async () => {
    startStopwatch();
    resetLocalBuffer();
    setStreamText('');
    const { setGenerationStatus } = useAppStore.getState();
    setGenerationStatus(null);
    useTutorStore.getState().clearAllSessions();
    await generateQuestionsOrchestrator();
  }, [startStopwatch, resetLocalBuffer, setStreamText]);

  // Bind the retry handler to the same generation call so the user can
  // re-run the same parameters after a failed attempt.
  useEffect(() => {
    bindFailureHandler(() => {
      void handleGenerateQuestions();
    });
  }, [bindFailureHandler, handleGenerateQuestions]);

  const handleSubmitForMarking = useCallback(
    async (payload?: { image?: StudentAnswerImage }) => {
      if (!activeQuestion) return;
      const effectiveImage = payload?.image ?? activeQuestionImage;
      const hasAnswerContent =
        activeQuestionAnswer.trim().length > 0 || Boolean(effectiveImage);
      if (
        !hasAnswerContent ||
        !apiKey.trim() ||
        !markModel.trim() ||
        isMarking ||
        activeFeedback
      )
        return;
      setErrorMessage(null);
      setShowMarkingScreen(true);
      clearFailure();
      try {
        if (payload?.image) {
          setImagesByQuestionId((prev) => ({
            ...prev,
            [activeQuestion.id]: payload.image,
          }));
        }
        await submitWrittenAnswer(markModel);
        writtenTimer.markAnswered(activeQuestion.id);
      } catch (error) {
        setErrorMessage(readBackendError(error));
        reportFailure('mark-written');
      }
    },
    [
      activeQuestion,
      activeQuestionImage,
      activeQuestionAnswer,
      apiKey,
      markModel,
      isMarking,
      activeFeedback,
      setErrorMessage,
      setImagesByQuestionId,
      submitWrittenAnswer,
      writtenTimer,
      clearFailure,
      reportFailure,
    ],
  );

  const handleArgueForMark = useCallback(async () => {
    if (!activeQuestion || !activeFeedback) return;
    const appealText = activeMarkAppeal.trim();
    if (!appealText || !apiKey.trim() || !markModel.trim()) return;
    setErrorMessage(null);
    setShowMarkingScreen(true);
    clearFailure();
    try {
      await argueForWrittenMark(markModel);
    } catch (error) {
      setErrorMessage(readBackendError(error));
      reportFailure('mark-written');
    } finally {
      setShowMarkingScreen(true);
    }
  }, [
    activeQuestion,
    activeFeedback,
    activeMarkAppeal,
    apiKey,
    markModel,
    argueForWrittenMark,
    setErrorMessage,
    clearFailure,
    reportFailure,
  ]);

  const handleMcAnswer = useCallback(
    (selectedLabel: string) => {
      if (!activeMcQuestion || isReviewingCompletedSet) return;
      submitMcAnswer(selectedLabel);
      mcTimer.markAnswered(activeMcQuestion.id);
    },
    [activeMcQuestion, isReviewingCompletedSet, submitMcAnswer, mcTimer],
  );

  const handleOverrideCriterion = useCallback(
    (idx: number, achievedMarks: number, rationale: string) => {
      if (!activeQuestion || !activeFeedback) return;
      const nextScheme = activeFeedback.vcaaMarkingScheme.map(
        (it: MarkingCriterion, i: number) =>
          i === idx ? { ...it, achievedMarks, rationale } : it,
      );
      const totalAchieved = nextScheme.reduce(
        (s: number, c: MarkingCriterion) =>
          s + (Number.isFinite(c.achievedMarks) ? c.achievedMarks : 0),
        0,
      );
      const totalMax =
        nextScheme.reduce(
          (s: number, c: MarkingCriterion) =>
            s + (Number.isFinite(c.maxMarks) ? c.maxMarks : 0),
          0,
        ) || activeFeedback.maxMarks;
      const nextFeedback = {
        ...activeFeedback,
        vcaaMarkingScheme: nextScheme,
        achievedMarks: totalAchieved,
        maxMarks: totalMax,
        verdict:
          totalAchieved === totalMax
            ? 'Correct'
            : totalAchieved === 0
              ? 'Incorrect'
              : 'Overridden',
      };
      setErrorMessage(null);
      setFeedbackByQuestionId((prev: Record<string, MarkAnswerResponse>) => ({
        ...prev,
        [activeQuestion.id]: nextFeedback,
      }));
      setMarkOverrideInputByQuestionId((prev: Record<string, string>) => ({
        ...prev,
        [activeQuestion.id]: String(nextFeedback.achievedMarks),
      }));
      const entry = questionHistory.find(
        (e) => e.question.id === activeQuestion.id,
      );
      if (!entry) return;
      updateQuestionHistoryEntry({
        ...entry,
        markResponse: nextFeedback,
        workedSolutionMarkdown: nextFeedback.workedSolutionMarkdown,
        lastModified: Date.now(),
      });
    },
    [
      activeQuestion,
      activeFeedback,
      setFeedbackByQuestionId,
      updateQuestionHistoryEntry,
      questionHistory,
      setErrorMessage,
      setMarkOverrideInputByQuestionId,
    ],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  if (showSetup) {
    return (
      <SetupPanel
        questionMode={questionMode}
        onSetQuestionMode={setQuestionMode}
        selectedTopics={selectedTopics}
        onToggleTopic={toggleTopic}
        selectedSubtopics={selectedSubtopics}
        onToggleSubtopic={toggleSubtopic}
        techMode={techMode}
        onSetTechMode={setTechMode}
        customFocusArea={customFocusArea}
        onSetCustomFocusArea={setCustomFocusArea}
        diversityEnabled={diversityEnabled}
        onSetDiversityEnabled={setDiversityEnabled}
        strictLatexValidation={strictLatexValidation}
        onSetStrictLatexValidation={setStrictLatexValidation}
        difficulty={difficulty}
        onSetDifficulty={setDifficulty}
        questionCount={questionCount}
        onSetQuestionCount={setQuestionCount}
        averageMarksPerQuestion={averageMarksPerQuestion}
        onSetAverageMarksPerQuestion={setAverageMarksPerQuestion}
        avoidSimilarQuestions={avoidSimilarQuestions}
        onSetAvoidSimilarQuestions={setAvoidSimilarQuestions}
        hasApiKey={Boolean(apiKey)}
        canGenerate={canGenerate}
        isGenerating={isGenerating}
        isPaused={activeTimer.isPaused}
        onTogglePause={togglePause}
        onAbort={() => void useAppStore.getState().abortGeneration()}
        generationStatus={generationStatus}
        generationStartedAt={generationStartedAt}
        formattedElapsedTime={activeTimer.formattedSessionTime}
        onGenerate={() => void handleGenerateQuestions()}
        onStartOver={resetPreferences}
        batchProgress={batchProgress}
        generationStrategy={generationStrategy}
        generationSubCallProgress={generationSubCallProgress}
        streamText={aggregatedStreamText}
      />
    );
  }

  if (showCompletionScreen) {
    return (
      <CompletionScreen
        questionMode={questionMode}
        difficulty={difficulty}
        accuracyPercent={completionAccuracyPercent}
        formattedElapsedTime={activeTimer.formattedSessionTime}
        completedCount={
          questionMode === 'written' ? completedCount : mcCompletedCount
        }
        totalCount={
          questionMode === 'written' ? questions.length : mcQuestions.length
        }
        onReview={() => setShowCompletionScreen(false)}
        onStartOver={() => {
          if (questionMode === 'written') setQuestions([]);
          else setMcQuestions([]);
        }}
        sessionWrittenResults={sessionWrittenResults}
        sessionMcResults={sessionMcResults}
      />
    );
  }

  return (
    <div className='flex flex-col h-full overflow-auto bg-background'>
      <SessionHeader
        type={questionMode === 'written' ? 'written' : 'mc'}
        questionIndex={
          questionMode === 'written'
            ? activeQuestionIndex
            : activeMcQuestionIndex
        }
        totalQuestions={
          questionMode === 'written' ? questions.length : mcQuestions.length
        }
        completedCount={
          questionMode === 'written' ? completedCount : mcCompletedCount
        }
        topic={
          questionMode === 'written'
            ? activeQuestion?.topic
            : activeMcQuestion?.topic
        }
        difficulty={difficulty}
        maxMarks={questionMode === 'written' ? activeQuestion?.maxMarks : 1}
        techAllowed={
          questionMode === 'written'
            ? activeQuestion?.techAllowed
            : activeMcQuestion?.techAllowed
        }
        isMathTopic={isMathTopic(
          questionMode === 'written'
            ? activeQuestion?.topic
            : activeMcQuestion?.topic,
        )}
        isAtLast={
          questionMode === 'written'
            ? isAtLastWrittenQuestion
            : isAtLastMcQuestion
        }
        canAdvance={
          questionMode === 'written' ? canAdvanceWritten : canAdvanceMc
        }
        generationStartedAt={generationStartedAt}
        telemetry={
          questionMode === 'written'
            ? writtenGenerationTelemetry
            : mcGenerationTelemetry
        }
        questionTimeSeconds={activeTimer.currentQuestionElapsed}
        questionMarks={activeTimer.currentQuestionMarks}
        isPaused={activeTimer.isPaused}
        onTogglePause={togglePause}
        onResetTimer={resetCurrentQuestionTimer}
        onPrev={questionMode === 'written' ? handlePrevWritten : handlePrevMc}
        onNext={
          questionMode === 'written'
            ? handleNextWrittenQuestion
            : handleNextMcQuestion
        }
        onDelete={
          questionMode === 'written'
            ? handleCancelWrittenQuestion
            : handleCancelMcQuestion
        }
        onExit={handleExitSession}
        getDifficultyBadgeClasses={getDifficultyBadgeClasses}
      />

      <div className='flex-1 min-h-0 overflow-auto relative px-6 pt-4 pb-10'>
        {questionMode === 'written' && activeFeedback ? (
          <WrittenFeedbackPanel
            questionId={activeQuestion.id}
            promptMarkdown={activeQuestion.promptMarkdown}
            answer={activeQuestionAnswer}
            image={activeQuestionImage}
            feedback={activeFeedback}
            markingDurationMs={
              writtenMarkingDurationMsByQuestionId[activeQuestion.id]
            }
            appealText={activeMarkAppeal}
            onAppealChange={handleAppealChange}
            onArgueForMark={() => void handleArgueForMark()}
            overrideInput={activeOverrideInput}
            onOverrideInputChange={handleOverrideInputChange}
            onApplyOverride={overrideWrittenMark}
            onCriterionChange={handleOverrideCriterion}
            isMarking={isMarking}
          />
        ) : questionMode === 'written' ? (
          <QuestionSplitLayout
            mode='written'
            leftSlot={
              <div className='border-t border-border/15 pt-4'>
                <div
                  className='prose dark:prose-invert max-w-none'
                  style={{
                    fontSize: 'var(--question-text-size)',
                  }}
                >
                  <MarkdownMath content={activeQuestion.promptMarkdown} />
                </div>
              </div>
            }
            rightSlot={
              <WrittenAnswerCard
                questionId={activeQuestion.id}
                answer={activeQuestionAnswer}
                image={activeQuestionImage}
                onAnswerChange={handleWrittenAnswerChange}
                onImageDrop={handleWrittenImageDrop}
                onImageRemove={handleWrittenImageRemove}
                onSubmit={(p) => void handleSubmitForMarking(p)}
                isMarking={isMarking}
                canSubmit={!activeFeedback && !isMarking}
                sketchSessionKey={activeWrittenSketchSessionKey}
                onSketchpadActiveChange={setWrittenSketchpadActive}
              />
            }
          />
        ) : mcSketchpadActive ? (
          <QuestionSplitLayout
            mode='mc'
            leftSlot={
              <div className='border-t border-border/15 pt-4'>
                <div
                  className='prose dark:prose-invert max-w-none'
                  style={{
                    fontSize: 'var(--question-text-size)',
                  }}
                >
                  <MarkdownMath content={activeMcQuestion.promptMarkdown} />
                </div>
              </div>
            }
            leftBelowSlot={
              <div className='min-w-0'>
                <UnifiedMcqOptionsGrid
                  options={activeMcQuestion.options}
                  selectedAnswer={activeMcAnswer}
                  correctAnswer={activeMcQuestion.correctAnswer}
                  answered={Boolean(activeMcAnswer)}
                  revealCorrectness={Boolean(activeMcAnswer)}
                  lockSelection={false}
                  onSelect={handleMcAnswer}
                  columns={1}
                />
              </div>
            }
            rightSlot={
              <McAnswerCard
                questionId={activeMcQuestion.id}
                options={activeMcQuestion.options}
                selectedAnswer={activeMcAnswer}
                correctAnswer={activeMcQuestion.correctAnswer}
                onSelectAnswer={handleMcAnswer}
                explanationMarkdown={activeMcQuestion.explanationMarkdown}
                isSketchpadOpen={mcSketchpadActive}
                onToggleSketchpad={() =>
                  setMcSketchpadActive(!mcSketchpadActive)
                }
                sketchSessionKey={activeMcSketchSessionKey}
                onApplyOverride={overrideMcMark}
                onImageDrop={() => {}}
                onImageRemove={() => {}}
                renderSketchpadInline={true}
              />
            }
          />
        ) : (
          <QuestionSplitLayout
            mode='mc'
            leftSlot={
              <div className='border-t border-border/15 pt-4'>
                <div
                  className='prose dark:prose-invert max-w-none'
                  style={{
                    fontSize: 'var(--question-text-size)',
                  }}
                >
                  <MarkdownMath content={activeMcQuestion.promptMarkdown} />
                </div>
              </div>
            }
            rightSlot={
              <McAnswerCard
                questionId={activeMcQuestion.id}
                options={activeMcQuestion.options}
                selectedAnswer={activeMcAnswer}
                correctAnswer={activeMcQuestion.correctAnswer}
                onSelectAnswer={handleMcAnswer}
                explanationMarkdown={activeMcQuestion.explanationMarkdown}
                isSketchpadOpen={mcSketchpadActive}
                onToggleSketchpad={() =>
                  setMcSketchpadActive(!mcSketchpadActive)
                }
                sketchSessionKey={activeMcSketchSessionKey}
                onApplyOverride={overrideMcMark}
                onImageDrop={() => {}}
                onImageRemove={() => {}}
              />
            }
          />
        )}

        {showKeyboardHint && (
          <div className='absolute bottom-4 right-4 bg-primary text-primary-foreground px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm animate-in fade-in slide-in-from-bottom-4'>
            <span>
              Press{' '}
              <kbd className='font-sans border px-1.5 py-0.5 rounded bg-white/20'>
                ?
              </kbd>{' '}
              for shortcuts
            </span>
            <button
              onClick={dismissKeyboardHint}
              className='hover:text-white/70'
            >
              <X className='h-4 w-4' />
            </button>
          </div>
        )}
      </div>

      <ConfirmModal
        open={cancelOpen}
        onCancel={cancelCancel}
        title='Remove Question?'
        description={cancelMessage || ''}
        onConfirm={confirmCancel}
        confirmText='Remove'
      />

      <ConfirmModal
        open={failureOpen}
        onCancel={dismissFailure}
        title='Generation Failed'
        description='The generation request timed out or was interrupted. Would you like to retry the same parameters?'
        onConfirm={() => {
          void confirmFailure();
        }}
        confirmText='Retry'
      />

      {activeTutorQuestionId && (
        <TutorPanel
          questionId={activeTutorQuestionId}
          contextPrompt={activeTutorContextPrompt}
          studentAnswer={activeTutorStudentAnswer}
          image={activeTutorImage}
          sketchSessionKey={activeTutorSketchSessionKey}
        />
      )}
    </div>
  );
}
