import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { XCircle } from "lucide-react";
import {
  useAppContext,
  useAppPreferences,
  useAppSettings,
  useMultipleChoiceSession,
  useWrittenSession,
} from "@/AppContext";
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

// ─── Stopwatch persistence keys ───────────────────────────────────────────────
const LS_STOPWATCH_STARTED_KEY = "generator_stopwatch_startedAt";
const LS_STOPWATCH_FINISHED_KEY = "generator_stopwatch_finishedAt";

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
  const [sessionFinishedAt, setSessionFinishedAt] = useState<number | null>(null);
  const [showCompletionScreen, setShowCompletionScreen] = useState(false);
  const [showWrittenRawOutput, setShowWrittenRawOutput] = useState(false);
  const [showMcRawOutput, setShowMcRawOutput] = useState(false);
  const [customFocusArea, setCustomFocusArea] = useState("");

  const [markAppealByQuestionId, setMarkAppealByQuestionId] = useState<Record<string, string>>({});
  const [markOverrideInputByQuestionId, setMarkOverrideInputByQuestionId] = useState<Record<string, string>>({});
  const [mcMarkAppealByQuestionId, setMcMarkAppealByQuestionId] = useState<Record<string, string>>({});
  const [mcMarkOverrideInputByQuestionId, setMcMarkOverrideInputByQuestionId] = useState<Record<string, string>>({});
  const [mcAwardedMarksByQuestionId, setMcAwardedMarksByQuestionId] = useState<Record<string, number>>({});
  const [writtenResponseEnteredAtById, setWrittenResponseEnteredAtById] = useState<Record<string, number>>({});

  // Per-topic batch progress — drives the multi-topic timeline in SetupPanel.
  // Empty when only one topic is selected (single-call path shows normal timeline).
  const [batchProgress, setBatchProgress] = useState<BatchTopicProgress[]>([]);

  // ── Context ─────────────────────────────────────────────────────────────────
  const { apiKey, model, markingModel, useSeparateMarkingModel, imageMarkingModel, useSeparateImageMarkingModel, debugMode } = useAppSettings();
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
    maxMarksPerQuestion, setMaxMarksPerQuestion,
    questionMode, setQuestionMode,
    subtopicInstructions,
  } = useAppPreferences();

  const {
    questions, setQuestions,
    activeQuestionIndex, setActiveQuestionIndex,
    writtenQuestionPresentedAtById, setWrittenQuestionPresentedAtById,
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
    mcQuestionPresentedAtById, setMcQuestionPresentedAtById,
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
  } = useAppContext();

  const [lastFailedAction, setLastFailedAction] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [pendingCancelType, setPendingCancelType] = useState<null | "written" | "mc">(null);

  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [, setNow] = useState(Date.now());

  const [streamText, setStreamText] = useState("");

  const [lastSessionTelemetry, setLastSessionTelemetry] = useState<
    import("@/types").GenerationTelemetry | null
  >(null);

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

  const lastWrittenCompletedCountRef = useRef(completedCount);
  const lastMcCompletedCountRef = useRef(mcCompletedCount);

  const isWrittenSetComplete = questionMode === "written" && questions.length > 0 && completedCount === questions.length;
  const isMcSetComplete = questionMode === "multiple-choice" && mcQuestions.length > 0 && mcCompletedCount === mcQuestions.length;
  const isSetComplete = isWrittenSetComplete || isMcSetComplete;
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

  const elapsedSeconds = generationStartedAt === null
    ? 0
    : Math.max(0, Math.floor(((sessionFinishedAt ?? Date.now()) - generationStartedAt) / 1000));

  const formattedElapsedTime = useMemo(() => {
    const h = Math.floor(elapsedSeconds / 3600);
    const m = Math.floor((elapsedSeconds % 3600) / 60);
    const s = elapsedSeconds % 60;
    if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [elapsedSeconds]);

  // ── Effects ──────────────────────────────────────────────────────────────────
  useEffect(() => { setShowCompletionScreen(false); }, [completionSetKey]);
  useEffect(() => { setLastSavedAt(null); }, [activeWrittenSavedSetId, activeMcSavedSetId]);

  useEffect(() => {
    const prev = lastWrittenCompletedCountRef.current;
    if (questionMode === "written" && activeWrittenSavedSetId && questions.length > 0 && completedCount > prev) saveCurrentSet();
    lastWrittenCompletedCountRef.current = completedCount;
  }, [activeWrittenSavedSetId, completedCount, questionMode, questions.length, saveCurrentSet]);

  useEffect(() => {
    const prev = lastMcCompletedCountRef.current;
    if (questionMode === "multiple-choice" && activeMcSavedSetId && mcQuestions.length > 0 && mcCompletedCount > prev) saveCurrentSet();
    lastMcCompletedCountRef.current = mcCompletedCount;
  }, [activeMcSavedSetId, mcCompletedCount, mcQuestions.length, questionMode, saveCurrentSet]);

  useEffect(() => {
    if (!activeQuestion) return;
    setWrittenQuestionPresentedAtById((prev) => {
      if (prev[activeQuestion.id] !== undefined) return prev;
      return { ...prev, [activeQuestion.id]: Date.now() };
    });
  }, [activeQuestion, setWrittenQuestionPresentedAtById]);

  useEffect(() => {
    if (!activeMcQuestion) return;
    setMcQuestionPresentedAtById((prev) => {
      if (prev[activeMcQuestion.id] !== undefined) return prev;
      return { ...prev, [activeMcQuestion.id]: Date.now() };
    });
  }, [activeMcQuestion, setMcQuestionPresentedAtById]);

  // ── Stopwatch ────────────────────────────────────────────────────────────────
  function startStopwatch() {
    const now = Date.now();
    localStorage.setItem(LS_STOPWATCH_STARTED_KEY, String(now));
    localStorage.removeItem(LS_STOPWATCH_FINISHED_KEY);
    setGenerationStartedAt(now);
    setSessionFinishedAt(null);
  }

  function resetStopwatch() {
    localStorage.removeItem(LS_STOPWATCH_STARTED_KEY);
    localStorage.removeItem(LS_STOPWATCH_FINISHED_KEY);
    setGenerationStartedAt(null);
    setSessionFinishedAt(null);
  }

  useEffect(() => {
    if (generationStartedAt !== null) return;
    const storedStart = localStorage.getItem(LS_STOPWATCH_STARTED_KEY);
    const storedFinish = localStorage.getItem(LS_STOPWATCH_FINISHED_KEY);
    if (storedStart) {
      const parsed = Number(storedStart);
      if (Number.isFinite(parsed) && parsed > 0) setGenerationStartedAt(parsed);
    }
    if (storedFinish) {
      const parsed = Number(storedFinish);
      if (Number.isFinite(parsed) && parsed > 0) setSessionFinishedAt(parsed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (generationStartedAt !== null) localStorage.setItem(LS_STOPWATCH_STARTED_KEY, String(generationStartedAt));
  }, [generationStartedAt]);

  useEffect(() => {
    if (sessionFinishedAt !== null) localStorage.setItem(LS_STOPWATCH_FINISHED_KEY, String(sessionFinishedAt));
  }, [sessionFinishedAt]);

  useEffect(() => {
    if (generationStartedAt === null || sessionFinishedAt !== null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [generationStartedAt, sessionFinishedAt]);

  useEffect(() => {
    if (generationStartedAt === null || sessionFinishedAt !== null) return;
    function onVisibilityChange() { if (!document.hidden) setNow(Date.now()); }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [generationStartedAt, sessionFinishedAt]);

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
  }).catch(() => {});

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
  }).catch(() => {});

  return () => {
    cancelled = true;
    unlisten?.();
  };
}, [setGenerationStatus]);

  // ── Navigation ───────────────────────────────────────────────────────────────
  function handleNextWrittenQuestion() {
    if (!canAdvanceWritten) return;
    if (isAtLastWrittenQuestion) { setSessionFinishedAt(Date.now()); setShowCompletionScreen(true); return; }
    setActiveQuestionIndex(Math.min(questions.length - 1, activeQuestionIndex + 1));
  }
  function handleNextMcQuestion() {
    if (!canAdvanceMc) return;
    if (isAtLastMcQuestion) { setSessionFinishedAt(Date.now()); setShowCompletionScreen(true); return; }
    setActiveMcQuestionIndex(Math.min(mcQuestions.length - 1, activeMcQuestionIndex + 1));
  }

  // ── Cancel question ──────────────────────────────────────────────────────────
  function removeKey<T>(record: Record<string, T>, key: string) {
    const next = { ...record }; delete next[key]; return next;
  }

  function handleCancelWrittenQuestion() {
    if (!activeQuestion) return;
    setConfirmMessage(`Remove question ${activeQuestionIndex + 1} ("${activeQuestion.topic}")? It will be taken out of your current set.`);
    setPendingCancelType("written");
    setConfirmOpen(true);
  }

  function handleCancelMcQuestion() {
    if (!activeMcQuestion) return;
    setConfirmMessage(`Remove question ${activeMcQuestionIndex + 1} ("${activeMcQuestion.topic}")? It will be taken out of your current set.`);
    setPendingCancelType("mc");
    setConfirmOpen(true);
  }

  function performConfirmedCancel() {
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
      setErrorMessage(null);
    }
    setPendingCancelType(null);
    setConfirmOpen(false);
    setConfirmMessage(null);
  }

  // ── Topic / subtopic toggles ─────────────────────────────────────────────────
  function toggleTopic(topic: Topic) { setSelectedTopics((p) => p.includes(topic) ? p.filter((t) => t !== topic) : [...p, topic]); }
  function toggleMathMethodsSubtopic(sub: MathMethodsSubtopic) { setMathMethodsSubtopics((p) => p.includes(sub) ? p.filter((s) => s !== sub) : [...p, sub]); }
  function toggleSpecialistMathSubtopic(sub: SpecialistMathSubtopic) { setSpecialistMathSubtopics((p) => p.includes(sub) ? p.filter((s) => s !== sub) : [...p, sub]); }
  function toggleChemistrySubtopic(sub: ChemistrySubtopic) { setChemistrySubtopics((p) => p.includes(sub) ? p.filter((s) => s !== sub) : [...p, sub]); }
  function togglePhysicalEducationSubtopic(sub: PhysicalEducationSubtopic) { setPhysicalEducationSubtopics((p) => p.includes(sub) ? p.filter((s) => s !== sub) : [...p, sub]); }

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
    const questionStartedAt = mcQuestionPresentedAtById[question.id];
    const responseAt = responseEnteredAtMs ?? Date.now();
    const entry: McHistoryEntry = {
      type: "multiple-choice", id: `${question.id}-${Date.now()}`, createdAt: new Date().toISOString(),
      question, selectedAnswer, correct: awardedMarks >= 1, awardedMarks, maxMarks: 1,
      generationTelemetry: mcGenerationTelemetry ?? undefined,
      analytics: {
        attemptKind, attemptSequence: getMcAttemptSequence(question.id),
        answerCharacterCount: 0, answerWordCount: 0, usedImageUpload: false,
        responseLatencyMs: Number.isFinite(questionStartedAt) && Number.isFinite(responseAt) ? Math.max(0, responseAt - questionStartedAt) : undefined,
      },
    };
    setMcHistory((prev: any) => [entry, ...prev].slice(0, 200));
  }

  function appendWrittenHistoryEntry(question: typeof activeQuestion, response: ReturnType<typeof normalizeMarkResponse>, options?: { uploadedAnswerOverride?: string; attemptKind?: WrittenAttemptKind; markingLatencyMs?: number; responseEnteredAtMs?: number }) {
    if (!question) return;
    const uploadedAnswer = options?.uploadedAnswerOverride ?? (answersByQuestionId[question.id] ?? "");
    const questionStartedAt = writtenQuestionPresentedAtById[question.id];
    const responseAt = options?.responseEnteredAtMs ?? writtenResponseEnteredAtById[question.id] ?? Date.now();
    const entry: QuestionHistoryEntry = {
      id: `${question.id}-${Date.now()}`, createdAt: new Date().toISOString(),
      question, uploadedAnswer, uploadedAnswerImage: imagesByQuestionId[question.id],
      workedSolutionMarkdown: response.workedSolutionMarkdown, markResponse: response,
      generationTelemetry: writtenGenerationTelemetry ?? undefined,
      analytics: {
        attemptKind: options?.attemptKind ?? "initial", attemptSequence: getWrittenAttemptSequence(question.id),
        answerCharacterCount: uploadedAnswer.length, answerWordCount: countWords(uploadedAnswer),
        usedImageUpload: Boolean(imagesByQuestionId[question.id]),
        responseLatencyMs: Number.isFinite(questionStartedAt) && Number.isFinite(responseAt) ? Math.max(0, responseAt - questionStartedAt) : undefined,
        markingLatencyMs: options?.markingLatencyMs,
      },
    };
    setQuestionHistory((prev: any) => [entry, ...prev].slice(0, 200));
  }

  // ── ID re-keying ─────────────────────────────────────────────────────────────
  // Each sequential backend call resets its own ID counter (q1, q2… / mc1, mc2…).
  // After concatenating results from multiple calls we must assign globally unique
  // IDs so that answer/feedback/image maps — keyed by question.id — don't collide
  // across topics.
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
    const hasMath = selectedTopics.some((t) => isMathTopic(t));
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
              maxMarksPerQuestion: hasMath ? maxMarksPerQuestion : undefined,
              model, apiKey, techMode,
              subtopics: getSubtopicsForTopic(topic),
              subtopicInstructions: getSelectedSubtopicInstructions(),
              customFocusArea: getCustomFocusArea(),
              avoidSimilarQuestions,
              priorQuestionPrompts: avoidSimilarQuestions ? getRecentSameTopicQuestionPrompts("written") : [],
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
      setWrittenRawModelOutput("");
      setWrittenGenerationTelemetry(totalTelemetry);
      setLastSessionTelemetry(totalTelemetry);
      setShowWrittenRawOutput(false);
      setActiveQuestionIndex(0);
      setActiveWrittenSavedSetId(null);
      setLastSavedAt(null);
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
              subtopics: getSubtopicsForTopic(topic),
              subtopicInstructions: getSelectedSubtopicInstructions(),
              customFocusArea: getCustomFocusArea(),
              avoidSimilarQuestions,
              priorQuestionPrompts: avoidSimilarQuestions ? getRecentSameTopicQuestionPrompts("multiple-choice") : [],
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
      setMcRawModelOutput("");
      setMcGenerationTelemetry(totalTelemetry);
      setLastSessionTelemetry(totalTelemetry);
      setShowMcRawOutput(false);
      setActiveMcQuestionIndex(0);
      setActiveMcSavedSetId(null);
      setLastSavedAt(null);
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
      setFeedbackByQuestionId((prev: any) => ({ ...prev, [activeQuestion.id]: response }));
      setMarkOverrideInputByQuestionId((prev) => ({ ...prev, [activeQuestion.id]: String(response.achievedMarks) }));
      appendWrittenHistoryEntry(activeQuestion, response, { uploadedAnswerOverride: activeQuestionAnswer, attemptKind: "initial", markingLatencyMs, responseEnteredAtMs });
    } catch (error) { setErrorMessage(readBackendError(error)); setLastFailedAction("mark-written"); }
    finally { setIsMarking(false); }
  }

  function handleSave() {
    const id = saveCurrentSet();
    if (id) setLastSavedAt(new Date().toISOString());
    return id;
  }

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
      setFeedbackByQuestionId((prev: any) => ({ ...prev, [activeQuestion.id]: response }));
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
    setFeedbackByQuestionId((prev: any) => ({ ...prev, [activeQuestion.id]: updated }));
    setMarkOverrideInputByQuestionId((prev) => ({ ...prev, [activeQuestion.id]: String(clamped) }));
    appendWrittenHistoryEntry(activeQuestion, updated, { uploadedAnswerOverride: activeQuestionAnswer, attemptKind: "override", responseEnteredAtMs: Date.now() });
  }

  // ── MC answer / appeal / override ────────────────────────────────────────────
  function handleMcAnswer(selectedLabel: string) {
    if (!activeMcQuestion || mcAnswersByQuestionId[activeMcQuestion.id]) return;
    const responseEnteredAtMs = Date.now();
    const awardedMarks = selectedLabel === activeMcQuestion.correctAnswer ? 1 : 0;
    setMcAnswersByQuestionId((prev: any) => ({ ...prev, [activeMcQuestion.id]: selectedLabel }));
    setMcAwardedMarksByQuestionId((prev) => ({ ...prev, [activeMcQuestion.id]: awardedMarks }));
    setMcMarkOverrideInputByQuestionId((prev) => ({ ...prev, [activeMcQuestion.id]: String(awardedMarks) }));
    appendMcHistoryEntry(activeMcQuestion, selectedLabel, awardedMarks, "initial", responseEnteredAtMs);
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
    appendMcHistoryEntry(activeMcQuestion, activeMcAnswer, clamped, "override", Date.now());
  }

  // ── Start over ───────────────────────────────────────────────────────────────
  function handleStartOver() {
    if ((questionMode === "written" && questions.length > 0 && !activeWrittenSavedSetId) ||
      (questionMode === "multiple-choice" && mcQuestions.length > 0 && !activeMcSavedSetId)) saveCurrentSet();
    resetStopwatch();
    setBatchProgress([]);
    setQuestions([]); setWrittenRawModelOutput(""); setWrittenGenerationTelemetry(null); setShowWrittenRawOutput(false);
    setActiveQuestionIndex(0); setActiveWrittenSavedSetId(null); setWrittenQuestionPresentedAtById({});
    setAnswersByQuestionId({}); setImagesByQuestionId({}); setFeedbackByQuestionId({});
    setWrittenResponseEnteredAtById({}); setMarkAppealByQuestionId({}); setMarkOverrideInputByQuestionId({});
    setMcQuestions([]); setMcRawModelOutput(""); setMcGenerationTelemetry(null); setShowMcRawOutput(false);
    setActiveMcQuestionIndex(0); setActiveMcSavedSetId(null); setMcQuestionPresentedAtById({});
    setMcAnswersByQuestionId({}); setMcMarkAppealByQuestionId({}); setMcMarkOverrideInputByQuestionId({}); setMcAwardedMarksByQuestionId({});
  }

  // ── Image drop ───────────────────────────────────────────────────────────────
  async function handleDropDropzone(acceptedFiles: File[]) {
    if (!activeQuestion || acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    try {
      const dataUrl = await fileToDataUrl(file);
      setErrorMessage(null);
      setImagesByQuestionId((prev: any) => ({ ...prev, [activeQuestion.id]: { name: file.name, dataUrl } }));
      setWrittenResponseEnteredAtById((prev) => {
        if (prev[activeQuestion.id] !== undefined) return prev;
        return { ...prev, [activeQuestion.id]: Date.now() };
      });
    } catch { setErrorMessage("Could not read image file. Try a different file."); }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full w-full p-3 sm:p-4 lg:p-6 flex flex-col gap-6 animate-in fade-in duration-500">

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
          selectedTopics={selectedTopics} onToggleTopic={toggleTopic}
          mathMethodsSubtopics={mathMethodsSubtopics} onToggleMathMethodsSubtopic={toggleMathMethodsSubtopic}
          specialistMathSubtopics={specialistMathSubtopics} onToggleSpecialistMathSubtopic={toggleSpecialistMathSubtopic}
          chemistrySubtopics={chemistrySubtopics} onToggleChemistrySubtopic={toggleChemistrySubtopic}
          physicalEducationSubtopics={physicalEducationSubtopics} onTogglePhysicalEducationSubtopic={togglePhysicalEducationSubtopic}
          techMode={techMode} onSetTechMode={setTechMode}
          customFocusArea={customFocusArea} onSetCustomFocusArea={setCustomFocusArea}
          difficulty={difficulty} onSetDifficulty={setDifficulty}
          questionCount={questionCount} onSetQuestionCount={setQuestionCount}
          maxMarksPerQuestion={maxMarksPerQuestion} onSetMaxMarksPerQuestion={setMaxMarksPerQuestion}
          avoidSimilarQuestions={avoidSimilarQuestions} onSetAvoidSimilarQuestions={setAvoidSimilarQuestions}
          shuffleQuestions={shuffleQuestions} onSetShuffleQuestions={setShuffleQuestions}
          hasApiKey={Boolean(apiKey)}
          canGenerate={canGenerate}
          isGenerating={isGenerating}
          generationStatus={generationStatus}
          generationStartedAt={generationStartedAt}
          formattedElapsedTime={formattedElapsedTime}
          onGenerate={questionMode === "written" ? handleGenerateQuestions : handleGenerateMcQuestions}
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
          formattedElapsedTime={formattedElapsedTime}
          completedCount={questionMode === "written" ? completedCount : mcCompletedCount}
          totalCount={questionMode === "written" ? questions.length : mcQuestions.length}
          hasSavedSet={Boolean(questionMode === "written" ? activeWrittenSavedSetId : activeMcSavedSetId)}
          onReview={() => setShowCompletionScreen(false)}
          onSave={handleSave}
          onStartOver={handleStartOver}
        />

        /* ── Written Question View ── */
      ) : questionMode === "written" ? (
        <div className="flex min-h-full flex-col gap-6 pb-20 animate-in slide-in-from-bottom-4 duration-500">
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
            hasSavedSet={Boolean(activeWrittenSavedSetId)}
            generationStartedAt={generationStartedAt}
            formattedElapsedTime={formattedElapsedTime}
            telemetry={writtenGenerationTelemetry}
            getDifficultyBadgeClasses={getDifficultyBadgeClasses}
            onPrev={() => setActiveQuestionIndex(Math.max(0, activeQuestionIndex - 1))}
            onNext={handleNextWrittenQuestion}
            onSave={handleSave}
            lastSavedAt={lastSavedAt}
            onDelete={handleCancelWrittenQuestion}
            onExit={handleStartOver}
          />
          {activeQuestion && (
            <div className="flex flex-col space-y-2">
              <WrittenQuestionCard
                promptMarkdown={activeQuestion.promptMarkdown}
                canShowRawOutput={canShowWrittenRawOutput}
                showRawOutput={showWrittenRawOutput}
                rawModelOutput={writtenRawModelOutput}
                onToggleRawOutput={() => setShowWrittenRawOutput((p) => !p)}
              />
              {!activeFeedback ? (
                <WrittenAnswerCard
                  questionId={activeQuestion.id}
                  answer={activeQuestionAnswer}
                  image={activeQuestionImage}
                  isMarking={isMarking}
                  canSubmit={canSubmitAnswer}
                  onAnswerChange={(value) => {
                    setAnswersByQuestionId((prev: any) => ({ ...prev, [activeQuestion.id]: value }));
                    if (value.trim().length > 0) {
                      setWrittenResponseEnteredAtById((prev) => {
                        if (prev[activeQuestion.id] !== undefined) return prev;
                        return { ...prev, [activeQuestion.id]: Date.now() };
                      });
                    }
                  }}
                  onImageDrop={handleDropDropzone}
                  onImageRemove={() => setImagesByQuestionId((prev: any) => ({ ...prev, [activeQuestion.id]: undefined }))}
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
                  onAppealChange={(v) => setMarkAppealByQuestionId((p) => ({ ...p, [activeQuestion.id]: v }))}
                  onOverrideInputChange={(v) => setMarkOverrideInputByQuestionId((p) => ({ ...p, [activeQuestion.id]: v }))}
                  onArgueForMark={handleArgueForMark}
                  onApplyOverride={handleOverrideMark}
                />
              )}
            </div>
          )}
        </div>

        /* ── MC Question View ── */
      ) : (
        <div className="flex flex-col h-full gap-6 pb-20 animate-in slide-in-from-bottom-4 duration-500">
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
            hasSavedSet={Boolean(activeMcSavedSetId)}
            generationStartedAt={generationStartedAt}
            formattedElapsedTime={formattedElapsedTime}
            telemetry={mcGenerationTelemetry}
            getDifficultyBadgeClasses={getDifficultyBadgeClasses}
            onPrev={() => setActiveMcQuestionIndex(Math.max(0, activeMcQuestionIndex - 1))}
            onNext={handleNextMcQuestion}
            onSave={handleSave}
            lastSavedAt={lastSavedAt}
            onDelete={handleCancelMcQuestion}
            onExit={handleStartOver}
          />
          {activeMcQuestion && (
            <div className="flex flex-col space-y-2">
              <McQuestionCard
                promptMarkdown={activeMcQuestion.promptMarkdown}
                canShowRawOutput={canShowMcRawOutput}
                showRawOutput={showMcRawOutput}
                rawModelOutput={mcRawModelOutput}
                onToggleRawOutput={() => setShowMcRawOutput((p) => !p)}
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
                onSelectAnswer={handleMcAnswer}
                onAppealChange={(v) => setMcMarkAppealByQuestionId((p) => ({ ...p, [activeMcQuestion.id]: v }))}
                onOverrideInputChange={(v) => setMcMarkOverrideInputByQuestionId((p) => ({ ...p, [activeMcQuestion.id]: v }))}
                onArgueForMark={handleArgueForMcMark}
                onApplyOverride={handleOverrideMcMark}
              />
            </div>
          )}
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
