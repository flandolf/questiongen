/**
 * GeneratorView — orchestrator
 *
 * This file owns:
 *   - Session-level local state (completion screen, raw-output toggles, per-question UI maps)
 *   - All async handlers (generate, mark, appeal, override, cancel, start-over)
 *   - Derived values computed from context
 *   - Routing between SetupPanel / WrittenSessionView / McSessionView / CompletionScreen
 *
 * It renders no JSX of its own beyond the outer error banner and the mode switch.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  useAppContext,
  useAppPreferences,
  useAppSettings,
  useMultipleChoiceSession,
  useWrittenSession,
  usePassageSession,
} from "../AppContext";
import { XCircle } from "lucide-react";
import {
  GenerateQuestionsResponse,
  GenerateMcQuestionsResponse,
  McOption,
  McHistoryEntry,
  McAttemptKind,
  QuestionHistoryEntry,
  WrittenAttemptKind,
  Topic,
  GeneratePassageResponse,
  MarkAnswerResponse,
} from "../types";
import {
  confirmAction,
  normalizeMarkResponse,
  readBackendError,
} from "../lib/app-utils";
import {
  countWords,
  isMathTopic,
  removeRecordKey,
  MAX_HISTORY_ENTRIES,
} from "./generatorUtils";
import { SetupPanel } from "./GeneratorView/SetupPanel";
import { WrittenSessionView } from "./GeneratorView/WrittenSessionView";
import { McSessionView } from "./GeneratorView/McSessionView";
import { CompletionScreen } from "./GeneratorView/CompletionScreen";

export function GeneratorView() {
  // ── Local UI state ──────────────────────────────────────────────────────────
  const [sessionFinishedAt, setSessionFinishedAt] = useState<number | null>(null);
  const [showCompletionScreen, setShowCompletionScreen] = useState(false);
  const [showWrittenRawOutput, setShowWrittenRawOutput] = useState(false);
  const [showMcRawOutput, setShowMcRawOutput] = useState(false);
  const [showPassageRawOutput, setShowPassageRawOutput] = useState(false);
  const [markAppealByQuestionId, setMarkAppealByQuestionId] = useState<Record<string, string>>({});
  const [markOverrideInputByQuestionId, setMarkOverrideInputByQuestionId] = useState<Record<string, string>>({});
  const [mcMarkAppealByQuestionId, setMcMarkAppealByQuestionId] = useState<Record<string, string>>({});
  const [mcMarkOverrideInputByQuestionId, setMcMarkOverrideInputByQuestionId] = useState<Record<string, string>>({});
  const [mcAwardedMarksByQuestionId, setMcAwardedMarksByQuestionId] = useState<Record<string, number>>({});
  const [writtenResponseEnteredAtById, setWrittenResponseEnteredAtById] = useState<Record<string, number>>({});

  // ── Context ─────────────────────────────────────────────────────────────────
  const { apiKey, model, debugMode, useStructuredOutput } = useAppSettings();
  const {
    selectedTopics,
    difficulty,
    avoidSimilarQuestions,
    techMode,
    mathMethodsSubtopics,
    specialistMathSubtopics,
    chemistrySubtopics,
    physicalEducationSubtopics,
    questionCount,
    setQuestionCount,
    maxMarksPerQuestion,
    passageQuestionCount,
    prioritizedCommandTerms,
    questionMode,
    subtopicInstructions,
    customFocusArea,
  } = useAppPreferences();
  const {
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
  } = useWrittenSession();
  const {
    mcQuestions,
    setMcQuestions,
    activeMcQuestionIndex,
    setActiveMcQuestionIndex,
    mcQuestionPresentedAtById,
    setMcQuestionPresentedAtById,
    mcAnswersByQuestionId,
    setMcAnswersByQuestionId,
    mcHistory,
    setMcHistory,
    mcRawModelOutput,
    setMcRawModelOutput,
    mcGenerationTelemetry,
    setMcGenerationTelemetry,
    activeMcSavedSetId,
    setActiveMcSavedSetId,
  } = useMultipleChoiceSession();
  const {
    passage,
    setPassage,
    activePassageQuestionIndex,
    setActivePassageQuestionIndex,
    setPassageQuestionPresentedAtById,
    passageAnswersByQuestionId,
    setPassageAnswersByQuestionId,
    passageFeedbackByQuestionId,
    setPassageFeedbackByQuestionId,
    passageRawModelOutput,
    setPassageRawModelOutput,
    passageGenerationTelemetry,
    setPassageGenerationTelemetry,
  } = usePassageSession();
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
  } = useAppContext();

  // ── Derived state ───────────────────────────────────────────────────────────

  const isPassageMode = false;

  const showSetup = isPassageMode
    ? !passage
    : questionMode === "written"
      ? questions.length === 0
      : mcQuestions.length === 0;

  const canShowWrittenRawOutput = debugMode && writtenRawModelOutput.trim().length > 0;
  const canShowMcRawOutput = debugMode && mcRawModelOutput.trim().length > 0;
  const canShowPassageRawOutput = debugMode && passageRawModelOutput.trim().length > 0;

  const activeQuestion = questions[activeQuestionIndex];
  const activeQuestionAnswer = activeQuestion ? (answersByQuestionId[activeQuestion.id] ?? "") : "";
  const activeQuestionImage = activeQuestion ? imagesByQuestionId[activeQuestion.id] : undefined;
  const activeFeedback = activeQuestion ? feedbackByQuestionId[activeQuestion.id] : undefined;

  const activeMcQuestion = mcQuestions[activeMcQuestionIndex];
  const activeMcAnswer = activeMcQuestion ? (mcAnswersByQuestionId[activeMcQuestion.id] ?? "") : "";
  const activeMcMarkAppeal = activeMcQuestion ? (mcMarkAppealByQuestionId[activeMcQuestion.id] ?? "") : "";
  const activeMcAwardedMarks = activeMcQuestion ? mcAwardedMarksByQuestionId[activeMcQuestion.id] : undefined;
  const activeMcOverrideInput = activeMcQuestion
    ? (mcMarkOverrideInputByQuestionId[activeMcQuestion.id] ??
        (activeMcAwardedMarks !== undefined ? String(activeMcAwardedMarks) : ""))
    : "";

  const activeWrittenQuestion = isPassageMode
    ? passage?.questions[activePassageQuestionIndex]
    : activeQuestion;
  const activeWrittenAnswer = activeWrittenQuestion
    ? isPassageMode
      ? (passageAnswersByQuestionId[activeWrittenQuestion.id] ?? "")
      : activeQuestionAnswer
    : "";
  const activeWrittenFeedback = activeWrittenQuestion
    ? isPassageMode
      ? passageFeedbackByQuestionId[activeWrittenQuestion.id]
      : activeFeedback
    : undefined;
  const activeWrittenMarkAppeal = activeWrittenQuestion
    ? (markAppealByQuestionId[activeWrittenQuestion.id] ?? "")
    : "";
  const activeWrittenOverrideInput = activeWrittenQuestion
    ? (markOverrideInputByQuestionId[activeWrittenQuestion.id] ??
        (activeWrittenFeedback ? String(activeWrittenFeedback.achievedMarks) : ""))
    : "";
  const activeWrittenTelemetry = isPassageMode ? passageGenerationTelemetry : writtenGenerationTelemetry;

  const completedCount = useMemo(
    () => questions.filter((q) => feedbackByQuestionId[q.id]).length,
    [feedbackByQuestionId, questions],
  );
  const passageCompletedCount = useMemo(
    () => (passage ? passage.questions.filter((q) => Boolean(passageFeedbackByQuestionId[q.id])).length : 0),
    [passage, passageFeedbackByQuestionId],
  );
  const passageQuestionsComplete = useMemo(
    () => (passage ? passage.questions.every((q) => Boolean(passageFeedbackByQuestionId[q.id])) : false),
    [passage, passageFeedbackByQuestionId],
  );
  const activeLineItems = useMemo(
    () =>
      (passage?.text ?? "")
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line, index) => ({ lineNumber: index + 1, text: line })),
    [passage],
  );
  const mcCompletedCount = useMemo(
    () => mcQuestions.filter((q) => mcAnswersByQuestionId[q.id]).length,
    [mcAnswersByQuestionId, mcQuestions],
  );

  const isWrittenSetComplete =
    questionMode === "written" &&
    (isPassageMode
      ? Boolean(passage) && passageQuestionsComplete
      : questions.length > 0 && completedCount === questions.length);
  const isMcSetComplete =
    questionMode === "multiple-choice" &&
    mcQuestions.length > 0 &&
    mcCompletedCount === mcQuestions.length;
  const isSetComplete = isWrittenSetComplete || isMcSetComplete;

  const isAtLastWrittenQuestion = isPassageMode
    ? activePassageQuestionIndex === Math.max(0, (passage?.questions.length ?? 0) - 1)
    : activeQuestionIndex === questions.length - 1;
  const isAtLastMcQuestion = activeMcQuestionIndex === mcQuestions.length - 1;

  const canAdvanceWritten = isPassageMode
    ? Boolean(passage) && passage!.questions.length > 0 && (!isAtLastWrittenQuestion || passageQuestionsComplete)
    : questions.length > 0 && (!isAtLastWrittenQuestion || isWrittenSetComplete);
  const canAdvanceMc = mcQuestions.length > 0 && (!isAtLastMcQuestion || isMcSetComplete);

  const writtenTotalQuestions = isPassageMode ? (passage?.questions.length ?? 0) : questions.length;
  const writtenCurrentIndex = isPassageMode ? activePassageQuestionIndex : activeQuestionIndex;
  const writtenCompletedCount = isPassageMode ? passageCompletedCount : completedCount;

  // canGenerate / canGenerateMc share the same conditions
  const canGenerate =
    selectedTopics.length > 0 &&
    apiKey.trim().length > 0 &&
    model.trim().length > 0 &&
    questionCount >= 1 &&
    questionCount <= 20 &&
    !isGenerating;
  const canGeneratePassage =
    isPassageMode &&
    apiKey.trim().length > 0 &&
    model.trim().length > 0 &&
    passageQuestionCount >= 3 &&
    passageQuestionCount <= 10 &&
    !isGenerating;
  const canSubmitAnswer =
    Boolean(activeWrittenQuestion) &&
    (isPassageMode
      ? activeWrittenAnswer.trim().length > 0
      : activeQuestionAnswer.trim().length > 0 || Boolean(activeQuestionImage)) &&
    apiKey.trim().length > 0 &&
    model.trim().length > 0 &&
    !isMarking &&
    !activeWrittenFeedback;

  const completionAccuracyPercent = useMemo(() => {
    if (questionMode === "written") {
      if (!isWrittenSetComplete) return null;
      const sourceQuestions = isPassageMode && passage ? passage.questions : questions;
      const sourceFeedback = isPassageMode ? passageFeedbackByQuestionId : feedbackByQuestionId;
      const totalAvailable = sourceQuestions.reduce((sum, q) => sum + q.maxMarks, 0);
      if (totalAvailable === 0) return 0;
      const totalAchieved = sourceQuestions.reduce(
        (sum, q) => sum + (sourceFeedback[q.id]?.achievedMarks ?? 0),
        0,
      );
      return (totalAchieved / totalAvailable) * 100;
    }
    if (!isMcSetComplete || mcQuestions.length === 0) return null;
    const achievedMarks = mcQuestions.reduce((sum, q) => {
      const selected = mcAnswersByQuestionId[q.id];
      if (!selected) return sum;
      const overridden = mcAwardedMarksByQuestionId[q.id];
      const awarded =
        typeof overridden === "number" && Number.isFinite(overridden)
          ? Math.max(0, Math.min(1, overridden))
          : selected === q.correctAnswer
            ? 1
            : 0;
      return sum + awarded;
    }, 0);
    return (achievedMarks / mcQuestions.length) * 100;
  }, [
    feedbackByQuestionId,
    isMcSetComplete,
    isPassageMode,
    isWrittenSetComplete,
    mcAnswersByQuestionId,
    mcAwardedMarksByQuestionId,
    mcQuestions,
    passage,
    passageFeedbackByQuestionId,
    questionMode,
    questions,
  ]);

  // ── Refs for auto-save ──────────────────────────────────────────────────────
  const lastWrittenCompletedCountRef = useRef(completedCount);
  const lastMcCompletedCountRef = useRef(mcCompletedCount);

  const completionSetKey = useMemo(() => {
    if (questionMode === "written") {
      if (isPassageMode && passage) return passage.questions.map((q) => q.id).join("|");
      return questions.map((q) => q.id).join("|");
    }
    return mcQuestions.map((q) => q.id).join("|");
  }, [isPassageMode, passage, questionMode, questions, mcQuestions]);

  // ── Effects ─────────────────────────────────────────────────────────────────

  useEffect(() => { setShowCompletionScreen(false); }, [completionSetKey]);

  // Auto-save written on new completion
  useEffect(() => {
    const previous = lastWrittenCompletedCountRef.current;
    if (questionMode === "written" && activeWrittenSavedSetId && questions.length > 0 && completedCount > previous) {
      saveCurrentSet();
    }
    lastWrittenCompletedCountRef.current = completedCount;
  }, [activeWrittenSavedSetId, completedCount, questionMode, questions.length, saveCurrentSet]);

  // Auto-save MC on new completion
  useEffect(() => {
    const previous = lastMcCompletedCountRef.current;
    if (questionMode === "multiple-choice" && activeMcSavedSetId && mcQuestions.length > 0 && mcCompletedCount > previous) {
      saveCurrentSet();
    }
    lastMcCompletedCountRef.current = mcCompletedCount;
  }, [activeMcSavedSetId, mcCompletedCount, mcQuestions.length, questionMode, saveCurrentSet]);

  // Record first-presented timestamps
  useEffect(() => {
    if (!activeQuestion) return;
    setWrittenQuestionPresentedAtById((prev) => {
      if (prev[activeQuestion.id] !== undefined) return prev;
      return { ...prev, [activeQuestion.id]: Date.now() };
    });
  }, [activeQuestion, setWrittenQuestionPresentedAtById]);

  useEffect(() => {
    if (!isPassageMode || !activeWrittenQuestion) return;
    setPassageQuestionPresentedAtById((prev) => {
      if (prev[activeWrittenQuestion.id]) return prev;
      return { ...prev, [activeWrittenQuestion.id]: Date.now() };
    });
  }, [activeWrittenQuestion, isPassageMode, setPassageQuestionPresentedAtById]);

  useEffect(() => {
    if (!activeMcQuestion) return;
    setMcQuestionPresentedAtById((prev) => {
      if (prev[activeMcQuestion.id] !== undefined) return prev;
      return { ...prev, [activeMcQuestion.id]: Date.now() };
    });
  }, [activeMcQuestion, setMcQuestionPresentedAtById]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function startStopwatch() {
    setGenerationStartedAt(Date.now());
    setSessionFinishedAt(null);
  }
  function resetStopwatch() {
    setGenerationStartedAt(null);
    setSessionFinishedAt(null);
  }

  function getSelectedSubtopics(): string[] {
    const raw: string[] = [
      ...(selectedTopics.includes("Mathematical Methods") ? mathMethodsSubtopics : []),
      ...(selectedTopics.includes("Specialist Mathematics") ? specialistMathSubtopics : []),
      ...(selectedTopics.includes("Chemistry") ? chemistrySubtopics : []),
      ...(selectedTopics.includes("Physical Education") ? physicalEducationSubtopics : []),
    ];
    return Array.from(new Set(raw));
  }

  function getSelectedSubtopicInstructions(): Record<string, string> {
    const filtered: Record<string, string> = {};
    for (const subtopic of getSelectedSubtopics()) {
      const instruction = subtopicInstructions[subtopic]?.trim();
      if (instruction) filtered[subtopic] = instruction;
    }
    return filtered;
  }

  function getCustomFocusArea(): string | undefined {
    const trimmed = customFocusArea.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  function getRecentSameTopicQuestionPrompts(mode: "written" | "multiple-choice"): string[] {
    const topicSet = new Set<string>(selectedTopics);
    const seen = new Set<string>();
    const prompts: string[] = [];
    const maxCount = 6;
    const source = mode === "written" ? questionHistory : mcHistory;
    for (const entry of source) {
      if (!topicSet.has(entry.question.topic as Topic)) continue;
      const prompt = entry.question.promptMarkdown.trim();
      if (!prompt || seen.has(prompt)) continue;
      seen.add(prompt);
      prompts.push(prompt);
      if (prompts.length >= maxCount) break;
    }
    return prompts;
  }

  function getWrittenAttemptSequence(questionId: string) {
    return questionHistory.filter((e) => e.question.id === questionId).length + 1;
  }
  function getMcAttemptSequence(questionId: string) {
    return mcHistory.filter((e) => e.question.id === questionId).length + 1;
  }

  function appendMcHistoryEntry(
    question: typeof activeMcQuestion,
    selectedAnswer: string,
    awardedMarks: number,
    attemptKind: McAttemptKind,
    responseEnteredAtMs?: number,
  ) {
    if (!question) return;
    const createdAt = new Date().toISOString();
    const questionStartedAt = mcQuestionPresentedAtById[question.id];
    const responseEnteredAt = responseEnteredAtMs ?? Date.now();
    const entry: McHistoryEntry = {
      type: "multiple-choice",
      id: `${question.id}-${Date.now()}`,
      createdAt,
      question,
      selectedAnswer,
      correct: awardedMarks >= 1,
      awardedMarks,
      maxMarks: 1,
      generationTelemetry: mcGenerationTelemetry ?? undefined,
      analytics: {
        attemptKind,
        attemptSequence: getMcAttemptSequence(question.id),
        answerCharacterCount: 0,
        answerWordCount: 0,
        usedImageUpload: false,
        responseLatencyMs:
          Number.isFinite(questionStartedAt) && Number.isFinite(responseEnteredAt)
            ? Math.max(0, responseEnteredAt - questionStartedAt)
            : undefined,
      },
    };
    setMcHistory((prev) => [entry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
  }

  function appendWrittenHistoryEntry(
    question: typeof activeQuestion,
    response: ReturnType<typeof normalizeMarkResponse>,
    options?: {
      uploadedAnswerOverride?: string;
      attemptKind?: WrittenAttemptKind;
      markingLatencyMs?: number;
      responseEnteredAtMs?: number;
    },
  ) {
    if (!question) return;
    const uploadedAnswer = options?.uploadedAnswerOverride ?? (answersByQuestionId[question.id] ?? "");
    const createdAt = new Date().toISOString();
    const questionStartedAt = writtenQuestionPresentedAtById[question.id];
    const responseEnteredAt =
      options?.responseEnteredAtMs ?? writtenResponseEnteredAtById[question.id] ?? Date.now();
    const historyEntry: QuestionHistoryEntry = {
      id: `${question.id}-${Date.now()}`,
      createdAt,
      question,
      uploadedAnswer,
      uploadedAnswerImage: imagesByQuestionId[question.id],
      workedSolutionMarkdown: response.workedSolutionMarkdown,
      markResponse: response,
      generationTelemetry: writtenGenerationTelemetry ?? undefined,
      analytics: {
        attemptKind: options?.attemptKind ?? "initial",
        attemptSequence: getWrittenAttemptSequence(question.id),
        answerCharacterCount: uploadedAnswer.length,
        answerWordCount: countWords(uploadedAnswer),
        usedImageUpload: Boolean(imagesByQuestionId[question.id]),
        responseLatencyMs:
          Number.isFinite(questionStartedAt) && Number.isFinite(responseEnteredAt)
            ? Math.max(0, responseEnteredAt - questionStartedAt)
            : undefined,
        markingLatencyMs: options?.markingLatencyMs,
      },
    };
    setQuestionHistory((prev) => [historyEntry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
  }

  // ── Async handlers ──────────────────────────────────────────────────────────

  async function handleGenerateQuestions() {
    if (!canGenerate) return;
    const customFocus = getCustomFocusArea();
    const hasPeTopic = selectedTopics.includes("Physical Education");
    const hasAnyMathTopic = selectedTopics.some((t) => isMathTopic(t));
    startStopwatch();
    setErrorMessage(null);
    setGenerationStatus({ mode: "written", stage: "preparing", message: "Preparing generation request.", attempt: 1 });
    setIsGenerating(true);
    try {
      const response = await invoke<GenerateQuestionsResponse>("generate_questions", {
        request: {
          topics: selectedTopics,
          difficulty,
          questionCount,
          maxMarksPerQuestion: hasAnyMathTopic ? maxMarksPerQuestion : undefined,
          prioritizedCommandTerms: hasPeTopic ? prioritizedCommandTerms : [],
          model,
          apiKey,
          techMode,
          useStructuredOutput,
          subtopics: getSelectedSubtopics(),
          subtopicInstructions: getSelectedSubtopicInstructions(),
          customFocusArea: customFocus,
          avoidSimilarQuestions,
          priorQuestionPrompts: avoidSimilarQuestions ? getRecentSameTopicQuestionPrompts("written") : [],
        },
      });
      setQuestions(response.questions);
      setWrittenRawModelOutput(response.rawModelOutput ?? "");
      setWrittenGenerationTelemetry(response.telemetry ?? null);
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
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleGeneratePassage() {
    if (!canGeneratePassage) return;
    try {
      setErrorMessage(null);
      setIsGenerating(true);
      setGenerationStatus({ mode: "passage", stage: "preparing", message: "Preparing passage generation request.", attempt: 1 });
      setGenerationStartedAt(Date.now());
      const response = await invoke<GeneratePassageResponse>("generate_passage_questions", {
        request: { aosSubtopic: "Unit 3 AOS 1: Informality", questionCount: passageQuestionCount, model, apiKey, useStructuredOutput },
      });
      setPassage(response.passage);
      setActivePassageQuestionIndex(0);
      setPassageAnswersByQuestionId({});
      setPassageFeedbackByQuestionId({});
      setPassageQuestionPresentedAtById({});
      setPassageRawModelOutput(response.rawModelOutput ?? "");
      setPassageGenerationTelemetry(response.telemetry ?? null);
      setShowPassageRawOutput(false);
    } catch (error) {
      setGenerationStatus({ mode: "passage", stage: "failed", message: "Passage generation failed.", attempt: generationStatus?.attempt ?? 1 });
      setErrorMessage(readBackendError(error));
    } finally {
      setIsGenerating(false);
      setGenerationStartedAt(null);
    }
  }

  async function handleGenerateMcQuestions() {
    if (!canGenerate) return;
    startStopwatch();
    setErrorMessage(null);
    setGenerationStatus({ mode: "multiple-choice", stage: "preparing", message: "Preparing generation request.", attempt: 1 });
    setIsGenerating(true);
    try {
      const response = await invoke<GenerateMcQuestionsResponse>("generate_mc_questions", {
        request: {
          topics: selectedTopics,
          difficulty,
          questionCount,
          model,
          apiKey,
          techMode,
          useStructuredOutput,
          subtopics: getSelectedSubtopics(),
          subtopicInstructions: getSelectedSubtopicInstructions(),
          customFocusArea: getCustomFocusArea(),
          avoidSimilarQuestions,
          priorQuestionPrompts: avoidSimilarQuestions ? getRecentSameTopicQuestionPrompts("multiple-choice") : [],
        },
      });
      setMcQuestions(response.questions);
      setMcRawModelOutput(response.rawModelOutput ?? "");
      setMcGenerationTelemetry(response.telemetry ?? null);
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
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSubmitForMarking() {
    if (!activeWrittenQuestion || !canSubmitAnswer) return;
    setErrorMessage(null);
    setIsMarking(true);
    try {
      if (isPassageMode && passage) {
        const response = await invoke<MarkAnswerResponse>("mark_passage_answer", {
          request: { passageText: passage.text, aosSubtopic: passage.aosSubtopic, question: activeWrittenQuestion, studentAnswer: activeWrittenAnswer, model, apiKey },
        });
        setPassageFeedbackByQuestionId((prev) => ({ ...prev, [activeWrittenQuestion.id]: response }));
        setMarkOverrideInputByQuestionId((prev) => ({ ...prev, [activeWrittenQuestion.id]: String(response.achievedMarks) }));
      } else {
        const responseEnteredAtMs = writtenResponseEnteredAtById[activeQuestion.id] ?? Date.now();
        const markStartedAt = Date.now();
        const rawResponse = await invoke<unknown>("mark_answer", {
          request: { question: activeQuestion, studentAnswer: activeQuestionAnswer, studentAnswerImageDataUrl: activeQuestionImage?.dataUrl, model, apiKey, useStructuredOutput },
        });
        const markingLatencyMs = Date.now() - markStartedAt;
        const response = normalizeMarkResponse(rawResponse, activeQuestion.maxMarks);
        setFeedbackByQuestionId((prev) => ({ ...prev, [activeQuestion.id]: response }));
        setMarkOverrideInputByQuestionId((prev) => ({ ...prev, [activeQuestion.id]: String(response.achievedMarks) }));
        appendWrittenHistoryEntry(activeQuestion, response, { uploadedAnswerOverride: activeQuestionAnswer, attemptKind: "initial", markingLatencyMs, responseEnteredAtMs });
      }
    } catch (error) {
      setErrorMessage(readBackendError(error));
    } finally {
      setIsMarking(false);
    }
  }

  async function handleArgueForMark() {
    if (!activeWrittenQuestion || !activeWrittenFeedback) return;
    const appealText = activeWrittenMarkAppeal.trim();
    if (!appealText) { setErrorMessage("Enter your argument before requesting a re-mark."); return; }
    if (!apiKey.trim() || !model.trim()) { setErrorMessage("Configure API key and model before requesting a re-mark."); return; }
    setErrorMessage(null);
    setIsMarking(true);
    try {
      const responseEnteredAtMs = Date.now();
      const markStartedAt = Date.now();
      const arguedAnswer = [activeWrittenAnswer, `Additional marking argument from student:\n${appealText}`]
        .filter((p) => p.trim().length > 0).join("\n\n");
      if (isPassageMode && passage) {
        const response = await invoke<MarkAnswerResponse>("mark_passage_answer", {
          request: { passageText: passage.text, aosSubtopic: passage.aosSubtopic, question: activeWrittenQuestion, studentAnswer: arguedAnswer, model, apiKey },
        });
        setPassageFeedbackByQuestionId((prev) => ({ ...prev, [activeWrittenQuestion.id]: response }));
        setMarkOverrideInputByQuestionId((prev) => ({ ...prev, [activeWrittenQuestion.id]: String(response.achievedMarks) }));
      } else {
        const rawResponse = await invoke<unknown>("mark_answer", {
          request: { question: activeQuestion, studentAnswer: arguedAnswer, studentAnswerImageDataUrl: activeQuestionImage?.dataUrl, model, apiKey, useStructuredOutput },
        });
        const markingLatencyMs = Date.now() - markStartedAt;
        const response = normalizeMarkResponse(rawResponse, activeQuestion.maxMarks);
        setFeedbackByQuestionId((prev) => ({ ...prev, [activeQuestion.id]: response }));
        setMarkOverrideInputByQuestionId((prev) => ({ ...prev, [activeQuestion.id]: String(response.achievedMarks) }));
        appendWrittenHistoryEntry(activeQuestion, response, { uploadedAnswerOverride: activeQuestionAnswer, attemptKind: "appeal", markingLatencyMs, responseEnteredAtMs });
      }
    } catch (error) {
      setErrorMessage(readBackendError(error));
    } finally {
      setIsMarking(false);
    }
  }

  function handleOverrideMark() {
    if (!activeWrittenQuestion || !activeWrittenFeedback) return;
    const parsed = Number(activeWrittenOverrideInput);
    if (!Number.isFinite(parsed)) { setErrorMessage("Enter a whole number to override the mark."); return; }
    const clampedMarks = Math.max(0, Math.min(activeWrittenFeedback.maxMarks, Math.round(parsed)));
    const updatedResponse = {
      ...activeWrittenFeedback,
      achievedMarks: clampedMarks,
      scoreOutOf10: Math.round((clampedMarks / activeWrittenFeedback.maxMarks) * 10),
      verdict: clampedMarks === activeWrittenFeedback.maxMarks ? "Correct" : clampedMarks === 0 ? "Incorrect" : "Overridden",
    };
    setErrorMessage(null);
    if (isPassageMode) {
      setPassageFeedbackByQuestionId((prev) => ({ ...prev, [activeWrittenQuestion.id]: updatedResponse }));
    } else {
      setFeedbackByQuestionId((prev) => ({ ...prev, [activeQuestion.id]: updatedResponse }));
      appendWrittenHistoryEntry(activeQuestion, updatedResponse, { uploadedAnswerOverride: activeQuestionAnswer, attemptKind: "override", responseEnteredAtMs: Date.now() });
    }
    setMarkOverrideInputByQuestionId((prev) => ({ ...prev, [activeWrittenQuestion.id]: String(clampedMarks) }));
  }

  function handleMcAnswer(selectedLabel: string) {
    if (!activeMcQuestion || mcAnswersByQuestionId[activeMcQuestion.id]) return;
    const responseEnteredAtMs = Date.now();
    const awardedMarks = selectedLabel === activeMcQuestion.correctAnswer ? 1 : 0;
    setMcAnswersByQuestionId((prev) => ({ ...prev, [activeMcQuestion.id]: selectedLabel }));
    setMcAwardedMarksByQuestionId((prev) => ({ ...prev, [activeMcQuestion.id]: awardedMarks }));
    setMcMarkOverrideInputByQuestionId((prev) => ({ ...prev, [activeMcQuestion.id]: String(awardedMarks) }));
    appendMcHistoryEntry(activeMcQuestion, selectedLabel, awardedMarks, "initial", responseEnteredAtMs);
  }

  async function handleArgueForMcMark() {
    if (!activeMcQuestion || !activeMcAnswer) return;
    const appealText = activeMcMarkAppeal.trim();
    if (!appealText) { setErrorMessage("Enter your argument before requesting a re-mark."); return; }
    if (!apiKey.trim() || !model.trim()) { setErrorMessage("Configure API key and model before requesting a re-mark."); return; }
    setErrorMessage(null);
    setIsMarking(true);
    try {
      const responseEnteredAtMs = Date.now();
      const selectedOptionText = activeMcQuestion.options.find((o: McOption) => o.label === activeMcAnswer)?.text ?? "";
      const arguedAnswer = [
        `Student selected option ${activeMcAnswer}: ${selectedOptionText}`,
        `Student argument for marks:\n${appealText}`,
      ].filter((p) => p.trim().length > 0).join("\n\n");
      const optionsText = activeMcQuestion.options.map((o: McOption) => `${o.label}. ${o.text}`).join("\n");
      const rawResponse = await invoke<unknown>("mark_answer", {
        request: {
          question: { id: activeMcQuestion.id, topic: activeMcQuestion.topic, subtopic: activeMcQuestion.subtopic, promptMarkdown: `${activeMcQuestion.promptMarkdown}\n\nOptions:\n${optionsText}`, maxMarks: 1, techAllowed: Boolean(activeMcQuestion.techAllowed) },
          studentAnswer: arguedAnswer,
          model,
          apiKey,
          useStructuredOutput,
        },
      });
      const response = normalizeMarkResponse(rawResponse, 1);
      const awardedMarks = Math.max(0, Math.min(1, response.achievedMarks));
      setMcAwardedMarksByQuestionId((prev) => ({ ...prev, [activeMcQuestion.id]: awardedMarks }));
      setMcMarkOverrideInputByQuestionId((prev) => ({ ...prev, [activeMcQuestion.id]: String(awardedMarks) }));
      appendMcHistoryEntry(activeMcQuestion, activeMcAnswer, awardedMarks, "appeal", responseEnteredAtMs);
    } catch (error) {
      setErrorMessage(readBackendError(error));
    } finally {
      setIsMarking(false);
    }
  }

  function handleOverrideMcMark() {
    if (!activeMcQuestion || !activeMcAnswer) return;
    const parsed = Number(activeMcOverrideInput);
    if (!Number.isFinite(parsed)) { setErrorMessage("Enter a whole number to override the mark."); return; }
    const clampedMarks = Math.max(0, Math.min(1, Math.round(parsed)));
    setErrorMessage(null);
    setMcAwardedMarksByQuestionId((prev) => ({ ...prev, [activeMcQuestion.id]: clampedMarks }));
    setMcMarkOverrideInputByQuestionId((prev) => ({ ...prev, [activeMcQuestion.id]: String(clampedMarks) }));
    appendMcHistoryEntry(activeMcQuestion, activeMcAnswer, clampedMarks, "override", Date.now());
  }

  function handleCancelWrittenQuestion() {
    if (!activeQuestion) return;
    if (!confirmAction("Cancel this question? It will be removed from your current set.")) return;
    const qId = activeQuestion.id;
    const next = questions.filter((q) => q.id !== qId);
    setQuestions(next);
    setQuestionCount(Math.max(1, next.length));
    setActiveWrittenSavedSetId(null);
    setShowCompletionScreen(false);
    setActiveQuestionIndex(Math.min(activeQuestionIndex, Math.max(0, next.length - 1)));
    setWrittenQuestionPresentedAtById((prev) => removeRecordKey(prev, qId));
    setAnswersByQuestionId((prev) => removeRecordKey(prev, qId));
    setImagesByQuestionId((prev) => removeRecordKey(prev, qId));
    setFeedbackByQuestionId((prev) => removeRecordKey(prev, qId));
    setMarkAppealByQuestionId((prev) => removeRecordKey(prev, qId));
    setMarkOverrideInputByQuestionId((prev) => removeRecordKey(prev, qId));
    setWrittenResponseEnteredAtById((prev) => removeRecordKey(prev, qId));
    setErrorMessage(null);
  }

  function handleCancelMcQuestion() {
    if (!activeMcQuestion) return;
    if (!confirmAction("Cancel this question? It will be removed from your current set.")) return;
    const qId = activeMcQuestion.id;
    const next = mcQuestions.filter((q) => q.id !== qId);
    setMcQuestions(next);
    setQuestionCount(Math.max(1, next.length));
    setActiveMcSavedSetId(null);
    setShowCompletionScreen(false);
    setActiveMcQuestionIndex(Math.min(activeMcQuestionIndex, Math.max(0, next.length - 1)));
    setMcQuestionPresentedAtById((prev) => removeRecordKey(prev, qId));
    setMcAnswersByQuestionId((prev) => removeRecordKey(prev, qId));
    setMcMarkAppealByQuestionId((prev) => removeRecordKey(prev, qId));
    setMcMarkOverrideInputByQuestionId((prev) => removeRecordKey(prev, qId));
    setMcAwardedMarksByQuestionId((prev) => removeRecordKey(prev, qId));
    setErrorMessage(null);
  }

  function handleResetPassage() {
    setErrorMessage(null);
    setPassage(null);
    setActivePassageQuestionIndex(0);
    setPassageAnswersByQuestionId({});
    setPassageFeedbackByQuestionId({});
    setPassageQuestionPresentedAtById({});
    setPassageRawModelOutput("");
    setPassageGenerationTelemetry(null);
    setGenerationStatus(null);
    setGenerationStartedAt(null);
    setShowPassageRawOutput(false);
  }

  function handleNextWrittenQuestion() {
    if (!canAdvanceWritten) return;
    if (isAtLastWrittenQuestion) {
      setSessionFinishedAt(Date.now());
      setShowCompletionScreen(true);
      return;
    }
    if (isPassageMode && passage) {
      setActivePassageQuestionIndex(Math.min(passage.questions.length - 1, activePassageQuestionIndex + 1));
      return;
    }
    setActiveQuestionIndex(Math.min(questions.length - 1, activeQuestionIndex + 1));
  }

  function handleNextMcQuestion() {
    if (!canAdvanceMc) return;
    if (isAtLastMcQuestion) {
      setSessionFinishedAt(Date.now());
      setShowCompletionScreen(true);
      return;
    }
    setActiveMcQuestionIndex(Math.min(mcQuestions.length - 1, activeMcQuestionIndex + 1));
  }

  function handleStartOver() {
    const shouldAutoSaveWritten =
      questionMode === "written" && (questions.length > 0 || Boolean(passage)) && !activeWrittenSavedSetId;
    const shouldAutoSaveMc =
      questionMode === "multiple-choice" && mcQuestions.length > 0 && !activeMcSavedSetId;
    if (shouldAutoSaveWritten || shouldAutoSaveMc) saveCurrentSet();

    resetStopwatch();
    // Written
    setQuestions([]);
    setWrittenRawModelOutput("");
    setWrittenGenerationTelemetry(null);
    setShowWrittenRawOutput(false);
    setActiveQuestionIndex(0);
    setActiveWrittenSavedSetId(null);
    setWrittenQuestionPresentedAtById({});
    setAnswersByQuestionId({});
    setImagesByQuestionId({});
    setFeedbackByQuestionId({});
    setWrittenResponseEnteredAtById({});
    setMarkAppealByQuestionId({});
    setMarkOverrideInputByQuestionId({});
    // MC
    setMcQuestions([]);
    setMcRawModelOutput("");
    setMcGenerationTelemetry(null);
    setShowMcRawOutput(false);
    setActiveMcQuestionIndex(0);
    setActiveMcSavedSetId(null);
    setMcQuestionPresentedAtById({});
    setMcAnswersByQuestionId({});
    setMcMarkAppealByQuestionId({});
    setMcMarkOverrideInputByQuestionId({});
    setMcAwardedMarksByQuestionId({});
    // Passage
    setPassage(null);
    setActivePassageQuestionIndex(0);
    setPassageAnswersByQuestionId({});
    setPassageFeedbackByQuestionId({});
    setPassageQuestionPresentedAtById({});
    setPassageRawModelOutput("");
    setPassageGenerationTelemetry(null);
    setShowPassageRawOutput(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full w-full p-2 sm:p-3 lg:p-4 flex flex-col gap-3 animate-in fade-in duration-500">
      {errorMessage && (
        <div className="bg-destructive/15 border border-destructive/30 text-destructive px-4 py-3 rounded-lg text-sm flex items-center gap-2 shadow-sm">
          <XCircle className="w-4 h-4 shrink-0" />
          <p className="font-medium">{errorMessage}</p>
        </div>
      )}

      {showSetup ? (
        <SetupPanel
          isPassageMode={isPassageMode}
          sessionFinishedAt={sessionFinishedAt}
          onGenerateWritten={handleGenerateQuestions}
          onGeneratePassage={handleGeneratePassage}
          onGenerateMc={handleGenerateMcQuestions}
          canGenerate={canGenerate}
          canGeneratePassage={canGeneratePassage}
          canGenerateMc={canGenerate}
        />
      ) : showCompletionScreen && isSetComplete ? (
        <CompletionScreen
          accuracyPercent={completionAccuracyPercent}
          generationStartedAt={generationStartedAt}
          sessionFinishedAt={sessionFinishedAt}
          writtenCompletedCount={writtenCompletedCount}
          writtenTotalQuestions={writtenTotalQuestions}
          mcCompletedCount={mcCompletedCount}
          mcQuestionsLength={mcQuestions.length}
          activeWrittenSavedSetId={activeWrittenSavedSetId}
          activeMcSavedSetId={activeMcSavedSetId}
          onReview={() => setShowCompletionScreen(false)}
          onSave={saveCurrentSet}
          onStartOver={handleStartOver}
        />
      ) : questionMode === "written" ? (
        <WrittenSessionView
          isPassageMode={isPassageMode}
          sessionFinishedAt={sessionFinishedAt}
          markAppealByQuestionId={markAppealByQuestionId}
          setMarkAppealByQuestionId={setMarkAppealByQuestionId}
          markOverrideInputByQuestionId={markOverrideInputByQuestionId}
          setMarkOverrideInputByQuestionId={setMarkOverrideInputByQuestionId}
          writtenResponseEnteredAtById={writtenResponseEnteredAtById}
          setWrittenResponseEnteredAtById={setWrittenResponseEnteredAtById}
          showWrittenRawOutput={showWrittenRawOutput}
          setShowWrittenRawOutput={setShowWrittenRawOutput}
          showPassageRawOutput={showPassageRawOutput}
          setShowPassageRawOutput={setShowPassageRawOutput}
          activeWrittenQuestion={activeWrittenQuestion as any}
          activeWrittenAnswer={activeWrittenAnswer}
          activeWrittenFeedback={activeWrittenFeedback}
          activeWrittenMarkAppeal={activeWrittenMarkAppeal}
          activeWrittenOverrideInput={activeWrittenOverrideInput}
          activeWrittenTelemetry={activeWrittenTelemetry}
          activeLineItems={activeLineItems}
          writtenCurrentIndex={writtenCurrentIndex}
          writtenTotalQuestions={writtenTotalQuestions}
          writtenCompletedCount={writtenCompletedCount}
          isAtLastWrittenQuestion={isAtLastWrittenQuestion}
          canAdvanceWritten={canAdvanceWritten}
          isWrittenSetComplete={isWrittenSetComplete}
          canSubmitAnswer={canSubmitAnswer}
          canShowWrittenRawOutput={canShowWrittenRawOutput}
          canShowPassageRawOutput={canShowPassageRawOutput}
          onSubmitForMarking={handleSubmitForMarking}
          onArgueForMark={handleArgueForMark}
          onOverrideMark={handleOverrideMark}
          onCancelQuestion={handleCancelWrittenQuestion}
          onResetPassage={handleResetPassage}
          onStartOver={handleStartOver}
          onNext={handleNextWrittenQuestion}
        />
      ) : (
        <McSessionView
          mcMarkAppealByQuestionId={mcMarkAppealByQuestionId}
          setMcMarkAppealByQuestionId={setMcMarkAppealByQuestionId}
          mcMarkOverrideInputByQuestionId={mcMarkOverrideInputByQuestionId}
          setMcMarkOverrideInputByQuestionId={setMcMarkOverrideInputByQuestionId}
          mcAwardedMarksByQuestionId={mcAwardedMarksByQuestionId}
          activeMcQuestion={activeMcQuestion}
          activeMcAnswer={activeMcAnswer}
          activeMcMarkAppeal={activeMcMarkAppeal}
          activeMcAwardedMarks={activeMcAwardedMarks}
          activeMcOverrideInput={activeMcOverrideInput}
          mcCompletedCount={mcCompletedCount}
          isAtLastMcQuestion={isAtLastMcQuestion}
          canAdvanceMc={canAdvanceMc}
          canShowMcRawOutput={canShowMcRawOutput}
          showMcRawOutput={showMcRawOutput}
          setShowMcRawOutput={setShowMcRawOutput}
          onMcAnswer={handleMcAnswer}
          onArgueForMcMark={handleArgueForMcMark}
          onOverrideMcMark={handleOverrideMcMark}
          onCancelMcQuestion={handleCancelMcQuestion}
          onNextMcQuestion={handleNextMcQuestion}
          onStartOver={handleStartOver}
        />
      )}
    </div>
  );
}
