import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, ArrowRight, ArrowLeft, Trash2, CheckCircle2, XCircle, Clock3, Settings2, BookOpen, Target, Sparkles, Check, Bug, Bookmark, Info, Album, BookCheck, Calculator, Pen } from "lucide-react";
import {
  useAppContext,
  useAppPreferences,
  useAppSettings,
  useMultipleChoiceSession,
  useWrittenSession,
} from "../AppContext";
import { MarkdownMath } from "../components/MarkdownMath";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "../components/ui/card";
import { Dropzone } from "../components/ui/dropzone";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Separator } from "../components/ui/separator";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Slider } from "../components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
import {
  TOPICS,
  Topic,
  TechMode,
  ENGLISH_LANGUAGE_SUBTOPICS,
  ENGLISH_LANGUAGE_TASK_TYPES,
  EnglishLanguageSubtopic,
  EnglishLanguageTaskType,
  MATH_METHODS_SUBTOPICS,
  MathMethodsSubtopic,
  CHEMISTRY_SUBTOPICS,
  ChemistrySubtopic,
  PHYSICAL_EDUCATION_SUBTOPICS,
  PhysicalEducationSubtopic,
  GenerateQuestionsResponse,
  GenerateMcQuestionsResponse,
  McOption,
  McHistoryEntry,
  McAttemptKind,
  QuestionHistoryEntry,
  Difficulty,
  WrittenAttemptKind,
  SpecialistMathSubtopic,
  SPECIALIST_MATH_SUBTOPICS,
  VCE_COMMAND_TERMS,
  VceCommandTerm,
} from "../types";
import { confirmAction, fileToDataUrl, formatDurationMs, normalizeMarkResponse, readBackendError } from "../lib/app-utils";

function countWords(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 0;
  }

  return trimmed.split(/\s+/).length;
}

export function GeneratorView() {
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

  const {
    apiKey,
    model,
    debugMode,
    useStructuredOutput,
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
    englishLanguageSubtopics,
    setEnglishLanguageSubtopics,
    englishLanguageTaskTypes,
    setEnglishLanguageTaskTypes,
    questionCount,
    setQuestionCount,
    maxMarksPerQuestion,
    setMaxMarksPerQuestion,
    prioritizedCommandTerms,
    setPrioritizedCommandTerms,
    questionMode,
    setQuestionMode,
    subtopicInstructions,
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
  const activeMcAwardedMarks = activeMcQuestion
    ? mcAwardedMarksByQuestionId[activeMcQuestion.id]
    : undefined;
  const activeMcOverrideInput = activeMcQuestion
    ? (mcMarkOverrideInputByQuestionId[activeMcQuestion.id] ?? (activeMcAwardedMarks !== undefined ? String(activeMcAwardedMarks) : ""))
    : "";

  const showSetup = questionMode === "written" ? questions.length === 0 : mcQuestions.length === 0;
  const canShowWrittenRawOutput = debugMode && writtenRawModelOutput.trim().length > 0;
  const canShowMcRawOutput = debugMode && mcRawModelOutput.trim().length > 0;

  const completedCount = useMemo(
    () => questions.filter((q: { id: string | number; }) => feedbackByQuestionId[q.id]).length,
    [feedbackByQuestionId, questions],
  );

  const mcCompletedCount = useMemo(
    () => mcQuestions.filter((q: { id: string | number; }) => mcAnswersByQuestionId[q.id]).length,
    [mcAnswersByQuestionId, mcQuestions],
  );

  const lastWrittenCompletedCountRef = useRef(completedCount);
  const lastMcCompletedCountRef = useRef(mcCompletedCount);


  function getMcAwardedMarks(questionId: string, selectedAnswer: string, correctAnswer: string) {
    const overridden = mcAwardedMarksByQuestionId[questionId];
    if (typeof overridden === "number" && Number.isFinite(overridden)) {
      return Math.max(0, Math.min(1, overridden));
    }

    return selectedAnswer === correctAnswer ? 1 : 0;
  }

  const canGenerate =
    selectedTopics.length > 0 &&
    (!selectedTopics.includes("English Language") || englishLanguageTaskTypes.length > 0) &&
    apiKey.trim().length > 0 &&
    model.trim().length > 0 &&
    questionCount >= 1 &&
    questionCount <= 20 &&
    !isGenerating;

  const canGenerateMc =
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
    model.trim().length > 0 &&
    !isMarking &&
    !activeFeedback;

  const isWrittenSetComplete = questionMode === "written" && questions.length > 0 && completedCount === questions.length;
  const isMcSetComplete = questionMode === "multiple-choice" && mcQuestions.length > 0 && mcCompletedCount === mcQuestions.length;
  const isSetComplete = isWrittenSetComplete || isMcSetComplete;
  const isAtLastWrittenQuestion = activeQuestionIndex === questions.length - 1;
  const isAtLastMcQuestion = activeMcQuestionIndex === mcQuestions.length - 1;
  const canAdvanceWritten = questions.length > 0 && (!isAtLastWrittenQuestion || isWrittenSetComplete);
  const canAdvanceMc = mcQuestions.length > 0 && (!isAtLastMcQuestion || isMcSetComplete);

  const completionSetKey = useMemo(() => {
    if (questionMode === "written") {
      return questions.map((question) => question.id).join("|");
    }
    return mcQuestions.map((question) => question.id).join("|");
  }, [questionMode, questions, mcQuestions]);

  const writtenAccuracyPercent = useMemo(() => {
    if (!isWrittenSetComplete) {
      return null;
    }

    const totalAvailable = questions.reduce((sum, question) => sum + question.maxMarks, 0);
    if (totalAvailable === 0) {
      return 0;
    }

    const totalAchieved = questions.reduce((sum, question) => {
      const feedback = feedbackByQuestionId[question.id];
      return sum + (feedback?.achievedMarks ?? 0);
    }, 0);

    return (totalAchieved / totalAvailable) * 100;
  }, [feedbackByQuestionId, isWrittenSetComplete, questions]);

  const mcAccuracyPercent = useMemo(() => {
    if (!isMcSetComplete || mcQuestions.length === 0) {
      return null;
    }

    const achievedMarks = mcQuestions.reduce((sum, question) => {
      const selected = mcAnswersByQuestionId[question.id];
      if (!selected) {
        return sum;
      }

      return sum + getMcAwardedMarks(question.id, selected, question.correctAnswer);
    }, 0);

    return (achievedMarks / mcQuestions.length) * 100;
  }, [isMcSetComplete, mcAnswersByQuestionId, mcQuestions, mcAwardedMarksByQuestionId]);

  const completionAccuracyPercent = questionMode === "written" ? writtenAccuracyPercent : mcAccuracyPercent;

  const elapsedSeconds = generationStartedAt === null
    ? 0
    : Math.max(0, Math.floor(((sessionFinishedAt ?? Date.now()) - generationStartedAt) / 1000));

  const formattedElapsedTime = useMemo(() => {
    const hours = Math.floor(elapsedSeconds / 3600);
    const minutes = Math.floor((elapsedSeconds % 3600) / 60);
    const seconds = elapsedSeconds % 60;
    if (hours > 0) return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }, [elapsedSeconds]);


  useEffect(() => {
    setShowCompletionScreen(false);
  }, [completionSetKey]);

  useEffect(() => {
    const previous = lastWrittenCompletedCountRef.current;
    const hasNewCompletion = completedCount > previous;

    if (
      questionMode === "written" &&
      activeWrittenSavedSetId &&
      questions.length > 0 &&
      hasNewCompletion
    ) {
      saveCurrentSet();
    }

    lastWrittenCompletedCountRef.current = completedCount;
  }, [
    activeWrittenSavedSetId,
    completedCount,
    questionMode,
    questions.length,
    saveCurrentSet,
  ]);

  useEffect(() => {
    const previous = lastMcCompletedCountRef.current;
    const hasNewCompletion = mcCompletedCount > previous;

    if (
      questionMode === "multiple-choice" &&
      activeMcSavedSetId &&
      mcQuestions.length > 0 &&
      hasNewCompletion
    ) {
      saveCurrentSet();
    }

    lastMcCompletedCountRef.current = mcCompletedCount;
  }, [
    activeMcSavedSetId,
    mcCompletedCount,
    mcQuestions.length,
    questionMode,
    saveCurrentSet,
  ]);

  useEffect(() => {
    if (!activeQuestion) {
      return;
    }

    setWrittenQuestionPresentedAtById((prev) => {
      if (prev[activeQuestion.id] !== undefined) {
        return prev;
      }

      return { ...prev, [activeQuestion.id]: Date.now() };
    });
  }, [activeQuestion, setWrittenQuestionPresentedAtById]);

  useEffect(() => {
    if (!activeMcQuestion) {
      return;
    }

    setMcQuestionPresentedAtById((prev) => {
      if (prev[activeMcQuestion.id] !== undefined) {
        return prev;
      }

      return { ...prev, [activeMcQuestion.id]: Date.now() };
    });
  }, [activeMcQuestion, setMcQuestionPresentedAtById]);

  function startStopwatch() {
    setGenerationStartedAt(Date.now());
    setSessionFinishedAt(null);
  }

  function resetStopwatch() {
    setGenerationStartedAt(null);
    setSessionFinishedAt(null);
  }

  function handleNextWrittenQuestion() {
    if (!canAdvanceWritten) {
      return;
    }

    if (isAtLastWrittenQuestion) {
      setSessionFinishedAt(Date.now());
      setShowCompletionScreen(true);
      return;
    }

    setActiveQuestionIndex(Math.min(questions.length - 1, activeQuestionIndex + 1));
  }

  function handleNextMcQuestion() {
    if (!canAdvanceMc) {
      return;
    }

    if (isAtLastMcQuestion) {
      setSessionFinishedAt(Date.now());
      setShowCompletionScreen(true);
      return;
    }

    setActiveMcQuestionIndex(Math.min(mcQuestions.length - 1, activeMcQuestionIndex + 1));
  }

  function removeRecordKey<T>(record: Record<string, T>, key: string) {
    const next = { ...record };
    delete next[key];
    return next;
  }

  function handleCancelWrittenQuestion() {
    if (!activeQuestion) {
      return;
    }

    const shouldCancel = confirmAction(
      "Cancel this question? It will be removed from your current set.",
    );
    if (!shouldCancel) {
      return;
    }

    const questionId = activeQuestion.id;
    const nextQuestions = questions.filter((question) => question.id !== questionId);
    const nextQuestionCount = Math.max(1, nextQuestions.length);

    setQuestions(nextQuestions);
    setQuestionCount(nextQuestionCount);
    setActiveWrittenSavedSetId(null);
    setShowCompletionScreen(false);
    setActiveQuestionIndex(Math.min(activeQuestionIndex, Math.max(0, nextQuestions.length - 1)));
    setWrittenQuestionPresentedAtById((prev) => removeRecordKey(prev, questionId));
    setAnswersByQuestionId((prev) => removeRecordKey(prev, questionId));
    setImagesByQuestionId((prev) => removeRecordKey(prev, questionId));
    setFeedbackByQuestionId((prev) => removeRecordKey(prev, questionId));
    setMarkAppealByQuestionId((prev) => removeRecordKey(prev, questionId));
    setMarkOverrideInputByQuestionId((prev) => removeRecordKey(prev, questionId));
    setWrittenResponseEnteredAtById((prev) => removeRecordKey(prev, questionId));
    setErrorMessage(null);
  }

  function handleCancelMcQuestion() {
    if (!activeMcQuestion) {
      return;
    }

    const shouldCancel = confirmAction(
      "Cancel this question? It will be removed from your current set.",
    );
    if (!shouldCancel) {
      return;
    }

    const questionId = activeMcQuestion.id;
    const nextQuestions = mcQuestions.filter((question) => question.id !== questionId);
    const nextQuestionCount = Math.max(1, nextQuestions.length);

    setMcQuestions(nextQuestions);
    setQuestionCount(nextQuestionCount);
    setActiveMcSavedSetId(null);
    setShowCompletionScreen(false);
    setActiveMcQuestionIndex(Math.min(activeMcQuestionIndex, Math.max(0, nextQuestions.length - 1)));
    setMcQuestionPresentedAtById((prev) => removeRecordKey(prev, questionId));
    setMcAnswersByQuestionId((prev) => removeRecordKey(prev, questionId));
    setMcMarkAppealByQuestionId((prev) => removeRecordKey(prev, questionId));
    setMcMarkOverrideInputByQuestionId((prev) => removeRecordKey(prev, questionId));
    setMcAwardedMarksByQuestionId((prev) => removeRecordKey(prev, questionId));
    setErrorMessage(null);
  }

  function toggleTopic(topic: Topic) {
    setSelectedTopics((prev) => prev.includes(topic) ? prev.filter((t: Topic) => t !== topic) : [...prev, topic]);
  }

  function toggleMathMethodsSubtopic(sub: MathMethodsSubtopic) {
    setMathMethodsSubtopics((prev: MathMethodsSubtopic[]) => prev.includes(sub) ? prev.filter((s: MathMethodsSubtopic) => s !== sub) : [...prev, sub]);
  }

  function toggleSpecialistMathSubtopic(sub: SpecialistMathSubtopic) {
    setSpecialistMathSubtopics((prev: SpecialistMathSubtopic[]) => prev.includes(sub) ? prev.filter((s: SpecialistMathSubtopic) => s !== sub) : [...prev, sub]);
  }

  function toggleChemistrySubtopic(sub: ChemistrySubtopic) {
    setChemistrySubtopics((prev: ChemistrySubtopic[]) => prev.includes(sub) ? prev.filter((s: ChemistrySubtopic) => s !== sub) : [...prev, sub]);
  }

  function togglePhysicalEducationSubtopic(sub: PhysicalEducationSubtopic) {
    setPhysicalEducationSubtopics((prev: PhysicalEducationSubtopic[]) => prev.includes(sub) ? prev.filter((s: PhysicalEducationSubtopic) => s !== sub) : [...prev, sub]);
  }

  function toggleEnglishLanguageSubtopic(sub: EnglishLanguageSubtopic) {
    setEnglishLanguageSubtopics((prev: EnglishLanguageSubtopic[]) => prev.includes(sub) ? prev.filter((s: EnglishLanguageSubtopic) => s !== sub) : [...prev, sub]);
  }

  function toggleEnglishLanguageTaskType(taskType: EnglishLanguageTaskType) {
    setEnglishLanguageTaskTypes((prev: EnglishLanguageTaskType[]) => prev.includes(taskType)
      ? prev.filter((t: EnglishLanguageTaskType) => t !== taskType)
      : [...prev, taskType]);
  }

  function getSelectedSubtopics() {
    const selectedSubtopics: string[] = [
      ...(selectedTopics.includes("Mathematical Methods") ? mathMethodsSubtopics : []),
      ...(selectedTopics.includes("Specialist Mathematics") ? specialistMathSubtopics : []),
      ...(selectedTopics.includes("Chemistry") ? chemistrySubtopics : []),
      ...(selectedTopics.includes("Physical Education") ? physicalEducationSubtopics : []),
      ...(selectedTopics.includes("English Language") ? englishLanguageSubtopics : []),
    ];

    return Array.from(new Set(selectedSubtopics));
  }

  function getSelectedSubtopicInstructions() {
    const selected = getSelectedSubtopics();
    const filtered: Record<string, string> = {};

    for (const subtopic of selected) {
      const instruction = subtopicInstructions[subtopic]?.trim();
      if (!instruction) {
        continue;
      }
      filtered[subtopic] = instruction;
    }

    return filtered;
  }

  function getCustomFocusArea() {
    const customFocus = customFocusArea.trim();
    return customFocus.length > 0 ? customFocus : undefined;
  }

  function isMathTopic(topic?: string) {
    return topic === "Mathematical Methods" || topic === "Specialist Mathematics";
  }

  function getDifficultyBadgeClasses(level: Difficulty) {
    switch (level) {
      case "Essential Skills":
        return "border-green-300 bg-green-50 text-green-800 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-200";
      case "Easy":
        return "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200";
      case "Medium":
        return "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200";
      case "Hard":
        return "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-200";
      case "Extreme":
        return "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200";
      default:
        return "";
    }
  }

  function togglePrioritizedCommandTerm(term: VceCommandTerm) {
    setPrioritizedCommandTerms((prev) =>
      prev.includes(term)
        ? prev.filter((item: VceCommandTerm) => item !== term)
        : [...prev, term],
    );
  }

  function getWrittenAttemptSequence(questionId: string) {
    return questionHistory.filter((entry) => entry.question.id === questionId).length + 1;
  }

  function getMcAttemptSequence(questionId: string) {
    return mcHistory.filter((entry) => entry.question.id === questionId).length + 1;
  }

  function appendMcHistoryEntry(
    question: typeof activeMcQuestion,
    selectedAnswer: string,
    awardedMarks: number,
    attemptKind: McAttemptKind,
    responseEnteredAtMs?: number,
  ) {
    if (!question) {
      return;
    }

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
        responseLatencyMs: Number.isFinite(questionStartedAt) && Number.isFinite(responseEnteredAt)
          ? Math.max(0, responseEnteredAt - questionStartedAt)
          : undefined,
      },
    };

    setMcHistory((prev: any) => [entry, ...prev].slice(0, 200));
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
    if (!question) {
      return;
    }

    const uploadedAnswer = options?.uploadedAnswerOverride ?? (answersByQuestionId[question.id] ?? "");
    const createdAt = new Date().toISOString();
    const questionStartedAt = writtenQuestionPresentedAtById[question.id];
    const responseEnteredAt = options?.responseEnteredAtMs ?? writtenResponseEnteredAtById[question.id] ?? Date.now();

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
        responseLatencyMs: Number.isFinite(questionStartedAt) && Number.isFinite(responseEnteredAt)
          ? Math.max(0, responseEnteredAt - questionStartedAt)
          : undefined,
        markingLatencyMs: options?.markingLatencyMs,
      },
    };

    setQuestionHistory((prev: any) => [historyEntry, ...prev].slice(0, 200));
  }

  function getRecentSameTopicQuestionPrompts(mode: "written" | "multiple-choice") {
    const selectedTopicSet = new Set(selectedTopics);
    const seen = new Set<string>();
    const prompts: string[] = [];
    const maxPromptCount = 6;

    if (mode === "written") {
      for (const entry of questionHistory) {
        if (!selectedTopicSet.has(entry.question.topic as Topic)) continue;
        const prompt = entry.question.promptMarkdown.trim();
        if (!prompt || seen.has(prompt)) continue;
        seen.add(prompt);
        prompts.push(prompt);
        if (prompts.length >= maxPromptCount) break;
      }
      return prompts;
    }

    for (const entry of mcHistory) {
      if (!selectedTopicSet.has(entry.question.topic as Topic)) continue;
      const prompt = entry.question.promptMarkdown.trim();
      if (!prompt || seen.has(prompt)) continue;
      seen.add(prompt);
      prompts.push(prompt);
      if (prompts.length >= maxPromptCount) break;
    }

    return prompts;
  }

  async function handleGenerateQuestions() {
    if (!canGenerate) return;
    const customFocus = getCustomFocusArea();
    const hasPeTopicLocal = selectedTopics.includes("Physical Education");
    const hasAnyMathTopicLocal = selectedTopics.some((topic) => isMathTopic(topic));
    startStopwatch();
    setErrorMessage(null);
    setGenerationStatus({
      mode: "written",
      stage: "preparing",
      message: "Preparing generation request.",
      attempt: 1,
    });
    setIsGenerating(true);

    try {
      const response = await invoke<GenerateQuestionsResponse>("generate_questions", {
        request: {
          topics: selectedTopics,
          difficulty,
          questionCount,
          maxMarksPerQuestion: hasAnyMathTopicLocal ? maxMarksPerQuestion : undefined,
          prioritizedCommandTerms: hasPeTopicLocal ? prioritizedCommandTerms : [],
          model,
          apiKey,
          techMode,
          useStructuredOutput,
          subtopics: getSelectedSubtopics(),
          subtopicInstructions: getSelectedSubtopicInstructions(),
          customFocusArea: customFocus,
          avoidSimilarQuestions,
          priorQuestionPrompts: avoidSimilarQuestions ? getRecentSameTopicQuestionPrompts("written") : [],
          englishTaskTypes: selectedTopics.includes("English Language") ? englishLanguageTaskTypes : [],
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
      setGenerationStatus({
        mode: "written",
        stage: "failed",
        message: "Generation failed.",
        attempt: generationStatus?.attempt ?? 1,
      });
      setErrorMessage(readBackendError(error));
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSubmitForMarking() {
    if (!activeQuestion || !canSubmitAnswer) return;
    setErrorMessage(null);
    setIsMarking(true);

    try {
      const responseEnteredAtMs = writtenResponseEnteredAtById[activeQuestion.id] ?? Date.now();
      const markStartedAt = Date.now();
      const rawResponse = await invoke<unknown>("mark_answer", {
        request: {
          question: activeQuestion,
          studentAnswer: activeQuestionAnswer,
          studentAnswerImageDataUrl: activeQuestionImage?.dataUrl,
          model,
          apiKey,
          useStructuredOutput,
        },
      });

      const markingLatencyMs = Date.now() - markStartedAt;
      const response = normalizeMarkResponse(rawResponse, activeQuestion.maxMarks);
      setFeedbackByQuestionId((prev: any) => ({ ...prev, [activeQuestion.id]: response }));
      setMarkOverrideInputByQuestionId((prev) => ({
        ...prev,
        [activeQuestion.id]: String(response.achievedMarks),
      }));
      appendWrittenHistoryEntry(activeQuestion, response, {
        uploadedAnswerOverride: activeQuestionAnswer,
        attemptKind: "initial",
        markingLatencyMs,
        responseEnteredAtMs,
      });
    } catch (error) {
      setErrorMessage(readBackendError(error));
    } finally {
      setIsMarking(false);
    }
  }

  async function handleArgueForMark() {
    if (!activeQuestion || !activeFeedback) return;

    const appealText = activeMarkAppeal.trim();
    if (appealText.length === 0) {
      setErrorMessage("Enter your argument before requesting a re-mark.");
      return;
    }

    if (apiKey.trim().length === 0 || model.trim().length === 0) {
      setErrorMessage("Configure API key and model before requesting a re-mark.");
      return;
    }

    setErrorMessage(null);
    setIsMarking(true);

    try {
      const responseEnteredAtMs = Date.now();
      const markStartedAt = Date.now();
      const arguedAnswer = [
        activeQuestionAnswer,
        `Additional marking argument from student:\n${appealText}`,
      ]
        .filter((part) => part.trim().length > 0)
        .join("\n\n");

      const rawResponse = await invoke<unknown>("mark_answer", {
        request: {
          question: activeQuestion,
          studentAnswer: arguedAnswer,
          studentAnswerImageDataUrl: activeQuestionImage?.dataUrl,
          model,
          apiKey,
          useStructuredOutput,
        },
      });

      const markingLatencyMs = Date.now() - markStartedAt;
      const response = normalizeMarkResponse(rawResponse, activeQuestion.maxMarks);
      setFeedbackByQuestionId((prev: any) => ({ ...prev, [activeQuestion.id]: response }));
      setMarkOverrideInputByQuestionId((prev) => ({
        ...prev,
        [activeQuestion.id]: String(response.achievedMarks),
      }));
      appendWrittenHistoryEntry(activeQuestion, response, {
        uploadedAnswerOverride: activeQuestionAnswer,
        attemptKind: "appeal",
        markingLatencyMs,
        responseEnteredAtMs,
      });
    } catch (error) {
      setErrorMessage(readBackendError(error));
    } finally {
      setIsMarking(false);
    }
  }

  function handleOverrideMark() {
    if (!activeQuestion || !activeFeedback) {
      return;
    }

    const parsed = Number(activeOverrideInput);
    if (!Number.isFinite(parsed)) {
      setErrorMessage("Enter a whole number to override the mark.");
      return;
    }

    const rounded = Math.round(parsed);
    const clampedMarks = Math.max(0, Math.min(activeFeedback.maxMarks, rounded));

    const updatedResponse = {
      ...activeFeedback,
      achievedMarks: clampedMarks,
      scoreOutOf10: Math.round((clampedMarks / activeFeedback.maxMarks) * 10),
      verdict:
        clampedMarks === activeFeedback.maxMarks
          ? "Correct"
          : clampedMarks === 0
            ? "Incorrect"
            : "Overridden",
    };

    setErrorMessage(null);
    setFeedbackByQuestionId((prev: any) => ({ ...prev, [activeQuestion.id]: updatedResponse }));
    setMarkOverrideInputByQuestionId((prev) => ({
      ...prev,
      [activeQuestion.id]: String(clampedMarks),
    }));
    appendWrittenHistoryEntry(activeQuestion, updatedResponse, {
      uploadedAnswerOverride: activeQuestionAnswer,
      attemptKind: "override",
      responseEnteredAtMs: Date.now(),
    });
  }

  async function handleGenerateMcQuestions() {
    if (!canGenerateMc) return;
    const customFocus = getCustomFocusArea();
    startStopwatch();
    setErrorMessage(null);
    setGenerationStatus({
      mode: "multiple-choice",
      stage: "preparing",
      message: "Preparing generation request.",
      attempt: 1,
    });
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
          customFocusArea: customFocus,
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
      setGenerationStatus({
        mode: "multiple-choice",
        stage: "failed",
        message: "Generation failed.",
        attempt: generationStatus?.attempt ?? 1,
      });
      setErrorMessage(readBackendError(error));
    } finally {
      setIsGenerating(false);
    }
  }

  const hasAnyMathTopic = selectedTopics.some((topic) => isMathTopic(topic));
  const hasPeTopic = selectedTopics.includes("Physical Education");
  const hasEnglishLanguageTopic = selectedTopics.includes("English Language");
  const commandTermsDisabled = !hasPeTopic;

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
    if (!question) {
      return "";
    }

    const optionsText = question.options
      .map((option: McOption) => `${option.label}. ${option.text}`)
      .join("\n");

    return `${question.promptMarkdown}\n\nOptions:\n${optionsText}`;
  }

  async function handleArgueForMcMark() {
    if (!activeMcQuestion || !activeMcAnswer) {
      return;
    }

    const appealText = activeMcMarkAppeal.trim();
    if (appealText.length === 0) {
      setErrorMessage("Enter your argument before requesting a re-mark.");
      return;
    }

    if (apiKey.trim().length === 0 || model.trim().length === 0) {
      setErrorMessage("Configure API key and model before requesting a re-mark.");
      return;
    }

    setErrorMessage(null);
    setIsMarking(true);

    try {
      const responseEnteredAtMs = Date.now();
      const selectedOptionText = activeMcQuestion.options.find((option: McOption) => option.label === activeMcAnswer)?.text ?? "";
      const arguedAnswer = [
        `Student selected option ${activeMcAnswer}: ${selectedOptionText}`,
        `Student argument for marks:\n${appealText}`,
      ]
        .filter((part) => part.trim().length > 0)
        .join("\n\n");

      const rawResponse = await invoke<unknown>("mark_answer", {
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
          model,
          apiKey,
          useStructuredOutput,
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
      appendMcHistoryEntry(activeMcQuestion, activeMcAnswer, awardedMarks, "appeal", responseEnteredAtMs);
    } catch (error) {
      setErrorMessage(readBackendError(error));
    } finally {
      setIsMarking(false);
    }
  }

  function handleOverrideMcMark() {
    if (!activeMcQuestion || !activeMcAnswer) {
      return;
    }

    const parsed = Number(activeMcOverrideInput);
    if (!Number.isFinite(parsed)) {
      setErrorMessage("Enter a whole number to override the mark.");
      return;
    }

    const rounded = Math.round(parsed);
    const clampedMarks = Math.max(0, Math.min(1, rounded));

    setErrorMessage(null);
    setMcAwardedMarksByQuestionId((prev) => ({
      ...prev,
      [activeMcQuestion.id]: clampedMarks,
    }));
    setMcMarkOverrideInputByQuestionId((prev) => ({
      ...prev,
      [activeMcQuestion.id]: String(clampedMarks),
    }));
    appendMcHistoryEntry(activeMcQuestion, activeMcAnswer, clampedMarks, "override", Date.now());
  }

  function handleStartOver() {
    const shouldAutoSaveWritten =
      questionMode === "written" &&
      questions.length > 0 &&
      !activeWrittenSavedSetId;
    const shouldAutoSaveMc =
      questionMode === "multiple-choice" &&
      mcQuestions.length > 0 &&
      !activeMcSavedSetId;

    if (shouldAutoSaveWritten || shouldAutoSaveMc) {
      saveCurrentSet();
    }

    resetStopwatch();
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
  }
  async function handleDropDropzone(acceptedFiles: File[]) {
    if (!activeQuestion || acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    try {
      const dataUrl = await fileToDataUrl(file);
      setErrorMessage(null);
      setImagesByQuestionId((prev: any) => ({
        ...prev,
        [activeQuestion.id]: { name: file.name, dataUrl },
      }));
      setWrittenResponseEnteredAtById((prev) => {
        if (prev[activeQuestion.id] !== undefined) {
          return prev;
        }

        return { ...prev, [activeQuestion.id]: Date.now() };
      });
    } catch {
      setErrorMessage("Could not read image file. Try a different file.");
    }
  }

  // --- Render Helpers ---

  function renderProgressBar(current: number, total: number, completed: number) {
    if (total === 0) return null;
    const percent = Math.min(100, Math.round((current / total) * 100));
    const completedPercent = Math.min(100, Math.round((completed / total) * 100));
    return (
      <div className="w-full flex flex-col gap-1">
        <div className="flex justify-between items-center text-xs font-medium mb-1">
          <span>Question {current} of {total}</span>
          <span className="text-muted-foreground">Completed: {completed} / {total}</span>
        </div>
        <div className="relative w-full h-3 bg-muted/40 rounded-full overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full bg-green-400/70 dark:bg-green-600/70 transition-all"
            style={{ width: `${completedPercent}%` }}
          />
          <div
            className="absolute left-0 top-0 h-full bg-primary/80 transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full w-full p-3 sm:p-4 lg:p-6 flex flex-col gap-6 animate-in fade-in duration-500">
      {errorMessage && (
        <div className="bg-destructive/15 border border-destructive/30 text-destructive px-5 py-4 rounded-xl text-sm flex items-center gap-3 shadow-sm">
          <XCircle className="w-5 h-5 shrink-0" />
          <p className="font-medium">{errorMessage}</p>
        </div>
      )}

      {showSetup ? (
        <Card className="border-0 shadow-xl bg-card/50 backdrop-blur-sm overflow-hidden">
          <div className="px-5 pb-3 border-b">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-2xl font-extrabold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  Practice Generator
                </CardTitle>
                <CardDescription className="text-sm mt-1">Configure your custom VCE revision session</CardDescription>
              </div>
              <div className="bg-background/80 p-1 rounded-xl shadow-sm border inline-flex">
                <Button
                  variant={questionMode === "written" ? "default" : "ghost"}
                  size="sm"
                  className={`rounded-lg transition-all ${questionMode === "written" ? "shadow-md" : ""}`}
                  onClick={() => setQuestionMode("written")}
                >
                  <BookOpen className="w-4 h-4 mr-2" /> Written Answer
                </Button>
                <Button
                  variant={questionMode === "multiple-choice" ? "default" : "ghost"}
                  size="sm"
                  className={`rounded-lg transition-all ${questionMode === "multiple-choice" ? "shadow-md" : ""}`}
                  onClick={() => setQuestionMode("multiple-choice")}
                >
                  <Target className="w-4 h-4 mr-2" /> Multiple Choice
                </Button>
              </div>
            </div>
          </div>

          <CardContent className="p-4 md:p-5 space-y-5">
            {/* Subject Selection */}
            <div className="space-y-2">
              <Label className="text-base font-semibold flex items-center gap-2">
                Select Subjects
              </Label>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {TOPICS.map((topic) => {
                  const isSelected = selectedTopics.includes(topic);
                  return (
                    <Button key={topic} variant={isSelected ? "default" : "outline"} className={`w-full transition-colors ${isSelected ? "shadow-md" : "hover:bg-primary/10"}`} onClick={() => toggleTopic(topic)}>
                      {topic}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Subtopic Drill-downs */}
            {(selectedTopics.includes("Mathematical Methods") || selectedTopics.includes("Specialist Mathematics") || selectedTopics.includes("Chemistry") || selectedTopics.includes("Physical Education") || selectedTopics.includes("English Language")) && (
              <div className="bg-muted/30 p-4 rounded-xl border space-y-2">
                {selectedTopics.includes("Mathematical Methods") && (
                  <div className="space-y-2">
                    <div>
                      <Label className="text-sm font-semibold">Mathematical Methods Focus Areas</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">Leave all unselected to test across the entire curriculum.</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {MATH_METHODS_SUBTOPICS.map((sub) => (
                        <Badge
                          key={sub}
                          variant={mathMethodsSubtopics.includes(sub) ? "default" : "outline"}
                          className={`cursor-pointer p-3 text-xs transition-colors ${mathMethodsSubtopics.includes(sub) ? "shadow-md" : "hover:bg-primary/10"}`}
                          onClick={() => toggleMathMethodsSubtopic(sub)}
                        >
                          {sub}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {selectedTopics.includes("Specialist Mathematics") && (
                  <div className="space-y-2">
                    <div>
                      <Label className="text-sm font-semibold">Specialist Mathematics Focus Areas</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">Leave all unselected to test across the entire curriculum.</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {SPECIALIST_MATH_SUBTOPICS.map((sub) => (
                        <Badge
                          key={sub}
                          variant={specialistMathSubtopics.includes(sub) ? "default" : "outline"}
                          className={`cursor-pointer p-3 text-xs transition-colors ${specialistMathSubtopics.includes(sub) ? "shadow-md" : "hover:bg-primary/10"}`}
                          onClick={() => toggleSpecialistMathSubtopic(sub)}
                        >
                          {sub}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {selectedTopics.includes("Chemistry") && (
                  <div className="space-y-2">
                    <div>
                      <Label className="text-sm font-semibold">Chemistry Focus Areas</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">Select one or more Chemistry study points, or leave all unselected to span the full course.</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {CHEMISTRY_SUBTOPICS.map((sub) => (
                        <Badge
                          key={sub}
                          variant={chemistrySubtopics.includes(sub) ? "default" : "outline"}
                          className={`cursor-pointer p-3 text-xs transition-colors ${chemistrySubtopics.includes(sub) ? "shadow-md" : "hover:bg-primary/10"}`}
                          onClick={() => toggleChemistrySubtopic(sub)}
                        >
                          {sub}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {selectedTopics.includes("Physical Education") && (
                  <div className="space-y-2">
                    <div>
                      <Label className="text-sm font-semibold">Physical Education Unit 3/4 Focus Areas</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">Based on the 2025 Study Design.</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {PHYSICAL_EDUCATION_SUBTOPICS.map((sub) => (
                        <Badge
                          key={sub}
                          variant={physicalEducationSubtopics.includes(sub) ? "default" : "outline"}
                          className={`cursor-pointer p-3 text-xs transition-colors ${physicalEducationSubtopics.includes(sub) ? "shadow-md" : "hover:bg-primary/10"}`}
                          onClick={() => togglePhysicalEducationSubtopic(sub)}
                        >
                          {sub}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {selectedTopics.includes("English Language") && (
                  <div className="space-y-2">
                    <div>
                      <Label className="text-sm font-semibold">English Language Unit 1-4 Areas of Study</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">Select specific study-design areas, or leave all unselected to span Units 1-4 broadly.</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {ENGLISH_LANGUAGE_SUBTOPICS.map((sub) => (
                        <Badge
                          key={sub}
                          variant={englishLanguageSubtopics.includes(sub) ? "default" : "outline"}
                          className={`cursor-pointer p-3 text-xs transition-colors ${englishLanguageSubtopics.includes(sub) ? "shadow-md" : "hover:bg-primary/10"}`}
                          onClick={() => toggleEnglishLanguageSubtopic(sub)}
                        >
                          {sub}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Configuration Parameters */}
            <div className="flex flex-col gap-y-3">
              {(selectedTopics.includes("Mathematical Methods") || selectedTopics.includes("Specialist Mathematics")) && (
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <Settings2 className="w-4 h-4" /> Calculator Mode
                  </Label>
                  <div className="grid grid-cols-3 gap-2 w-full md:w-2/3 lg:w-1/2">
                    {(["tech-free", "mix", "tech-active"] as TechMode[]).map((mode) => {
                      const isActive = techMode === mode;
                      return (
                        <Button
                          key={mode}
                          variant={isActive ? "default" : "outline"}
                          className={`w-full h-9 text-sm transition-all ${isActive ? "shadow-md ring-2 ring-primary/20 ring-offset-1" : ""}`}
                          onClick={() => setTechMode(mode)}
                        >
                          {mode === "tech-free" && <Pen className="w-4 h-4 mr-1" />}
                          {mode === "tech-active" && <Calculator className="w-4 h-4 mr-1" />}
                          {mode === "tech-free" ? "Tech-Free" : mode === "tech-active" ? "Tech-Active" : "Mixed"}
                        </Button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-1.5 md:col-span-2">
                <div className="flex items-center gap-2">
                  <BookCheck className="w-4 h-4" />
                  <Label className="text-sm font-semibold">Custom Focus Area (Optional)</Label>
                </div>
                <Input
                  value={customFocusArea}
                  onChange={(e) => setCustomFocusArea(e.target.value)}
                  maxLength={160}
                  placeholder="e.g. projectile motion with optimization constraints"
                />
                <p className="text-xs text-muted-foreground">
                  Add a custom topic or skill focus to guide generation. This is appended to the selected subtopics sent to the model.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Album className="w-4 h-4" />
                  <Label className="text-sm font-semibold">Difficulty</Label>
                </div>
                <div className="pl-px flex w-full flex-nowrap items-start gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] py-1">
                  {(["Essential Skills", "Easy", "Medium", "Hard", "Extreme"] as Difficulty[]).map((level) => {
                    const isSelected = difficulty === level;
                    return (
                      <Button
                        key={level}
                        variant={isSelected ? "default" : "outline"}
                        className={`h-9 shrink-0 whitespace-nowrap px-3 text-sm transition-all ${isSelected ? "shadow-md ring-2 ring-primary/20 ring-offset-1" : ""}`}
                        onClick={() => setDifficulty(level)}
                      >
                        {level}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between items-center">
                  <Label className="text-sm font-semibold">Question Count</Label>
                  <Badge variant="secondary" className="px-2 py-0.5 text-xs">{questionCount}</Badge>
                </div>
                <Slider min={1} max={20} step={1} value={[questionCount]} onValueChange={(val) => setQuestionCount(val[0])} className="py-1" />
              </div>

              {questionMode === "written" && hasAnyMathTopic && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm font-semibold">Max Marks per Question</Label>
                    <Badge variant="secondary" className="px-2 py-0.5 text-xs">{maxMarksPerQuestion}</Badge>
                  </div>
                  <Slider min={1} max={30} step={1} value={[maxMarksPerQuestion]} onValueChange={(val) => setMaxMarksPerQuestion(val[0])} className="py-1" />
                  <p className="text-xs text-muted-foreground">Caps the mark value for each generated maths question.</p>
                </div>
              )}

              {questionMode === "written" && hasPeTopic && (
                <div className="space-y-1.5 pt-1 md:col-span-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm font-semibold">VCE Command Terms to Prioritise</Label>
                    <Badge variant="secondary" className="px-2 py-0.5 text-xs">{prioritizedCommandTerms.length} Selected</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {VCE_COMMAND_TERMS.map((term) => {
                      const isSelected = prioritizedCommandTerms.includes(term);
                      return (
                        <Badge
                          key={term}
                          variant={isSelected ? "default" : "outline"}
                          className={`px-3 py-1.5 text-xs transition-colors ${commandTermsDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${isSelected ? "shadow-md" : "hover:bg-primary/10"}`}
                          onClick={() => {
                            if (!commandTermsDisabled) {
                              togglePrioritizedCommandTerm(term);
                            }
                          }}
                        >
                          {term}
                        </Badge>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The model is instructed to focus on what each command term means and what a student must do to answer successfully.
                    {commandTermsDisabled
                      ? " Command-term prioritisation is currently disabled because only Mathematics topics are selected."
                      : hasAnyMathTopic
                        ? " Command-term prioritisation applies to non-Mathematics questions only."
                        : ""}
                  </p>
                </div>
              )}

              {questionMode === "written" && hasEnglishLanguageTopic && (
                <div className="space-y-1.5 pt-1 md:col-span-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm font-semibold">English Language Task Types</Label>
                    <Badge variant="secondary" className="px-2 py-0.5 text-xs">{englishLanguageTaskTypes.length} Selected</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ENGLISH_LANGUAGE_TASK_TYPES.map((taskType) => {
                      const isSelected = englishLanguageTaskTypes.includes(taskType);
                      return (
                        <Badge
                          key={taskType}
                          variant={isSelected ? "default" : "outline"}
                          className={`px-3 py-1.5 text-xs cursor-pointer transition-colors ${isSelected ? "shadow-md" : "hover:bg-primary/10"}`}
                          onClick={() => toggleEnglishLanguageTaskType(taskType)}
                        >
                          {taskType === "short-answer" ? "Short Answer" : "Analytical Essay"}
                        </Badge>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Select one or both SAC sections. At least one task type is required when English Language is selected.
                  </p>
                </div>
              )}

              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-sm font-semibold">Variation Guardrail</Label>
                <Button
                  type="button"
                  variant={avoidSimilarQuestions ? "default" : "outline"}
                  className="h-auto w-full justify-start py-2.5 text-left whitespace-normal"
                  onClick={() => setAvoidSimilarQuestions(!avoidSimilarQuestions)}
                >
                  <div className="min-w-0 flex flex-col items-start gap-0.5">
                    <span className="w-full wrap-break-word">
                      {avoidSimilarQuestions ? "Avoid Similar Questions: On" : "Avoid Similar Questions: Off"}
                    </span>
                    <span className="w-full wrap-break-word text-xs font-normal opacity-80">
                      When enabled, generation includes your recent same-topic prompts (if available) and asks the model to avoid repeating them.
                    </span>
                  </div>
                </Button>
              </div>

            </div>

            {!apiKey && (
              <div className="bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 p-3 rounded-lg text-xs flex items-center gap-2">
                <Settings2 className="w-4 h-4 shrink-0" />
                <span><strong>API Key Missing:</strong> Go to Settings to configure your OpenRouter API Key before generating questions.</span>
              </div>
            )}

          </CardContent>

          <CardFooter className="bg-muted/20 border-t flex flex-col gap-3">
            <Button
              size="lg"
              className={`w-full h-12 text-base font-bold transition-all duration-300 ${isGenerating ? 'opacity-90' : 'hover:scale-[1.01] hover:shadow-xl hover:shadow-primary/25 bg-linear-to-r from-primary to-primary/90'}`}
              onClick={questionMode === "written" ? handleGenerateQuestions : handleGenerateMcQuestions}
              disabled={questionMode === "written" ? !canGenerate : !canGenerateMc}
            >
              {isGenerating ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Crafting Questions...</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" /> Generate Revision Set</>
              )}
            </Button>
            {isGenerating && generationStartedAt !== null && (
              <div className="w-full rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                    <span>{generationStatus?.message ?? "Generating questions..."}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Badge variant="outline" className="bg-background/70 px-1.5 py-0">{generationStatus?.stage ?? "generating"}</Badge>
                    <Badge variant="outline" className="bg-background/70 px-1.5 py-0">Attempt {generationStatus?.attempt ?? 1}</Badge>
                    <span className="inline-flex items-center gap-1 font-medium text-xs">
                      <Clock3 className="w-3 h-3" /> {formattedElapsedTime}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </CardFooter>
        </Card>


      ) : showCompletionScreen && isSetComplete ? (
        <Card className="border-0 shadow-xl bg-card/50 backdrop-blur-sm overflow-hidden animate-in fade-in duration-500">
          <CardHeader className="border-b bg-muted/20 p-5 md:p-6">
            <div className="flex flex-col gap-2">
              <CardTitle className="text-2xl font-extrabold flex items-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-green-500" /> Session Complete
              </CardTitle>
              <CardDescription>
                Nice work. You have finished this {questionMode === "written" ? "written-response" : "multiple-choice"} set.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="p-5 md:p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Accuracy</div>
                <div className="mt-1 text-3xl font-extrabold">{(completionAccuracyPercent ?? 0).toFixed(1)}%</div>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Time</div>
                <div className="mt-1 text-3xl font-extrabold">{formattedElapsedTime}</div>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Difficulty</div>
                <div className="mt-1 text-3xl font-extrabold">{difficulty}</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="secondary">{questionMode === "written" ? "Written Answer" : "Multiple Choice"}</Badge>
              <Badge variant="outline">{questionMode === "written" ? `${completedCount}/${questions.length}` : `${mcCompletedCount}/${mcQuestions.length}`} completed</Badge>
            </div>
          </CardContent>

          <CardFooter className="bg-muted/20 p-4 md:p-5 border-t flex flex-wrap gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setShowCompletionScreen(false);
              }}
            >
              Review Questions
            </Button>
            <Button variant={questionMode === "written" ? (activeWrittenSavedSetId ? "default" : "outline") : (activeMcSavedSetId ? "default" : "outline")} onClick={saveCurrentSet}>
              {questionMode === "written" ? (activeWrittenSavedSetId ? "Update Saved Set" : "Save for Later") : (activeMcSavedSetId ? "Update Saved Set" : "Save for Later")}
            </Button>
            <Button onClick={handleStartOver}>Start New Set</Button>
          </CardFooter>
        </Card>
      ) : questionMode === "written" ? (
        // ── Written Question View ──
        <div className="flex min-h-full flex-col gap-6 pb-20 animate-in slide-in-from-bottom-4 duration-500">

          <div className="sticky px-4.5 top-0 z-10 flex flex-col gap-3 border-b bg-background/80 pb-3 pt-2 backdrop-blur-xl">

            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <div className="flex items-baseline gap-1.5 shrink-0">
                  <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                    Question {activeQuestionIndex + 1}
                  </h2>
                  <span className="text-sm text-muted-foreground font-medium">/ {questions.length}</span>
                </div>

                <Badge variant="secondary" className="shrink-0 border-primary/20 bg-primary/10 text-primary">
                  {activeQuestion?.topic}
                </Badge>
                <Badge variant="outline" className={`shrink-0 font-semibold ${getDifficultyBadgeClasses(difficulty)}`}>
                  Difficulty: {difficulty}
                </Badge>
                <Badge variant="outline" className="shrink-0 font-semibold">
                  {activeQuestion?.maxMarks} marks
                </Badge>
                {activeQuestion && isMathTopic(activeQuestion.topic) && activeQuestion.techAllowed !== undefined && (
                  <Badge
                    variant={activeQuestion.techAllowed ? "default" : "destructive"}
                    className="shrink-0"
                  >
                    {activeQuestion.techAllowed ? "Tech-active" : "Tech-free"}
                  </Badge>
                )}
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                      aria-label="Question details"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="end" sideOffset={8} className="w-72 max-w-[calc(100vw-2rem)] p-3">
                    <div className="flex flex-col gap-2 text-xs">
                      <div className="font-semibold text-background">Question details</div>
                      {generationStartedAt !== null && (
                        <div className="flex items-center justify-between gap-3 text-background/80">
                          <span>Timer</span>
                          <span className="font-mono text-background">{formattedElapsedTime}</span>
                        </div>
                      )}
                      {writtenGenerationTelemetry && (
                        <div className="flex items-center justify-between gap-3 text-background/80">
                          <span>Generation time</span>
                          <span className="text-background">{formatDurationMs(writtenGenerationTelemetry.durationMs)}</span>
                        </div>
                      )}
                      {writtenGenerationTelemetry && (writtenGenerationTelemetry.totalAttempts ?? 0) > 1 && (
                        <div className="flex items-center justify-between gap-3 text-background/80">
                          <span>Attempts</span>
                          <span className="text-right text-background">
                            {(writtenGenerationTelemetry.totalAttempts ?? 0)} total, {(writtenGenerationTelemetry.repairAttempts ?? 0)} repair
                          </span>
                        </div>
                      )}
                      {Boolean(
                        (writtenGenerationTelemetry as { constrainedRegenerationUsed?: boolean } | null)
                          ?.constrainedRegenerationUsed,
                      ) && (
                          <div className="flex items-center justify-between gap-3 text-background/80">
                            <span>Fallback</span>
                            <span className="text-red-300">Full regeneration used</span>
                          </div>
                        )}
                      {writtenGenerationTelemetry?.structuredOutputStatus === "used" && (
                        <div className="flex items-center justify-between gap-3 text-background/80">
                          <span>Structured output</span>
                          <span className="text-emerald-300">JSON used</span>
                        </div>
                      )}
                      {writtenGenerationTelemetry?.structuredOutputStatus === "not-supported-fallback" && (
                        <div className="flex items-center justify-between gap-3 text-background/80">
                          <span>Structured output</span>
                          <span className="text-amber-300">Fallback used</span>
                        </div>
                      )}
                      {generationStartedAt === null && !writtenGenerationTelemetry && (
                        <div className="text-background/80">No extra generation diagnostics.</div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button
                variant={activeWrittenSavedSetId ? "default" : "outline"}
                size="sm"
                onClick={saveCurrentSet}
                className="h-8 gap-1.5"
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{activeWrittenSavedSetId ? "Update" : "Save"}</span>
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleCancelWrittenQuestion}
                disabled={questions.length === 0}
                className="h-8"
              >
                <Trash2 className="w-3.5 h-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">Delete</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleStartOver}
                className="h-8 text-muted-foreground hover:text-foreground"
              >
                Exit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveQuestionIndex(Math.max(0, activeQuestionIndex - 1))}
                disabled={activeQuestionIndex === 0}
                className="h-8"
              >
                <ArrowLeft className="w-3.5 h-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">Prev</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextWrittenQuestion}
                disabled={!canAdvanceWritten}
                className="h-8"
              >
                <span className="hidden sm:inline">{isAtLastWrittenQuestion ? "Summary" : "Next"}</span>
                <ArrowRight className="w-3.5 h-3.5 sm:ml-1.5" />
              </Button>
            </div>

            <div className="w-full">
              {renderProgressBar(activeQuestionIndex + 1, questions.length, completedCount)}
            </div>
          </div>

          {activeQuestion && (
            <div className="flex flex-col space-y-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2 text-xl"><BookOpen className="w-5 h-5 text-primary" /> The Problem</CardTitle>
                    {canShowWrittenRawOutput && (
                      <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setShowWrittenRawOutput((prev) => !prev)}>
                        <Bug className="h-4 w-4" />
                        {showWrittenRawOutput ? "Hide Raw Output" : "Show Raw Output"}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="prose prose-slate dark:prose-invert max-w-none">
                    <MarkdownMath content={activeQuestion.promptMarkdown} />
                  </div>
                  {showWrittenRawOutput && canShowWrittenRawOutput && (
                    <div className="space-y-2">
                      <Separator />
                      <div>
                        <Label className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Raw LLM Output</Label>
                        <pre className="mt-2 max-h-80 overflow-auto rounded-xl border border-border/60 bg-muted/30 p-4 text-xs leading-5 whitespace-pre-wrap wrap-break-word">{writtenRawModelOutput}</pre>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-md border-border/50 flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Target className="w-5 h-5 text-primary" /> Your Response
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 flex-1 flex flex-col">
                  {!activeFeedback ? (
                    <div className="flex-1 flex flex-col gap-6">
                      <div className="space-y-3 flex-1">
                        <Label className="text-base font-semibold">Type your answer</Label>
                        <Textarea
                          placeholder="Compose your response here..."
                          className="min-h-[200px] resize-y text-base p-4 focus-visible:ring-primary/30"
                          value={activeQuestionAnswer}
                          onChange={(e) => {
                            const nextValue = e.target.value;
                            setAnswersByQuestionId((prev: any) => ({ ...prev, [activeQuestion.id]: nextValue }));
                            if (nextValue.trim().length === 0) {
                              return;
                            }
                            setWrittenResponseEnteredAtById((prev) => {
                              if (prev[activeQuestion.id] !== undefined) {
                                return prev;
                              }

                              return { ...prev, [activeQuestion.id]: Date.now() };
                            });
                          }}
                          disabled={isMarking}
                        />
                      </div>

                      <div className="space-y-3">
                        <Label className="text-base font-semibold">Or upload working (Image)</Label>
                        {activeQuestionImage ? (
                          <div className="relative group rounded-xl overflow-hidden border-2 border-primary/20 shadow-sm bg-muted/30 p-2">
                            <img src={activeQuestionImage.dataUrl} alt="Uploaded text" className="w-full h-auto max-h-80 object-contain rounded-lg" />
                            <div className="absolute inset-0 bg-background/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center">
                              <Button variant="destructive" size="sm" className="shadow-xl" onClick={() => setImagesByQuestionId((prev: any) => ({ ...prev, [activeQuestion.id]: undefined }))}>
                                <Trash2 className="w-4 h-4 mr-2" /> Remove Image
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="border-2 border-dashed border-border rounded-xl hover:bg-muted/30 transition-colors">
                            <Dropzone onDrop={handleDropDropzone} />
                          </div>
                        )}
                      </div>

                      <Button
                        size="lg"
                        className="w-full mt-auto h-14 text-base font-bold shadow-md transition-all hover:shadow-primary/20"
                        onClick={handleSubmitForMarking}
                        disabled={!canSubmitAnswer || isMarking}
                      >
                        {isMarking ? <><Loader2 className="w-5 h-5 mr-3 animate-spin" /> Evaluating Answer...</> : <><CheckCircle2 className="w-5 h-5 mr-2" /> Submit for Marking</>}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2 animate-in slide-in-from-right-4 duration-500">
                      <div className="space-y-4">
                        <Label className="text-xl font-bold border-b pb-2 flex items-center gap-2"><BookOpen className="w-5 h-5 text-primary" /> Submitted Answer</Label>
                        {activeQuestionAnswer.trim().length > 0 ? (
                          <div className="prose prose-slate dark:prose-invert max-w-none bg-muted/20 p-5 rounded-xl border border-border/50">
                            <MarkdownMath content={activeQuestionAnswer} />
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
                            No typed answer was submitted.
                          </div>
                        )}

                        {activeQuestionImage && (
                          <div className="space-y-3">
                            <Label className="text-base font-semibold">Uploaded working</Label>
                            <div className="rounded-xl border border-border/50 bg-muted/20 p-3 shadow-sm">
                              <img src={activeQuestionImage.dataUrl} alt="Submitted working" className="w-full h-auto max-h-96 object-contain rounded-lg" />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Score Banner */}
                      <div className="bg-linear-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 p-6 rounded-2xl flex justify-between items-center shadow-sm relative overflow-hidden">
                        <div className="absolute -right-4 -top-4 opacity-5 pointer-events-none">
                          <Target className="w-32 h-32" />
                        </div>
                        <div className="relative z-10">
                          <div className="text-sm font-bold uppercase tracking-wider text-primary mb-1">Total Score</div>
                          <div className="text-5xl font-extrabold text-foreground">{activeFeedback.scoreOutOf10}<span className="ml-1 text-2xl text-muted-foreground font-medium">/ 10</span></div>
                        </div>
                        <div className="text-right relative z-10 bg-background/80 backdrop-blur px-4 py-2 rounded-xl border">
                          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Marks Awarded</div>
                          <div className="text-2xl font-bold">{activeFeedback.achievedMarks} <span className="text-base text-muted-foreground font-normal">/ {activeFeedback.maxMarks}</span></div>
                        </div>
                      </div>

                      <div className="p-3.5 rounded-2xl border border-border/60 bg-muted/20 space-y-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold">Argue for Mark</Label>
                          <Textarea
                            placeholder="Explain why your response deserves additional marks..."
                            className="min-h-[96px]"
                            value={activeMarkAppeal}
                            onChange={(e) =>
                              setMarkAppealByQuestionId((prev) => ({
                                ...prev,
                                [activeQuestion.id]: e.target.value,
                              }))
                            }
                            disabled={isMarking}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleArgueForMark}
                            disabled={isMarking || activeMarkAppeal.trim().length === 0}
                          >
                            {isMarking ? (
                              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Re-marking...</>
                            ) : (
                              <>Argue for Mark</>
                            )}
                          </Button>
                        </div>

                        <Separator />

                        <div className="space-y-2">
                          <Label className="text-sm font-semibold">Override Mark</Label>
                          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                            <Input
                              type="number"
                              min={0}
                              max={activeFeedback.maxMarks}
                              step={1}
                              className="sm:max-w-28"
                              value={activeOverrideInput}
                              onChange={(e) =>
                                setMarkOverrideInputByQuestionId((prev) => ({
                                  ...prev,
                                  [activeQuestion.id]: e.target.value,
                                }))
                              }
                            />
                            <span className="text-sm text-muted-foreground">out of {activeFeedback.maxMarks}</span>
                            <Button type="button" onClick={handleOverrideMark}>Apply Override</Button>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <Label className="text-xl font-bold border-b pb-2 flex items-center gap-2"><Sparkles className="w-5 h-5 text-amber-500" /> AI Feedback</Label>
                        <div className="prose prose-slate dark:prose-invert max-w-none bg-muted/20 p-5 rounded-xl border border-border/50">
                          <MarkdownMath content={activeFeedback.feedbackMarkdown} />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <Label className="text-xl font-bold border-b pb-2 flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Marking Scheme</Label>
                        <div className="space-y-3 mt-2">
                          {activeFeedback.vcaaMarkingScheme.map((item: { criterion: string; achievedMarks: number; maxMarks: number; rationale: string }, idx: number) => {
                            const isFullMarks = item.achievedMarks === item.maxMarks;
                            return (
                              <div key={idx} className={`p-4 rounded-xl border text-sm flex justify-between gap-6 transition-colors ${isFullMarks ? "bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-900/50" : "bg-card"}`}>
                                <div className="leading-relaxed flex-1 space-y-2">
                                  <MarkdownMath content={item.criterion} />
                                  {item.rationale.trim().length > 0 && (
                                    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Rationale</p>
                                      <MarkdownMath content={item.rationale} />
                                    </div>
                                  )}
                                </div>
                                <span className={`font-bold whitespace-nowrap px-3 py-1 rounded-md h-fit ${isFullMarks ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300" : "bg-muted"}`}>
                                  {item.achievedMarks} / {item.maxMarks}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      ) : (
        // ── Multiple Choice Question View ──
        <div className="flex flex-col h-full gap-6 pb-20 animate-in slide-in-from-bottom-4 duration-500">

          <div className="sticky top-0 z-10 flex flex-col gap-3 border-b bg-background/80 pb-4 pt-2 backdrop-blur-xl">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <h2 className="bg-linear-to-br from-foreground to-foreground/70 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent sm:text-3xl">
                    Question {activeMcQuestionIndex + 1}
                  </h2>
                  <span className="text-base font-medium text-muted-foreground sm:text-xl">of {mcQuestions.length}</span>
                </div>
                <div className="flex flex-row justify-between ">
                  <div className="mt-1 flex max-w-full items-center gap-1.5 overflow-x-auto pb-1 text-xs sm:text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <Badge variant="secondary" className="shrink-0 border-primary/20 bg-primary/10 text-primary">{activeMcQuestion?.topic}</Badge>
                    <Badge variant="outline" className={`shrink-0 font-semibold ${getDifficultyBadgeClasses(difficulty)}`}>Difficulty: {difficulty}</Badge>
                    {activeMcQuestion && isMathTopic(activeMcQuestion.topic) && activeMcQuestion.techAllowed !== undefined && (
                      <Badge variant={activeMcQuestion.techAllowed ? "default" : "destructive"} className="shrink-0 shadow-sm">
                        <span className="hidden sm:inline">{activeMcQuestion.techAllowed ? "CAS allowed" : "No calculator"}</span>
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-row gap-x-1.5">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                            aria-label="Question details"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" align="end" sideOffset={8}>
                          <div className="flex flex-col gap-2 text-xs">
                            <div className="font-semibold text-background">Question details</div>
                            {generationStartedAt !== null && (
                              <div className="flex items-center justify-between gap-3 text-background/80">
                                <span>Timer</span>
                                <span className="font-mono text-background">{formattedElapsedTime}</span>
                              </div>
                            )}
                            {mcGenerationTelemetry && (
                              <div className="flex items-center justify-between gap-3 text-background/80">
                                <span>Generation time</span>
                                <span className="text-background">{formatDurationMs(mcGenerationTelemetry.durationMs)}</span>
                              </div>
                            )}
                            {mcGenerationTelemetry && mcGenerationTelemetry.totalAttempts > 1 && (
                              <div className="flex items-center justify-between gap-3 text-background/80">
                                <span>Attempts</span>
                                <span className="text-right text-background">
                                  {mcGenerationTelemetry.totalAttempts} total, {mcGenerationTelemetry.repairAttempts} repair
                                </span>
                              </div>
                            )}
                            {mcGenerationTelemetry?.constrainedRegenerationUsed && (
                              <div className="flex items-center justify-between gap-3 text-background/80">
                                <span>Fallback</span>
                                <span className="text-red-300">Full regeneration used</span>
                              </div>
                            )}
                            {mcGenerationTelemetry?.structuredOutputStatus === "used" && (
                              <div className="flex items-center justify-between gap-3 text-background/80">
                                <span>Structured output</span>
                                <span className="text-emerald-300">JSON used</span>
                              </div>
                            )}
                            {mcGenerationTelemetry?.structuredOutputStatus === "not-supported-fallback" && (
                              <div className="flex items-center justify-between gap-3 text-background/80">
                                <span>Structured output</span>
                                <span className="text-amber-300">Fallback used</span>
                              </div>
                            )}
                            {generationStartedAt === null && !mcGenerationTelemetry && (
                              <div className="text-background/80">No extra generation diagnostics.</div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Button variant={activeMcSavedSetId ? "default" : "outline"} size="sm" onClick={saveCurrentSet} className="gap-2 shadow-sm">
                      <Bookmark className="w-4 h-4" />
                      <span className="hidden xl:inline">{activeMcSavedSetId ? "Update Saved Set" : "Save for Later"}</span>
                    </Button>
                    <Button variant="destructive" size="sm" onClick={handleCancelMcQuestion} disabled={mcQuestions.length === 0} className="shadow-sm">
                      <Trash2 className="w-4 h-4 xl:mr-2" />
                      <span className="hidden xl:inline">Cancel Question</span>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleStartOver} className="text-muted-foreground hover:text-foreground">Exit Set</Button>
                    <Button variant="outline" size="sm" onClick={() => setActiveMcQuestionIndex(Math.max(0, activeMcQuestionIndex - 1))} disabled={activeMcQuestionIndex === 0} className="shadow-sm">
                      <ArrowLeft className="w-4 h-4 xl:mr-2" /> <span className="hidden xl:inline">Previous</span>
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleNextMcQuestion} disabled={!canAdvanceMc} className="shadow-sm">
                      <span className="hidden xl:inline">{isAtLastMcQuestion ? "View Summary" : "Next"}</span> <ArrowRight className="w-4 h-4 xl:ml-2" />
                    </Button>
                  </div>
                </div>

              </div>
            </div>

            <div className="w-full">
              {renderProgressBar(activeMcQuestionIndex + 1, mcQuestions.length, mcCompletedCount)}
            </div>
          </div>

          {activeMcQuestion && (
            <div className="flex flex-col space-y-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2 text-xl"><BookOpen className="w-5 h-5 text-primary" /> The Problem</CardTitle>
                    {canShowMcRawOutput && (
                      <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setShowMcRawOutput((prev) => !prev)}>
                        <Bug className="h-4 w-4" />
                        {showMcRawOutput ? "Hide Raw Output" : "Show Raw Output"}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="prose prose-slate dark:prose-invert max-w-none text-lg">
                    <MarkdownMath content={activeMcQuestion.promptMarkdown} />
                  </div>
                  {showMcRawOutput && canShowMcRawOutput && (
                    <div className="space-y-2">
                      <Separator />
                      <div>
                        <Label className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Raw LLM Output</Label>
                        <pre className="mt-2 max-h-80 overflow-auto rounded-xl border border-border/60 bg-muted/30 p-4 text-sm leading-5 whitespace-pre-wrap wrap-break-word">{mcRawModelOutput}</pre>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl"><Target className="w-5 h-5 text-primary" /> Select an Answer</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex flex-col gap-3">
                    {activeMcQuestion.options.map((opt: McOption) => {
                      const answered = Boolean(activeMcAnswer);
                      const isChosen = activeMcAnswer === opt.label;
                      const isCorrect = opt.label === activeMcQuestion.correctAnswer;

                      let dynamicClasses = "border-2 bg-card hover:border-primary/50 hover:bg-muted/50";

                      if (answered) {
                        if (isCorrect) {
                          dynamicClasses = "border-green-500 bg-green-50 dark:bg-green-950/40 shadow-sm ring-1 ring-green-500/20";
                        } else if (isChosen) {
                          dynamicClasses = "border-red-500 bg-red-50 dark:bg-red-950/40 opacity-90";
                        } else {
                          dynamicClasses = "border-border bg-card opacity-50 grayscale transition-all";
                        }
                      }

                      return (
                        <button
                          key={opt.label}
                          disabled={answered}
                          className={`w-full text-left p-3.5 rounded-2xl flex gap-4 items-center transition-all duration-200 ${dynamicClasses} ${!answered ? "cursor-pointer transform hover:-translate-y-0.5" : "cursor-default"}`}
                          onClick={() => handleMcAnswer(opt.label)}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-sm ${answered && isCorrect ? 'bg-green-500 text-white' : answered && isChosen ? 'bg-red-500 text-white' : 'bg-muted text-foreground'}`}>
                            {opt.label}
                          </div>
                          <div className="flex-1 text-base">
                            <MarkdownMath content={opt.text} />
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {activeMcAnswer && (
                    <div className="mt-6 space-y-4 animate-in zoom-in-95 duration-300">
                      <div className={`p-6 rounded-2xl border-2 flex gap-4 items-start ${activeMcAnswer === activeMcQuestion.correctAnswer
                        ? "bg-green-50/80 dark:bg-green-950/30 border-green-200 dark:border-green-900/50 text-green-900 dark:text-green-100"
                        : "bg-red-50/80 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-900 dark:text-red-100"
                        }`}>
                        {activeMcAnswer === activeMcQuestion.correctAnswer
                          ? <CheckCircle2 className="w-8 h-8 shrink-0 text-green-600 dark:text-green-400" />
                          : <XCircle className="w-8 h-8 shrink-0 text-red-600 dark:text-red-400" />}
                        <div className="flex-1">
                          <p className="font-extrabold text-lg mb-2 flex items-center gap-2">
                            {activeMcAnswer === activeMcQuestion.correctAnswer
                              ? "Excellent! That is correct."
                              : `Incorrect. The correct answer is ${activeMcQuestion.correctAnswer}.`}
                          </p>
                          <div className="prose prose-sm dark:prose-invert max-w-none opacity-90">
                            <MarkdownMath content={activeMcQuestion.explanationMarkdown} />
                          </div>
                        </div>
                      </div>
                        {activeMcAnswer !== activeMcQuestion.correctAnswer && (
                          <div className="p-3.5 rounded-2xl border border-border/60 bg-muted/20 space-y-4">
                          <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                            <div className="text-sm font-semibold">Awarded mark</div>
                            <div className="text-lg font-bold">
                              {(activeMcAwardedMarks ?? (activeMcAnswer === activeMcQuestion.correctAnswer ? 1 : 0)).toFixed(0)} / 1
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-semibold">Argue for Mark</Label>
                          <Textarea
                            placeholder="Explain why this answer should still receive a mark..."
                            className="min-h-[96px]"
                            value={activeMcMarkAppeal}
                            onChange={(e) =>
                              setMcMarkAppealByQuestionId((prev) => ({
                                ...prev,
                                [activeMcQuestion.id]: e.target.value,
                              }))
                            }
                            disabled={isMarking}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleArgueForMcMark}
                            disabled={isMarking || activeMcMarkAppeal.trim().length === 0}
                          >
                            {isMarking ? (
                              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Re-marking...</>
                            ) : (
                              <>Argue for Mark</>
                            )}
                          </Button>
                        </div>

                        <Separator />

                        <div className="space-y-2">
                          <Label className="text-sm font-semibold">Override Mark</Label>
                          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                            <Input
                              type="number"
                              min={0}
                              max={1}
                              step={1}
                              className="sm:max-w-28"
                              value={activeMcOverrideInput}
                              onChange={(e) =>
                                setMcMarkOverrideInputByQuestionId((prev) => ({
                                  ...prev,
                                  [activeMcQuestion.id]: e.target.value,
                                }))
                              }
                            />
                            <span className="text-sm text-muted-foreground">out of 1</span>
                            <Button type="button" onClick={handleOverrideMcMark}>Apply Override</Button>
                          </div>
                        </div>
                      </div>)}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}