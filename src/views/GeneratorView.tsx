import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { XCircle } from "lucide-react";
import {
  useAppPreferences,
  useAppSettings,
  useMultipleChoiceSession,
  useWrittenSession,
  useGenerationStatus,
} from "@/AppContext";
import { useAppStore } from "@/store";
import {
  Topic,
  MathMethodsSubtopic,
  SpecialistMathSubtopic,
  ChemistrySubtopic,
  PhysicalEducationSubtopic,
  GenerateQuestionsResponse,
  GenerateMcQuestionsResponse,
  McOption,
  McHistoryEntry,
  McAttemptKind,
  QuestionHistoryEntry,
  Difficulty,
  WrittenAttemptKind,
  GenerationTokenEvent,
  TOPICS,
  MATH_METHODS_SUBTOPICS,
  SPECIALIST_MATH_SUBTOPICS,
  CHEMISTRY_SUBTOPICS,
  PHYSICAL_EDUCATION_SUBTOPICS,
  ExamRecord,
  ExamQuestionResult,
} from "@/types";
import {
  fileToDataUrl,
  normalizeMarkResponse,
  readBackendError,
} from "@/lib/app-utils";

import { ConfirmModal } from "@/components/ui/ConfirmModal";

import { SetupPanel, BatchTopicProgress } from "@/components/generator/SetupPanel";
import { CompletionScreen } from "@/components/generator/CompletionScreen";
import { WrittenSessionHeader } from "@/components/generator/WrittenSessionHeader";
import { WrittenQuestionCard } from "@/components/generator/WrittenQuestionCard";
import { useQuestionTimer } from "@/hooks/useQuestionTimer";
import { useTimerBar, type TimerBarData } from "@/context/TimerBarContext";
import { WrittenAnswerCard } from "@/components/generator/WrittenAnswerCard";
import { WrittenFeedbackPanel } from "@/components/generator/WrittenFeedbackPanel";
import { McSessionHeader } from "@/components/generator/McSessionHeader";
import { McQuestionCard } from "@/components/generator/McQuestionCard";
import { McAnswerPanel } from "@/components/generator/McAnswerPanel";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countWords(value: string) {
  const trimmed = value.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

const MC_MAX_EXPLANATION_WORDS = 300;

function isMathTopic(topic?: string) {
  return topic === "Mathematical Methods" || topic === "Specialist Mathematics";
}

function getDifficultyBadgeClasses(level: Difficulty) {
  switch (level) {
    case "Essential Skills": return "border-green-300 bg-green-50 text-green-800 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-200";
    case "Easy": return "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200";
    case "Medium": return "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200";
    case "Hard": return "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-200";
    case "Extreme": return "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200";
    default: return "";
  }
}

// ─── Batch distribution helper ────────────────────────────────────────────────
// Distributes `total` questions across `n` topics as evenly as possible.
// The remainder is spread across the first topics (not the last) so that
// e.g. 10 questions over 3 topics → [4, 3, 3] rather than [3, 3, 4].
function distributeQuestions(topics: Topic[], total: number): number[] {
  if (topics.length === 0) return [];
  const base = Math.floor(total / topics.length);
  const remainder = total % topics.length;
  return topics.map((_, i) => base + (i < remainder ? 1 : 0));
}

// ─── Pure helpers (moved outside component) ───────────────────────────────────

function removeKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

function generateEntryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function rekeyWritten(
  qs: import("@/types").GeneratedQuestion[],
): import("@/types").GeneratedQuestion[] {
  return qs.map((q, i) => ({ ...q, id: `q${i + 1}` }));
}

function rekeyMc(
  qs: import("@/types").McQuestion[],
): import("@/types").McQuestion[] {
  return qs.map((q, i) => ({ ...q, id: `mc${i + 1}` }));
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GeneratorView() {
  // Read query params for pre-selection
  const location = useLocation();
  // Pre-select topic and subtopic from query params on mount
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const topic = params.get("topic");
    const subtopic = params.get("subtopic");
    if (topic && TOPICS.includes(topic as Topic)) {
      setSelectedTopics([topic as Topic]);
      // Try to select subtopic if present and valid for this topic
      if (subtopic) {
        if (topic === "Mathematical Methods" && MATH_METHODS_SUBTOPICS.includes(subtopic as MathMethodsSubtopic)) {
          setMathMethodsSubtopics([subtopic as MathMethodsSubtopic]);
        } else if (topic === "Specialist Mathematics" && SPECIALIST_MATH_SUBTOPICS.includes(subtopic as SpecialistMathSubtopic)) {
          setSpecialistMathSubtopics([subtopic as SpecialistMathSubtopic]);
        } else if (topic === "Chemistry" && CHEMISTRY_SUBTOPICS.includes(subtopic as ChemistrySubtopic)) {
          setChemistrySubtopics([subtopic as ChemistrySubtopic]);
        } else if (topic === "Physical Education" && PHYSICAL_EDUCATION_SUBTOPICS.includes(subtopic as PhysicalEducationSubtopic)) {
          setPhysicalEducationSubtopics([subtopic as PhysicalEducationSubtopic]);
        }
      }
    }
    // Only run on mount or when location.search changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);
  // ── Local UI state ──────────────────────────────────────────────────────────
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [showCompletionScreen, setShowCompletionScreen] = useState(false);
  const [hasShownCompletionScreen, setHasShownCompletionScreen] = useState(false);
  const [showWrittenRawOutput, setShowWrittenRawOutput] = useState(false);
  const [showMcRawOutput, setShowMcRawOutput] = useState(false);
  const [customFocusArea, setCustomFocusArea] = useState("");
  const [examRecordSaved, setExamRecordSaved] = useState(false);

  const [markAppealByQuestionId, setMarkAppealByQuestionId] = useState<Record<string, string>>({});
  const [markOverrideInputByQuestionId, setMarkOverrideInputByQuestionId] = useState<Record<string, string>>({});
  const [mcMarkAppealByQuestionId, setMcMarkAppealByQuestionId] = useState<Record<string, string>>({});
  const [mcMarkOverrideInputByQuestionId, setMcMarkOverrideInputByQuestionId] = useState<Record<string, string>>({});
  const [mcAwardedMarksByQuestionId, setMcAwardedMarksByQuestionId] = useState<Record<string, number>>({});
  const [writtenResponseEnteredAtById, setWrittenResponseEnteredAtById] = useState<Record<string, number>>({});

  // Keyboard shortcut hint state
  const [showKeyboardHint, setShowKeyboardHint] = useState(() => {
    try { return !localStorage.getItem("keyboard-hint-dismissed"); } catch { return true; }
  });

  // Per-topic batch progress — drives the multi-topic timeline in SetupPanel.
  // Empty when only one topic is selected (single-call path shows normal timeline).
  const [batchProgress, setBatchProgress] = useState<BatchTopicProgress[]>([]);

  // ── Context ─────────────────────────────────────────────────────────────────
  const { apiKey, model, markingModel, useSeparateMarkingModel, imageMarkingModel, useSeparateImageMarkingModel, debugMode, includeExamContext } = useAppSettings();
  const {
    selectedTopics, setSelectedTopics,
    difficulty, setDifficulty,
    avoidSimilarQuestions, setAvoidSimilarQuestions,
    techMode, setTechMode,
    mathMethodsSubtopics, setMathMethodsSubtopics,
    specialistMathSubtopics, setSpecialistMathSubtopics,
    chemistrySubtopics, setChemistrySubtopics,
    physicalEducationSubtopics, setPhysicalEducationSubtopics,
    questionCount, setQuestionCount,
    averageMarksPerQuestion, setAverageMarksPerQuestion,
    questionMode, setQuestionMode,
    generationMode, setGenerationMode,
    examTimeLimitMinutes, setExamTimeLimitMinutes,
    subtopicInstructions,
    aiDifficultyScalingEnabled, setAiDifficultyScalingEnabled,
    difficultyThresholds, setDifficultyThresholds,
  } = useAppPreferences();

  const {
    questions, setQuestions,
    activeQuestionIndex, setActiveQuestionIndex,
    setWrittenQuestionPresentedAtById,
    answersByQuestionId, setAnswersByQuestionId,
    imagesByQuestionId, setImagesByQuestionId,
    feedbackByQuestionId, setFeedbackByQuestionId,
    questionHistory, setQuestionHistory,
    writtenRawModelOutput, setWrittenRawModelOutput,
    writtenGenerationTelemetry, setWrittenGenerationTelemetry,
    activeWrittenSavedSetId, setActiveWrittenSavedSetId,
  } = useWrittenSession();

  const {
    mcQuestions, setMcQuestions,
    activeMcQuestionIndex, setActiveMcQuestionIndex,
    setMcQuestionPresentedAtById,
    mcAnswersByQuestionId, setMcAnswersByQuestionId,
    mcHistory, setMcHistory,
    mcRawModelOutput, setMcRawModelOutput,
    mcGenerationTelemetry, setMcGenerationTelemetry,
    activeMcSavedSetId, setActiveMcSavedSetId,
  } = useMultipleChoiceSession();

  const {
    saveCurrentSet,
    isGenerating, setIsGenerating,
    generationStatus, setGenerationStatus,
    generationStartedAt, setGenerationStartedAt,
    isMarking, setIsMarking,
    errorMessage, setErrorMessage,
  } = useGenerationStatus();

  const addGenerationRecord = useAppStore((s) => s.addGenerationRecord);
  const addExamRecord = useAppStore((s) => s.addExamRecord);
  const setWrittenTimerState = useAppStore((s) => s.setWrittenTimerState);
  const setMcTimerState = useAppStore((s) => s.setMcTimerState);

  const [lastFailedAction, setLastFailedAction] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [pendingCancelType, setPendingCancelType] = useState<null | "written" | "mc">(null);

  const [streamText, setStreamText] = useState("");

  // Calculate recent average score for AI scaling
  const recentAverageScore = useMemo(() => {
    const examHistory = useAppStore.getState().examHistory;
    if (examHistory.length === 0) return null;

    // Take last 5 exams
    const recentExams = examHistory.slice(0, 5);
    const totalScore = recentExams.reduce((sum, exam) => sum + (exam.totalScore / exam.totalMax * 100), 0);
    return totalScore / recentExams.length;
  }, []); // Recalculate when needed, but for now static


  const [lastSessionTelemetry, setLastSessionTelemetry] = useState<
    import("@/types").GenerationTelemetry | null
  >(null);

  // --- Timer hooks ---
  const writtenTimer = useQuestionTimer(
    generationMode,
    examTimeLimitMinutes * 60,
    questions,
    activeQuestionIndex,
    "written",
  );
  const mcTimer = useQuestionTimer(
    generationMode,
    examTimeLimitMinutes * 60,
    mcQuestions,
    activeMcQuestionIndex,
    "mc",
  );


  // ── Derived values ───────────────────────────────────────────────────────────
  const activeQuestion = questions[activeQuestionIndex];
  const activeQuestionAnswer = activeQuestion ? (answersByQuestionId[activeQuestion.id] ?? "") : "";
  const activeQuestionImage = activeQuestion ? imagesByQuestionId[activeQuestion.id] : undefined;
  const activeFeedback = activeQuestion ? feedbackByQuestionId[activeQuestion.id] : undefined;
  const activeMarkAppeal = activeQuestion ? (markAppealByQuestionId[activeQuestion.id] ?? "") : "";
  const activeOverrideInput = activeQuestion
    ? (markOverrideInputByQuestionId[activeQuestion.id] ?? (activeFeedback ? String(activeFeedback.achievedMarks) : ""))
    : "";

  const activeMcQuestion = mcQuestions[activeMcQuestionIndex];
  const activeMcAnswer = activeMcQuestion ? (mcAnswersByQuestionId[activeMcQuestion.id] ?? "") : "";
  const activeMcMarkAppeal = activeMcQuestion ? (mcMarkAppealByQuestionId[activeMcQuestion.id] ?? "") : "";
  const activeMcAwardedMarks = activeMcQuestion ? mcAwardedMarksByQuestionId[activeMcQuestion.id] : undefined;
  const activeMcOverrideInput = activeMcQuestion
    ? (mcMarkOverrideInputByQuestionId[activeMcQuestion.id] ?? (activeMcAwardedMarks !== undefined ? String(activeMcAwardedMarks) : ""))
    : "";

  const markModel = (() => {
    if (activeQuestionImage && useSeparateImageMarkingModel && imageMarkingModel && imageMarkingModel.trim().length > 0) {
      return imageMarkingModel;
    }
    if (useSeparateMarkingModel && markingModel && markingModel.trim().length > 0) {
      return markingModel;
    }
    return model;
  })();

  const showSetup = questionMode === "written" ? questions.length === 0 : mcQuestions.length === 0;
  const canShowWrittenRawOutput = debugMode && writtenRawModelOutput.trim().length > 0;
  const canShowMcRawOutput = debugMode && mcRawModelOutput.trim().length > 0;

  const canGenerate =
    selectedTopics.length > 0 &&
    apiKey.trim().length > 0 &&
    model.trim().length > 0 &&
    questionCount >= 1 && questionCount <= 20 &&
    !isGenerating;

  const canSubmitAnswer =
    Boolean(activeQuestion) &&
    (activeQuestionAnswer.trim().length > 0 || Boolean(activeQuestionImage)) &&
    apiKey.trim().length > 0 &&
    markModel.trim().length > 0 &&
    !isMarking &&
    !activeFeedback;

  const completedCount = useMemo(
    () => questions.filter((q) => feedbackByQuestionId[q.id]).length,
    [feedbackByQuestionId, questions],
  );
  const mcCompletedCount = useMemo(
    () => mcQuestions.filter((q) => mcAnswersByQuestionId[q.id]).length,
    [mcAnswersByQuestionId, mcQuestions],
  );

  const isWrittenSetComplete = questionMode === "written" && questions.length > 0 && completedCount === questions.length;
  const isMcSetComplete = questionMode === "multiple-choice" && mcQuestions.length > 0 && mcCompletedCount === mcQuestions.length;
  const isSetComplete = isWrittenSetComplete || isMcSetComplete;
  const isReviewingCompletedSet = generationMode === "exam" && isSetComplete && !showCompletionScreen && hasShownCompletionScreen;
  const isAtLastWrittenQuestion = activeQuestionIndex === questions.length - 1;
  const isAtLastMcQuestion = activeMcQuestionIndex === mcQuestions.length - 1;
  const canAdvanceWritten = questions.length > 0 && (!isAtLastWrittenQuestion || isWrittenSetComplete);
  const canAdvanceMc = mcQuestions.length > 0 && (!isAtLastMcQuestion || isMcSetComplete);

  const completionSetKey = useMemo(() => {
    if (questionMode === "written") return questions.map((q) => q.id).join("|");
    return mcQuestions.map((q) => q.id).join("|");
  }, [questionMode, questions, mcQuestions]);

  const writtenAccuracyPercent = useMemo(() => {
    if (!isWrittenSetComplete) return null;
    const total = questions.reduce((s, q) => s + q.maxMarks, 0);
    if (total === 0) return 0;
    return (questions.reduce((s, q) => s + (feedbackByQuestionId[q.id]?.achievedMarks ?? 0), 0) / total) * 100;
  }, [feedbackByQuestionId, isWrittenSetComplete, questions]);

  const mcAccuracyPercent = useMemo(() => {
    if (!isMcSetComplete || mcQuestions.length === 0) return null;
    const achieved = mcQuestions.reduce((s, q) => {
      const sel = mcAnswersByQuestionId[q.id];
      return sel ? s + getMcAwardedMarks(q.id, sel, q.correctAnswer) : s;
    }, 0);
    return (achieved / mcQuestions.length) * 100;
  }, [isMcSetComplete, mcAnswersByQuestionId, mcQuestions, mcAwardedMarksByQuestionId]);

  const completionAccuracyPercent = questionMode === "written" ? writtenAccuracyPercent : mcAccuracyPercent;

  // Active timer hook based on current question mode
  const activeTimer = questionMode === "written" ? writtenTimer : mcTimer;

  // Session elapsed time from the active timer hook (single source of truth)
  const elapsedSeconds = activeTimer.sessionElapsedSeconds;

  const formattedElapsedTime = useMemo(() => {
    const secs = elapsedSeconds;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [elapsedSeconds]);

  const completionFormattedElapsedTime = formattedElapsedTime;

  const remainingSeconds = activeTimer.sessionRemainingSeconds;

  const formattedCountdownTime = useMemo(() => {
    const secs = remainingSeconds;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [remainingSeconds]);

  // Exam mode: auto-complete when time runs out
  useEffect(() => {
    if (generationMode !== "exam") return;
    if (!activeTimer.sessionElapsedSeconds && activeTimer.sessionElapsedSeconds !== 0) return;
    if (showCompletionScreen || isSetComplete) return;
    if (activeTimer.sessionRemainingSeconds > 0) return;
    activeTimer.finishSession();
    setShowCompletionScreen(true);
  }, [generationMode, activeTimer.sessionRemainingSeconds, isSetComplete, showCompletionScreen]);

  // --- Timer bar context (for header display) ---
  const { setTimerBarData } = useTimerBar();
  const hasActiveSession = (questionMode === "written" && questions.length > 0) || (questionMode === "multiple-choice" && mcQuestions.length > 0);

  useEffect(() => {
    if (!hasActiveSession) {
      setTimerBarData(null);
      return;
    }
    const timer = activeTimer;
    const data: TimerBarData = {
      questionNumber: (questionMode === "written" ? activeQuestionIndex : activeMcQuestionIndex) + 1,
      totalQuestions: questionMode === "written" ? questions.length : mcQuestions.length,
      currentQuestionTimeUsed: timer.currentQuestionTimeUsed,
      currentQuestionTimeLimit: timer.currentQuestionTimeLimit,
      currentQuestionRemaining: timer.currentQuestionRemaining,
      formattedQuestionTime: timer.formattedQuestionTime,
      parTimeSeconds: timer.parTimeSeconds,
      bankedSeconds: timer.bankedSeconds,
      formattedBank: timer.formattedBank,
      bankStatus: timer.bankStatus,
      formattedSessionTime: timer.formattedSessionTime,
      isQuestionExpired: timer.isQuestionExpired,
      mode: generationMode,
    };
    setTimerBarData(data);
  }, [
    hasActiveSession,
    questionMode,
    activeQuestionIndex,
    activeMcQuestionIndex,
    questions.length,
    mcQuestions.length,
    activeTimer.currentQuestionTimeUsed,
    activeTimer.currentQuestionTimeLimit,
    activeTimer.currentQuestionRemaining,
    activeTimer.formattedQuestionTime,
    activeTimer.parTimeSeconds,
    activeTimer.bankedSeconds,
    activeTimer.formattedBank,
    activeTimer.bankStatus,
    activeTimer.formattedSessionTime,
    activeTimer.isQuestionExpired,
    generationMode,
    setTimerBarData,
  ]);

  // Clear timer bar on unmount
  useEffect(() => {
    return () => { setTimerBarData(null); };
  }, [setTimerBarData]);

  // ── Effects ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    setShowCompletionScreen(false);
    setHasShownCompletionScreen(false);
  }, [completionSetKey]);

  useEffect(() => {
    if (showCompletionScreen) setHasShownCompletionScreen(true);
  }, [showCompletionScreen]);
  useEffect(() => { setExamRecordSaved(false); }, [completionSetKey, generationMode]);

  // ── Timer actions ─────────────────────────────────────────────────────────────
  function startStopwatch() {
    if (questionMode === "written") writtenTimer.reset();
    else if (questionMode === "multiple-choice") mcTimer.reset();
  }

  function startTiming() {
    setGenerationStartedAt(Date.now());
  }

  // Start timer only after questions or mcQuestions are populated
  // The hook handles resumption from Zustand internally — this just starts new sessions
  useEffect(() => {
    if (questionMode === "written" && questions.length > 0) {
      writtenTimer.startTiming(questions);
    } else if (questionMode === "multiple-choice" && mcQuestions.length > 0) {
      mcTimer.startTiming(mcQuestions);
    }
  }, [questionMode, questions.length, mcQuestions.length]);

  // Pause timers while marking in practice mode
  useEffect(() => {
    if (generationMode !== "practice") return;
    if (questionMode === "written") {
      writtenTimer.setPaused(isMarking);
    } else if (questionMode === "multiple-choice") {
      mcTimer.setPaused(isMarking);
    }
  }, [isMarking, generationMode, questionMode, writtenTimer, mcTimer]);

  function resetStopwatch() {
    setGenerationStartedAt(null);
    if (questionMode === "written") writtenTimer.reset();
    else if (questionMode === "multiple-choice") mcTimer.reset();
  }

  function togglePause() {
    if (questionMode === "written") writtenTimer.togglePause();
    else if (questionMode === "multiple-choice") mcTimer.togglePause();
  }

  // ── Stream token listener ────────────────────────────────────────────────────
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    listen<GenerationTokenEvent>("generation-token", (event) => {
      setStreamText((prev) => prev + event.payload.text);
    }).then((fn) => {
      if (cancelled) {
        fn(); // Promise resolved after cleanup — immediately unlisten
      } else {
        unlisten = fn;
      }
    }).catch(() => { });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // ── SSE status listener — forwards stage updates into batchProgress ──────────
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    listen<import("@/types").GenerationStatusEvent>("generation-status", (event) => {
      setGenerationStatus(event.payload);
      setBatchProgress((prev) => {
        const activeIdx = prev.findIndex((e) => e.status === "active");
        if (activeIdx === -1) return prev;
        const next = [...prev];
        next[activeIdx] = {
          ...next[activeIdx],
          stage: event.payload.stage,
          message: event.payload.message,
        };
        return next;
      });
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    }).catch(() => { });

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
    setActiveQuestionIndex(Math.min(questions.length - 1, activeQuestionIndex + 1));
  }, [canAdvanceWritten, isAtLastWrittenQuestion, questions.length, activeQuestionIndex, setActiveQuestionIndex, writtenTimer]);

  const handleNextMcQuestion = useCallback(() => {
    if (!canAdvanceMc) return;
    if (isAtLastMcQuestion) {
      mcTimer.finishSession();
      setShowCompletionScreen(true);
      return;
    }
    setActiveMcQuestionIndex(Math.min(mcQuestions.length - 1, activeMcQuestionIndex + 1));
  }, [canAdvanceMc, isAtLastMcQuestion, mcQuestions.length, activeMcQuestionIndex, setActiveMcQuestionIndex, mcTimer]);

  const isInSession = !showSetup && !showCompletionScreen;
  function dismissKeyboardHint() {
    setShowKeyboardHint(false);
    try { localStorage.setItem("keyboard-hint-dismissed", "1"); } catch { /* noop */ }
  }
  const startOverRef = useRef<() => void>(() => {});
  const submitRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!isInSession) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable = (e.target as HTMLElement)?.isContentEditable;
      if (tag === "TEXTAREA" || tag === "INPUT" || isEditable) return;

      // Ctrl/Cmd+Enter → submit answer
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (questionMode === "written" && canSubmitAnswer && !isMarking) {
          submitRef.current();
        }
        return;
      }

      // Right arrow / N → next question
      if (e.key === "ArrowRight" || e.key === "n") {
        e.preventDefault();
        if (questionMode === "written") {
          handleNextWrittenQuestion();
        } else {
          handleNextMcQuestion();
        }
        return;
      }

      // Left arrow / P → previous question
      if (e.key === "ArrowLeft" || e.key === "p") {
        e.preventDefault();
        if (questionMode === "written") {
          setActiveQuestionIndex(Math.max(0, activeQuestionIndex - 1));
        } else {
          setActiveMcQuestionIndex(Math.max(0, activeMcQuestionIndex - 1));
        }
        return;
      }

      // Esc → exit session (with confirmation)
      if (e.key === "Escape") {
        e.preventDefault();
        startOverRef.current();
        return;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isInSession, questionMode, canSubmitAnswer, isMarking, activeQuestionIndex, activeMcQuestionIndex, handleNextWrittenQuestion, handleNextMcQuestion, setActiveQuestionIndex, setActiveMcQuestionIndex]);

  // ── Cancel question ──────────────────────────────────────────────────────────
  const handleCancelWrittenQuestion = useCallback(() => {
    if (!activeQuestion) return;
    setConfirmMessage(`Remove question ${activeQuestionIndex + 1} ("${activeQuestion.topic}")? It will be taken out of your current set.`);
    setPendingCancelType("written");
    setConfirmOpen(true);
  }, [activeQuestion, activeQuestionIndex]);

  const handleCancelMcQuestion = useCallback(() => {
    if (!activeMcQuestion) return;
    setConfirmMessage(`Remove question ${activeMcQuestionIndex + 1} ("${activeMcQuestion.topic}")? It will be taken out of your current set.`);
    setPendingCancelType("mc");
    setConfirmOpen(true);
  }, [activeMcQuestion, activeMcQuestionIndex]);

  const performConfirmedCancel = useCallback(() => {
    if (pendingCancelType === "written" && activeQuestion) {
      const id = activeQuestion.id;
      const next = questions.filter((q) => q.id !== id);
      setQuestions(next);
      setActiveWrittenSavedSetId(null);
      setShowCompletionScreen(false);
      setActiveQuestionIndex(Math.min(activeQuestionIndex, Math.max(0, next.length - 1)));
      setWrittenQuestionPresentedAtById((p) => removeKey(p, id));
      setAnswersByQuestionId((p) => removeKey(p, id));
      setImagesByQuestionId((p) => removeKey(p, id));
      setFeedbackByQuestionId((p) => removeKey(p, id));
      setMarkAppealByQuestionId((p) => removeKey(p, id));
      setMarkOverrideInputByQuestionId((p) => removeKey(p, id));
      setWrittenResponseEnteredAtById((p) => removeKey(p, id));
      // Remove from history if it was already answered
      setQuestionHistory((prev) => prev.filter((e: QuestionHistoryEntry) => e.question.id !== id));
      // Subtract question time from session timer
      writtenTimer.removeQuestion(id);
      setErrorMessage(null);
    }
    if (pendingCancelType === "mc" && activeMcQuestion) {
      const id = activeMcQuestion.id;
      const next = mcQuestions.filter((q) => q.id !== id);
      setMcQuestions(next);
      setActiveMcSavedSetId(null);
      setShowCompletionScreen(false);
      setActiveMcQuestionIndex(Math.min(activeMcQuestionIndex, Math.max(0, next.length - 1)));
      setMcQuestionPresentedAtById((p) => removeKey(p, id));
      setMcAnswersByQuestionId((p) => removeKey(p, id));
      setMcMarkAppealByQuestionId((p) => removeKey(p, id));
      setMcMarkOverrideInputByQuestionId((p) => removeKey(p, id));
      setMcAwardedMarksByQuestionId((p) => removeKey(p, id));
      // Remove from history if it was already answered
      setMcHistory((prev) => prev.filter((e: McHistoryEntry) => e.question.id !== id));
      // Subtract question time from session timer
      mcTimer.removeQuestion(id);
      setErrorMessage(null);
    }
    setPendingCancelType(null);
    setConfirmOpen(false);
    setConfirmMessage(null);
  }, [pendingCancelType, activeQuestion, activeQuestionIndex, activeMcQuestion, activeMcQuestionIndex, questions, mcQuestions, setQuestions, setActiveWrittenSavedSetId, setActiveQuestionIndex, setWrittenQuestionPresentedAtById, setAnswersByQuestionId, setImagesByQuestionId, setFeedbackByQuestionId, setMarkAppealByQuestionId, setMarkOverrideInputByQuestionId, setWrittenResponseEnteredAtById, setQuestionHistory, writtenTimer, setMcQuestions, setActiveMcSavedSetId, setActiveMcQuestionIndex, setMcQuestionPresentedAtById, setMcAnswersByQuestionId, setMcMarkAppealByQuestionId, setMcMarkOverrideInputByQuestionId, setMcAwardedMarksByQuestionId, setMcHistory, mcTimer, setErrorMessage]);

  // ── Topic / subtopic toggles ─────────────────────────────────────────────────
  const toggleTopic = useCallback((topic: Topic) => {
    setSelectedTopics((p) => p.includes(topic) ? p.filter((t) => t !== topic) : [...p, topic]);
  }, [setSelectedTopics]);

  const toggleMathMethodsSubtopic = useCallback((sub: MathMethodsSubtopic) => {
    setMathMethodsSubtopics((p) => p.includes(sub) ? p.filter((s) => s !== sub) : [...p, sub]);
  }, [setMathMethodsSubtopics]);

  const toggleSpecialistMathSubtopic = useCallback((sub: SpecialistMathSubtopic) => {
    setSpecialistMathSubtopics((p) => p.includes(sub) ? p.filter((s) => s !== sub) : [...p, sub]);
  }, [setSpecialistMathSubtopics]);

  const toggleChemistrySubtopic = useCallback((sub: ChemistrySubtopic) => {
    setChemistrySubtopics((p) => p.includes(sub) ? p.filter((s) => s !== sub) : [...p, sub]);
  }, [setChemistrySubtopics]);

  const togglePhysicalEducationSubtopic = useCallback((sub: PhysicalEducationSubtopic) => {
    setPhysicalEducationSubtopics((p) => p.includes(sub) ? p.filter((s) => s !== sub) : [...p, sub]);
  }, [setPhysicalEducationSubtopics]);

  // ── Subtopic / focus helpers ─────────────────────────────────────────────────
  function getSubtopicsForTopic(topic: Topic): string[] {
    switch (topic) {
      case "Mathematical Methods": return mathMethodsSubtopics;
      case "Specialist Mathematics": return specialistMathSubtopics;
      case "Chemistry": return chemistrySubtopics;
      case "Physical Education": return physicalEducationSubtopics;
      default: return [];
    }
  }

  function getSelectedSubtopics() {
    return Array.from(new Set([
      ...(selectedTopics.includes("Mathematical Methods") ? mathMethodsSubtopics : []),
      ...(selectedTopics.includes("Specialist Mathematics") ? specialistMathSubtopics : []),
      ...(selectedTopics.includes("Chemistry") ? chemistrySubtopics : []),
      ...(selectedTopics.includes("Physical Education") ? physicalEducationSubtopics : []),
    ]));
  }
  function getSelectedSubtopicInstructions() {
    const result: Record<string, string> = {};
    for (const sub of getSelectedSubtopics()) {
      const instr = subtopicInstructions[sub]?.trim();
      if (instr) result[sub] = instr;
    }
    return result;
  }
  function getCustomFocusArea() { const v = customFocusArea.trim(); return v.length > 0 ? v : undefined; }

  // ── History helpers ──────────────────────────────────────────────────────────
  function getWrittenAttemptSequence(qId: string) { return questionHistory.filter((e) => e.question.id === qId).length + 1; }
  function getMcAttemptSequence(qId: string) { return mcHistory.filter((e) => e.question.id === qId).length + 1; }

  function getMcAwardedMarks(qId: string, selectedAnswer: string, correctAnswer: string) {
    const ov = mcAwardedMarksByQuestionId[qId];
    return typeof ov === "number" && Number.isFinite(ov) ? Math.max(0, Math.min(1, ov)) : selectedAnswer === correctAnswer ? 1 : 0;
  }

  function getRecentSameTopicQuestionPrompts(mode: "written" | "multiple-choice") {
    const topicSet = new Set(selectedTopics);
    const seen = new Set<string>(); const prompts: string[] = [];
    for (const entry of (mode === "written" ? questionHistory : mcHistory)) {
      if (!topicSet.has(entry.question.topic as Topic)) continue;
      const p = entry.question.promptMarkdown.trim();
      if (!p || seen.has(p)) continue;
      seen.add(p); prompts.push(p);
      if (prompts.length >= 6) break;
    }
    return prompts;
  }

  function appendMcHistoryEntry(question: typeof activeMcQuestion, selectedAnswer: string, awardedMarks: number, attemptKind: McAttemptKind, responseEnteredAtMs?: number) {
    if (!question) return;
    const timing = mcTimer.getQuestionTiming(question.id);
    const responseAt = responseEnteredAtMs ?? Date.now();
    const now = Date.now();
    const entry: McHistoryEntry = {
      type: "multiple-choice", id: generateEntryId(), createdAt: new Date(now).toISOString(), lastModified: now,
      question, selectedAnswer, correct: awardedMarks >= 1, awardedMarks, maxMarks: 1,
      generationTelemetry: mcGenerationTelemetry ?? undefined,
      analytics: {
        attemptKind, attemptSequence: getMcAttemptSequence(question.id),
        answerCharacterCount: 0, answerWordCount: 0, usedImageUpload: false,
        responseLatencyMs: timing ? timing.timeUsedSeconds * 1000 : undefined,
        finalAnswerChangedAtMs: responseAt,
      },
    };
    setMcHistory((prev) => [entry, ...prev].slice(0, 200));
  }

  function updateLatestMcHistoryEntry(questionId: string, selectedAnswer: string, awardedMarks: number, responseEnteredAtMs?: number) {
    const now = Date.now();
    const responseAt = responseEnteredAtMs ?? now;
    setMcHistory((prev) => {
      const idx = prev.findIndex((e: McHistoryEntry) => e.question.id === questionId && (e.analytics?.attemptKind ?? "initial") === "initial");
      if (idx === -1) return prev;
      const entry = prev[idx];
      const next = [...prev];
      next[idx] = {
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
      return next;
    });
  }

  function appendWrittenHistoryEntry(question: typeof activeQuestion, response: ReturnType<typeof normalizeMarkResponse>, options?: { uploadedAnswerOverride?: string; attemptKind?: WrittenAttemptKind; markingLatencyMs?: number; responseEnteredAtMs?: number }) {
    if (!question) return;
    const uploadedAnswer = options?.uploadedAnswerOverride ?? (answersByQuestionId[question.id] ?? "");
    const timing = writtenTimer.getQuestionTiming(question.id);
    const now = Date.now();
    const entry: QuestionHistoryEntry = {
      id: generateEntryId(), createdAt: new Date(now).toISOString(), lastModified: now,
      question, uploadedAnswer, uploadedAnswerImage: imagesByQuestionId[question.id],
      workedSolutionMarkdown: response.workedSolutionMarkdown, markResponse: response,
      generationTelemetry: writtenGenerationTelemetry ?? undefined,
      analytics: {
        attemptKind: options?.attemptKind ?? "initial", attemptSequence: getWrittenAttemptSequence(question.id),
        answerCharacterCount: uploadedAnswer.length, answerWordCount: countWords(uploadedAnswer),
        usedImageUpload: Boolean(imagesByQuestionId[question.id]),
        responseLatencyMs: timing ? timing.timeUsedSeconds * 1000 : undefined,
        markingLatencyMs: options?.markingLatencyMs,
      },
    };
    setQuestionHistory((prev) => [entry, ...prev].slice(0, 200));
  }

  // ── Batch progress helpers ───────────────────────────────────────────────────

  function initBatchProgress(topics: Topic[], counts: number[]): BatchTopicProgress[] {
    return topics.map((topic, i) => ({
      topic,
      questionCount: counts[i],
      status: "waiting" as const,
      stage: undefined,
      message: undefined,
      errorMessage: undefined,
    }));
  }

  function setBatchEntryActive(idx: number) {
    setBatchProgress((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], status: "active", stage: "preparing", message: undefined, errorMessage: undefined };
      return next;
    });
    // Clear stream text at the start of each new topic call
    setStreamText("");
  }

  function setBatchEntryDone(idx: number) {
    setBatchProgress((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], status: "done", stage: "completed" };
      return next;
    });
  }

  function setBatchEntryError(idx: number, message: string) {
    setBatchProgress((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], status: "error", errorMessage: message };
      return next;
    });
  }

  // ── Generation ───────────────────────────────────────────────────────────────
  async function handleGenerateQuestions() {
    if (!canGenerate) return;
    startStopwatch();
    setErrorMessage(null);
    setLastFailedAction(null);
    setStreamText("");
    setGenerationStatus({ mode: "written", stage: "preparing", message: "Preparing generation request.", attempt: 1 });
    setIsGenerating(true);

    const counts = distributeQuestions(selectedTopics, questionCount);
    // Only show batch UI when more than one topic is selected
    const isMultiTopic = selectedTopics.length > 1;
    if (isMultiTopic) {
      setBatchProgress(initBatchProgress(selectedTopics, counts));
    } else {
      setBatchProgress([]);
    }

    try {
      let allQuestions: import("@/types").GeneratedQuestion[] = [];
      let totalTelemetry = { durationMs: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: 0, distinctnessAvg: 0, multiStepDepthAvg: 0 };
      const failedTopics: string[] = [];

      for (let i = 0; i < selectedTopics.length; i++) {
        const topic = selectedTopics[i];
        const count = counts[i];
        if (count === 0) {
          if (isMultiTopic) setBatchEntryDone(i);
          continue;
        }

        if (isMultiTopic) setBatchEntryActive(i);

        try {
          const response = await invoke<GenerateQuestionsResponse>("generate_questions", {
            request: {
              topics: [topic],
              difficulty,
              questionCount: count,
              averageMarksPerQuestion,
              model, apiKey, techMode,
              includeExamContext,
              subtopics: getSubtopicsForTopic(topic),
              subtopicInstructions: getSelectedSubtopicInstructions(),
              customFocusArea: getCustomFocusArea(),
              avoidSimilarQuestions,
              priorQuestionPrompts: avoidSimilarQuestions ? getRecentSameTopicQuestionPrompts("written") : [],
              aiDifficultyScalingEnabled,
              recentAverageScore,
              recentDifficulty: difficulty, // Use current as recent
            },
          });

          allQuestions = allQuestions.concat(response.questions);
          totalTelemetry.durationMs += response.durationMs || 0;
          totalTelemetry.promptTokens += response.promptTokens || 0;
          totalTelemetry.completionTokens += response.completionTokens || 0;
          totalTelemetry.totalTokens += response.totalTokens || 0;
          totalTelemetry.estimatedCostUsd += response.estimatedCostUsd || 0;
          totalTelemetry.distinctnessAvg += (response.distinctnessAvg || 0) * count;
          totalTelemetry.multiStepDepthAvg += (response.multiStepDepthAvg || 0) * count;

          // Record this generation for cost estimation
          addGenerationRecord({
            id: `gen-${topic}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            inputs: {
              topic,
              difficulty,
              questionCount: count,
              questionMode: "written",
              techMode,
              averageMarksPerQuestion,
              subtopics: getSubtopicsForTopic(topic),
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

          if (isMultiTopic) setBatchEntryDone(i);
        } catch (topicError) {
          failedTopics.push(topic);
          if (isMultiTopic) {
            setBatchEntryError(i, readBackendError(topicError));
          } else {
            throw topicError;
          }
          setErrorMessage(`Failed to generate questions for ${topic}: ${readBackendError(topicError)}`);
        }
      }

      if (allQuestions.length === 0) {
        throw new Error("No questions were generated. Please try again.");
      }

      if (allQuestions.length > 0) {
        totalTelemetry.distinctnessAvg /= allQuestions.length;
        totalTelemetry.multiStepDepthAvg /= allQuestions.length;
      }

      if (failedTopics.length > 0) {
        setErrorMessage(`Failed to generate questions for: ${failedTopics.join(", ")}. Other subjects loaded successfully.`);
      }

      // Re-assign sequential IDs across the merged batch so that per-question
      // state maps (answers, feedback, images) never collide between topics.
      const rekeyedQuestions = rekeyWritten(allQuestions);

      let finalQuestions = rekeyedQuestions;
      if (shuffleQuestions) {
        finalQuestions = [...rekeyedQuestions];
        for (let i = finalQuestions.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [finalQuestions[i], finalQuestions[j]] = [finalQuestions[j], finalQuestions[i]];
        }
      }

      setQuestions(finalQuestions);
      setWrittenTimerState(null); // Clear persisted timer for new session
      startTiming();
      setWrittenRawModelOutput("");
      setWrittenGenerationTelemetry(totalTelemetry);
      setLastSessionTelemetry(totalTelemetry);
      setShowWrittenRawOutput(false);
      setActiveQuestionIndex(0);
      setActiveWrittenSavedSetId(null);
      setWrittenQuestionPresentedAtById({});
      setWrittenResponseEnteredAtById({});
      setAnswersByQuestionId({});
      setImagesByQuestionId({});
      setFeedbackByQuestionId({});
    } catch (error) {
      resetStopwatch();
      setGenerationStatus({ mode: "written", stage: "failed", message: "Generation failed.", attempt: generationStatus?.attempt ?? 1 });
      setErrorMessage(readBackendError(error));
      setLastFailedAction("generate-written");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleGenerateMcQuestions() {
    if (!canGenerate) return;
    startStopwatch();
    setErrorMessage(null);
    setLastFailedAction(null);
    setStreamText("");
    setGenerationStatus({ mode: "multiple-choice", stage: "preparing", message: "Preparing generation request.", attempt: 1 });
    setIsGenerating(true);

    const counts = distributeQuestions(selectedTopics, questionCount);
    const isMultiTopic = selectedTopics.length > 1;
    if (isMultiTopic) {
      setBatchProgress(initBatchProgress(selectedTopics, counts));
    } else {
      setBatchProgress([]);
    }

    try {
      let allQuestions: import("@/types").McQuestion[] = [];
      let totalTelemetry = { durationMs: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: 0, distinctnessAvg: 0, multiStepDepthAvg: 0 };
      const failedTopics: string[] = [];

      for (let i = 0; i < selectedTopics.length; i++) {
        const topic = selectedTopics[i];
        const count = counts[i];
        if (count === 0) {
          if (isMultiTopic) setBatchEntryDone(i);
          continue;
        }

        if (isMultiTopic) setBatchEntryActive(i);

        try {
          const response = await invoke<GenerateMcQuestionsResponse>("generate_mc_questions", {
            request: {
              topics: [topic],
              difficulty,
              questionCount: count,
              model, apiKey, techMode,
              includeExamContext,
              subtopics: getSubtopicsForTopic(topic),
              subtopicInstructions: getSelectedSubtopicInstructions(),
              customFocusArea: getCustomFocusArea(),
              avoidSimilarQuestions,
              priorQuestionPrompts: avoidSimilarQuestions ? getRecentSameTopicQuestionPrompts("multiple-choice") : [],
              aiDifficultyScalingEnabled,
              recentAverageScore,
              recentDifficulty: difficulty,
            },
          });

          allQuestions = allQuestions.concat(response.questions);
          totalTelemetry.durationMs += response.durationMs || 0;
          totalTelemetry.promptTokens += response.promptTokens || 0;
          totalTelemetry.completionTokens += response.completionTokens || 0;
          totalTelemetry.totalTokens += response.totalTokens || 0;
          totalTelemetry.estimatedCostUsd += response.estimatedCostUsd || 0;
          totalTelemetry.distinctnessAvg += (response.distinctnessAvg || 0) * count;
          totalTelemetry.multiStepDepthAvg += (response.multiStepDepthAvg || 0) * count;

          // Record this generation for cost estimation
          addGenerationRecord({
            id: `gen-${topic}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            inputs: {
              topic,
              difficulty,
              questionCount: count,
              questionMode: "multiple-choice",
              techMode,
              averageMarksPerQuestion,
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

          if (isMultiTopic) setBatchEntryDone(i);
        } catch (topicError) {
          failedTopics.push(topic);
          if (isMultiTopic) {
            setBatchEntryError(i, readBackendError(topicError));
          } else {
            throw topicError;
          }
          setErrorMessage(`Failed to generate questions for ${topic}: ${readBackendError(topicError)}`);
        }
      }

      if (allQuestions.length === 0) {
        throw new Error("No questions were generated. Please try again.");
      }

      if (allQuestions.length > 0) {
        totalTelemetry.distinctnessAvg /= allQuestions.length;
        totalTelemetry.multiStepDepthAvg /= allQuestions.length;
      }

      if (failedTopics.length > 0) {
        setErrorMessage(`Failed to generate questions for: ${failedTopics.join(", ")}. Other subjects loaded successfully.`);
      }

      // Re-assign sequential IDs across the merged batch so that per-question
      // state maps (answers, feedback, images) never collide between topics.
      const rekeyedQuestions = rekeyMc(allQuestions);

      let finalQuestions = rekeyedQuestions;
      if (shuffleQuestions) {
        finalQuestions = [...rekeyedQuestions];
        for (let i = finalQuestions.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [finalQuestions[i], finalQuestions[j]] = [finalQuestions[j], finalQuestions[i]];
        }
      }

      setMcQuestions(finalQuestions);
      setMcTimerState(null); // Clear persisted timer for new session
      startTiming();
      setMcRawModelOutput("");
      setMcGenerationTelemetry(totalTelemetry);
      setLastSessionTelemetry(totalTelemetry);
      setShowMcRawOutput(false);
      setActiveMcQuestionIndex(0);
      setActiveMcSavedSetId(null);
      setMcQuestionPresentedAtById({});
      setMcAnswersByQuestionId({});
      setMcMarkAppealByQuestionId({});
      setMcMarkOverrideInputByQuestionId({});
      setMcAwardedMarksByQuestionId({});
    } catch (error) {
      resetStopwatch();
      setGenerationStatus({ mode: "multiple-choice", stage: "failed", message: "Generation failed.", attempt: generationStatus?.attempt ?? 1 });
      setErrorMessage(readBackendError(error));
      setLastFailedAction("generate-mc");
    } finally {
      setIsGenerating(false);
    }
  }

  // ── Marking ──────────────────────────────────────────────────────────────────
  async function handleSubmitForMarking() {
    if (!activeQuestion || !canSubmitAnswer) return;
    setErrorMessage(null); setIsMarking(true); setLastFailedAction(null);
    try {
      const responseEnteredAtMs = writtenResponseEnteredAtById[activeQuestion.id] ?? Date.now();
      const markStartedAt = Date.now();
      const rawResponse = await invoke<unknown>("mark_answer", {
        request: { question: activeQuestion, studentAnswer: activeQuestionAnswer, studentAnswerImageDataUrl: activeQuestionImage?.dataUrl, model: markModel, apiKey },
      });
      const markingLatencyMs = Date.now() - markStartedAt;
      const response = normalizeMarkResponse(rawResponse, activeQuestion.maxMarks);
      setFeedbackByQuestionId((prev) => ({ ...prev, [activeQuestion.id]: response }));
      setMarkOverrideInputByQuestionId((prev) => ({ ...prev, [activeQuestion.id]: String(response.achievedMarks) }));
      appendWrittenHistoryEntry(activeQuestion, response, { uploadedAnswerOverride: activeQuestionAnswer, attemptKind: "initial", markingLatencyMs, responseEnteredAtMs });
      writtenTimer.onQuestionAnswered(activeQuestion.id);
      useAppStore.getState().recordCompletion("written");
    } catch (error) { setErrorMessage(readBackendError(error)); setLastFailedAction("mark-written"); }
    finally { setIsMarking(false); }
  }
  submitRef.current = handleSubmitForMarking;

  async function handleArgueForMark() {
    if (!activeQuestion || !activeFeedback) return;
    const appealText = activeMarkAppeal.trim();
    if (!appealText) { setErrorMessage("Enter your argument before requesting a re-mark."); return; }
    if (!apiKey.trim() || !markModel.trim()) { setErrorMessage("Configure API key and model before requesting a re-mark."); return; }
    setErrorMessage(null); setIsMarking(true); setLastFailedAction(null);
    try {
      const responseEnteredAtMs = Date.now(); const markStartedAt = Date.now();
      const arguedAnswer = [activeQuestionAnswer, `Additional marking argument from student:\n${appealText}`].filter((p) => p.trim()).join("\n\n");
      const rawResponse = await invoke<unknown>("mark_answer", {
        request: { question: activeQuestion, studentAnswer: arguedAnswer, studentAnswerImageDataUrl: activeQuestionImage?.dataUrl, model: markModel, apiKey },
      });
      const response = normalizeMarkResponse(rawResponse, activeQuestion.maxMarks);
      setFeedbackByQuestionId((prev) => ({ ...prev, [activeQuestion.id]: response }));
      setMarkOverrideInputByQuestionId((prev) => ({ ...prev, [activeQuestion.id]: String(response.achievedMarks) }));
      appendWrittenHistoryEntry(activeQuestion, response, { uploadedAnswerOverride: activeQuestionAnswer, attemptKind: "appeal", markingLatencyMs: Date.now() - markStartedAt, responseEnteredAtMs });
    } catch (error) { setErrorMessage(readBackendError(error)); setLastFailedAction("mark-written"); }
    finally { setIsMarking(false); }
  }

  function handleOverrideMark() {
    if (!activeQuestion || !activeFeedback) return;
    const parsed = Number(activeOverrideInput);
    if (!Number.isFinite(parsed)) { setErrorMessage("Enter a whole number to override the mark."); return; }
    const clamped = Math.max(0, Math.min(activeFeedback.maxMarks, Math.round(parsed)));
    const updated = { ...activeFeedback, achievedMarks: clamped, scoreOutOf10: Math.round((clamped / activeFeedback.maxMarks) * 10), verdict: clamped === activeFeedback.maxMarks ? "Correct" : clamped === 0 ? "Incorrect" : "Overridden" };
    setErrorMessage(null);
    setFeedbackByQuestionId((prev) => ({ ...prev, [activeQuestion.id]: updated }));
    setMarkOverrideInputByQuestionId((prev) => ({ ...prev, [activeQuestion.id]: String(clamped) }));
    appendWrittenHistoryEntry(activeQuestion, updated, { uploadedAnswerOverride: activeQuestionAnswer, attemptKind: "override", responseEnteredAtMs: Date.now() });
  }

  function handleOverrideCriterion(idx: number, achievedMarks: number, rationale: string) {
    if (!activeQuestion || !activeFeedback) return;
    const nextScheme = activeFeedback.vcaaMarkingScheme.map((it, i) => i === idx ? { ...it, achievedMarks, rationale } : it);
    const totalAchieved = nextScheme.reduce((s, c) => s + (Number.isFinite(c.achievedMarks) ? c.achievedMarks : 0), 0);
    const totalMax = nextScheme.reduce((s, c) => s + (Number.isFinite(c.maxMarks) ? c.maxMarks : 0), 0) || activeFeedback.maxMarks;
    const nextFeedback = {
      ...activeFeedback,
      vcaaMarkingScheme: nextScheme,
      achievedMarks: totalAchieved,
      maxMarks: totalMax,
      scoreOutOf10: Math.round((totalAchieved / Math.max(1, totalMax)) * 10),
      verdict: totalAchieved === totalMax ? "Correct" : totalAchieved === 0 ? "Incorrect" : "Overridden",
    };
    setFeedbackByQuestionId((prev) => ({ ...prev, [activeQuestion.id]: nextFeedback }));
    setMarkOverrideInputByQuestionId((prev) => ({ ...prev, [activeQuestion.id]: String(nextFeedback.achievedMarks) }));
    appendWrittenHistoryEntry(activeQuestion, nextFeedback, { uploadedAnswerOverride: activeQuestionAnswer, attemptKind: "override", responseEnteredAtMs: Date.now() });
  }

  // ── MC answer / appeal / override ────────────────────────────────────────────
  function handleMcAnswer(selectedLabel: string) {
    if (!activeMcQuestion) return;
    const isExamMode = generationMode === "exam";
    const isCompletionLocked = showCompletionScreen;
    if (isReviewingCompletedSet) return;
    const existingAnswer = mcAnswersByQuestionId[activeMcQuestion.id];
    if (!isExamMode && existingAnswer) return;
    if (isExamMode && isCompletionLocked) return;
    if (existingAnswer === selectedLabel) return;
    const responseEnteredAtMs = Date.now();
    const awardedMarks = selectedLabel === activeMcQuestion.correctAnswer ? 1 : 0;
    setMcAnswersByQuestionId((prev) => ({ ...prev, [activeMcQuestion.id]: selectedLabel }));
    setMcAwardedMarksByQuestionId((prev) => ({ ...prev, [activeMcQuestion.id]: awardedMarks }));
    setMcMarkOverrideInputByQuestionId((prev) => ({ ...prev, [activeMcQuestion.id]: String(awardedMarks) }));
    if (existingAnswer) {
      updateLatestMcHistoryEntry(activeMcQuestion.id, selectedLabel, awardedMarks, responseEnteredAtMs);
    } else {
      appendMcHistoryEntry(activeMcQuestion, selectedLabel, awardedMarks, "initial", responseEnteredAtMs);
      mcTimer.onQuestionAnswered(activeMcQuestion.id);
      useAppStore.getState().recordCompletion("multiple-choice");
    }
  }

  function buildMcMarkingPrompt(question: typeof activeMcQuestion) {
    if (!question) return "";
    return `${question.promptMarkdown}\n\nOptions:\n${question.options.map((o: McOption) => `${o.label}. ${o.text}`).join("\n")}`;
  }

  async function handleArgueForMcMark() {
    if (!activeMcQuestion || !activeMcAnswer) return;
    const appealText = activeMcMarkAppeal.trim();
    if (!appealText) { setErrorMessage("Enter your argument before requesting a re-mark."); return; }
    if (!apiKey.trim() || !markModel.trim()) { setErrorMessage("Configure API key and model before requesting a re-mark."); return; }
    setErrorMessage(null); setIsMarking(true);
    try {
      const responseEnteredAtMs = Date.now();
      const selectedOptionText = activeMcQuestion.options.find((o: McOption) => o.label === activeMcAnswer)?.text ?? "";
      const arguedAnswer = [`Student selected option ${activeMcAnswer}: ${selectedOptionText}`, `Student argument for marks:\n${appealText}`].filter((p) => p.trim()).join("\n\n");
      const rawResponse = await invoke<unknown>("mark_answer", {
        request: {
          question: { id: activeMcQuestion.id, topic: activeMcQuestion.topic, subtopic: activeMcQuestion.subtopic, promptMarkdown: buildMcMarkingPrompt(activeMcQuestion), maxMarks: 1, techAllowed: Boolean(activeMcQuestion.techAllowed) },
          studentAnswer: arguedAnswer, model: markModel, apiKey,
        },
      });
      const response = normalizeMarkResponse(rawResponse, 1);
      const awardedMarks = Math.max(0, Math.min(1, response.achievedMarks));
      setMcAwardedMarksByQuestionId((prev) => ({ ...prev, [activeMcQuestion.id]: awardedMarks }));
      setMcMarkOverrideInputByQuestionId((prev) => ({ ...prev, [activeMcQuestion.id]: String(awardedMarks) }));
      appendMcHistoryEntry(activeMcQuestion, activeMcAnswer, awardedMarks, "appeal", responseEnteredAtMs);
    } catch (error) { setErrorMessage(readBackendError(error)); }
    finally { setIsMarking(false); }
  }

  function handleOverrideMcMark() {
    if (!activeMcQuestion || !activeMcAnswer) return;
    const parsed = Number(activeMcOverrideInput);
    if (!Number.isFinite(parsed)) { setErrorMessage("Enter a whole number to override the mark."); return; }
    const clamped = Math.max(0, Math.min(1, Math.round(parsed)));
    setErrorMessage(null);
    setMcAwardedMarksByQuestionId((prev) => ({ ...prev, [activeMcQuestion.id]: clamped }));
    setMcMarkOverrideInputByQuestionId((prev) => ({ ...prev, [activeMcQuestion.id]: String(clamped) }));
    if (clamped === 1) {
      const updated = [...mcQuestions];
      updated[activeMcQuestionIndex] = { ...updated[activeMcQuestionIndex], correctAnswer: activeMcAnswer };
      setMcQuestions(updated);
    }
    appendMcHistoryEntry(activeMcQuestion, activeMcAnswer, clamped, "override", Date.now());
  }

  // ── Start over ───────────────────────────────────────────────────────────────
  const handleStartOver = useCallback(() => {
    if (questionMode === "written" && questions.length > 0) saveCurrentSet();
    else if (questionMode === "multiple-choice" && mcQuestions.length > 0) saveCurrentSet();
    resetStopwatch();
    setBatchProgress([]);
    setGenerationStatus(null); // Reset status so summary shows
    setGenerationStartedAt(null);
    setQuestions([]); setWrittenRawModelOutput(""); setWrittenGenerationTelemetry(null); setShowWrittenRawOutput(false);
    setActiveQuestionIndex(0); setActiveWrittenSavedSetId(null); setWrittenQuestionPresentedAtById({});
    setAnswersByQuestionId({}); setImagesByQuestionId({}); setFeedbackByQuestionId({});
    setWrittenResponseEnteredAtById({}); setMarkAppealByQuestionId({}); setMarkOverrideInputByQuestionId({});
    setMcQuestions([]); setMcRawModelOutput(""); setMcGenerationTelemetry(null); setShowMcRawOutput(false);
    setActiveMcQuestionIndex(0); setActiveMcSavedSetId(null); setMcQuestionPresentedAtById({});
    setMcAnswersByQuestionId({}); setMcMarkAppealByQuestionId({}); setMcMarkOverrideInputByQuestionId({}); setMcAwardedMarksByQuestionId({});
    setExamRecordSaved(false);
    setWrittenTimerState(null);
    setMcTimerState(null);
  }, [questionMode, questions.length, mcQuestions.length, activeWrittenSavedSetId, activeMcSavedSetId, saveCurrentSet]);
  startOverRef.current = handleStartOver;

  useEffect(() => {
    if (generationMode !== "exam" || !showCompletionScreen || !isSetComplete || examRecordSaved) return;

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const timeUsedSeconds = Math.max(0, Math.min(elapsedSeconds, examTimeLimitMinutes * 60));

    if (questionMode === "written") {
      const totalScore = questions.reduce((s, q) => s + (feedbackByQuestionId[q.id]?.achievedMarks ?? 0), 0);
      const totalMax = questions.reduce((s, q) => s + (feedbackByQuestionId[q.id]?.maxMarks ?? q.maxMarks), 0);
      const questionResults: ExamQuestionResult[] = questions.map((q) => {
        const fb = feedbackByQuestionId[q.id];
        return {
          questionId: q.id,
          topic: q.topic,
          subtopic: q.subtopic,
          promptMarkdown: q.promptMarkdown,
          achievedMarks: fb?.achievedMarks ?? 0,
          maxMarks: fb?.maxMarks ?? q.maxMarks,
          correct: Boolean(fb && fb.achievedMarks >= fb.maxMarks),
        };
      });
      const record: ExamRecord = {
        id: `exam-record-${now}`,
        createdAt: nowIso,
        topic: selectedTopics.length > 1 ? "Mixed" : (selectedTopics[0] ?? "Mixed"),
        difficulty,
        questionMode: "written",
        techMode,
        questionCount: questions.length,
        timeUsedSeconds,
        totalScore,
        totalMax,
        questionResults,
      };
      addExamRecord(record);
      setExamRecordSaved(true);
      return;
    }

    const totalScore = mcQuestions.reduce((s, q) => s + getMcAwardedMarks(q.id, mcAnswersByQuestionId[q.id] ?? "", q.correctAnswer), 0);
    const questionResults: ExamQuestionResult[] = mcQuestions.map((q) => ({
      questionId: q.id,
      topic: q.topic,
      subtopic: q.subtopic,
      promptMarkdown: q.promptMarkdown,
      achievedMarks: getMcAwardedMarks(q.id, mcAnswersByQuestionId[q.id] ?? "", q.correctAnswer),
      maxMarks: 1,
      correct: (mcAnswersByQuestionId[q.id] ?? "") === q.correctAnswer,
      selectedAnswer: mcAnswersByQuestionId[q.id],
      correctAnswer: q.correctAnswer,
    }));
    const record: ExamRecord = {
      id: `exam-record-${now}`,
      createdAt: nowIso,
      topic: selectedTopics.length > 1 ? "Mixed" : (selectedTopics[0] ?? "Mixed"),
      difficulty,
      questionMode: "multiple-choice",
      techMode,
      questionCount: mcQuestions.length,
      timeUsedSeconds,
      totalScore,
      totalMax: mcQuestions.length,
      questionResults,
    };
    addExamRecord(record);
    setExamRecordSaved(true);
  }, [
    generationMode,
    showCompletionScreen,
    isSetComplete,
    examRecordSaved,
    elapsedSeconds,
    examTimeLimitMinutes,
    questionMode,
    questions,
    feedbackByQuestionId,
    mcQuestions,
    mcAnswersByQuestionId,
    selectedTopics,
    difficulty,
    techMode,
    addExamRecord,
  ]);

  // ── Image drop ───────────────────────────────────────────────────────────────
  const handleDropDropzone = useCallback(async (acceptedFiles: File[]) => {
    if (!activeQuestion || acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    try {
      const dataUrl = await fileToDataUrl(file);
      setErrorMessage(null);
      setImagesByQuestionId((prev) => ({ ...prev, [activeQuestion.id]: { name: file.name, dataUrl } }));
      setWrittenResponseEnteredAtById((prev) => {
        if (prev[activeQuestion.id] !== undefined) return prev;
        return { ...prev, [activeQuestion.id]: Date.now() };
      });
    } catch { setErrorMessage("Could not read image file. Try a different file."); }
  }, [activeQuestion, setImagesByQuestionId, setWrittenResponseEnteredAtById]);

  // ── Memoized per-question callbacks ──────────────────────────────────────
  const handleAnswerChange = useCallback((value: string) => {
    if (!activeQuestion) return;
    setAnswersByQuestionId((prev: Record<string, string>) => ({ ...prev, [activeQuestion.id]: value }));
    if (value.trim().length > 0) {
      setWrittenResponseEnteredAtById((prev) => {
        if (prev[activeQuestion.id] !== undefined) return prev;
        return { ...prev, [activeQuestion.id]: Date.now() };
      });
    }
  }, [activeQuestion, setAnswersByQuestionId, setWrittenResponseEnteredAtById]);

  const handleImageRemove = useCallback(() => {
    if (!activeQuestion) return;
    setImagesByQuestionId((prev) => ({ ...prev, [activeQuestion.id]: undefined }));
  }, [activeQuestion, setImagesByQuestionId]);

  const handleAppealChange = useCallback((v: string) => {
    if (!activeQuestion) return;
    setMarkAppealByQuestionId((p) => ({ ...p, [activeQuestion.id]: v }));
  }, [activeQuestion]);

  const handleOverrideInputChange = useCallback((v: string) => {
    if (!activeQuestion) return;
    setMarkOverrideInputByQuestionId((p) => ({ ...p, [activeQuestion.id]: v }));
  }, [activeQuestion]);

  const handleMcAppealChange = useCallback((v: string) => {
    if (!activeMcQuestion) return;
    setMcMarkAppealByQuestionId((p) => ({ ...p, [activeMcQuestion.id]: v }));
  }, [activeMcQuestion]);

  const handleMcOverrideInputChange = useCallback((v: string) => {
    if (!activeMcQuestion) return;
    setMcMarkOverrideInputByQuestionId((p) => ({ ...p, [activeMcQuestion.id]: v }));
  }, [activeMcQuestion]);


  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full w-full flex flex-col gap-6 animate-in fade-in duration-500">

      {errorMessage && (
        <div role="alert" aria-live="assertive" className="bg-destructive/15 border border-destructive/30 text-destructive px-5 py-4 rounded-xl text-sm flex items-center gap-3 shadow-sm">
          <XCircle className="w-5 h-5 shrink-0" />
          <p className="font-medium flex-1">{errorMessage}</p>
          {lastFailedAction && (
            <button
              type="button"
              onClick={() => {
                if (lastFailedAction === "generate-written") handleGenerateQuestions();
                else if (lastFailedAction === "generate-mc") handleGenerateMcQuestions();
                else if (lastFailedAction === "mark-written") handleSubmitForMarking();
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
          questionMode={questionMode} onSetQuestionMode={setQuestionMode}
          generationMode={generationMode} onSetGenerationMode={setGenerationMode}
          examTimeLimitMinutes={examTimeLimitMinutes} onSetExamTimeLimitMinutes={setExamTimeLimitMinutes}
          selectedTopics={selectedTopics} onToggleTopic={toggleTopic}
          mathMethodsSubtopics={mathMethodsSubtopics} onToggleMathMethodsSubtopic={toggleMathMethodsSubtopic}
          specialistMathSubtopics={specialistMathSubtopics} onToggleSpecialistMathSubtopic={toggleSpecialistMathSubtopic}
          chemistrySubtopics={chemistrySubtopics} onToggleChemistrySubtopic={toggleChemistrySubtopic}
          physicalEducationSubtopics={physicalEducationSubtopics} onTogglePhysicalEducationSubtopic={togglePhysicalEducationSubtopic}
          techMode={techMode} onSetTechMode={setTechMode}
          customFocusArea={customFocusArea} onSetCustomFocusArea={setCustomFocusArea}
          difficulty={difficulty} onSetDifficulty={setDifficulty}
          questionCount={questionCount} onSetQuestionCount={setQuestionCount}
          averageMarksPerQuestion={averageMarksPerQuestion} onSetAverageMarksPerQuestion={setAverageMarksPerQuestion}
          avoidSimilarQuestions={avoidSimilarQuestions} onSetAvoidSimilarQuestions={setAvoidSimilarQuestions}
          shuffleQuestions={shuffleQuestions} onSetShuffleQuestions={setShuffleQuestions}
          aiDifficultyScalingEnabled={aiDifficultyScalingEnabled} onSetAiDifficultyScalingEnabled={setAiDifficultyScalingEnabled}
          difficultyThresholds={difficultyThresholds} onSetDifficultyThresholds={setDifficultyThresholds}
          hasApiKey={Boolean(apiKey)}
          canGenerate={canGenerate}
          isGenerating={isGenerating}
          isPaused={activeTimer.isPaused}
          onTogglePause={togglePause}
          generationStatus={generationStatus}
          generationStartedAt={generationStartedAt}
          formattedElapsedTime={formattedElapsedTime}
          onGenerate={questionMode === "written" ? handleGenerateQuestions : handleGenerateMcQuestions}
          includeExamContext={includeExamContext}
          lastGenerationTelemetry={lastSessionTelemetry}
          streamText={streamText}
          batchProgress={batchProgress}
        />

        /* ── Completion ── */
      ) : showCompletionScreen && isSetComplete ? (
        <CompletionScreen
          questionMode={questionMode}
          difficulty={difficulty}
          accuracyPercent={completionAccuracyPercent ?? 0}
          formattedElapsedTime={completionFormattedElapsedTime}
          completedCount={questionMode === "written" ? completedCount : mcCompletedCount}
          totalCount={questionMode === "written" ? questions.length : mcQuestions.length}
          onReview={() => setShowCompletionScreen(false)}
          onStartOver={handleStartOver}
          perQuestionTiming={questionMode === "written"
            ? questions.map(q => {
              const t = writtenTimer.getQuestionTiming(q.id);
              return t ? {
                questionId: q.id,
                timeUsedSeconds: t.timeUsedSeconds,
                timeLimitSeconds: t.timeLimitSeconds,
                finishedEarly: t.finishedEarly,
              } : { questionId: q.id, timeUsedSeconds: 0, timeLimitSeconds: 0, finishedEarly: false };
            })
            : mcQuestions.map(q => {
              const t = mcTimer.getQuestionTiming(q.id);
              return t ? {
                questionId: q.id,
                timeUsedSeconds: t.timeUsedSeconds,
                timeLimitSeconds: t.timeLimitSeconds,
                finishedEarly: t.finishedEarly,
              } : { questionId: q.id, timeUsedSeconds: 0, timeLimitSeconds: 0, finishedEarly: false };
            })
          }
          parTimeSeconds={questionMode === "written" ? writtenTimer.parTimeSeconds : mcTimer.parTimeSeconds}
          totalBankedSeconds={questionMode === "written" ? writtenTimer.bankedSeconds : mcTimer.bankedSeconds}
        />

        /* ── Written Question View ── */
      ) : questionMode === "written" ? (
        <div className="flex min-h-full flex-col animate-in slide-in-from-bottom-4 duration-500">
          <WrittenSessionHeader
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
            getDifficultyBadgeClasses={getDifficultyBadgeClasses}
            onPrev={() => setActiveQuestionIndex(Math.max(0, activeQuestionIndex - 1))}
            onNext={handleNextWrittenQuestion}
            onDelete={handleCancelWrittenQuestion}
            onExit={handleStartOver}
            generationMode={generationMode}
            formattedCountdownTime={formattedCountdownTime}
            remainingSeconds={remainingSeconds}
            formattedElapsedTime={formattedElapsedTime}
          />
          {showKeyboardHint && (
            <div className="flex items-center justify-center gap-3 px-4 py-1.5 bg-muted/40 border-b text-[11px] text-muted-foreground">
              <span>Tip: Use <kbd className="px-1 py-0.5 rounded bg-background border text-[10px] font-mono">←</kbd> <kbd className="px-1 py-0.5 rounded bg-background border text-[10px] font-mono">→</kbd> to navigate, <kbd className="px-1 py-0.5 rounded bg-background border text-[10px] font-mono">Ctrl+Enter</kbd> to submit</span>
              <button onClick={dismissKeyboardHint} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Dismiss</button>
            </div>
          )}
          {activeQuestion && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
              <div className="max-w-4xl mx-auto flex flex-col space-y-4 pb-10">
                {generationMode === "exam" && remainingSeconds > 0 && remainingSeconds <= 120 && (
                  <div className="rounded-lg border border-amber-300/70 bg-amber-50/80 text-amber-900 px-4 py-2 text-sm font-semibold">
                    Time warning: {formattedCountdownTime} remaining.
                  </div>
                )}
                <WrittenQuestionCard
                  promptMarkdown={activeQuestion.promptMarkdown}
                  canShowRawOutput={canShowWrittenRawOutput}
                  showRawOutput={showWrittenRawOutput}
                  rawModelOutput={writtenRawModelOutput}
                  onToggleRawOutput={() => setShowWrittenRawOutput((p) => !p)}
                  isQuestionExpired={writtenTimer.isQuestionExpired}
                  generationMode={generationMode}
                  isSubmitDisabled={writtenTimer.isQuestionExpired && generationMode === "exam"}
                />
                {!activeFeedback ? (
                  <WrittenAnswerCard
                    questionId={activeQuestion.id}
                    answer={activeQuestionAnswer}
                    image={activeQuestionImage}
                    isMarking={isMarking}
                    canSubmit={canSubmitAnswer}
                    onAnswerChange={handleAnswerChange}
                    onImageDrop={handleDropDropzone}
                    onImageRemove={handleImageRemove}
                    onSubmit={handleSubmitForMarking}
                  />
                ) : (
                  <WrittenFeedbackPanel
                    questionId={activeQuestion.id}
                    answer={activeQuestionAnswer}
                    image={activeQuestionImage}
                    feedback={activeFeedback}
                    appealText={activeMarkAppeal}
                    overrideInput={activeOverrideInput}
                    isMarking={isMarking}
                    onAppealChange={handleAppealChange}
                    onOverrideInputChange={handleOverrideInputChange}
                    onArgueForMark={handleArgueForMark}
                    onApplyOverride={handleOverrideMark}
                    onCriterionChange={handleOverrideCriterion}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        /* ── MC Question View ── */
      ) : (
        <div className="flex flex-col h-full animate-in slide-in-from-bottom-4 duration-500">
          <McSessionHeader
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
            getDifficultyBadgeClasses={getDifficultyBadgeClasses}
            onPrev={() => setActiveMcQuestionIndex(Math.max(0, activeMcQuestionIndex - 1))}
            onNext={handleNextMcQuestion}
            onDelete={handleCancelMcQuestion}
            onExit={handleStartOver}
            generationMode={generationMode}
            formattedCountdownTime={formattedCountdownTime}
            remainingSeconds={remainingSeconds}
            formattedElapsedTime={formattedElapsedTime}
          />
          {showKeyboardHint && (
            <div className="flex items-center justify-center gap-3 px-4 py-1.5 bg-muted/40 border-b text-[11px] text-muted-foreground">
              <span>Tip: Use <kbd className="px-1 py-0.5 rounded bg-background border text-[10px] font-mono">←</kbd> <kbd className="px-1 py-0.5 rounded bg-background border text-[10px] font-mono">→</kbd> to navigate</span>
              <button onClick={dismissKeyboardHint} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Dismiss</button>
            </div>
          )}
          {activeMcQuestion && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
              <div className="max-w-4xl mx-auto flex flex-col space-y-4 pb-10">
                {generationMode === "exam" && remainingSeconds > 0 && remainingSeconds <= 120 && (
                  <div className="rounded-lg border border-amber-300/70 bg-amber-50/80 text-amber-900 px-4 py-2 text-sm font-semibold">
                    Time warning: {formattedCountdownTime} remaining.
                  </div>
                )}
                <McQuestionCard
                  promptMarkdown={activeMcQuestion.promptMarkdown}
                  canShowRawOutput={canShowMcRawOutput}
                  showRawOutput={showMcRawOutput}
                  rawModelOutput={mcRawModelOutput}
                  onToggleRawOutput={() => setShowMcRawOutput((p) => !p)}
                  isQuestionExpired={mcTimer.isQuestionExpired}
                  generationMode={generationMode}
                  isSubmitDisabled={mcTimer.isQuestionExpired && generationMode === "exam"}
                />
                {countWords(activeMcQuestion.explanationMarkdown) > MC_MAX_EXPLANATION_WORDS && (
                  <div className="bg-yellow-100 text-yellow-900 border border-yellow-300 rounded-lg px-4 py-2 mb-2 text-sm">
                    <strong>Warning:</strong> Explanation is {countWords(activeMcQuestion.explanationMarkdown)} words (max {MC_MAX_EXPLANATION_WORDS}).
                    This may be rejected by the backend.
                  </div>
                )}
                <McAnswerPanel
                  questionId={activeMcQuestion.id}
                  options={activeMcQuestion.options}
                  correctAnswer={activeMcQuestion.correctAnswer}
                  explanationMarkdown={activeMcQuestion.explanationMarkdown}
                  selectedAnswer={activeMcAnswer}
                  awardedMarks={activeMcAwardedMarks}
                  appealText={activeMcMarkAppeal}
                  overrideInput={activeMcOverrideInput}
                  isMarking={isMarking}
                  hideCorrectAnswer={generationMode === "exam" && !isReviewingCompletedSet}
                  onSelectAnswer={handleMcAnswer}
                  onAppealChange={handleMcAppealChange}
                  onOverrideInputChange={handleMcOverrideInputChange}
                  onArgueForMark={handleArgueForMcMark}
                  onApplyOverride={handleOverrideMcMark}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Keyboard shortcut hint ── */}
      {isInSession && showKeyboardHint && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 rounded-full bg-foreground/90 text-background text-[11px] font-medium shadow-lg backdrop-blur-sm">
          <span>Tip: Use</span>
          <kbd className="px-1.5 py-0.5 rounded bg-background/20 text-[10px] font-mono">←</kbd>
          <kbd className="px-1.5 py-0.5 rounded bg-background/20 text-[10px] font-mono">→</kbd>
          <span>to navigate,</span>
          <kbd className="px-1.5 py-0.5 rounded bg-background/20 text-[10px] font-mono">Esc</kbd>
          <span>to exit</span>
          <button
            type="button"
            onClick={() => {
              setShowKeyboardHint(false);
              try { localStorage.setItem("keyboard-hint-dismissed", "1"); } catch {}
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
        onCancel={() => { setConfirmOpen(false); setPendingCancelType(null); setConfirmMessage(null); }}
      />
    </div>
  );
}