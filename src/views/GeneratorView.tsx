import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useQuestionTimer } from '@/hooks/useQuestionTimer';
import {
  fileToDataUrl,
  formatDurationMs,
  normalizeMarkResponse,
  readBackendError,
} from '@/lib/app-utils';
import {
  buildSubtopicCalls,
  distributeQuestions,
  preprocessMcQuestions,
  shuffleMcQuestionOptions,
} from '@/lib/generator-batch';
import {
  countWords,
  generateEntryId,
  getDifficultyBadgeClasses,
  isMathTopic,
  rekeyMc,
  rekeyWritten,
  removeKey,
} from '@/lib/generator-helpers';
import { applyBatchQualityChecks } from '@/lib/question-cache';
import { useAppStore } from '@/store';
import type {
  ChemistrySubtopic,
  DiversityStrictness,
  GeneratedQuestion,
  GenerateMcQuestionsResponse,
  GenerateQuestionsResponse,
  GenerationStatusEvent,
  GenerationSubCallProgress,
  GenerationTelemetry,
  GenerationTokenEvent,
  MathMethodsSubtopic,
  McAttemptKind,
  McHistoryEntry,
  McOption,
  McQuestion,
  PhysicalEducationSubtopic,
  QuestionHistoryEntry,
  SpecialistMathSubtopic,
  StudentAnswerImage,
  Topic,
  WrittenAttemptKind,
} from '@/types';
import {
  CHEMISTRY_SUBTOPICS,
  MATH_METHODS_SUBTOPICS,
  PHYSICAL_EDUCATION_SUBTOPICS,
  SPECIALIST_MATH_SUBTOPICS,
  TOPICS,
} from '@/types';
import { CompletionScreen } from '@/views/generator/CompletionScreen';
import { McAnswerCard, McSketchpadPanel } from '@/views/generator/McAnswerCard';
import type { BatchTopicProgress } from '@/views/generator/SetupPanel';
import { SetupPanel } from '@/views/generator/SetupPanel';
import { WrittenFeedbackPanel } from '@/views/generator/WrittenFeedbackPanel';

import { SessionHeader } from './generator/SessionHeader';
import { WrittenAnswerCard } from './generator/WrittenAnswerCard';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MC_MAX_EXPLANATION_WORDS = 180;

// ─── Component ────────────────────────────────────────────────────────────────

// eslint-disable-next-line complexity
export function GeneratorView() {
  // Read query params for pre-selection
  const location = useLocation();
  // Pre-select topic and subtopic from query params on mount
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const topic = params.get('topic');
    const subtopic = params.get('subtopic');
    if (topic && TOPICS.includes(topic as Topic)) {
      setSelectedTopics([topic as Topic]);
      // Try to select subtopic if present and valid for this topic
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
          topic === 'Physical Education' &&
          PHYSICAL_EDUCATION_SUBTOPICS.includes(subtopic)
        ) {
          setPhysicalEducationSubtopics([subtopic]);
        }
      }
    }
    // Only run on mount or when location.search changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);
  // ── Local UI state ──────────────────────────────────────────────────────────
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [showCompletionScreen, setShowCompletionScreen] = useState(false);
  const [hasShownCompletionScreen, setHasShownCompletionScreen] =
    useState(false);
  const [customFocusArea, setCustomFocusArea] = useState('');
  const [diversityStrictness, setDiversityStrictness] =
    useState<DiversityStrictness>('moderate');
  const [strictLatexValidation, setStrictLatexValidation] = useState(false);
  const [strictSubtopicCoverage, setStrictSubtopicCoverage] = useState(false);
  const [minSubtopicCoverageRatio, setMinSubtopicCoverageRatio] = useState(0.7);

  const [markAppealByQuestionId, setMarkAppealByQuestionId] = useState<
    Record<string, string>
  >({});
  const [markOverrideInputByQuestionId, setMarkOverrideInputByQuestionId] =
    useState<Record<string, string>>({});
  const [mcMarkAppealByQuestionId, setMcMarkAppealByQuestionId] = useState<
    Record<string, string>
  >({});
  const [mcMarkOverrideInputByQuestionId, setMcMarkOverrideInputByQuestionId] =
    useState<Record<string, string>>({});
  const [mcAwardedMarksByQuestionId, setMcAwardedMarksByQuestionId] = useState<
    Record<string, number>
  >({});
  const [writtenResponseEnteredAtById, setWrittenResponseEnteredAtById] =
    useState<Record<string, number>>({});

  // Keyboard shortcut hint state
  const [showKeyboardHint, setShowKeyboardHint] = useState(() => {
    try {
      return !localStorage.getItem('keyboard-hint-dismissed');
    } catch {
      return true;
    }
  });

  const [writtenSketchpadActive, setWrittenSketchpadActive] = useState(false);
  const [mcSketchpadActive, setMcSketchpadActive] = useState(false);
  const [mcImagesByQuestionId, setMcImagesByQuestionId] = useState<
    Record<string, StudentAnswerImage>
  >({});

  // Per-topic batch progress — drives the multi-topic timeline in SetupPanel.
  // Empty when only one topic is selected (single-call path shows normal timeline).
  const [batchProgress, setBatchProgress] = useState<BatchTopicProgress[]>([]);
  const [generationSubCallProgress, setGenerationSubCallProgress] =
    useState<GenerationSubCallProgress | null>(null);

  // ── Context ─────────────────────────────────────────────────────────────────
  const {
    apiKey,
    model,
    markingModel,
    useSeparateMarkingModel,
    imageMarkingModel,
    useSeparateImageMarkingModel,
    includeExamContext,
  } = useAppSettings();
  const {
    selectedTopics,
    setSelectedTopics,
    difficulty,
    setDifficulty,
    avoidSimilarQuestions,
    setAvoidSimilarQuestions,
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
    questionCount,
    setQuestionCount,
    averageMarksPerQuestion,
    setAverageMarksPerQuestion,
    questionMode,
    setQuestionMode,
    aiDifficultyScalingEnabled,
  } = useAppPreferences();

  const {
    questions,
    setQuestions,
    activeQuestionIndex,
    setActiveQuestionIndex,
    setWrittenQuestionPresentedAtById,
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
    setWrittenRawModelOutput,
    writtenGenerationTelemetry,
    setWrittenGenerationTelemetry,
    activeWrittenSavedSetId: _activeWrittenSavedSetId,
    setActiveWrittenSavedSetId,
  } = useWrittenSession();

  const {
    mcQuestions,
    setMcQuestions,
    activeMcQuestionIndex,
    setActiveMcQuestionIndex,
    setMcQuestionPresentedAtById,
    mcAnswersByQuestionId,
    setMcAnswersByQuestionId,
    mcHistory,
    addMcHistoryEntry,
    updateMcHistoryEntry,
    deleteMcHistoryEntry,
    setMcRawModelOutput,
    mcGenerationTelemetry,
    setMcGenerationTelemetry,
    activeMcSavedSetId: _activeMcSavedSetId,
    setActiveMcSavedSetId,
  } = useMultipleChoiceSession();

  const {
    saveCurrentSet,
    isGenerating,
    setIsGenerating,
    generationStatus,
    setGenerationStatus,
    generationStartedAt,
    setGenerationStartedAt,
    isMarking,
    setIsMarking,
    errorMessage,
    setErrorMessage,
  } = useGenerationStatus();

  const addGenerationRecord = useAppStore((s) => s.addGenerationRecord);
  const setWrittenTimerState = useAppStore((s) => s.setWrittenTimerState);
  const setMcTimerState = useAppStore((s) => s.setMcTimerState);

  const [lastFailedAction, setLastFailedAction] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [pendingCancelType, setPendingCancelType] = useState<
    null | 'written' | 'mc'
  >(null);

  const [streamText, setStreamText] = useState('');

  const [lastSessionTelemetry, setLastSessionTelemetry] =
    useState<GenerationTelemetry | null>(null);

  // --- Timer hooks ---
  const writtenTimer = useQuestionTimer(
    0,
    questions,
    activeQuestionIndex,
    'written'
  );
  const mcTimer = useQuestionTimer(0, mcQuestions, activeMcQuestionIndex, 'mc');

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
  const activeMcMarkAppeal = activeMcQuestion
    ? (mcMarkAppealByQuestionId[activeMcQuestion.id] ?? '')
    : '';
  const activeMcAwardedMarks = activeMcQuestion
    ? mcAwardedMarksByQuestionId[activeMcQuestion.id]
    : undefined;
  const activeMcOverrideInput = activeMcQuestion
    ? (mcMarkOverrideInputByQuestionId[activeMcQuestion.id] ??
      (activeMcAwardedMarks !== undefined ? String(activeMcAwardedMarks) : ''))
    : '';

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
    [mcAwardedMarksByQuestionId]
  );
  const recentAverageScore = useMemo(() => {
    if (questionMode === 'written') {
      const completedQuestions = questions.filter(
        (q) => feedbackByQuestionId[q.id]
      );
      if (completedQuestions.length === 0) return undefined;
      const totalMarks = completedQuestions.reduce(
        (sum, q) => sum + q.maxMarks,
        0
      );
      if (totalMarks === 0) return undefined;
      const achievedMarks = completedQuestions.reduce(
        (sum, q) => sum + (feedbackByQuestionId[q.id]?.achievedMarks ?? 0),
        0
      );
      return (achievedMarks / totalMarks) * 100;
    }

    const answeredQuestions = mcQuestions.filter(
      (q) => mcAnswersByQuestionId[q.id]
    );
    if (answeredQuestions.length === 0) return undefined;
    const achievedMarks = answeredQuestions.reduce(
      (sum, q) =>
        sum +
        getMcAwardedMarks(
          q.id,
          mcAnswersByQuestionId[q.id] ?? '',
          q.correctAnswer
        ),
      0
    );
    return (achievedMarks / answeredQuestions.length) * 100;
  }, [
    questionMode,
    questions,
    feedbackByQuestionId,
    mcQuestions,
    mcAnswersByQuestionId,
    getMcAwardedMarks,
  ]);

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
    return model;
  })();

  const showSetup =
    questionMode === 'written'
      ? questions.length === 0
      : mcQuestions.length === 0;

  const canGenerate =
    selectedTopics.length > 0 &&
    apiKey.trim().length > 0 &&
    model.trim().length > 0 &&
    questionCount >= 1 &&
    questionCount <= 20 &&
    !isGenerating;

  const canSubmitAnswer =
    Boolean(activeQuestion) &&
    (activeQuestionAnswer.trim().length > 0 || Boolean(activeQuestionImage)) &&
    apiKey.trim().length > 0 &&
    markModel.trim().length > 0 &&
    !isMarking &&
    !activeFeedback;

  const completedCount = useMemo(() => {
    return questions.filter((q: { id: string }) => feedbackByQuestionId[q.id])
      .length;
  }, [feedbackByQuestionId, questions]);
  const mcCompletedCount = useMemo(
    () => mcQuestions.filter((q) => mcAnswersByQuestionId[q.id]).length,
    [mcAnswersByQuestionId, mcQuestions]
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

  const autoSavedCompletionKeyRef = useRef<string | null>(null);

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
  }, [isMcSetComplete, mcAnswersByQuestionId, mcQuestions, getMcAwardedMarks]);

  const completionAccuracyPercent =
    questionMode === 'written' ? writtenAccuracyPercent : mcAccuracyPercent;

  // ── Session-scoped result rows (passed to CompletionScreen) ─────────────────
  // Built directly from current session state, not from global history.
  // This ensures accuracy in all modes including exam mode where history isn't populated.
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

  // Active timer hook based on current question mode
  const activeTimer = questionMode === 'written' ? writtenTimer : mcTimer;

  // Use formattedSessionTime from the timer hook
  const formattedSessionTime = activeTimer.formattedSessionTime;

  // Compute formatted elapsed time: use generationStartedAt during generation,
  // fall back to the question timer once the session is active.
  const [generationElapsedMs, setGenerationElapsedMs] = useState(0);

  useEffect(() => {
    if (!generationStartedAt || !isGenerating) {
      setGenerationElapsedMs(0);
      return;
    }

    const tick = () => setGenerationElapsedMs(Date.now() - generationStartedAt);
    tick();

    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [generationStartedAt, isGenerating]);

  const generationFormattedElapsedTime =
    generationStartedAt && isGenerating
      ? formatDurationMs(generationElapsedMs)
      : '';

  // If we're generating, show generation elapsed time; otherwise use session timer
  const formattedElapsedTime =
    isGenerating && generationStartedAt
      ? generationFormattedElapsedTime
      : formattedSessionTime;
  const completionFormattedElapsedTime = formattedSessionTime;
  // ── Effects ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    setShowCompletionScreen(false);
    setHasShownCompletionScreen(false);
  }, [completionSetKey]);

  useEffect(() => {
    if (showCompletionScreen) setHasShownCompletionScreen(true);
  }, [showCompletionScreen]);

  useEffect(() => {
    if (!isSetComplete) return;
    const key = `${questionMode}:${completionSetKey}`;
    if (!completionSetKey || autoSavedCompletionKeyRef.current === key) return;
    autoSavedCompletionKeyRef.current = key;
    saveCurrentSet();
  }, [isSetComplete, questionMode, completionSetKey, saveCurrentSet]);

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
            : { ...prev, [questionId]: Date.now() }
        );
      }
    },
    [activeQuestion, setAnswersByQuestionId, setWrittenResponseEnteredAtById]
  );

  const handleWrittenImageDrop = useCallback(
    (files: File[]) => {
      if (!activeQuestion) return;
      const file = files[0];
      if (!file) return;
      const questionId = activeQuestion.id;
      void fileToDataUrl(file)
        .then((dataUrl) => {
          setImagesByQuestionId((prev) => ({
            ...prev,
            [questionId]: {
              name: file.name,
              dataUrl,
            },
          }));
          setWrittenResponseEnteredAtById((prev) =>
            prev[questionId] !== undefined
              ? prev
              : { ...prev, [questionId]: Date.now() }
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
    ]
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
    [activeQuestion, setMarkAppealByQuestionId]
  );

  const handleOverrideInputChange = useCallback(
    (value: string) => {
      if (!activeQuestion) return;
      setMarkOverrideInputByQuestionId((prev) => ({
        ...prev,
        [activeQuestion.id]: value,
      }));
    },
    [activeQuestion, setMarkOverrideInputByQuestionId]
  );

  const handleMcAppealChange = useCallback(
    (value: string) => {
      if (!activeMcQuestion) return;
      setMcMarkAppealByQuestionId((prev) => ({
        ...prev,
        [activeMcQuestion.id]: value,
      }));
    },
    [activeMcQuestion, setMcMarkAppealByQuestionId]
  );

  const handleMcOverrideInputChange = useCallback(
    (value: string) => {
      if (!activeMcQuestion) return;
      setMcMarkOverrideInputByQuestionId((prev) => ({
        ...prev,
        [activeMcQuestion.id]: value,
      }));
    },
    [activeMcQuestion, setMcMarkOverrideInputByQuestionId]
  );

  // ── Timer actions ─────────────────────────────────────────────────────────────
  function startStopwatch() {
    if (questionMode === 'written') writtenTimer.reset();
    else if (questionMode === 'multiple-choice') mcTimer.reset();
  }

  // Start timer only after questions or mcQuestions are populated
  // The hook handles resumption from Zustand internally — this just starts new sessions
  useEffect(() => {
    if (questionMode === 'written' && questions.length > 0) {
      writtenTimer.startTiming(questions);
    } else if (questionMode === 'multiple-choice' && mcQuestions.length > 0) {
      mcTimer.startTiming(mcQuestions);
    }
  }, [questionMode, questions, mcQuestions, writtenTimer, mcTimer]);

  // Pause timers while marking
  useEffect(() => {
    if (questionMode === 'written') {
      writtenTimer.setPaused(isMarking);
    } else if (questionMode === 'multiple-choice') {
      mcTimer.setPaused(isMarking);
    }
  }, [isMarking, questionMode, writtenTimer, mcTimer]);

  const resetStopwatch = useCallback(() => {
    setGenerationStartedAt(null);
    if (questionMode === 'written') writtenTimer.reset();
    else if (questionMode === 'multiple-choice') mcTimer.reset();
  }, [questionMode, writtenTimer, mcTimer, setGenerationStartedAt]);

  function togglePause() {
    if (questionMode === 'written') writtenTimer.togglePause();
    else if (questionMode === 'multiple-choice') mcTimer.togglePause();
  }

  // ── Stream token listener ────────────────────────────────────────────────────
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    listen<GenerationTokenEvent>('generation-token', (event) => {
      setStreamText((prev) => prev + event.payload.text);
    })
      .then((fn) => {
        if (cancelled) {
          fn(); // Promise resolved after cleanup — immediately unlisten
        } else {
          unlisten = fn;
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // ── SSE status listener — forwards stage updates into batchProgress ──────────
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    listen<GenerationStatusEvent>('generation-status', (event) => {
      setGenerationStatus(event.payload);
      setBatchProgress((prev) => {
        const activeIdx = prev.findIndex((e) => e.status === 'active');
        if (activeIdx === -1) return prev;
        const next = [...prev];
        next[activeIdx] = {
          ...next[activeIdx],
          stage: event.payload.stage,
          message: event.payload.message,
        };
        return next;
      });
    })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [setGenerationStatus]);

  // ── Navigation ───────────────────────────────────────────────────────────────
  const handleNextWrittenQuestion = useCallback(() => {
    if (!canAdvanceWritten) return;
    if (isAtLastWrittenQuestion) {
      writtenTimer.finishSession();
      setShowCompletionScreen(true);
      return;
    }
    setActiveQuestionIndex(
      Math.min(questions.length - 1, activeQuestionIndex + 1)
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
      mcTimer.finishSession();
      setShowCompletionScreen(true);
      return;
    }
    setActiveMcQuestionIndex(
      Math.min(mcQuestions.length - 1, activeMcQuestionIndex + 1)
    );
  }, [
    canAdvanceMc,
    isAtLastMcQuestion,
    mcQuestions.length,
    activeMcQuestionIndex,
    setActiveMcQuestionIndex,
    mcTimer,
  ]);

  const isInSession = !showSetup && !showCompletionScreen;
  function dismissKeyboardHint() {
    setShowKeyboardHint(false);
    try {
      localStorage.setItem('keyboard-hint-dismissed', '1');
    } catch {
      /* noop */
    }
  }
  const startOverRef = useRef<() => void>(() => {});
  const submitRef = useRef<() => void | Promise<void>>(() => {});
  useEffect(() => {
    if (!isInSession) return;
    // eslint-disable-next-line complexity
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable = (e.target as HTMLElement)?.isContentEditable;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || isEditable) return;

      // Ctrl/Cmd+Enter → submit answer
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (questionMode === 'written' && canSubmitAnswer && !isMarking) {
          void submitRef.current();
        }
        return;
      }

      // Right arrow / N → next question
      if (e.key === 'ArrowRight' || e.key === 'n') {
        e.preventDefault();
        if (questionMode === 'written') {
          handleNextWrittenQuestion();
        } else {
          handleNextMcQuestion();
        }
        return;
      }

      // Left arrow / P → previous question
      if (e.key === 'ArrowLeft' || e.key === 'p') {
        e.preventDefault();
        if (questionMode === 'written') {
          setActiveQuestionIndex(Math.max(0, activeQuestionIndex - 1));
        } else {
          setActiveMcQuestionIndex(Math.max(0, activeMcQuestionIndex - 1));
        }
        return;
      }

      // Esc → exit session (with confirmation)
      if (e.key === 'Escape') {
        e.preventDefault();
        startOverRef.current();
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
  ]);

  // ── Cancel question ──────────────────────────────────────────────────────────
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
      setMarkAppealByQuestionId((p) => removeKey(p, id));
      setMarkOverrideInputByQuestionId((p) => removeKey(p, id));
      setWrittenResponseEnteredAtById((p) => removeKey(p, id));
      // Remove from history if it was already answered
      deleteQuestionHistoryEntry(id);
      // Subtract question time from session timer
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
      setMcMarkAppealByQuestionId((p) => removeKey(p, id));
      setMcMarkOverrideInputByQuestionId((p) => removeKey(p, id));
      setMcAwardedMarksByQuestionId((p) => removeKey(p, id));
      setMcImagesByQuestionId((p) => removeKey(p, id));
      // Remove from history if it was already answered
      deleteMcHistoryEntry(id);
      // Subtract question time from session timer
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
    setActiveQuestionIndex,
    setWrittenQuestionPresentedAtById,
    setAnswersByQuestionId,
    setImagesByQuestionId,
    setFeedbackByQuestionId,
    setMarkAppealByQuestionId,
    setMarkOverrideInputByQuestionId,
    setWrittenResponseEnteredAtById,
    addQuestionHistoryEntry,
    updateQuestionHistoryEntry,
    deleteQuestionHistoryEntry,
    writtenTimer,
    setMcQuestions,
    setActiveMcSavedSetId,
    setActiveMcQuestionIndex,
    setMcQuestionPresentedAtById,
    setMcAnswersByQuestionId,
    setMcMarkAppealByQuestionId,
    setMcMarkOverrideInputByQuestionId,
    setMcAwardedMarksByQuestionId,
    addMcHistoryEntry,
    updateMcHistoryEntry,
    deleteMcHistoryEntry,
    mcTimer,
    setErrorMessage,
  ]);

  // ── Topic / subtopic toggles ─────────────────────────────────────────────────
  const toggleTopic = useCallback(
    (topic: Topic) => {
      setSelectedTopics((p) =>
        p.includes(topic) ? p.filter((t) => t !== topic) : [...p, topic]
      );
    },
    [setSelectedTopics]
  );

  const toggleMathMethodsSubtopic = useCallback(
    (sub: MathMethodsSubtopic) => {
      setMathMethodsSubtopics((p) =>
        p.includes(sub) ? p.filter((s) => s !== sub) : [...p, sub]
      );
    },
    [setMathMethodsSubtopics]
  );

  const toggleSpecialistMathSubtopic = useCallback(
    (sub: SpecialistMathSubtopic) => {
      setSpecialistMathSubtopics((p) =>
        p.includes(sub) ? p.filter((s) => s !== sub) : [...p, sub]
      );
    },
    [setSpecialistMathSubtopics]
  );

  const toggleChemistrySubtopic = useCallback(
    (sub: ChemistrySubtopic) => {
      setChemistrySubtopics((p) =>
        p.includes(sub) ? p.filter((s) => s !== sub) : [...p, sub]
      );
    },
    [setChemistrySubtopics]
  );

  const togglePhysicalEducationSubtopic = useCallback(
    (sub: PhysicalEducationSubtopic) => {
      setPhysicalEducationSubtopics((p) =>
        p.includes(sub) ? p.filter((s) => s !== sub) : [...p, sub]
      );
    },
    [setPhysicalEducationSubtopics]
  );

  // ── Subtopic / focus helpers ─────────────────────────────────────────────────
  function getSubtopicsForTopic(topic: Topic): string[] {
    switch (topic) {
      case 'Mathematical Methods':
        return mathMethodsSubtopics;
      case 'Specialist Mathematics':
        return specialistMathSubtopics;
      case 'Chemistry':
        return chemistrySubtopics;
      case 'Physical Education':
        return physicalEducationSubtopics;
      default:
        return [];
    }
  }

  function getCustomFocusArea() {
    const v = customFocusArea.trim();
    return v.length > 0 ? v : undefined;
  }

  // ── History helpers ──────────────────────────────────────────────────────────
  function getWrittenAttemptSequence(qId: string) {
    return questionHistory.filter((e) => e.question.id === qId).length + 1;
  }
  function getMcAttemptSequence(qId: string) {
    return mcHistory.filter((e) => e.question.id === qId).length + 1;
  }

  function getRecentSameTopicQuestionPrompts(
    mode: 'written' | 'multiple-choice'
  ) {
    const topicSet = new Set(selectedTopics);
    const seen = new Set<string>();
    const prompts: string[] = [];
    for (const entry of mode === 'written' ? questionHistory : mcHistory) {
      if (!topicSet.has(entry.question.topic as Topic)) continue;
      const p = entry.question.promptMarkdown.trim();
      if (!p || seen.has(p)) continue;
      seen.add(p);
      prompts.push(p);
      if (prompts.length >= 6) break;
    }
    return prompts;
  }

  function appendMcHistoryEntry(
    question: typeof activeMcQuestion,
    selectedAnswer: string,
    awardedMarks: number,
    attemptKind: McAttemptKind,
    responseEnteredAtMs?: number
  ) {
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
      difficulty,
      analytics: {
        attemptKind,
        attemptSequence: getMcAttemptSequence(question.id),
        answerCharacterCount: 0,
        answerWordCount: 0,
        usedImageUpload: false,
        responseLatencyMs: timing ? timing.timeUsedSeconds * 1000 : undefined,
        finalAnswerChangedAtMs: responseAt,
      },
    };
    addMcHistoryEntry(entry);
  }

  function updateLatestMcHistoryEntry(
    questionId: string,
    selectedAnswer: string,
    awardedMarks: number,
    responseEnteredAtMs?: number
  ) {
    const now = Date.now();
    const responseAt = responseEnteredAtMs ?? now;
    const entry = mcHistory.find(
      (e: McHistoryEntry) =>
        e.question.id === questionId &&
        (e.analytics?.attemptKind ?? 'initial') === 'initial'
    );
    if (!entry) return;
    const updatedEntry = {
      ...entry,
      selectedAnswer,
      correct: awardedMarks >= 1,
      awardedMarks,
      lastModified: now,
      analytics: {
        attemptSequence: entry.analytics?.attemptSequence ?? 0,
        answerCharacterCount: entry.analytics?.answerCharacterCount ?? 0,
        answerWordCount: entry.analytics?.answerWordCount ?? 0,
        usedImageUpload: entry.analytics?.usedImageUpload ?? false,
        attemptKind: entry.analytics?.attemptKind,
        responseLatencyMs: entry.analytics?.responseLatencyMs,
        finalAnswerChangedAtMs: responseAt,
      },
    };
    updateMcHistoryEntry(updatedEntry);
  }

  function updateLatestMcHistoryEntryMark(
    questionId: string,
    awardedMarks: number
  ) {
    const now = Date.now();
    const entry = mcHistory.find((e: McHistoryEntry) => e.question.id === questionId);
    if (!entry) return;
    const updatedEntry = {
      ...entry,
      correct: awardedMarks >= 1,
      awardedMarks,
      lastModified: now,
    };
    updateMcHistoryEntry(updatedEntry);
  }

  function updateLatestWrittenHistoryEntry(
    questionId: string,
    response: ReturnType<typeof normalizeMarkResponse>
  ) {
    const now = Date.now();
    const entry = questionHistory.find(
      (e: QuestionHistoryEntry) => e.question.id === questionId
    );
    if (!entry) return;
    const updatedEntry = {
      ...entry,
      markResponse: response,
      workedSolutionMarkdown: response.workedSolutionMarkdown,
      lastModified: now,
      analytics: {
        attemptSequence: entry.analytics?.attemptSequence ?? 0,
        attemptKind: entry.analytics?.attemptKind ?? 'initial',
        answerCharacterCount: entry.analytics?.answerCharacterCount ?? 0,
        answerWordCount: entry.analytics?.answerWordCount ?? 0,
        usedImageUpload: entry.analytics?.usedImageUpload ?? false,
        responseLatencyMs: entry.analytics?.responseLatencyMs,
        markingLatencyMs: entry.analytics?.markingLatencyMs,
      },
    };
    updateQuestionHistoryEntry(updatedEntry);
  }

  function appendWrittenHistoryEntry(
    question: typeof activeQuestion,
    response: ReturnType<typeof normalizeMarkResponse>,
    options?: {
      uploadedAnswerOverride?: string;
      attemptKind?: WrittenAttemptKind;
      markingLatencyMs?: number;
      responseEnteredAtMs?: number;
    }
  ) {
    if (!question) return;
    const uploadedAnswer =
      options?.uploadedAnswerOverride ?? answersByQuestionId[question.id] ?? '';
    const timing = writtenTimer.getQuestionTiming(question.id);
    const now = Date.now();
    const entry: QuestionHistoryEntry = {
      id: generateEntryId(),
      createdAt: new Date(now).toISOString(),
      lastModified: now,
      question,
      uploadedAnswer,
      uploadedAnswerImage: imagesByQuestionId[question.id],
      workedSolutionMarkdown: response.workedSolutionMarkdown,
      markResponse: response,
      generationTelemetry: writtenGenerationTelemetry ?? undefined,
      difficulty,
      analytics: {
        attemptKind: options?.attemptKind ?? 'initial',
        attemptSequence: getWrittenAttemptSequence(question.id),
        answerCharacterCount: uploadedAnswer.length,
        answerWordCount: countWords(uploadedAnswer),
        usedImageUpload: Boolean(imagesByQuestionId[question.id]),
        responseLatencyMs: timing ? timing.timeUsedSeconds * 1000 : undefined,
        markingLatencyMs: options?.markingLatencyMs,
      },
    };
    addQuestionHistoryEntry(entry);
  }

  // ── Batch progress helpers ───────────────────────────────────────────────────

  function initBatchProgress(
    topics: Topic[],
    counts: number[]
  ): BatchTopicProgress[] {
    return topics.map((topic, i) => ({
      topic,
      questionCount: counts[i],
      status: 'waiting' as const,
      stage: undefined,
      message: undefined,
      errorMessage: undefined,
    }));
  }

  function setBatchEntryActive(idx: number, topic: Topic) {
    const topicSubtopics = getSubtopicsForTopic(topic);
    const hasFocus = topicSubtopics.length > 0;
    setBatchProgress((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        status: 'active',
        stage: 'allocating_subtopics',
        message: hasFocus
          ? 'Picking focus subtopics locally (seeded)…'
          : 'Planning question mix locally…',
        errorMessage: undefined,
      };
      return next;
    });
    // Clear stream text at the start of each new topic call
    setStreamText('');
  }

  function setBatchEntryDone(idx: number) {
    setBatchProgress((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], status: 'done', stage: 'completed' };
      return next;
    });
  }

  function setBatchEntryError(idx: number, message: string) {
    setBatchProgress((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], status: 'error', errorMessage: message };
      return next;
    });
  }

  // ── Generation ───────────────────────────────────────────────────────────────
  // eslint-disable-next-line complexity
  async function handleGenerateQuestions() {
    if (!canGenerate) return;
    startStopwatch();
    setErrorMessage(null);
    setLastFailedAction(null);
    setStreamText('');
    setGenerationSubCallProgress(null);
    const generationSeed =
      ((Date.now() & 0x7fffffff) ^ Math.floor(Math.random() * 0x7fffffff)) >>>
      0;
    const counts = distributeQuestions(selectedTopics, questionCount);
    const firstActiveIdx = selectedTopics.findIndex((_, j) => counts[j] > 0);
    const firstAllocTopic =
      firstActiveIdx >= 0 ? selectedTopics[firstActiveIdx] : selectedTopics[0];
    const firstHasFocus =
      firstAllocTopic && getSubtopicsForTopic(firstAllocTopic).length > 0;
    setGenerationStatus({
      mode: 'written',
      stage: 'allocating_subtopics',
      message: firstHasFocus
        ? 'Picking focus subtopics locally (seeded)…'
        : 'Planning question mix locally…',
      attempt: 1,
    });
    setIsGenerating(true);
    setGenerationStartedAt(Date.now());
    // Only show batch UI when more than one topic is selected
    const isMultiTopic = selectedTopics.length > 1;
    if (isMultiTopic) {
      setBatchProgress(initBatchProgress(selectedTopics, counts));
    } else {
      setBatchProgress([]);
    }

    try {
      let allQuestions: GeneratedQuestion[] = [];
      const totalTelemetry = {
        durationMs: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        distinctnessAvg: 0,
        multiStepDepthAvg: 0,
        qualityDiagnostics: undefined as
          | GenerationTelemetry['qualityDiagnostics']
          | undefined,
      };
      let distinctnessWeight = 0;
      let multiStepDepthWeight = 0;
      const failedTopics: string[] = [];

      for (let i = 0; i < selectedTopics.length; i++) {
        const topic = selectedTopics[i];
        const count = counts[i];
        if (count === 0) {
          if (isMultiTopic) setBatchEntryDone(i);
          continue;
        }

        if (isMultiTopic) setBatchEntryActive(i, topic);

        try {
          // If subtopics are present, build per-subtopic calls so the client
          // decides which subtopics to use (reducing LLM-side randomness).
          // Uses seeded randomization based on topic for reproducibility.
          const topicSubtopics = getSubtopicsForTopic(topic);
          const subCalls = buildSubtopicCalls(topicSubtopics, count, [topic], {
            seed: generationSeed + i * 1009,
            combineForSmallBatches: true,
            minSubtopicsPerQuestion: 2,
            maxSubtopicsPerQuestion: 3,
          });
          if (!isMultiTopic) {
            const hasFocus = topicSubtopics.length > 0;
            setGenerationStatus({
              mode: 'written',
              stage: 'allocating_subtopics',
              message: hasFocus
                ? 'Picking focus subtopics locally (seeded)…'
                : 'Planning question mix locally…',
              attempt: 1,
            });
          }
          for (let si = 0; si < subCalls.length; si++) {
            const call = subCalls[si];
            if (call.count === 0) continue;
            if (subCalls.length > 1) {
              setGenerationSubCallProgress({
                current: si + 1,
                total: subCalls.length,
              });
            }
            const response = await invoke<GenerateQuestionsResponse>(
              'generate_questions',
              {
                request: {
                  topics: [topic],
                  difficulty,
                  questionCount: call.count,
                  averageMarksPerQuestion,
                  model,
                  apiKey,
                  techMode,
                  includeExamContext,
                  subtopics: call.subtopics,
                  customFocusArea: getCustomFocusArea(),
                  avoidSimilarQuestions,
                  strictLatexValidation,
                  strictSubtopicCoverage,
                  minSubtopicCoverageRatio,
                  diversityStrictness,
                  priorQuestionPrompts: avoidSimilarQuestions
                    ? getRecentSameTopicQuestionPrompts('written')
                    : [],
                  aiDifficultyScalingEnabled,
                  recentAverageScore,
                  recentDifficulty: difficulty,
                },
              }
            );

            allQuestions = allQuestions.concat(response.questions);
            totalTelemetry.durationMs += response.durationMs || 0;
            totalTelemetry.promptTokens += response.promptTokens || 0;
            totalTelemetry.completionTokens += response.completionTokens || 0;
            totalTelemetry.totalTokens += response.totalTokens || 0;
            totalTelemetry.estimatedCostUsd += response.estimatedCostUsd || 0;
            totalTelemetry.distinctnessAvg +=
              (response.distinctnessAvg || 0) * response.questions.length;
            totalTelemetry.multiStepDepthAvg +=
              (response.multiStepDepthAvg || 0) * response.questions.length;
            if (response.qualityDiagnostics) {
              totalTelemetry.qualityDiagnostics = response.qualityDiagnostics;
            }
            distinctnessWeight += response.questions.length;
            multiStepDepthWeight += response.questions.length;

            // Record this generation for cost estimation
            addGenerationRecord({
              id: `gen-${topic}-${Date.now()}-${Math.random()
                .toString(36)
                .substr(2, 9)}`,
              timestamp: new Date().toISOString(),
              inputs: {
                topic,
                difficulty,
                questionCount: call.count,
                questionMode: 'written',
                techMode,
                averageMarksPerQuestion,
                subtopics: call.subtopics,
                customFocusArea: getCustomFocusArea(),
              },
              outputs: {
                durationMs: response.durationMs || 0,
                promptTokens: response.promptTokens,
                completionTokens: response.completionTokens,
                totalTokens: response.totalTokens,
                estimatedCostUsd: response.estimatedCostUsd,
                distinctnessAvg: response.distinctnessAvg,
                multiStepDepthAvg: response.multiStepDepthAvg,
              },
            });
          }
          setGenerationSubCallProgress(null);

          if (isMultiTopic) setBatchEntryDone(i);
        } catch (topicError) {
          failedTopics.push(topic);
          setGenerationSubCallProgress(null);
          if (isMultiTopic) {
            setBatchEntryError(i, readBackendError(topicError));
          } else {
            throw topicError;
          }
          setErrorMessage(
            `Failed to generate questions for ${topic}: ${readBackendError(topicError)}`
          );
        }
      }

      if (allQuestions.length === 0) {
        throw new Error('No questions were generated. Please try again.');
      }

      if (allQuestions.length > 0) {
        totalTelemetry.distinctnessAvg =
          distinctnessWeight > 0
            ? totalTelemetry.distinctnessAvg / distinctnessWeight
            : 0;
        totalTelemetry.multiStepDepthAvg =
          multiStepDepthWeight > 0
            ? totalTelemetry.multiStepDepthAvg / multiStepDepthWeight
            : 0;
      }

      if (failedTopics.length > 0) {
        setErrorMessage(
          `Failed to generate questions for: ${failedTopics.join(', ')}. Other subjects loaded successfully.`
        );
      }

      // Re-assign sequential IDs across the merged batch so that per-question
      // state maps (answers, feedback, images) never collide between topics.
      const rekeyedQuestions = rekeyWritten(allQuestions);

      let finalQuestions = rekeyedQuestions;
      if (shuffleQuestions) {
        finalQuestions = [...rekeyedQuestions];
        for (let i = finalQuestions.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [finalQuestions[i], finalQuestions[j]] = [
            finalQuestions[j],
            finalQuestions[i],
          ];
        }
      }

      // Apply client-side batch quality checks: deduplication and variance validation
      const { cleanedQuestions, issuesFound } =
        applyBatchQualityChecks(finalQuestions);
      if (issuesFound.length > 0) {
        console.info('Quality checks completed:', issuesFound);
      }

      setQuestions(cleanedQuestions);
      setWrittenTimerState(null);
      setWrittenRawModelOutput('');
      setWrittenGenerationTelemetry(totalTelemetry);
      setLastSessionTelemetry(totalTelemetry);
      setActiveQuestionIndex(0);
      setActiveWrittenSavedSetId(null);
      setWrittenQuestionPresentedAtById({});
      setWrittenResponseEnteredAtById({});
      setAnswersByQuestionId({});
      setImagesByQuestionId({});
      setFeedbackByQuestionId({});
      toast.success(`${cleanedQuestions.length} questions generated`);
    } catch (error) {
      resetStopwatch();
      setGenerationStatus({
        mode: 'written',
        stage: 'failed',
        message: 'Generation failed.',
        attempt: generationStatus?.attempt ?? 1,
      });
      setErrorMessage(readBackendError(error));
      setLastFailedAction('generate-written');
    } finally {
      setGenerationSubCallProgress(null);
      setIsGenerating(false);
    }
  }

  // eslint-disable-next-line complexity
  async function handleGenerateMcQuestions() {
    if (!canGenerate) return;
    startStopwatch();
    setErrorMessage(null);
    setLastFailedAction(null);
    setStreamText('');
    setGenerationSubCallProgress(null);
    const generationSeed =
      ((Date.now() & 0x7fffffff) ^ Math.floor(Math.random() * 0x7fffffff)) >>>
      0;
    const counts = distributeQuestions(selectedTopics, questionCount);
    const firstActiveIdxMc = selectedTopics.findIndex((_, j) => counts[j] > 0);
    const firstAllocTopicMc =
      firstActiveIdxMc >= 0
        ? selectedTopics[firstActiveIdxMc]
        : selectedTopics[0];
    const firstHasFocusMc =
      firstAllocTopicMc && getSubtopicsForTopic(firstAllocTopicMc).length > 0;
    setGenerationStatus({
      mode: 'multiple-choice',
      stage: 'allocating_subtopics',
      message: firstHasFocusMc
        ? 'Picking focus subtopics locally (seeded)…'
        : 'Planning question mix locally…',
      attempt: 1,
    });
    setIsGenerating(true);
    setGenerationStartedAt(Date.now());

    const isMultiTopic = selectedTopics.length > 1;
    if (isMultiTopic) {
      setBatchProgress(initBatchProgress(selectedTopics, counts));
    } else {
      setBatchProgress([]);
    }

    try {
      let allQuestions: McQuestion[] = [];
      const totalTelemetry = {
        durationMs: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        distinctnessAvg: 0,
        multiStepDepthAvg: 0,
        qualityDiagnostics: undefined as
          | GenerationTelemetry['qualityDiagnostics']
          | undefined,
      };
      let distinctnessWeight = 0;
      let multiStepDepthWeight = 0;
      const failedTopics: string[] = [];

      for (let i = 0; i < selectedTopics.length; i++) {
        const topic = selectedTopics[i];
        const count = counts[i];
        if (count === 0) {
          if (isMultiTopic) setBatchEntryDone(i);
          continue;
        }

        if (isMultiTopic) setBatchEntryActive(i, topic);

        try {
          // Build per-subtopic calls so the client picks which subtopics to
          // generate from. Also shuffle MC options client-side after LLM
          // returns to avoid predictable answer positions.
          // Uses seeded randomization based on topic for reproducibility.
          const topicSubtopics = getSubtopicsForTopic(topic);
          const subCalls = buildSubtopicCalls(topicSubtopics, count, [topic], {
            seed: generationSeed + i * 1009,
            combineForSmallBatches: true,
            minSubtopicsPerQuestion: 2,
            maxSubtopicsPerQuestion: 3,
          });
          if (!isMultiTopic) {
            const hasFocus = topicSubtopics.length > 0;
            setGenerationStatus({
              mode: 'multiple-choice',
              stage: 'allocating_subtopics',
              message: hasFocus
                ? 'Picking focus subtopics locally (seeded)…'
                : 'Planning question mix locally…',
              attempt: 1,
            });
          }
          for (let si = 0; si < subCalls.length; si++) {
            const call = subCalls[si];
            if (call.count === 0) continue;
            if (subCalls.length > 1) {
              setGenerationSubCallProgress({
                current: si + 1,
                total: subCalls.length,
              });
            }
            const response = await invoke<GenerateMcQuestionsResponse>(
              'generate_mc_questions',
              {
                request: {
                  topics: [topic],
                  difficulty,
                  questionCount: call.count,
                  model,
                  apiKey,
                  techMode,
                  includeExamContext,
                  subtopics: call.subtopics,
                  customFocusArea: getCustomFocusArea(),
                  avoidSimilarQuestions,
                  strictLatexValidation,
                  strictSubtopicCoverage,
                  minSubtopicCoverageRatio,
                  diversityStrictness,
                  priorQuestionPrompts: avoidSimilarQuestions
                    ? getRecentSameTopicQuestionPrompts('multiple-choice')
                    : [],
                  aiDifficultyScalingEnabled,
                  recentAverageScore,
                  recentDifficulty: difficulty,
                },
              }
            );

            // Shuffle options for each returned MC question and relabel
            const adjusted = (response.questions || []).map((q) =>
              shuffleMcQuestionOptions(q)
            );

            allQuestions = allQuestions.concat(adjusted);
            totalTelemetry.durationMs += response.durationMs || 0;
            totalTelemetry.promptTokens += response.promptTokens || 0;
            totalTelemetry.completionTokens += response.completionTokens || 0;
            totalTelemetry.totalTokens += response.totalTokens || 0;
            totalTelemetry.estimatedCostUsd += response.estimatedCostUsd || 0;
            totalTelemetry.distinctnessAvg +=
              (response.distinctnessAvg || 0) * response.questions.length;
            totalTelemetry.multiStepDepthAvg +=
              (response.multiStepDepthAvg || 0) * response.questions.length;
            if (response.qualityDiagnostics) {
              totalTelemetry.qualityDiagnostics = response.qualityDiagnostics;
            }
            distinctnessWeight += response.questions.length;
            multiStepDepthWeight += response.questions.length;

            // Record this generation for cost estimation
            addGenerationRecord({
              id: `gen-${topic}-${Date.now()}-${Math.random()
                .toString(36)
                .substr(2, 9)}`,
              timestamp: new Date().toISOString(),
              inputs: {
                topic,
                difficulty,
                questionCount: call.count,
                questionMode: 'multiple-choice',
                techMode,
                averageMarksPerQuestion,
                subtopics: call.subtopics,
              },
              outputs: {
                durationMs: response.durationMs || 0,
                promptTokens: response.promptTokens,
                completionTokens: response.completionTokens,
                totalTokens: response.totalTokens,
                estimatedCostUsd: response.estimatedCostUsd,
                distinctnessAvg: response.distinctnessAvg,
                multiStepDepthAvg: response.multiStepDepthAvg,
              },
            });
          }
          setGenerationSubCallProgress(null);

          if (isMultiTopic) setBatchEntryDone(i);
        } catch (topicError) {
          failedTopics.push(topic);
          setGenerationSubCallProgress(null);
          if (isMultiTopic) {
            setBatchEntryError(i, readBackendError(topicError));
          } else {
            throw topicError;
          }
          setErrorMessage(
            `Failed to generate questions for ${topic}: ${readBackendError(topicError)}`
          );
        }
      }

      if (allQuestions.length === 0) {
        throw new Error('No questions were generated. Please try again.');
      }

      if (allQuestions.length > 0) {
        totalTelemetry.distinctnessAvg =
          distinctnessWeight > 0
            ? totalTelemetry.distinctnessAvg / distinctnessWeight
            : 0;
        totalTelemetry.multiStepDepthAvg =
          multiStepDepthWeight > 0
            ? totalTelemetry.multiStepDepthAvg / multiStepDepthWeight
            : 0;
      }

      if (failedTopics.length > 0) {
        setErrorMessage(
          `Failed to generate questions for: ${failedTopics.join(', ')}. Other subjects loaded successfully.`
        );
      }

      // Re-assign sequential IDs across the merged batch
      const rekeyedQuestions = rekeyMc(allQuestions);

      let finalQuestions = rekeyedQuestions;
      if (shuffleQuestions) {
        finalQuestions = [...rekeyedQuestions];
        for (let i = finalQuestions.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [finalQuestions[i], finalQuestions[j]] = [
            finalQuestions[j],
            finalQuestions[i],
          ];
        }
      }

      // Apply client-side preprocessing: validation and option shuffling
      const preprocessedQuestions = preprocessMcQuestions(finalQuestions);

      setMcQuestions(preprocessedQuestions);
      setMcTimerState(null);
      setMcRawModelOutput('');
      setMcGenerationTelemetry(totalTelemetry);
      setLastSessionTelemetry(totalTelemetry);
      setActiveMcQuestionIndex(0);
      setActiveMcSavedSetId(null);
      setMcQuestionPresentedAtById({});
      setMcAnswersByQuestionId({});
      setMcMarkAppealByQuestionId({});
      setMcMarkOverrideInputByQuestionId({});
      setMcAwardedMarksByQuestionId({});
      toast.success(`${preprocessedQuestions.length} MC questions generated`);
    } catch (error) {
      resetStopwatch();
      setGenerationStatus({
        mode: 'multiple-choice',
        stage: 'failed',
        message: 'Generation failed.',
        attempt: generationStatus?.attempt ?? 1,
      });
      setErrorMessage(readBackendError(error));
      setLastFailedAction('generate-mc');
    } finally {
      setGenerationSubCallProgress(null);
      setIsGenerating(false);
    }
  }

  // ── Marking ──────────────────────────────────────────────────────────────────
  async function handleSubmitForMarking(payload?: {
    image?: StudentAnswerImage;
  }) {
    if (!activeQuestion) return;
    const effectiveImage = payload?.image ?? activeQuestionImage;
    const hasAnswerContent =
      activeQuestionAnswer.trim().length > 0 || Boolean(effectiveImage);
    const canSubmitNow =
      hasAnswerContent &&
      apiKey.trim().length > 0 &&
      markModel.trim().length > 0 &&
      !isMarking &&
      !activeFeedback;
    if (!canSubmitNow) return;
    setErrorMessage(null);
    setIsMarking(true);
    setLastFailedAction(null);
    try {
      if (payload?.image) {
        setImagesByQuestionId((prev) => ({
          ...prev,
          [activeQuestion.id]: payload.image as StudentAnswerImage,
        }));
      }
      const responseEnteredAtMs =
        writtenResponseEnteredAtById[activeQuestion.id] ?? Date.now();
      const markStartedAt = Date.now();
      const rawResponse = await invoke<unknown>('mark_answer', {
        request: {
          question: activeQuestion,
          studentAnswer: activeQuestionAnswer,
          studentAnswerImageDataUrl: effectiveImage?.dataUrl,
          model: markModel,
          apiKey,
        },
      });
      const markingLatencyMs = Date.now() - markStartedAt;
      const response = normalizeMarkResponse(
        rawResponse,
        activeQuestion.maxMarks
      );
      setFeedbackByQuestionId((prev) => ({
        ...prev,
        [activeQuestion.id]: response,
      }));
      setMarkOverrideInputByQuestionId((prev) => ({
        ...prev,
        [activeQuestion.id]: String(response.achievedMarks),
      }));
      appendWrittenHistoryEntry(activeQuestion, response, {
        uploadedAnswerOverride: activeQuestionAnswer,
        attemptKind: 'initial',
        markingLatencyMs,
        responseEnteredAtMs,
      });
      writtenTimer.onQuestionAnswered(activeQuestion.id);
      useAppStore.getState().recordCompletion('written');
      toast.success(
        `Answer marked: ${response.achievedMarks}/${response.maxMarks} marks`
      );
    } catch (error) {
      setErrorMessage(readBackendError(error));
      setLastFailedAction('mark-written');
    } finally {
      setIsMarking(false);
    }
  }
  submitRef.current = handleSubmitForMarking;

  async function handleArgueForMark() {
    if (!activeQuestion || !activeFeedback) return;
    const appealText = activeMarkAppeal.trim();
    if (!appealText) {
      setErrorMessage('Enter your argument before requesting a re-mark.');
      return;
    }
    if (!apiKey.trim() || !markModel.trim()) {
      setErrorMessage(
        'Configure API key and model before requesting a re-mark.'
      );
      return;
    }
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
        activeQuestion.maxMarks
      );
      setFeedbackByQuestionId((prev) => ({
        ...prev,
        [activeQuestion.id]: response,
      }));
      setMarkOverrideInputByQuestionId((prev) => ({
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
        `Re-mark complete: ${response.achievedMarks}/${response.maxMarks} marks`
      );
    } catch (error) {
      setErrorMessage(readBackendError(error));
      setLastFailedAction('mark-written');
    } finally {
      setIsMarking(false);
    }
  }

  function handleOverrideMark() {
    if (!activeQuestion || !activeFeedback) return;
    const parsed = Number(activeOverrideInput);
    if (!Number.isFinite(parsed)) {
      setErrorMessage('Enter a whole number to override the mark.');
      return;
    }
    const clamped = Math.max(
      0,
      Math.min(activeFeedback.maxMarks, Math.round(parsed))
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
    setFeedbackByQuestionId((prev) => ({
      ...prev,
      [activeQuestion.id]: updated,
    }));
    setMarkOverrideInputByQuestionId((prev) => ({
      ...prev,
      [activeQuestion.id]: String(clamped),
    }));
    updateLatestWrittenHistoryEntry(activeQuestion.id, updated);
    toast.message(`Mark overridden to ${clamped}/${activeFeedback.maxMarks}`);
  }

  function handleOverrideCriterion(
    idx: number,
    achievedMarks: number,
    rationale: string
  ) {
    if (!activeQuestion || !activeFeedback) return;
    const nextScheme = activeFeedback.vcaaMarkingScheme.map((it, i) =>
      i === idx ? { ...it, achievedMarks, rationale } : it
    );
    const totalAchieved = nextScheme.reduce(
      (s, c) => s + (Number.isFinite(c.achievedMarks) ? c.achievedMarks : 0),
      0
    );
    const totalMax =
      nextScheme.reduce(
        (s, c) => s + (Number.isFinite(c.maxMarks) ? c.maxMarks : 0),
        0
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
    setFeedbackByQuestionId((prev) => ({
      ...prev,
      [activeQuestion.id]: nextFeedback,
    }));
    setMarkOverrideInputByQuestionId((prev) => ({
      ...prev,
      [activeQuestion.id]: String(nextFeedback.achievedMarks),
    }));
    updateLatestWrittenHistoryEntry(activeQuestion.id, nextFeedback);
  }

  // ── MC answer / appeal / override ────────────────────────────────────────────
  function handleMcAnswer(selectedLabel: string) {
    if (!activeMcQuestion) return;
    if (isReviewingCompletedSet) return;
    const existingAnswer = mcAnswersByQuestionId[activeMcQuestion.id];
    if (existingAnswer) return;
    if (existingAnswer === selectedLabel) return;
    const responseEnteredAtMs = Date.now();
    const awardedMarks =
      selectedLabel === activeMcQuestion.correctAnswer ? 1 : 0;
    setMcAnswersByQuestionId((prev) => ({
      ...prev,
      [activeMcQuestion.id]: selectedLabel,
    }));
    setMcAwardedMarksByQuestionId((prev) => ({
      ...prev,
      [activeMcQuestion.id]: awardedMarks,
    }));
    setMcMarkOverrideInputByQuestionId((prev) => ({
      ...prev,
      [activeMcQuestion.id]: String(awardedMarks),
    }));
    if (existingAnswer) {
      updateLatestMcHistoryEntry(
        activeMcQuestion.id,
        selectedLabel,
        awardedMarks,
        responseEnteredAtMs
      );
    } else {
      appendMcHistoryEntry(
        activeMcQuestion,
        selectedLabel,
        awardedMarks,
        'initial',
        responseEnteredAtMs
      );
      mcTimer.onQuestionAnswered(activeMcQuestion.id);
      useAppStore.getState().recordCompletion('multiple-choice');
    }
  }

  // ── MC sketchpad handlers ───────────────────────────────────────────────────
  function handleMcImageDrop(files: File[]) {
    if (!activeMcQuestion) return;
    const file = files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setMcImagesByQuestionId((prev) => ({
        ...prev,
        [activeMcQuestion.id]: { name: file.name, dataUrl },
      }));
    };
    reader.readAsDataURL(file);
  }

  function handleMcImageRemove() {
    if (!activeMcQuestion) return;
    setMcImagesByQuestionId((prev) => {
      const next = { ...prev };
      delete next[activeMcQuestion.id];
      return next;
    });
  }

  function buildMcMarkingPrompt(question: typeof activeMcQuestion) {
    if (!question) return '';
    return `${question.promptMarkdown}\n\nOptions:\n${question.options.map((o: McOption) => `${o.label}. ${o.text}`).join('\n')}`;
  }

  async function handleArgueForMcMark() {
    if (!activeMcQuestion || !activeMcAnswer) return;
    const appealText = activeMcMarkAppeal.trim();
    if (!appealText) {
      setErrorMessage('Enter your argument before requesting a re-mark.');
      return;
    }
    if (!apiKey.trim() || !markModel.trim()) {
      setErrorMessage(
        'Configure API key and model before requesting a re-mark.'
      );
      return;
    }
    setErrorMessage(null);
    setIsMarking(true);
    try {
      const responseEnteredAtMs = Date.now();
      const selectedOptionText =
        activeMcQuestion.options.find(
          (o: McOption) => o.label === activeMcAnswer
        )?.text ?? '';
      const arguedAnswer = [
        `Student selected option ${activeMcAnswer}: ${selectedOptionText}`,
        `Student argument for marks:\n${appealText}`,
      ]
        .filter((p) => p.trim())
        .join('\n\n');
      const rawResponse = await invoke<unknown>('mark_answer', {
        request: {
          question: {
            id: activeMcQuestion.id,
            topic: activeMcQuestion.topic,
            subtopic: activeMcQuestion.subtopic,
            promptMarkdown: buildMcMarkingPrompt(activeMcQuestion),
            maxMarks: 1,
            techAllowed: Boolean(activeMcQuestion.techAllowed),
          },
          studentAnswer: arguedAnswer,
          model: markModel,
          apiKey,
        },
      });
      const response = normalizeMarkResponse(rawResponse, 1);
      const awardedMarks = Math.max(0, Math.min(1, response.achievedMarks));
      setMcAwardedMarksByQuestionId((prev) => ({
        ...prev,
        [activeMcQuestion.id]: awardedMarks,
      }));
      setMcMarkOverrideInputByQuestionId((prev) => ({
        ...prev,
        [activeMcQuestion.id]: String(awardedMarks),
      }));
      appendMcHistoryEntry(
        activeMcQuestion,
        activeMcAnswer,
        awardedMarks,
        'appeal',
        responseEnteredAtMs
      );
    } catch (error) {
      setErrorMessage(readBackendError(error));
    } finally {
      setIsMarking(false);
    }
  }

  function handleOverrideMcMark() {
    if (!activeMcQuestion || !activeMcAnswer) return;
    const parsed = Number(activeMcOverrideInput);
    if (!Number.isFinite(parsed)) {
      setErrorMessage('Enter a whole number to override the mark.');
      return;
    }
    const clamped = Math.max(0, Math.min(1, Math.round(parsed)));
    setErrorMessage(null);
    setMcAwardedMarksByQuestionId((prev) => ({
      ...prev,
      [activeMcQuestion.id]: clamped,
    }));
    setMcMarkOverrideInputByQuestionId((prev) => ({
      ...prev,
      [activeMcQuestion.id]: String(clamped),
    }));
    if (clamped === 1) {
      const updated = [...mcQuestions];
      updated[activeMcQuestionIndex] = {
        ...updated[activeMcQuestionIndex],
        correctAnswer: activeMcAnswer,
      };
      setMcQuestions(updated);
    }
    updateLatestMcHistoryEntryMark(activeMcQuestion.id, clamped);
  }

  // ── Start over ───────────────────────────────────────────────────────────────
  const handleStartOver = useCallback(() => {
    if (questionMode === 'written' && questions.length > 0) saveCurrentSet();
    else if (questionMode === 'multiple-choice' && mcQuestions.length > 0)
      saveCurrentSet();
    resetStopwatch();
    setBatchProgress([]);
    setStreamText('');
    setGenerationStatus(null); // Reset status so summary shows
    setGenerationStartedAt(null);
    setQuestions([]);
    setWrittenRawModelOutput('');
    setWrittenGenerationTelemetry(null);
    setActiveQuestionIndex(0);
    setActiveWrittenSavedSetId(null);
    setWrittenQuestionPresentedAtById({});
    setAnswersByQuestionId({});
    setImagesByQuestionId({});
    setFeedbackByQuestionId({});
    setWrittenResponseEnteredAtById({});
    setMarkAppealByQuestionId({});
    setMarkOverrideInputByQuestionId({});
    setMcQuestions([]);
    setMcRawModelOutput('');
    setMcGenerationTelemetry(null);
    setActiveMcQuestionIndex(0);
    setActiveMcSavedSetId(null);
    setMcQuestionPresentedAtById({});
    setMcAnswersByQuestionId({});
    setMcMarkAppealByQuestionId({});
    setMcMarkOverrideInputByQuestionId({});
    setMcAwardedMarksByQuestionId({});
    setWrittenTimerState(null);
    setMcTimerState(null);
  }, [
    questionMode,
    questions.length,
    mcQuestions.length,
    saveCurrentSet,
    resetStopwatch,
    setActiveMcQuestionIndex,
    setActiveMcSavedSetId,
    setActiveQuestionIndex,
    setActiveWrittenSavedSetId,
    setAnswersByQuestionId,
    setFeedbackByQuestionId,
    setGenerationStartedAt,
    setGenerationStatus,
    setImagesByQuestionId,
    setMcAnswersByQuestionId,
    setMcGenerationTelemetry,
    setMcQuestionPresentedAtById,
    setMcQuestions,
    setMcRawModelOutput,
    setMcTimerState,
    setQuestions,
    setWrittenGenerationTelemetry,
    setWrittenQuestionPresentedAtById,
    setWrittenRawModelOutput,
    setWrittenTimerState,
    setWrittenResponseEnteredAtById,
    setMarkAppealByQuestionId,
    setMarkOverrideInputByQuestionId,
    setMcMarkAppealByQuestionId,
    setMcMarkOverrideInputByQuestionId,
    setMcAwardedMarksByQuestionId,
    setBatchProgress,
    setStreamText,
  ]);
  startOverRef.current = handleStartOver;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full w-full flex flex-col gap-6 animate-in fade-in duration-500">
      {errorMessage && (
        <div
          role="alert"
          aria-live="assertive"
          className="bg-destructive/15 border border-destructive/30 text-destructive px-5 py-4 rounded-sm text-sm flex items-center gap-3 shadow-sm"
        >
          <XCircle className="w-5 h-5 shrink-0" />
          <p className="font-medium flex-1">{errorMessage}</p>
          {lastFailedAction && (
            <button
              type="button"
              onClick={() => {
                if (lastFailedAction === 'generate-written')
                  void handleGenerateQuestions();
                else if (lastFailedAction === 'generate-mc')
                  void handleGenerateMcQuestions();
                else if (lastFailedAction === 'mark-written')
                  void handleSubmitForMarking();
                setLastFailedAction(null);
              }}
              className="ml-2 text-sm text-destructive underline"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* ── Setup ── */}
      {showSetup ? (
        <SetupPanel
          questionMode={questionMode}
          onSetQuestionMode={setQuestionMode}
          selectedTopics={selectedTopics}
          onToggleTopic={toggleTopic}
          mathMethodsSubtopics={mathMethodsSubtopics}
          onToggleMathMethodsSubtopic={toggleMathMethodsSubtopic}
          specialistMathSubtopics={specialistMathSubtopics}
          onToggleSpecialistMathSubtopic={toggleSpecialistMathSubtopic}
          chemistrySubtopics={chemistrySubtopics}
          onToggleChemistrySubtopic={toggleChemistrySubtopic}
          physicalEducationSubtopics={physicalEducationSubtopics}
          onTogglePhysicalEducationSubtopic={togglePhysicalEducationSubtopic}
          techMode={techMode}
          onSetTechMode={setTechMode}
          customFocusArea={customFocusArea}
          onSetCustomFocusArea={setCustomFocusArea}
          diversityStrictness={diversityStrictness}
          onSetDiversityStrictness={setDiversityStrictness}
          strictLatexValidation={strictLatexValidation}
          onSetStrictLatexValidation={setStrictLatexValidation}
          strictSubtopicCoverage={strictSubtopicCoverage}
          onSetStrictSubtopicCoverage={setStrictSubtopicCoverage}
          minSubtopicCoverageRatio={minSubtopicCoverageRatio}
          onSetMinSubtopicCoverageRatio={setMinSubtopicCoverageRatio}
          difficulty={difficulty}
          onSetDifficulty={setDifficulty}
          questionCount={questionCount}
          onSetQuestionCount={setQuestionCount}
          averageMarksPerQuestion={averageMarksPerQuestion}
          onSetAverageMarksPerQuestion={setAverageMarksPerQuestion}
          avoidSimilarQuestions={avoidSimilarQuestions}
          onSetAvoidSimilarQuestions={setAvoidSimilarQuestions}
          shuffleQuestions={shuffleQuestions}
          onSetShuffleQuestions={setShuffleQuestions}
          hasApiKey={Boolean(apiKey)}
          canGenerate={canGenerate}
          isGenerating={isGenerating}
          isPaused={activeTimer.isPaused}
          onTogglePause={togglePause}
          generationStatus={generationStatus}
          generationStartedAt={generationStartedAt}
          formattedElapsedTime={formattedElapsedTime}
          onGenerate={
            questionMode === 'written'
              ? () => void handleGenerateQuestions()
              : () => void handleGenerateMcQuestions()
          }
          lastGenerationTelemetry={lastSessionTelemetry}
          streamText={streamText}
          batchProgress={batchProgress}
          generationSubCallProgress={generationSubCallProgress}
        />
      ) : /* ── Completion ── */
      showCompletionScreen && isSetComplete ? (
        <CompletionScreen
          questionMode={questionMode}
          difficulty={difficulty}
          accuracyPercent={completionAccuracyPercent ?? 0}
          formattedElapsedTime={completionFormattedElapsedTime}
          completedCount={
            questionMode === 'written' ? completedCount : mcCompletedCount
          }
          totalCount={
            questionMode === 'written' ? questions.length : mcQuestions.length
          }
          onReview={() => setShowCompletionScreen(false)}
          onStartOver={handleStartOver}
          perQuestionTiming={
            questionMode === 'written'
              ? questions.map((q) => {
                  const t = writtenTimer.getQuestionTiming(q.id);
                  return t
                    ? {
                        questionId: q.id,
                        timeUsedSeconds: t.timeUsedSeconds,
                        timeLimitSeconds: t.timeLimitSeconds,
                        finishedEarly: t.finishedEarly,
                      }
                    : {
                        questionId: q.id,
                        timeUsedSeconds: 0,
                        timeLimitSeconds: 0,
                        finishedEarly: false,
                      };
                })
              : mcQuestions.map((q) => {
                  const t = mcTimer.getQuestionTiming(q.id);
                  return t
                    ? {
                        questionId: q.id,
                        timeUsedSeconds: t.timeUsedSeconds,
                        timeLimitSeconds: t.timeLimitSeconds,
                        finishedEarly: t.finishedEarly,
                      }
                    : {
                        questionId: q.id,
                        timeUsedSeconds: 0,
                        timeLimitSeconds: 0,
                        finishedEarly: false,
                      };
                })
          }
          sessionWrittenResults={sessionWrittenResults}
          sessionMcResults={sessionMcResults}
        />
      ) : /* ── Written Question View ── */
      questionMode === 'written' ? (
        <div className="flex min-h-full flex-col animate-in slide-in-from-bottom-4 duration-500">
          <SessionHeader
            type="written"
            questionIndex={activeQuestionIndex}
            totalQuestions={questions.length}
            completedCount={completedCount}
            topic={activeQuestion?.topic}
            difficulty={difficulty}
            maxMarks={activeQuestion?.maxMarks}
            techAllowed={activeQuestion?.techAllowed}
            isMathTopic={isMathTopic(activeQuestion?.topic)}
            isAtLast={isAtLastWrittenQuestion}
            canAdvance={canAdvanceWritten}
            generationStartedAt={generationStartedAt}
            telemetry={writtenGenerationTelemetry}
            questionTimeSeconds={writtenTimer.currentQuestionTimeUsed}
            isPaused={writtenTimer.isPaused}
            getDifficultyBadgeClasses={getDifficultyBadgeClasses}
            onPrev={() =>
              setActiveQuestionIndex(Math.max(0, activeQuestionIndex - 1))
            }
            onNext={handleNextWrittenQuestion}
            onDelete={handleCancelWrittenQuestion}
            onExit={handleStartOver}
          />
          {showKeyboardHint && (
            <div className="flex items-center justify-center gap-3 px-4 py-1.5 bg-muted/40 border-b text-[11px] text-muted-foreground">
              <span>
                Tip: Use{' '}
                <kbd className="px-1 py-0.5 rounded bg-background border text-[10px] font-mono">
                  ←
                </kbd>{' '}
                <kbd className="px-1 py-0.5 rounded bg-background border text-[10px] font-mono">
                  →
                </kbd>{' '}
                to navigate,{' '}
                <kbd className="px-1 py-0.5 rounded bg-background border text-[10px] font-mono">
                  Ctrl+Enter
                </kbd>{' '}
                to submit
              </span>
              <button
                onClick={dismissKeyboardHint}
                className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}
          {activeQuestion && (
            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-8xl px-4 sm:px-6 lg:px-8 xl:px-12 py-4 sm:py-6 lg:py-8">
                {activeFeedback ? (
                  <div className="min-w-0 pb-10">
                    <WrittenFeedbackPanel
                      questionId={activeQuestion.id}
                      promptMarkdown={activeQuestion.promptMarkdown}
                      answer={activeQuestionAnswer}
                      image={activeQuestionImage}
                      feedback={activeFeedback}
                      appealText={activeMarkAppeal}
                      overrideInput={activeOverrideInput}
                      isMarking={isMarking}
                      distinctness={activeQuestion.distinctnessScore}
                      multiStepDepth={activeQuestion.multiStepDepth}
                      onAppealChange={handleAppealChange}
                      onOverrideInputChange={handleOverrideInputChange}
                      onArgueForMark={() => void handleArgueForMark()}
                      onApplyOverride={handleOverrideMark}
                      onCriterionChange={handleOverrideCriterion}
                    />
                  </div>
                ) : (
                  <div
                    className={`grid grid-cols-1 ${writtenSketchpadActive ? 'lg:grid-cols-[35%_65%]' : 'lg:grid-cols-2'} lg:gap-6`}
                  >
                    <div className="min-w-0 space-y-4 pb-10">
                      <MarkdownMath content={activeQuestion.promptMarkdown} />
                    </div>
                    <div className="min-w-0 space-y-4 pb-10">
                      <WrittenAnswerCard
                        questionId={activeQuestion.id}
                        answer={activeQuestionAnswer}
                        image={activeQuestionImage}
                        isMarking={isMarking}
                        canSubmit={canSubmitAnswer}
                        onAnswerChange={handleWrittenAnswerChange}
                        onImageDrop={handleWrittenImageDrop}
                        onImageRemove={handleWrittenImageRemove}
                        onSubmit={(payload?: { image?: StudentAnswerImage }) =>
                          void handleSubmitForMarking(payload)
                        }
                        onSketchpadActiveChange={setWrittenSketchpadActive}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── MC Question View ── */
        <div className="flex flex-col h-full animate-in slide-in-from-bottom-4 duration-500">
          <SessionHeader
            type="mc"
            questionIndex={activeMcQuestionIndex}
            totalQuestions={mcQuestions.length}
            completedCount={mcCompletedCount}
            topic={activeMcQuestion?.topic}
            difficulty={difficulty}
            techAllowed={activeMcQuestion?.techAllowed}
            isMathTopic={isMathTopic(activeMcQuestion?.topic)}
            isAtLast={isAtLastMcQuestion}
            canAdvance={canAdvanceMc}
            generationStartedAt={generationStartedAt}
            telemetry={mcGenerationTelemetry}
            questionTimeSeconds={mcTimer.currentQuestionTimeUsed}
            getDifficultyBadgeClasses={getDifficultyBadgeClasses}
            onPrev={() =>
              setActiveMcQuestionIndex(Math.max(0, activeMcQuestionIndex - 1))
            }
            onNext={handleNextMcQuestion}
            onDelete={handleCancelMcQuestion}
            onExit={handleStartOver}
          />
          {showKeyboardHint && (
            <div className="flex items-center justify-center gap-3 px-4 py-1.5 bg-muted/40 border-b text-[11px] text-muted-foreground">
              <span>
                Tip: Use{' '}
                <kbd className="px-1 py-0.5 rounded bg-background border text-[10px] font-mono">
                  ←
                </kbd>{' '}
                <kbd className="px-1 py-0.5 rounded bg-background border text-[10px] font-mono">
                  →
                </kbd>{' '}
                to navigate
              </span>
              <button
                onClick={dismissKeyboardHint}
                className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}
          {activeMcQuestion && (
            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-8xl px-4 sm:px-6 lg:px-8 xl:px-12 py-4 sm:py-6 lg:py-8">
                <div
                  className={`mx-auto space-y-5 lg:space-y-0 pb-10 lg:grid lg:gap-6 ${
                    mcSketchpadActive
                      ? 'lg:grid-cols-[40%_60%]'
                      : 'lg:grid-cols-2'
                  }`}
                >
                  <div className="space-y-5">
                    <div className="p-6 bg-muted/20 rounded-md space-y-2">
                      <h1 className="text-xl font-bold">
                        Question {activeMcQuestionIndex + 1}
                      </h1>
                      <MarkdownMath content={activeMcQuestion.promptMarkdown} />
                    </div>
                    {countWords(activeMcQuestion.explanationMarkdown) >
                      MC_MAX_EXPLANATION_WORDS && (
                      <div className="rounded-[20px] border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-sm text-amber-100/90">
                        <strong className="font-semibold">Warning:</strong>{' '}
                        Explanation is{' '}
                        {countWords(activeMcQuestion.explanationMarkdown)}
                        words (max {MC_MAX_EXPLANATION_WORDS}). This may be
                        rejected by the backend.
                      </div>
                    )}

                    {mcSketchpadActive && (
                      <div className="min-w-0">
                        <McAnswerCard
                          options={activeMcQuestion.options}
                          correctAnswer={activeMcQuestion.correctAnswer}
                          explanationMarkdown={
                            activeMcQuestion.explanationMarkdown
                          }
                          selectedAnswer={activeMcAnswer}
                          awardedMarks={activeMcAwardedMarks}
                          appealText={activeMcMarkAppeal}
                          overrideInput={activeMcOverrideInput}
                          isMarking={isMarking}
                          image={mcImagesByQuestionId[activeMcQuestion.id]}
                          hideCorrectAnswer={false}
                          onSelectAnswer={handleMcAnswer}
                          onAppealChange={handleMcAppealChange}
                          onOverrideInputChange={handleMcOverrideInputChange}
                          onArgueForMark={() => void handleArgueForMcMark()}
                          onApplyOverride={handleOverrideMcMark}
                          isSketchpadOpen={mcSketchpadActive}
                          onToggleSketchpad={() =>
                            setMcSketchpadActive((prev) => !prev)
                          }
                          onImageDrop={handleMcImageDrop}
                          onImageRemove={handleMcImageRemove}
                          renderSketchpadInline={false}
                        />
                      </div>
                    )}
                  </div>

                  {mcSketchpadActive ? (
                    <div className="min-w-0 space-y-4">
                      <McSketchpadPanel
                        image={mcImagesByQuestionId[activeMcQuestion.id]}
                        onImageDrop={handleMcImageDrop}
                        onImageRemove={handleMcImageRemove}
                      />
                    </div>
                  ) : (
                    <div className="min-w-0 space-y-4">
                      <McAnswerCard
                        options={activeMcQuestion.options}
                        correctAnswer={activeMcQuestion.correctAnswer}
                        explanationMarkdown={
                          activeMcQuestion.explanationMarkdown
                        }
                        selectedAnswer={activeMcAnswer}
                        awardedMarks={activeMcAwardedMarks}
                        appealText={activeMcMarkAppeal}
                        overrideInput={activeMcOverrideInput}
                        isMarking={isMarking}
                        image={mcImagesByQuestionId[activeMcQuestion.id]}
                        hideCorrectAnswer={false}
                        onSelectAnswer={handleMcAnswer}
                        onAppealChange={handleMcAppealChange}
                        onOverrideInputChange={handleMcOverrideInputChange}
                        onArgueForMark={() => void handleArgueForMcMark()}
                        onApplyOverride={handleOverrideMcMark}
                        isSketchpadOpen={mcSketchpadActive}
                        onToggleSketchpad={() =>
                          setMcSketchpadActive((prev) => !prev)
                        }
                        onImageDrop={handleMcImageDrop}
                        onImageRemove={handleMcImageRemove}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Keyboard shortcut hint ── */}
      {isInSession && showKeyboardHint && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 rounded-sm bg-foreground/90 text-background text-[11px] font-medium shadow-lg backdrop-blur-sm">
          <span>Tip: Use</span>
          <kbd className="px-1.5 py-0.5 rounded bg-background/20 text-[10px] font-mono">
            ←
          </kbd>
          <kbd className="px-1.5 py-0.5 rounded bg-background/20 text-[10px] font-mono">
            →
          </kbd>
          <span>to navigate,</span>
          <kbd className="px-1.5 py-0.5 rounded bg-background/20 text-[10px] font-mono">
            Esc
          </kbd>
          <span>to exit</span>
          <button
            type="button"
            onClick={() => {
              setShowKeyboardHint(false);
              try {
                localStorage.setItem('keyboard-hint-dismissed', '1');
              } catch {
                // ignore localStorage errors
              }
            }}
            className="ml-2 text-background/60 hover:text-background cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        title="Remove question"
        description={confirmMessage ?? undefined}
        confirmText="Remove"
        cancelText="Keep"
        onConfirm={performConfirmedCancel}
        onCancel={() => {
          setConfirmOpen(false);
          setPendingCancelType(null);
          setConfirmMessage(null);
        }}
      />
    </div>
  );
}
