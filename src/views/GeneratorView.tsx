import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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
} from "@/types";
import {
  confirmAction,
  fileToDataUrl,
  normalizeMarkResponse,
  readBackendError,
} from "@/lib/app-utils";

import { SetupPanel } from "@/components/generator/SetupPanel";
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

// ─── Component ────────────────────────────────────────────────────────────────

export function GeneratorView() {
  // ── Local UI state ──────────────────────────────────────────────────────────
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

  // ── Context ─────────────────────────────────────────────────────────────────
  const { apiKey, model, debugMode } = useAppSettings();

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
    model.trim().length > 0 &&
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
  function startStopwatch() { setGenerationStartedAt(Date.now()); setSessionFinishedAt(null); }
  function resetStopwatch() { setGenerationStartedAt(null); setSessionFinishedAt(null); }

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
    if (!activeQuestion || !confirmAction("Cancel this question? It will be removed from your current set.")) return;
    const id = activeQuestion.id;
    const next = questions.filter((q) => q.id !== id);
    setQuestions(next); setActiveWrittenSavedSetId(null); setShowCompletionScreen(false);
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

  function handleCancelMcQuestion() {
    if (!activeMcQuestion || !confirmAction("Cancel this question? It will be removed from your current set.")) return;
    const id = activeMcQuestion.id;
    const next = mcQuestions.filter((q) => q.id !== id);
    setMcQuestions(next); setActiveMcSavedSetId(null); setShowCompletionScreen(false);
    setActiveMcQuestionIndex(Math.min(activeMcQuestionIndex, Math.max(0, next.length - 1)));
    setMcQuestionPresentedAtById((p) => removeKey(p, id));
    setMcAnswersByQuestionId((p) => removeKey(p, id));
    setMcMarkAppealByQuestionId((p) => removeKey(p, id));
    setMcMarkOverrideInputByQuestionId((p) => removeKey(p, id));
    setMcAwardedMarksByQuestionId((p) => removeKey(p, id));
    setErrorMessage(null);
  }

  // ── Topic / subtopic toggles ─────────────────────────────────────────────────
  function toggleTopic(topic: Topic) { setSelectedTopics((p) => p.includes(topic) ? p.filter((t) => t !== topic) : [...p, topic]); }
  function toggleMathMethodsSubtopic(sub: MathMethodsSubtopic) { setMathMethodsSubtopics((p) => p.includes(sub) ? p.filter((s) => s !== sub) : [...p, sub]); }
  function toggleSpecialistMathSubtopic(sub: SpecialistMathSubtopic) { setSpecialistMathSubtopics((p) => p.includes(sub) ? p.filter((s) => s !== sub) : [...p, sub]); }
  function toggleChemistrySubtopic(sub: ChemistrySubtopic) { setChemistrySubtopics((p) => p.includes(sub) ? p.filter((s) => s !== sub) : [...p, sub]); }
  function togglePhysicalEducationSubtopic(sub: PhysicalEducationSubtopic) { setPhysicalEducationSubtopics((p) => p.includes(sub) ? p.filter((s) => s !== sub) : [...p, sub]); }

  // ── Subtopic / focus helpers ─────────────────────────────────────────────────
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

  // ── Generation ───────────────────────────────────────────────────────────────
  async function handleGenerateQuestions() {
    if (!canGenerate) return;
    const hasMath = selectedTopics.some((t) => isMathTopic(t));
    startStopwatch(); setErrorMessage(null);
    setGenerationStatus({ mode: "written", stage: "preparing", message: "Preparing generation request.", attempt: 1 });
    setIsGenerating(true);
    try {
      const response = await invoke<GenerateQuestionsResponse>("generate_questions", {
        request: {
          topics: selectedTopics, difficulty, questionCount,
          maxMarksPerQuestion: hasMath ? maxMarksPerQuestion : undefined,
          model, apiKey, techMode,
          subtopics: getSelectedSubtopics(), subtopicInstructions: getSelectedSubtopicInstructions(),
          customFocusArea: getCustomFocusArea(), avoidSimilarQuestions,
          priorQuestionPrompts: avoidSimilarQuestions ? getRecentSameTopicQuestionPrompts("written") : [],
        },
      });
      setQuestions(response.questions); setWrittenRawModelOutput("");
        setWrittenGenerationTelemetry({
    durationMs:         response.durationMs,
    promptTokens:       response.promptTokens,
    completionTokens:   response.completionTokens,
    totalTokens:        response.totalTokens,
    distinctnessAvg:    response.distinctnessAvg,
    multiStepDepthAvg:  response.multiStepDepthAvg,
  });
      setShowWrittenRawOutput(false); setActiveQuestionIndex(0); setActiveWrittenSavedSetId(null);
      setWrittenQuestionPresentedAtById({}); setWrittenResponseEnteredAtById({});
      setAnswersByQuestionId({}); setImagesByQuestionId({}); setFeedbackByQuestionId({});
    } catch (error) {
      resetStopwatch();
      setGenerationStatus({ mode: "written", stage: "failed", message: "Generation failed.", attempt: generationStatus?.attempt ?? 1 });
      setErrorMessage(readBackendError(error));
    } finally { setIsGenerating(false); }
  }

  async function handleGenerateMcQuestions() {
    if (!canGenerate) return;
    startStopwatch(); setErrorMessage(null);
    setGenerationStatus({ mode: "multiple-choice", stage: "preparing", message: "Preparing generation request.", attempt: 1 });
    setIsGenerating(true);
    try {
      const response = await invoke<GenerateMcQuestionsResponse>("generate_mc_questions", {
        request: {
          topics: selectedTopics, difficulty, questionCount, model, apiKey, techMode,
          subtopics: getSelectedSubtopics(), subtopicInstructions: getSelectedSubtopicInstructions(),
          customFocusArea: getCustomFocusArea(), avoidSimilarQuestions,
          priorQuestionPrompts: avoidSimilarQuestions ? getRecentSameTopicQuestionPrompts("multiple-choice") : [],
        },
      });
      setMcQuestions(response.questions); setMcRawModelOutput("");
      setMcGenerationTelemetry({
        durationMs:         response.durationMs,
        promptTokens:       response.promptTokens,
        completionTokens:   response.completionTokens,
        totalTokens:        response.totalTokens,
        distinctnessAvg:    response.distinctnessAvg,
        multiStepDepthAvg:  response.multiStepDepthAvg,
      });
      setShowMcRawOutput(false); setActiveMcQuestionIndex(0); setActiveMcSavedSetId(null);
      setMcQuestionPresentedAtById({}); setMcAnswersByQuestionId({});
      setMcMarkAppealByQuestionId({}); setMcMarkOverrideInputByQuestionId({}); setMcAwardedMarksByQuestionId({});
    } catch (error) {
      resetStopwatch();
      setGenerationStatus({ mode: "multiple-choice", stage: "failed", message: "Generation failed.", attempt: generationStatus?.attempt ?? 1 });
      setErrorMessage(readBackendError(error));
    } finally { setIsGenerating(false); }
  }

  // ── Marking ──────────────────────────────────────────────────────────────────
  async function handleSubmitForMarking() {
    if (!activeQuestion || !canSubmitAnswer) return;
    setErrorMessage(null); setIsMarking(true);
    try {
      const responseEnteredAtMs = writtenResponseEnteredAtById[activeQuestion.id] ?? Date.now();
      const markStartedAt = Date.now();
      const rawResponse = await invoke<unknown>("mark_answer", {
        request: { question: activeQuestion, studentAnswer: activeQuestionAnswer, studentAnswerImageDataUrl: activeQuestionImage?.dataUrl, model, apiKey },
      });
      const markingLatencyMs = Date.now() - markStartedAt;
      const response = normalizeMarkResponse(rawResponse, activeQuestion.maxMarks);
      setFeedbackByQuestionId((prev: any) => ({ ...prev, [activeQuestion.id]: response }));
      setMarkOverrideInputByQuestionId((prev) => ({ ...prev, [activeQuestion.id]: String(response.achievedMarks) }));
      appendWrittenHistoryEntry(activeQuestion, response, { uploadedAnswerOverride: activeQuestionAnswer, attemptKind: "initial", markingLatencyMs, responseEnteredAtMs });
    } catch (error) { setErrorMessage(readBackendError(error)); }
    finally { setIsMarking(false); }
  }

  async function handleArgueForMark() {
    if (!activeQuestion || !activeFeedback) return;
    const appealText = activeMarkAppeal.trim();
    if (!appealText) { setErrorMessage("Enter your argument before requesting a re-mark."); return; }
    if (!apiKey.trim() || !model.trim()) { setErrorMessage("Configure API key and model before requesting a re-mark."); return; }
    setErrorMessage(null); setIsMarking(true);
    try {
      const responseEnteredAtMs = Date.now(); const markStartedAt = Date.now();
      const arguedAnswer = [activeQuestionAnswer, `Additional marking argument from student:\n${appealText}`].filter((p) => p.trim()).join("\n\n");
      const rawResponse = await invoke<unknown>("mark_answer", {
        request: { question: activeQuestion, studentAnswer: arguedAnswer, studentAnswerImageDataUrl: activeQuestionImage?.dataUrl, model, apiKey },
      });
      const response = normalizeMarkResponse(rawResponse, activeQuestion.maxMarks);
      setFeedbackByQuestionId((prev: any) => ({ ...prev, [activeQuestion.id]: response }));
      setMarkOverrideInputByQuestionId((prev) => ({ ...prev, [activeQuestion.id]: String(response.achievedMarks) }));
      appendWrittenHistoryEntry(activeQuestion, response, { uploadedAnswerOverride: activeQuestionAnswer, attemptKind: "appeal", markingLatencyMs: Date.now() - markStartedAt, responseEnteredAtMs });
    } catch (error) { setErrorMessage(readBackendError(error)); }
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
    if (!apiKey.trim() || !model.trim()) { setErrorMessage("Configure API key and model before requesting a re-mark."); return; }
    setErrorMessage(null); setIsMarking(true);
    try {
      const responseEnteredAtMs = Date.now();
      const selectedOptionText = activeMcQuestion.options.find((o: McOption) => o.label === activeMcAnswer)?.text ?? "";
      const arguedAnswer = [`Student selected option ${activeMcAnswer}: ${selectedOptionText}`, `Student argument for marks:\n${appealText}`].filter((p) => p.trim()).join("\n\n");
      const rawResponse = await invoke<unknown>("mark_answer", {
        request: {
          question: { id: activeMcQuestion.id, topic: activeMcQuestion.topic, subtopic: activeMcQuestion.subtopic, promptMarkdown: buildMcMarkingPrompt(activeMcQuestion), maxMarks: 1, techAllowed: Boolean(activeMcQuestion.techAllowed) },
          studentAnswer: arguedAnswer, model, apiKey,
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
        <div className="bg-destructive/15 border border-destructive/30 text-destructive px-5 py-4 rounded-xl text-sm flex items-center gap-3 shadow-sm">
          <XCircle className="w-5 h-5 shrink-0" />
          <p className="font-medium">{errorMessage}</p>
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
          hasApiKey={Boolean(apiKey)}
          canGenerate={canGenerate}
          isGenerating={isGenerating}
          generationStatus={generationStatus}
          generationStartedAt={generationStartedAt}
          formattedElapsedTime={formattedElapsedTime}
          onGenerate={questionMode === "written" ? handleGenerateQuestions : handleGenerateMcQuestions}
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
          onSave={saveCurrentSet}
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
            onSave={saveCurrentSet}
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
            onSave={saveCurrentSet}
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
    </div>
  );
}
