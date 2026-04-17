import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
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
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { useFirebaseSyncContext } from '@/context/FirebaseSyncContext';
import { useTimer } from '@/hooks/useTimer';
import {
  fileToDataUrl,
  normalizeMarkResponse,
  readBackendError,
} from '@/lib/app-utils';
import { deleteImage, uploadImageDataUrl } from '@/lib/firebase-storage';
import {
  generateQuestionsOrchestrator,
  getCanGenerate,
} from '@/lib/generation-orchestrator';
import {
  countWords,
  generateEntryId,
  getDifficultyBadgeClasses,
  hashStringForSeed,
  isMathTopic,
  removeKey,
} from '@/lib/generator-helpers';
import { useAppStore } from '@/store';
import { useTutorStore } from '@/store/tutor';
import type {
  GeneratedQuestion,
  GenerationTokenEvent,
  MarkAnswerResponse,
  MarkingCriterion,
  McAttemptKind,
  McHistoryEntry,
  McQuestion,
  QuestionHistoryEntry,
  StudentAnswerImage,
  Topic,
  WrittenAttemptKind,
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
import { McAnswerCard } from '@/views/generator/McAnswerCard';
import { SetupPanel } from '@/views/generator/SetupPanel';
import { WrittenFeedbackPanel } from '@/views/generator/WrittenFeedbackPanel';

import { QuestionSplitLayout } from './generator/QuestionSplitLayout';
import { SessionHeader } from './generator/SessionHeader';
import { WrittenAnswerCard } from './generator/WrittenAnswerCard';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSketchpadSessionKey(
  mode: 'written' | 'multiple-choice',
  question:
    | Pick<GeneratedQuestion, 'id' | 'topic' | 'subtopic' | 'promptMarkdown'>
    | Pick<
        McQuestion,
        'id' | 'topic' | 'subtopic' | 'promptMarkdown' | 'explanationMarkdown'
      >,
): string {
  const signature = [
    mode,
    question.topic,
    question.subtopic ?? '',
    question.promptMarkdown,
    'explanationMarkdown' in question
      ? (question as McQuestion).explanationMarkdown
      : '',
  ].join('|');
  const hash = hashStringForSeed(signature).toString(36);
  return `sketch-${mode}-${question.id}-${hash}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

// eslint-disable-next-line complexity
export function GeneratorView() {
  const location = useLocation();
  const { user } = useFirebaseSyncContext();

  const [showCompletionScreen, setShowCompletionScreen] = useState(false);
  const [hasShownCompletionScreen, setHasShownCompletionScreen] =
    useState(false);

  const [markAppealByQuestionId, setMarkAppealByQuestionId] = useState<
    Record<string, string>
  >({});
  const [markOverrideInputByQuestionId, setMarkOverrideInputByQuestionId] =
    useState<Record<string, string>>({});
  const [mcMarkOverrideInputByQuestionId, setMcMarkOverrideInputByQuestionId] =
    useState<Record<string, string>>({});
  const [
    writtenHistoryEntryIdByQuestionId,
    setWrittenHistoryEntryIdByQuestionId,
  ] = useState<Record<string, string>>({});
  const [mcHistoryEntryIdByQuestionId, setMcHistoryEntryIdByQuestionId] =
    useState<Record<string, string>>({});
  const [mcAwardedMarksByQuestionId, setMcAwardedMarksByQuestionId] = useState<
    Record<string, number>
  >({});
  const [writtenResponseEnteredAtById, setWrittenResponseEnteredAtById] =
    useState<Record<string, number>>({});

  const [showKeyboardHint, setShowKeyboardHint] = useState(() => {
    try {
      return !localStorage.getItem('keyboard-hint-dismissed');
    } catch {
      return true;
    }
  });

  const [writtenSketchpadActive, setWrittenSketchpadActive] = useState(false);
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
    difficulty,
    setDifficulty,
    techMode,
    setTechMode,
    mathMethodsSubtopics,
    setMathMethodsSubtopics,
    specialistMathSubtopics,
    setSpecialistMathSubtopics,
    chemistrySubtopics,
    setChemistrySubtopics,
    physicalEducationSubtopics,
    setPhysicalEducationSubtopics,
    biologySubtopics,
    setBiologySubtopics,
    generalMathematicsSubtopics,
    setGeneralMathematicsSubtopics,
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
    diversityStrictness,
    setDiversityStrictness,
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
    addQuestionHistoryEntry,
    updateQuestionHistoryEntry,
    deleteQuestionHistoryEntry,
    activeWrittenSavedSetId,
    setActiveWrittenSavedSetId,
    writtenGenerationTelemetry,
    setWrittenQuestionPresentedAtById,
  } = useWrittenSession();

  const {
    mcQuestions,
    setMcQuestions,
    activeMcQuestionIndex,
    setActiveMcQuestionIndex,
    mcAnswersByQuestionId,
    setMcAnswersByQuestionId,
    mcHistory,
    addMcHistoryEntry,
    updateMcHistoryEntry,
    deleteMcHistoryEntry,
    activeMcSavedSetId,
    setActiveMcSavedSetId,
    mcGenerationTelemetry,
    setMcQuestionPresentedAtById,
  } = useMultipleChoiceSession();

  const {
    isGenerating,
    generationStatus,
    generationStartedAt,
    isMarking,
    setIsMarking,
    setErrorMessage,
    batchProgress,
    generationSubCallProgress,
  } = useGenerationStatus();

  const deleteSavedSet = useAppStore((s) => s.deleteSavedSet);

  const [lastFailedAction, setLastFailedAction] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [pendingCancelType, setPendingCancelType] = useState<
    null | 'written' | 'mc'
  >(null);

  const [, setStreamText] = useState('');

  const writtenTimer = useTimer(questions, activeQuestionIndex, 'written');
  const mcTimer = useTimer(mcQuestions, activeMcQuestionIndex, 'mc');

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
  const activeMcAwardedMarks = activeMcQuestion
    ? mcAwardedMarksByQuestionId[activeMcQuestion.id]
    : undefined;
  const activeMcOverrideInput = activeMcQuestion
    ? (mcMarkOverrideInputByQuestionId[activeMcQuestion.id] ??
      (activeMcAwardedMarks !== undefined ? String(activeMcAwardedMarks) : ''))
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

  useEffect(() => {
    setShowCompletionScreen(false);
    setHasShownCompletionScreen(false);
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

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const topic = params.get('topic');
    const subtopic = params.get('subtopic');
    if (topic && TOPICS.includes(topic as Topic)) {
      setSelectedTopics([topic as Topic]);
      if (subtopic) {
        if (
          topic === 'Mathematical Methods' &&
          MATH_METHODS_SUBTOPICS.includes(subtopic)
        ) {
          setMathMethodsSubtopics([subtopic]);
        } else if (
          topic === 'Specialist Mathematics' &&
          SPECIALIST_MATH_SUBTOPICS.includes(subtopic)
        ) {
          setSpecialistMathSubtopics([subtopic]);
        } else if (
          topic === 'Chemistry' &&
          CHEMISTRY_SUBTOPICS.includes(subtopic)
        ) {
          setChemistrySubtopics([subtopic]);
        } else if (
          topic === 'Biology' &&
          BIOLOGY_SUBTOPICS.includes(subtopic)
        ) {
          setBiologySubtopics([subtopic]);
        } else if (
          topic === 'General Mathematics' &&
          GENERAL_MATHEMATICS_SUBTOPICS.includes(subtopic)
        ) {
          setGeneralMathematicsSubtopics([subtopic]);
        } else if (
          topic === 'Physical Education' &&
          PHYSICAL_EDUCATION_SUBTOPICS.includes(subtopic)
        ) {
          setPhysicalEducationSubtopics([subtopic]);
        }
      }
    }
  }, [
    location.search,
    setSelectedTopics,
    setMathMethodsSubtopics,
    setSpecialistMathSubtopics,
    setChemistrySubtopics,
    setBiologySubtopics,
    setGeneralMathematicsSubtopics,
    setPhysicalEducationSubtopics,
  ]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleWrittenAnswerChange = useCallback(
    (value: string) => {
      if (!activeQuestion) return;
      const questionId = activeQuestion.id;
      setAnswersByQuestionId((prev: Record<string, string>) => ({
        ...prev,
        [questionId]: value,
      }));
      if (value.trim().length > 0) {
        setWrittenResponseEnteredAtById((prev: Record<string, number>) =>
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
        .then(async (dataUrl) => {
          setImagesByQuestionId(
            (prev: Record<string, StudentAnswerImage | undefined>) => ({
              ...prev,
              [questionId]: { id: imageId, dataUrl, timestamp },
            }),
          );
          setWrittenResponseEnteredAtById((prev: Record<string, number>) =>
            prev[questionId] !== undefined
              ? prev
              : { ...prev, [questionId]: Date.now() },
          );

          if (user) {
            try {
              const { storagePath, downloadUrl } = await uploadImageDataUrl(
                dataUrl,
                questionId,
                imageId,
              );
              setImagesByQuestionId(
                (prev: Record<string, StudentAnswerImage | undefined>) => ({
                  ...prev,
                  [questionId]: {
                    id: imageId,
                    dataUrl,
                    storagePath,
                    downloadUrl,
                    timestamp,
                  },
                }),
              );
            } catch (error) {
              console.error('Firebase upload failed:', error);
              toast.error('Failed to upload image to cloud storage.');
            }
          }
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
      user,
    ],
  );

  const handleWrittenImageRemove = useCallback(() => {
    if (!activeQuestion) return;
    const currentImage = imagesByQuestionId[activeQuestion.id];
    if (currentImage?.storagePath) {
      void deleteImage(currentImage.storagePath).catch(console.error);
    }
    setImagesByQuestionId(
      (prev: Record<string, StudentAnswerImage | undefined>) =>
        removeKey(prev, activeQuestion.id),
    );
  }, [activeQuestion, imagesByQuestionId, setImagesByQuestionId]);

  const handleAppealChange = useCallback(
    (value: string) => {
      if (!activeQuestion) return;
      setMarkAppealByQuestionId((prev: Record<string, string>) => ({
        ...prev,
        [activeQuestion.id]: value,
      }));
    },
    [activeQuestion, setMarkAppealByQuestionId],
  );

  const handleOverrideInputChange = useCallback(
    (value: string) => {
      if (!activeQuestion) return;
      setMarkOverrideInputByQuestionId((prev: Record<string, string>) => ({
        ...prev,
        [activeQuestion.id]: value,
      }));
    },
    [activeQuestion, setMarkOverrideInputByQuestionId],
  );

  const handleMcOverrideInputChange = useCallback(
    (value: string) => {
      if (!activeMcQuestion) return;
      setMcMarkOverrideInputByQuestionId((prev: Record<string, string>) => ({
        ...prev,
        [activeMcQuestion.id]: value,
      }));
    },
    [activeMcQuestion, setMcMarkOverrideInputByQuestionId],
  );

  const startStopwatch = useCallback(() => {
    writtenTimer.reset();
    mcTimer.reset();
  }, [writtenTimer, mcTimer]);

  useEffect(() => {
    if (isMarking) {
      if (!writtenTimer.isPaused) writtenTimer.togglePause();
      if (!mcTimer.isPaused) mcTimer.togglePause();
    }
  }, [isMarking, writtenTimer, mcTimer]);

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

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void listen('generation-reset', () => {
      setStreamText('');
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void listen<GenerationTokenEvent>('generation-token', (event) => {
      setStreamText(event.payload.text);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const handleNextWrittenQuestion = useCallback(() => {
    if (!canAdvanceWritten) return;
    if (isAtLastWrittenQuestion) {
      writtenTimer.complete();
      setShowCompletionScreen(true);
      return;
    }
    setActiveQuestionIndex(
      Math.min(questions.length - 1, activeQuestionIndex + 1),
    );
  }, [
    canAdvanceWritten,
    isAtLastWrittenQuestion,
    questions.length,
    activeQuestionIndex,
    setActiveQuestionIndex,
    writtenTimer,
  ]);

  const handleNextMcQuestion = useCallback(() => {
    if (!canAdvanceMc) return;
    if (isAtLastMcQuestion) {
      mcTimer.complete();
      setShowCompletionScreen(true);
      return;
    }
    setActiveMcQuestionIndex(
      Math.min(mcQuestions.length - 1, activeMcQuestionIndex + 1),
    );
  }, [
    canAdvanceMc,
    isAtLastMcQuestion,
    mcQuestions.length,
    activeMcQuestionIndex,
    setActiveMcQuestionIndex,
    mcTimer,
  ]);

  const handlePrevWritten = useCallback(() => {
    setActiveQuestionIndex(Math.max(0, activeQuestionIndex - 1));
  }, [activeQuestionIndex, setActiveQuestionIndex]);

  const handlePrevMc = useCallback(() => {
    setActiveMcQuestionIndex(Math.max(0, activeMcQuestionIndex - 1));
  }, [activeMcQuestionIndex, setActiveMcQuestionIndex]);

  const handleCancelWrittenQuestion = useCallback(() => {
    if (!activeQuestion) return;
    setConfirmMessage(
      `Remove question ${activeQuestionIndex + 1} ("${activeQuestion.topic}")? It will be taken out of your current set.`,
    );
    setPendingCancelType('written');
    setConfirmOpen(true);
  }, [activeQuestion, activeQuestionIndex]);

  const handleCancelMcQuestion = useCallback(() => {
    if (!activeMcQuestion) return;
    setConfirmMessage(
      `Remove question ${activeMcQuestionIndex + 1} ("${activeMcQuestion.topic}")? It will be taken out of your current set.`,
    );
    setPendingCancelType('mc');
    setConfirmOpen(true);
  }, [activeMcQuestion, activeMcQuestionIndex]);

  const handleExitSession = useCallback(() => {
    if (isSetComplete) {
      activeTimer.complete();
      setShowCompletionScreen(true);
    } else {
      // Uncompleted session - save and return to setup
      const savedId = appStore.saveCurrentSet();
      if (savedId) {
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

  const getWrittenAttemptSequence = useCallback(
    (qId: string) =>
      questionHistory.filter((e: QuestionHistoryEntry) => e.question.id === qId)
        .length + 1,
    [questionHistory],
  );
  const getMcAttemptSequence = useCallback(
    (qId: string) =>
      mcHistory.filter((e: McHistoryEntry) => e.question.id === qId).length + 1,
    [mcHistory],
  );

  const appendMcHistoryEntry = useCallback(
    (
      question: McQuestion,
      selectedAnswer: string,
      awardedMarks: number,
      attemptKind: McAttemptKind,
      responseEnteredAtMs?: number,
    ) => {
      if (!question) return;
      const timing = mcTimer.getQuestionTiming(question.id);
      const responseAt = responseEnteredAtMs ?? Date.now();
      const now = Date.now();
      const entry: McHistoryEntry = {
        type: 'multiple-choice',
        id: generateEntryId(),
        createdAt: new Date(now).toISOString(),
        lastModified: now,
        question,
        selectedAnswer,
        correct: awardedMarks >= 1,
        awardedMarks,
        maxMarks: 1,
        generationTelemetry: mcGenerationTelemetry ?? undefined,
        difficulty: difficulty,
        analytics: {
          attemptKind,
          attemptSequence: getMcAttemptSequence(question.id),
          answerCharacterCount: 0,
          answerWordCount: 0,
          usedImageUpload: false,
          responseLatencyMs: timing ? timing.elapsedSeconds * 1000 : undefined,
          finalAnswerChangedAtMs: responseAt,
        },
      };
      addMcHistoryEntry(entry);
      setMcHistoryEntryIdByQuestionId((prev: Record<string, string>) => ({
        ...prev,
        [question.id]: entry.id,
      }));

      useAppStore
        .getState()
        .reviewSpacedCard(question.id, awardedMarks >= 1 ? 4 : 1);
    },
    [
      mcTimer,
      mcGenerationTelemetry,
      difficulty,
      getMcAttemptSequence,
      addMcHistoryEntry,
    ],
  );

  const updateLatestMcHistoryEntryMark = useCallback(
    (questionId: string, awardedMarks: number) => {
      const now = Date.now();
      const latestMcHistory = useAppStore.getState().mcHistory;
      const trackedEntryId = mcHistoryEntryIdByQuestionId[questionId];
      const entry = trackedEntryId
        ? latestMcHistory.find((e: McHistoryEntry) => e.id === trackedEntryId)
        : latestMcHistory.find(
            (e: McHistoryEntry) => e.question.id === questionId,
          );
      if (!entry) return;
      const updatedEntry = {
        ...entry,
        correct: awardedMarks >= 1,
        awardedMarks,
        lastModified: now,
      };
      updateMcHistoryEntry(updatedEntry);
    },
    [mcHistoryEntryIdByQuestionId, updateMcHistoryEntry],
  );

  const updateLatestWrittenHistoryEntry = useCallback(
    (questionId: string, response: MarkAnswerResponse) => {
      const now = Date.now();
      const latestQuestionHistory = useAppStore.getState().questionHistory;
      const trackedEntryId = writtenHistoryEntryIdByQuestionId[questionId];
      const entry = trackedEntryId
        ? latestQuestionHistory.find(
            (e: QuestionHistoryEntry) => e.id === trackedEntryId,
          )
        : latestQuestionHistory.find(
            (e: QuestionHistoryEntry) => e.question.id === questionId,
          );
      if (!entry) return;
      const updatedEntry = {
        ...entry,
        markResponse: response,
        workedSolutionMarkdown: response.workedSolutionMarkdown,
        lastModified: now,
      };
      updateQuestionHistoryEntry(updatedEntry);
    },
    [writtenHistoryEntryIdByQuestionId, updateQuestionHistoryEntry],
  );

  const appendWrittenHistoryEntry = useCallback(
    (
      question: GeneratedQuestion,
      response: MarkAnswerResponse,
      options?: {
        uploadedAnswerOverride?: string;
        uploadedAnswerImageOverride?: StudentAnswerImage;
        attemptKind?: WrittenAttemptKind;
        markingLatencyMs?: number;
        responseEnteredAtMs?: number;
      },
    ) => {
      if (!question) return;
      const uploadedAnswer =
        options?.uploadedAnswerOverride ??
        answersByQuestionId[question.id] ??
        '';
      const uploadedAnswerImage =
        options?.uploadedAnswerImageOverride ?? imagesByQuestionId[question.id];
      const timing = writtenTimer.getQuestionTiming(question.id);
      const now = Date.now();
      const entry: QuestionHistoryEntry = {
        id: generateEntryId(),
        createdAt: new Date(now).toISOString(),
        lastModified: now,
        question,
        uploadedAnswer,
        uploadedAnswerImage,
        workedSolutionMarkdown: response.workedSolutionMarkdown,
        markResponse: response,
        generationTelemetry: writtenGenerationTelemetry ?? undefined,
        difficulty: difficulty,
        analytics: {
          attemptKind: options?.attemptKind ?? 'initial',
          attemptSequence: getWrittenAttemptSequence(question.id),
          answerCharacterCount: uploadedAnswer.length,
          answerWordCount: countWords(uploadedAnswer),
          usedImageUpload: Boolean(imagesByQuestionId[question.id]),
          responseLatencyMs: timing ? timing.elapsedSeconds * 1000 : undefined,
          markingLatencyMs: options?.markingLatencyMs,
        },
      };
      addQuestionHistoryEntry(entry);
      setWrittenHistoryEntryIdByQuestionId((prev: Record<string, string>) => ({
        ...prev,
        [question.id]: entry.id,
      }));

      const isCorrect =
        response.verdict?.toLowerCase() === 'correct' ||
        (response.maxMarks > 0 && response.achievedMarks >= response.maxMarks);
      useAppStore.getState().reviewSpacedCard(question.id, isCorrect ? 4 : 1);
    },
    [
      answersByQuestionId,
      imagesByQuestionId,
      writtenTimer,
      writtenGenerationTelemetry,
      difficulty,
      getWrittenAttemptSequence,
      addQuestionHistoryEntry,
    ],
  );

  const performConfirmedCancel = useCallback(() => {
    if (pendingCancelType === 'written' && activeQuestion) {
      const id = activeQuestion.id;
      const next = questions.filter((q: GeneratedQuestion) => q.id !== id);
      setQuestions(next);
      setActiveWrittenSavedSetId(null);
      setShowCompletionScreen(false);
      setActiveQuestionIndex(
        Math.min(activeQuestionIndex, Math.max(0, next.length - 1)),
      );
      setAnswersByQuestionId((p: Record<string, string>) => removeKey(p, id));
      setImagesByQuestionId(
        (p: Record<string, StudentAnswerImage | undefined>) => removeKey(p, id),
      );
      setFeedbackByQuestionId((p: Record<string, MarkAnswerResponse>) =>
        removeKey(p, id),
      );
      setMarkAppealByQuestionId((p: Record<string, string>) =>
        removeKey(p, id),
      );
      setMarkOverrideInputByQuestionId((p: Record<string, string>) =>
        removeKey(p, id),
      );
      setWrittenHistoryEntryIdByQuestionId((p: Record<string, string>) =>
        removeKey(p, id),
      );
      setWrittenResponseEnteredAtById((p: Record<string, number>) =>
        removeKey(p, id),
      );
      const writtenHistoryEntryId = writtenHistoryEntryIdByQuestionId[id];
      if (writtenHistoryEntryId) {
        deleteQuestionHistoryEntry(writtenHistoryEntryId);
      }
      writtenTimer.removeQuestion(id);
      setErrorMessage(null);
    }
    if (pendingCancelType === 'mc' && activeMcQuestion) {
      const id = activeMcQuestion.id;
      const next = mcQuestions.filter((q: McQuestion) => q.id !== id);
      setMcQuestions(next);
      setActiveMcSavedSetId(null);
      setShowCompletionScreen(false);
      setActiveMcQuestionIndex(
        Math.min(activeMcQuestionIndex, Math.max(0, next.length - 1)),
      );
      setMcAnswersByQuestionId((p: Record<string, string>) => removeKey(p, id));
      setMcMarkOverrideInputByQuestionId((p: Record<string, string>) =>
        removeKey(p, id),
      );
      setMcHistoryEntryIdByQuestionId((p: Record<string, string>) =>
        removeKey(p, id),
      );
      setMcAwardedMarksByQuestionId((p: Record<string, number>) =>
        removeKey(p, id),
      );
      const mcHistoryEntryId = mcHistoryEntryIdByQuestionId[id];
      if (mcHistoryEntryId) {
        deleteMcHistoryEntry(mcHistoryEntryId);
      }
      mcTimer.removeQuestion(id);
      setErrorMessage(null);
    }
    setPendingCancelType(null);
    setConfirmOpen(false);
    setConfirmMessage(null);
    toast.success('Question removed from set');
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
    setActiveMcSavedSetId,
    setActiveQuestionIndex,
    setAnswersByQuestionId,
    setImagesByQuestionId,
    setFeedbackByQuestionId,
    writtenHistoryEntryIdByQuestionId,
    deleteQuestionHistoryEntry,
    writtenTimer,
    setMcQuestions,
    setActiveMcQuestionIndex,
    setMcAnswersByQuestionId,
    deleteMcHistoryEntry,
    mcHistoryEntryIdByQuestionId,
    mcTimer,
    setErrorMessage,
    setMarkAppealByQuestionId,
    setMarkOverrideInputByQuestionId,
    setWrittenHistoryEntryIdByQuestionId,
    setWrittenResponseEnteredAtById,
    setMcMarkOverrideInputByQuestionId,
    setMcAwardedMarksByQuestionId,
  ]);

  const handleGenerateQuestions = useCallback(async () => {
    startStopwatch();
    useTutorStore.getState().clearAllSessions();
    await generateQuestionsOrchestrator();
  }, [startStopwatch]);

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
      setIsMarking(true);
      setLastFailedAction(null);
      try {
        let finalImage = effectiveImage;
        if (payload?.image) {
          finalImage = payload.image;
          setImagesByQuestionId(
            (prev: Record<string, StudentAnswerImage | undefined>) => ({
              ...prev,
              [activeQuestion.id]: finalImage,
            }),
          );
          if (user) {
            try {
              const { storagePath, downloadUrl } = await uploadImageDataUrl(
                finalImage.dataUrl,
                activeQuestion.id,
                finalImage.id,
              );
              finalImage = { ...finalImage, storagePath, downloadUrl };
              setImagesByQuestionId(
                (prev: Record<string, StudentAnswerImage | undefined>) => ({
                  ...prev,
                  [activeQuestion.id]: finalImage,
                }),
              );
            } catch (error) {
              console.error('Firebase upload failed:', error);
            }
          }
        }
        const responseEnteredAtMs =
          writtenResponseEnteredAtById[activeQuestion.id] ?? Date.now();
        const markStartedAt = Date.now();
        const rawResponse = await invoke<unknown>('mark_answer', {
          request: {
            question: activeQuestion,
            studentAnswer: activeQuestionAnswer,
            studentAnswerImageDataUrl: finalImage?.dataUrl,
            model: markModel,
            apiKey,
          },
        });
        const markingLatencyMs = Date.now() - markStartedAt;
        const response = normalizeMarkResponse(
          rawResponse,
          activeQuestion.maxMarks,
        );
        setFeedbackByQuestionId((prev: Record<string, MarkAnswerResponse>) => ({
          ...prev,
          [activeQuestion.id]: response,
        }));
        setMarkOverrideInputByQuestionId((prev: Record<string, string>) => ({
          ...prev,
          [activeQuestion.id]: String(response.achievedMarks),
        }));
        appendWrittenHistoryEntry(activeQuestion, response, {
          uploadedAnswerOverride: activeQuestionAnswer,
          uploadedAnswerImageOverride: finalImage,
          attemptKind: 'initial',
          markingLatencyMs,
          responseEnteredAtMs,
        });
        writtenTimer.markAnswered(activeQuestion.id);
        useAppStore.getState().recordCompletion('written');
        toast.success(
          `Answer marked: ${response.achievedMarks}/${response.maxMarks} marks`,
        );
      } catch (error) {
        setErrorMessage(readBackendError(error));
        setLastFailedAction('mark-written');
      } finally {
        setIsMarking(false);
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
      setIsMarking,
      setImagesByQuestionId,
      user,
      writtenResponseEnteredAtById,
      setFeedbackByQuestionId,
      setMarkOverrideInputByQuestionId,
      appendWrittenHistoryEntry,
      writtenTimer,
    ],
  );

  const handleArgueForMark = useCallback(async () => {
    if (!activeQuestion || !activeFeedback) return;
    const appealText = activeMarkAppeal.trim();
    if (!appealText || !apiKey.trim() || !markModel.trim()) return;
    setErrorMessage(null);
    setIsMarking(true);
    setLastFailedAction(null);
    try {
      const responseEnteredAtMs = Date.now();
      const markStartedAt = Date.now();
      const arguedAnswer = [
        activeQuestionAnswer,
        `Additional marking argument from student:\n${appealText}`,
      ]
        .filter((p) => p.trim())
        .join('\n\n');
      const rawResponse = await invoke<unknown>('mark_answer', {
        request: {
          question: activeQuestion,
          studentAnswer: arguedAnswer,
          studentAnswerImageDataUrl: activeQuestionImage?.dataUrl,
          model: markModel,
          apiKey,
        },
      });
      const response = normalizeMarkResponse(
        rawResponse,
        activeQuestion.maxMarks,
      );
      setFeedbackByQuestionId((prev: Record<string, MarkAnswerResponse>) => ({
        ...prev,
        [activeQuestion.id]: response,
      }));
      setMarkOverrideInputByQuestionId((prev: Record<string, string>) => ({
        ...prev,
        [activeQuestion.id]: String(response.achievedMarks),
      }));
      appendWrittenHistoryEntry(activeQuestion, response, {
        uploadedAnswerOverride: activeQuestionAnswer,
        attemptKind: 'appeal',
        markingLatencyMs: Date.now() - markStartedAt,
        responseEnteredAtMs,
      });
      toast.success(
        `Re-mark complete: ${response.achievedMarks}/${response.maxMarks} marks`,
      );
    } catch (error) {
      setErrorMessage(readBackendError(error));
      setLastFailedAction('mark-written');
    } finally {
      setIsMarking(false);
    }
  }, [
    activeQuestion,
    activeFeedback,
    activeMarkAppeal,
    apiKey,
    markModel,
    activeQuestionAnswer,
    activeQuestionImage,
    setErrorMessage,
    setIsMarking,
    setFeedbackByQuestionId,
    setMarkOverrideInputByQuestionId,
    appendWrittenHistoryEntry,
  ]);

  const handleOverrideMark = useCallback(() => {
    if (!activeQuestion || !activeFeedback) return;
    const parsed = Number(activeOverrideInput);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(
      0,
      Math.min(activeFeedback.maxMarks, Math.round(parsed)),
    );
    const updated = {
      ...activeFeedback,
      achievedMarks: clamped,
      scoreOutOf10: Math.round((clamped / activeFeedback.maxMarks) * 10),
      verdict:
        clamped === activeFeedback.maxMarks
          ? 'Correct'
          : clamped === 0
            ? 'Incorrect'
            : 'Overridden',
    };
    setErrorMessage(null);
    setFeedbackByQuestionId((prev: Record<string, MarkAnswerResponse>) => ({
      ...prev,
      [activeQuestion.id]: updated,
    }));
    setMarkOverrideInputByQuestionId((prev: Record<string, string>) => ({
      ...prev,
      [activeQuestion.id]: String(clamped),
    }));
    updateLatestWrittenHistoryEntry(activeQuestion.id, updated);
    toast.message(`Mark overridden to ${clamped}/${activeFeedback.maxMarks}`);
  }, [
    activeQuestion,
    activeFeedback,
    activeOverrideInput,
    setErrorMessage,
    setFeedbackByQuestionId,
    updateLatestWrittenHistoryEntry,
    setMarkOverrideInputByQuestionId,
  ]);

  const handleMcAnswer = useCallback(
    (selectedLabel: string) => {
      if (!activeMcQuestion || isReviewingCompletedSet) return;
      const existingAnswer = mcAnswersByQuestionId[activeMcQuestion.id];
      if (existingAnswer) return;
      const responseEnteredAtMs = Date.now();
      const awardedMarks =
        selectedLabel === activeMcQuestion.correctAnswer ? 1 : 0;
      setMcAnswersByQuestionId((prev: Record<string, string>) => ({
        ...prev,
        [activeMcQuestion.id]: selectedLabel,
      }));
      setMcAwardedMarksByQuestionId((prev: Record<string, number>) => ({
        ...prev,
        [activeMcQuestion.id]: awardedMarks,
      }));
      appendMcHistoryEntry(
        activeMcQuestion,
        selectedLabel,
        awardedMarks,
        'initial',
        responseEnteredAtMs,
      );
      mcTimer.markAnswered(activeMcQuestion.id);
      useAppStore.getState().recordCompletion('multiple-choice');
      if (awardedMarks >= 1) {
        toast.success('Correct!');
      } else {
        toast.error(
          `Incorrect. The correct answer was ${activeMcQuestion.correctAnswer}.`,
        );
      }
    },
    [
      activeMcQuestion,
      isReviewingCompletedSet,
      mcAnswersByQuestionId,
      appendMcHistoryEntry,
      mcTimer,
      setMcAnswersByQuestionId,
      setMcAwardedMarksByQuestionId,
    ],
  );

  const handleMcOverrideMark = useCallback(() => {
    if (!activeMcQuestion) return;
    const parsed = Number(activeMcOverrideInput);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(0, Math.min(1, Math.round(parsed)));
    setMcAwardedMarksByQuestionId((prev: Record<string, number>) => ({
      ...prev,
      [activeMcQuestion.id]: clamped,
    }));
    setMcMarkOverrideInputByQuestionId((prev: Record<string, string>) => ({
      ...prev,
      [activeMcQuestion.id]: String(clamped),
    }));
    updateLatestMcHistoryEntryMark(activeMcQuestion.id, clamped);
    toast.message(`Mark overridden to ${clamped}/1`);
  }, [
    activeMcQuestion,
    activeMcOverrideInput,
    updateLatestMcHistoryEntryMark,
    setMcAwardedMarksByQuestionId,
    setMcMarkOverrideInputByQuestionId,
  ]);

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
        scoreOutOf10: Math.round((totalAchieved / Math.max(1, totalMax)) * 10),
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
      updateLatestWrittenHistoryEntry(activeQuestion.id, nextFeedback);
    },
    [
      activeQuestion,
      activeFeedback,
      setFeedbackByQuestionId,
      updateLatestWrittenHistoryEntry,
      setErrorMessage,
      setMarkOverrideInputByQuestionId,
    ],
  );

  const toggleSubtopics = useCallback(
    <T extends string>(setter: (update: T[] | ((prev: T[]) => T[])) => void) =>
      (sub: T | T[]) => {
        setter((prev: T[]) => {
          const subs = Array.isArray(sub) ? sub : [sub];
          let next = [...prev];
          for (const s of subs) {
            if (next.includes(s)) next = next.filter((i: T) => i !== s);
            else next.push(s);
          }
          return next;
        });
      },
    [],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  if (showSetup) {
    return (
      <SetupPanel
        questionMode={questionMode}
        onSetQuestionMode={setQuestionMode}
        selectedTopics={selectedTopics}
        onToggleTopic={toggleTopic}
        mathMethodsSubtopics={mathMethodsSubtopics}
        onToggleMathMethodsSubtopic={toggleSubtopics(setMathMethodsSubtopics)}
        specialistMathSubtopics={specialistMathSubtopics}
        onToggleSpecialistMathSubtopic={toggleSubtopics(
          setSpecialistMathSubtopics,
        )}
        chemistrySubtopics={chemistrySubtopics}
        onToggleChemistrySubtopic={toggleSubtopics(setChemistrySubtopics)}
        physicalEducationSubtopics={physicalEducationSubtopics}
        onTogglePhysicalEducationSubtopic={toggleSubtopics(
          setPhysicalEducationSubtopics,
        )}
        biologySubtopics={biologySubtopics}
        onToggleBiologySubtopic={toggleSubtopics(setBiologySubtopics)}
        generalMathematicsSubtopics={generalMathematicsSubtopics}
        onToggleGeneralMathematicsSubtopic={toggleSubtopics(
          setGeneralMathematicsSubtopics,
        )}
        techMode={techMode}
        onSetTechMode={setTechMode}
        customFocusArea={customFocusArea}
        onSetCustomFocusArea={setCustomFocusArea}
        diversityStrictness={diversityStrictness}
        onSetDiversityStrictness={setDiversityStrictness}
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
        generationStatus={generationStatus}
        generationStartedAt={generationStartedAt}
        formattedElapsedTime={activeTimer.formattedSessionTime}
        onGenerate={() => void handleGenerateQuestions()}
        onStartOver={resetPreferences}
        batchProgress={batchProgress}
        generationStrategy={generationStrategy}
        generationSubCallProgress={generationSubCallProgress}
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
    <div className='flex flex-col h-full overflow-hidden bg-background'>
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
        telemetry={null}
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
        onSaveDraft={() => {
          const id = appStore.saveCurrentSet();
          if (id) toast.success("Draft saved to 'Saved Sets'");
        }}
        getDifficultyBadgeClasses={getDifficultyBadgeClasses}
        questions={questionMode === 'written' ? questions : mcQuestions}
      />

      <div className='flex-1 min-h-0 overflow-hidden relative p-6'>
        <QuestionSplitLayout
          mode={questionMode === 'written' ? 'written' : 'mc'}
          sketchpadActive={
            questionMode === 'written'
              ? writtenSketchpadActive
              : mcSketchpadActive
          }
          leftSlot={
            questionMode === 'written' ? (
              <div className='prose dark:prose-invert max-w-none'>
                <MarkdownMath content={activeQuestion.promptMarkdown} />
              </div>
            ) : (
              <div className='space-y-6'>
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-2'>
                    <span
                      className={`px-2 py-0.5 text-xs font-medium border rounded-full ${getDifficultyBadgeClasses(difficulty)}`}
                    >
                      {difficulty}
                    </span>
                    {activeMcQuestion.subtopic && (
                      <span className='text-xs font-medium text-muted-foreground uppercase tracking-wider'>
                        {activeMcQuestion.subtopic}
                      </span>
                    )}
                  </div>
                  <span className='text-sm font-semibold text-primary'>
                    [1 mark]
                  </span>
                </div>
                <div className='prose dark:prose-invert max-w-none'>
                  <MarkdownMath content={activeMcQuestion.promptMarkdown} />
                </div>
              </div>
            )
          }
          rightSlot={
            questionMode === 'written' ? (
              <div className='space-y-6 h-full flex flex-col'>
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

                {activeFeedback && (
                  <WrittenFeedbackPanel
                    questionId={activeQuestion.id}
                    promptMarkdown={activeQuestion.promptMarkdown}
                    answer={activeQuestionAnswer}
                    image={activeQuestionImage}
                    feedback={activeFeedback}
                    appealText={activeMarkAppeal}
                    onAppealChange={handleAppealChange}
                    onArgueForMark={() => void handleArgueForMark()}
                    overrideInput={activeOverrideInput}
                    onOverrideInputChange={handleOverrideInputChange}
                    onApplyOverride={handleOverrideMark}
                    onCriterionChange={handleOverrideCriterion}
                    isMarking={isMarking}
                  />
                )}
              </div>
            ) : (
              <div className='space-y-6 h-full flex flex-col'>
                <McAnswerCard
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
                  awardedMarks={activeMcAwardedMarks}
                  appealText=''
                  overrideInput={activeMcOverrideInput}
                  onAppealChange={() => {}}
                  onOverrideInputChange={handleMcOverrideInputChange}
                  onArgueForMark={() => {}}
                  onApplyOverride={handleMcOverrideMark}
                  isMarking={isMarking}
                  onImageDrop={() => {}}
                  onImageRemove={() => {}}
                />
              </div>
            )
          }
        />

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
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        title='Remove Question?'
        description={confirmMessage || ''}
        onConfirm={performConfirmedCancel}
        confirmText='Remove'
      />

      <ConfirmModal
        open={confirmOpen && Boolean(lastFailedAction)}
        onCancel={() => setLastFailedAction(null)}
        title='Generation Failed'
        description='The generation request timed out or was interrupted. Would you like to retry the same parameters?'
        onConfirm={() => void handleGenerateQuestions()}
        confirmText='Retry'
      />
    </div>
  );
}
