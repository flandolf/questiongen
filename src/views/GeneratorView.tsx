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
import { MarkdownMath } from "../components/MarkdownMath";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "../components/ui/card";
import { Dropzone } from "../components/ui/dropzone";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { ScrollArea } from "../components/ui/scroll-area";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Slider } from "../components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
import {
  TOPICS,
  Topic,
  TechMode,
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
  ENGLISH_LANGUAGE_SUBTOPICS,
  EnglishLanguageSubtopic,
  GeneratePassageResponse,
  MarkAnswerResponse,
  ENGLISH_LANGUAGE_TASK_TYPES,
} from "../types";
import { confirmAction, fileToDataUrl, formatDurationMs, normalizeMarkResponse, readBackendError } from "../lib/app-utils";
import { XCircle, Sparkles, BookOpen, Target, Album, Settings2, Pen, Calculator, BookCheck, Loader2, Clock3, CheckCircle2, Info, Bookmark, RefreshCcw, Trash2, ArrowLeft, ArrowRight, BookText, Bug } from "lucide-react";

function countWords(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 0;
  }

  return trimmed.split(/\s+/).length;
}

function formatElapsedTime(startAt: number | null, endAt: number | null, now: number) {
  if (startAt === null) {
    return "00:00";
  }
  const effectiveEnd = endAt ?? now;
  const elapsedSeconds = Math.max(0, Math.floor((effectiveEnd - startAt) / 1000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  if (hours > 0) return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function ElapsedTimerText({ startAt, endAt }: { startAt: number | null; endAt: number | null }) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (startAt === null) {
      return;
    }
    if (endAt !== null) {
      setNow(endAt);
      return;
    }
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [endAt, startAt]);

  return <span>{formatElapsedTime(startAt, endAt, now)}</span>;
}

export function GeneratorView() {
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
    passageAosSubtopic,
    setPassageAosSubtopic,
    passageQuestionCount,
    setPassageQuestionCount,
    prioritizedCommandTerms,
    setPrioritizedCommandTerms,
    questionMode,
    setQuestionMode,
    subtopicInstructions,
    customFocusArea,
    setCustomFocusArea,
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

  const activeQuestion = questions[activeQuestionIndex];
  const activeQuestionAnswer = activeQuestion ? (answersByQuestionId[activeQuestion.id] ?? "") : "";
  const activeQuestionImage = activeQuestion ? imagesByQuestionId[activeQuestion.id] : undefined;
  const activeFeedback = activeQuestion ? feedbackByQuestionId[activeQuestion.id] : undefined;

  const activeMcQuestion = mcQuestions[activeMcQuestionIndex];
  const activeMcAnswer = activeMcQuestion ? (mcAnswersByQuestionId[activeMcQuestion.id] ?? "") : "";
  const activeMcMarkAppeal = activeMcQuestion ? (mcMarkAppealByQuestionId[activeMcQuestion.id] ?? "") : "";
  const activeMcAwardedMarks = activeMcQuestion
    ? mcAwardedMarksByQuestionId[activeMcQuestion.id]
    : undefined;
  const activeMcOverrideInput = activeMcQuestion
    ? (mcMarkOverrideInputByQuestionId[activeMcQuestion.id] ?? (activeMcAwardedMarks !== undefined ? String(activeMcAwardedMarks) : ""))
    : "";

  const hasEnglishTopic = selectedTopics.includes("English Language");
  const englishTaskType = englishLanguageTaskTypes[0] ?? "short-answer";
  const isPassageMode = questionMode === "written" && hasEnglishTopic && englishTaskType === "text-analysis";
  const showSetup = isPassageMode ? !passage : (questionMode === "written" ? questions.length === 0 : mcQuestions.length === 0);
  const canShowWrittenRawOutput = debugMode && writtenRawModelOutput.trim().length > 0;
  const canShowMcRawOutput = debugMode && mcRawModelOutput.trim().length > 0;
  const canShowPassageRawOutput = debugMode && passageRawModelOutput.trim().length > 0;
  const generatorTopics = selectedTopics;
  const [showAdvanced, setShowAdvanced] = useState(false);

  const hasAdvancedSelections = useMemo(() => {
    return (
      mathMethodsSubtopics.length > 0 ||
      specialistMathSubtopics.length > 0 ||
      chemistrySubtopics.length > 0 ||
      physicalEducationSubtopics.length > 0 ||
      englishLanguageSubtopics.length > 0 ||
      prioritizedCommandTerms.length > 0 ||
      customFocusArea.trim().length > 0 ||
      (questionMode === "written" && englishTaskType === "text-analysis" && Boolean(passageAosSubtopic))
    );
  }, [
    chemistrySubtopics.length,
    customFocusArea,
    englishLanguageSubtopics.length,
    englishTaskType,
    mathMethodsSubtopics.length,
    passageAosSubtopic,
    physicalEducationSubtopics.length,
    prioritizedCommandTerms.length,
    questionMode,
    specialistMathSubtopics.length,
  ]);

  const activeWrittenQuestion = isPassageMode ? passage?.questions[activePassageQuestionIndex] : activeQuestion;
  const activeWrittenAnswer = activeWrittenQuestion
    ? (isPassageMode ? (passageAnswersByQuestionId[activeWrittenQuestion.id] ?? "") : activeQuestionAnswer)
    : "";
  const activeWrittenFeedback = activeWrittenQuestion
    ? (isPassageMode ? passageFeedbackByQuestionId[activeWrittenQuestion.id] : activeFeedback)
    : undefined;
  const activeWrittenMarkAppeal = activeWrittenQuestion
    ? (markAppealByQuestionId[activeWrittenQuestion.id] ?? "")
    : "";
  const activeWrittenOverrideInput = activeWrittenQuestion
    ? (markOverrideInputByQuestionId[activeWrittenQuestion.id] ?? (activeWrittenFeedback ? String(activeWrittenFeedback.achievedMarks) : ""))
    : "";
  const activeWrittenTelemetry = isPassageMode ? passageGenerationTelemetry : writtenGenerationTelemetry;

  const completedCount = useMemo(
    () => questions.filter((q: { id: string | number; }) => feedbackByQuestionId[q.id]).length,
    [feedbackByQuestionId, questions],
  );

  const passageCompletedCount = useMemo(
    () => (passage ? passage.questions.filter((q) => Boolean(passageFeedbackByQuestionId[q.id])).length : 0),
    [passage, passageFeedbackByQuestionId],
  );

  const passageQuestionsComplete = useMemo(
    () => (passage ? passage.questions.every((question) => Boolean(passageFeedbackByQuestionId[question.id])) : false),
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
    generatorTopics.length > 0 &&
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

  const canGenerateMc =
    generatorTopics.length > 0 &&
    apiKey.trim().length > 0 &&
    model.trim().length > 0 &&
    questionCount >= 1 &&
    questionCount <= 20 &&
    !isGenerating;

  const canSubmitAnswer =
    Boolean(activeWrittenQuestion) &&
    (isPassageMode
      ? activeWrittenAnswer.trim().length > 0
      : (activeQuestionAnswer.trim().length > 0 || Boolean(activeQuestionImage))) &&
    apiKey.trim().length > 0 &&
    model.trim().length > 0 &&
    !isMarking &&
    !activeWrittenFeedback;

  const isWrittenSetComplete = questionMode === "written" && (
    isPassageMode
      ? Boolean(passage) && passageQuestionsComplete
      : questions.length > 0 && completedCount === questions.length
  );
  const isMcSetComplete = questionMode === "multiple-choice" && mcQuestions.length > 0 && mcCompletedCount === mcQuestions.length;
  const isSetComplete = isWrittenSetComplete || isMcSetComplete;
  const isAtLastWrittenQuestion = isPassageMode
    ? activePassageQuestionIndex === Math.max(0, (passage?.questions.length ?? 0) - 1)
    : activeQuestionIndex === questions.length - 1;
  const isAtLastMcQuestion = activeMcQuestionIndex === mcQuestions.length - 1;
  const canAdvanceWritten = isPassageMode
    ? Boolean(passage) && (passage!.questions.length > 0) && (!isAtLastWrittenQuestion || passageQuestionsComplete)
    : questions.length > 0 && (!isAtLastWrittenQuestion || isWrittenSetComplete);
  const canAdvanceMc = mcQuestions.length > 0 && (!isAtLastMcQuestion || isMcSetComplete);
  const writtenTotalQuestions = isPassageMode ? (passage?.questions.length ?? 0) : questions.length;
  const writtenCurrentIndex = isPassageMode ? activePassageQuestionIndex : activeQuestionIndex;
  const writtenCompletedCount = isPassageMode ? passageCompletedCount : completedCount;

  const completionSetKey = useMemo(() => {
    if (questionMode === "written") {
      if (isPassageMode && passage) {
        return passage.questions.map((question) => question.id).join("|");
      }
      return questions.map((question) => question.id).join("|");
    }
    return mcQuestions.map((question) => question.id).join("|");
  }, [isPassageMode, passage, questionMode, questions, mcQuestions]);

  const writtenAccuracyPercent = useMemo(() => {
    if (!isWrittenSetComplete) {
      return null;
    }

    const sourceQuestions = isPassageMode && passage ? passage.questions : questions;
    const sourceFeedback = isPassageMode ? passageFeedbackByQuestionId : feedbackByQuestionId;
    const totalAvailable = sourceQuestions.reduce((sum, question) => sum + question.maxMarks, 0);
    if (totalAvailable === 0) {
      return 0;
    }

    const totalAchieved = sourceQuestions.reduce((sum, question) => {
      const feedback = sourceFeedback[question.id];
      return sum + (feedback?.achievedMarks ?? 0);
    }, 0);

    return (totalAchieved / totalAvailable) * 100;
  }, [feedbackByQuestionId, isPassageMode, isWrittenSetComplete, passage, passageFeedbackByQuestionId, questions]);

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

  useEffect(() => {
    if (hasAdvancedSelections) {
      setShowAdvanced(true);
    }
  }, [hasAdvancedSelections]);


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
    if (!isPassageMode || !activeWrittenQuestion) {
      return;
    }

    setPassageQuestionPresentedAtById((prev) => {
      if (prev[activeWrittenQuestion.id]) {
        return prev;
      }
      return { ...prev, [activeWrittenQuestion.id]: Date.now() };
    });
  }, [activeWrittenQuestion, isPassageMode, setPassageQuestionPresentedAtById]);

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

  useEffect(() => {
    if (!hasEnglishTopic) {
      return;
    }
    if (englishLanguageTaskTypes.length !== 1) {
      setEnglishLanguageTaskTypes([englishTaskType]);
    }
  }, [englishLanguageTaskTypes, englishTaskType, hasEnglishTopic, setEnglishLanguageTaskTypes]);

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

    if (isPassageMode && passage) {
      setActivePassageQuestionIndex(Math.min(passage.questions.length - 1, activePassageQuestionIndex + 1));
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
    if (topic == "English Language") {
      setQuestionMode("written");
    }
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

  function getSelectedSubtopics() {
    const selectedSubtopics: string[] = [
      ...(generatorTopics.includes("Mathematical Methods") ? mathMethodsSubtopics : []),
      ...(generatorTopics.includes("Specialist Mathematics") ? specialistMathSubtopics : []),
      ...(generatorTopics.includes("Chemistry") ? chemistrySubtopics : []),
      ...(generatorTopics.includes("Physical Education") ? physicalEducationSubtopics : []),
      ...(generatorTopics.includes("English Language") ? englishLanguageSubtopics : []),
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
    const selectedTopicSet = new Set<string>(generatorTopics);
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
    const hasEnglishTopicLocal = selectedTopics.includes("English Language");
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
          topics: generatorTopics,
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
          englishTaskTypes: hasEnglishTopicLocal ? englishLanguageTaskTypes : undefined,
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

  async function handleGeneratePassage() {
    if (!canGeneratePassage) {
      return;
    }

    try {
      setErrorMessage(null);
      setIsGenerating(true);
      setGenerationStatus({
        mode: "passage",
        stage: "preparing",
        message: "Preparing passage generation request.",
        attempt: 1,
      });
      setGenerationStartedAt(Date.now());

      const response = await invoke<GeneratePassageResponse>("generate_passage_questions", {
        request: {
          aosSubtopic: passageAosSubtopic,
          questionCount: passageQuestionCount,
          model,
          apiKey,
          useStructuredOutput,
        },
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
      setGenerationStatus({
        mode: "passage",
        stage: "failed",
        message: "Passage generation failed.",
        attempt: generationStatus?.attempt ?? 1,
      });
      setErrorMessage(readBackendError(error));
    } finally {
      setIsGenerating(false);
      setGenerationStartedAt(null);
    }
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

  async function handleSubmitForMarking() {
    if (!activeWrittenQuestion || !canSubmitAnswer) return;
    setErrorMessage(null);
    setIsMarking(true);

    try {
      if (isPassageMode && passage) {
        const response = await invoke<MarkAnswerResponse>("mark_passage_answer", {
          request: {
            passageText: passage.text,
            aosSubtopic: passage.aosSubtopic,
            question: activeWrittenQuestion,
            studentAnswer: activeWrittenAnswer,
            model,
            apiKey,
          },
        });
        setPassageFeedbackByQuestionId((prev) => ({ ...prev, [activeWrittenQuestion.id]: response }));
        setMarkOverrideInputByQuestionId((prev) => ({
          ...prev,
          [activeWrittenQuestion.id]: String(response.achievedMarks),
        }));
      } else {
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
        activeWrittenAnswer,
        `Additional marking argument from student:\n${appealText}`,
      ]
        .filter((part) => part.trim().length > 0)
        .join("\n\n");

      if (isPassageMode && passage) {
        const response = await invoke<MarkAnswerResponse>("mark_passage_answer", {
          request: {
            passageText: passage.text,
            aosSubtopic: passage.aosSubtopic,
            question: activeWrittenQuestion,
            studentAnswer: arguedAnswer,
            model,
            apiKey,
          },
        });
        setPassageFeedbackByQuestionId((prev) => ({ ...prev, [activeWrittenQuestion.id]: response }));
        setMarkOverrideInputByQuestionId((prev) => ({
          ...prev,
          [activeWrittenQuestion.id]: String(response.achievedMarks),
        }));
      } else {
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
      }
    } catch (error) {
      setErrorMessage(readBackendError(error));
    } finally {
      setIsMarking(false);
    }
  }

  function handleOverrideMark() {
    if (!activeWrittenQuestion || !activeWrittenFeedback) {
      return;
    }

    const parsed = Number(activeWrittenOverrideInput);
    if (!Number.isFinite(parsed)) {
      setErrorMessage("Enter a whole number to override the mark.");
      return;
    }

    const rounded = Math.round(parsed);
    const clampedMarks = Math.max(0, Math.min(activeWrittenFeedback.maxMarks, rounded));

    const updatedResponse = {
      ...activeWrittenFeedback,
      achievedMarks: clampedMarks,
      scoreOutOf10: Math.round((clampedMarks / activeWrittenFeedback.maxMarks) * 10),
      verdict:
        clampedMarks === activeWrittenFeedback.maxMarks
          ? "Correct"
          : clampedMarks === 0
            ? "Incorrect"
            : "Overridden",
    };

    setErrorMessage(null);
    if (isPassageMode) {
      setPassageFeedbackByQuestionId((prev) => ({ ...prev, [activeWrittenQuestion.id]: updatedResponse }));
    } else {
      setFeedbackByQuestionId((prev: any) => ({ ...prev, [activeQuestion.id]: updatedResponse }));
      appendWrittenHistoryEntry(activeQuestion, updatedResponse, {
        uploadedAnswerOverride: activeQuestionAnswer,
        attemptKind: "override",
        responseEnteredAtMs: Date.now(),
      });
    }
    setMarkOverrideInputByQuestionId((prev) => ({
      ...prev,
      [activeWrittenQuestion.id]: String(clampedMarks),
    }));
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
          topics: generatorTopics,
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

  const hasAnyMathTopic = generatorTopics.some((topic) => isMathTopic(topic));
  const hasPeTopic = generatorTopics.includes("Physical Education");
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
      (questions.length > 0 || Boolean(passage)) &&
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
    setPassage(null);
    setActivePassageQuestionIndex(0);
    setPassageAnswersByQuestionId({});
    setPassageFeedbackByQuestionId({});
    setPassageQuestionPresentedAtById({});
    setPassageRawModelOutput("");
    setPassageGenerationTelemetry(null);
    setShowPassageRawOutput(false);
  }
  async function handleDropDropzone(acceptedFiles: File[]) {
    if (isPassageMode || !activeQuestion || acceptedFiles.length === 0) return;
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
        <div className="relative w-full h-1.5 bg-muted/40 rounded-full overflow-hidden">
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
    <div className="min-h-full w-full p-2 sm:p-3 lg:p-4 flex flex-col gap-3 animate-in fade-in duration-500">
      {errorMessage && (
        <div className="bg-destructive/15 border border-destructive/30 text-destructive px-4 py-3 rounded-lg text-sm flex items-center gap-2 shadow-sm">
          <XCircle className="w-4 h-4 shrink-0" />
          <p className="font-medium">{errorMessage}</p>
        </div>
      )}

      {showSetup ? (
        <>
          {/* Setup view (Unchanged for this task) */}
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
                  <TooltipProvider>
                    {selectedTopics.includes("English Language") ? (
                      <Tooltip>
                        <TooltipTrigger>
                          <Button
                            disabled
                            variant={questionMode === "multiple-choice" ? "default" : "ghost"}
                            size="sm"
                            className={`rounded-lg transition-all ${questionMode === "multiple-choice" ? "shadow-md" : ""}`}
                            onClick={() => {
                              if (selectedTopics.includes("English Language")) {
                                return;
                              }
                              setQuestionMode("multiple-choice")
                            }}
                          >
                            <Target className="w-4 h-4 mr-2" /> Multiple Choice
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          Multiple-choice questions are not available for English Language.
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Button
                        variant={questionMode === "multiple-choice" ? "default" : "ghost"}
                        size="sm"
                        className={`rounded-lg transition-all ${questionMode === "multiple-choice" ? "shadow-md" : ""}`}
                        onClick={() => {
                          if (selectedTopics.includes("English Language")) {
                            return;
                          }
                          setQuestionMode("multiple-choice")
                        }}
                      >

                        <Target className="w-4 h-4 mr-2" /> Multiple Choice
                      </Button>
                    )}
                  </TooltipProvider>

                </div>
              </div>
            </div>

            <CardContent className="space-y-2">
              <div className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <Label className="text-base font-semibold flex items-center gap-2">
                      Quick Start
                    </Label>
                    <p className="text-xs text-muted-foreground">Pick your essentials. Advanced options are below.</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAdvanced((prev) => !prev)}
                  >
                    {showAdvanced ? "Hide Advanced" : "Show Advanced"}
                  </Button>
                </div>

                {/* Subject Selection */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Select Subjects</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
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

                <div className="rounded-xl border border-border/50 bg-background/70 p-3">
                  <div className="flex flex-wrap gap-2 text-xs font-medium">
                    <Badge variant="outline" className={`font-semibold ${getDifficultyBadgeClasses(difficulty)}`}>
                      Difficulty: {difficulty}
                    </Badge>
                    <Badge variant="outline">{isPassageMode ? `${passageQuestionCount} passage questions` : `${questionCount} questions`}</Badge>
                    {hasAnyMathTopic && questionMode === "written" ? (
                      <Badge variant="outline">Maximum marks: {maxMarksPerQuestion}</Badge>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Album className="w-4 h-4 sm:hidden lg:flex" />
                    <Label className="text-sm font-semibold">Difficulty</Label>
                  </div>
                  <div className="flex flex-nowrap items-center gap-2 overflow-x-auto [scrollbar-width:thin] py-1 px-1">
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

                {isPassageMode ? (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between items-center">
                      <Label className="text-sm font-semibold">Passage Question Count</Label>
                      <Badge variant="secondary" className="px-2 py-0.5 text-xs">{passageQuestionCount}</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <Slider min={3} max={10} step={1} value={[passageQuestionCount]} onValueChange={(val) => setPassageQuestionCount(val[0])} className="py-1 flex-1" />
                      <Input
                        type="number"
                        min={3}
                        max={10}
                        value={passageQuestionCount}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          if (!Number.isNaN(next)) {
                            setPassageQuestionCount(Math.min(10, Math.max(3, Math.round(next))));
                          }
                        }}
                        className="w-20"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between items-center">
                      <Label className="text-sm font-semibold">Question Count</Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <Slider min={1} max={20} step={1} value={[questionCount]} onValueChange={(val) => setQuestionCount(val[0])} className="py-1 flex-1" />
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        value={questionCount}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          if (!Number.isNaN(next)) {
                            setQuestionCount(Math.min(20, Math.max(1, Math.round(next))));
                          }
                        }}
                        className="w-20"
                      />
                    </div>
                  </div>
                )}
              </div>

              {showAdvanced ? (
                <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <Label className="text-base font-semibold">Advanced Setup</Label>
                      <p className="text-xs text-muted-foreground">Refine subtopics, modes, and guardrails.</p>
                    </div>
                    {hasAdvancedSelections ? (
                      <Badge variant="secondary">Configured</Badge>
                    ) : null}
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

                      {selectedTopics.includes("English Language") && questionMode === "written" && (
                        <div className="space-y-2">
                          <div>
                            <Label className="text-sm font-semibold">English Language Task Type</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">Choose between short-answer questions or text analysis with a passage.</p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {ENGLISH_LANGUAGE_TASK_TYPES.map((taskType) => {
                              const isSelected = englishTaskType === taskType;
                              return (
                                <Badge
                                  key={taskType}
                                  variant={isSelected ? "default" : "outline"}
                                  className={`cursor-pointer p-3 text-xs transition-colors ${isSelected ? "shadow-md" : "hover:bg-primary/10"}`}
                                  onClick={() => setEnglishLanguageTaskTypes([taskType])}
                                >
                                  {taskType === "short-answer" ? "Short Answer" : "Text Analysis (Passage)"}
                                </Badge>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {selectedTopics.includes("English Language") && questionMode === "written" && englishTaskType === "short-answer" && (
                        <div className="space-y-2">
                          <div>
                            <Label className="text-sm font-semibold">English Language Focus Areas</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">Select one or more Areas of Study, or leave all unselected to span the full course.</p>
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

                      {selectedTopics.includes("English Language") && questionMode === "written" && englishTaskType === "text-analysis" && (
                        <div className="space-y-2">
                          <div>
                            <Label className="text-sm font-semibold">Text Analysis Area of Study</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">Choose the Area of Study that guides the passage and question set.</p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {ENGLISH_LANGUAGE_SUBTOPICS.map((sub) => (
                              <Badge
                                key={sub}
                                variant={passageAosSubtopic === sub ? "default" : "outline"}
                                className={`cursor-pointer p-3 text-xs transition-colors ${passageAosSubtopic === sub ? "shadow-md" : "hover:bg-primary/10"}`}
                                onClick={() => setPassageAosSubtopic(sub)}
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

                    {questionMode === "written" && hasAnyMathTopic && (
                      <div className="space-y-1.5 pt-1">
                        <div className="flex justify-between items-center">
                          <Label className="text-sm font-semibold">Max Marks per Question</Label>
                        </div>
                        <div className="flex items-center gap-3">
                          <Slider min={1} max={30} step={1} value={[maxMarksPerQuestion]} onValueChange={(val) => setMaxMarksPerQuestion(val[0])} className="py-1 flex-1" />
                          <Input
                            type="number"
                            min={1}
                            max={30}
                            value={maxMarksPerQuestion}
                            onChange={(e) => {
                              const next = Number(e.target.value);
                              if (!Number.isNaN(next)) {
                                setMaxMarksPerQuestion(Math.min(30, Math.max(1, Math.round(next))));
                              }
                            }}
                            className="w-20"
                          />
                        </div>
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

                    <div className="space-y-1.5 md:col-span-2">
                      <div className="flex items-center justify-between gap-3">
                        <Label className="text-sm font-semibold">Variation Guardrail</Label>
                        <button
                          type="button"
                          aria-pressed={avoidSimilarQuestions}
                          onClick={() => setAvoidSimilarQuestions(!avoidSimilarQuestions)}
                          className={`relative inline-flex h-7 w-12 items-center rounded-full border transition-colors ${avoidSimilarQuestions ? "bg-primary/80 border-primary" : "bg-muted/60 border-border"}`}
                        >
                          <span className={`inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform ${avoidSimilarQuestions ? "translate-x-6" : "translate-x-1"}`} />
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        When enabled, generation includes your recent same-topic prompts (if available) and asks the model to avoid repeating them.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {!apiKey && (
                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 p-3 rounded-lg text-xs flex items-center gap-2">
                  <Settings2 className="w-4 h-4 shrink-0" />
                  <span><strong>API Key Missing:</strong> Go to Settings to configure your OpenRouter API Key before generating questions.</span>
                </div>
              )}

            </CardContent>

            <CardFooter className="bg-muted/20 border-t flex flex-col gap-3 sm:pb-2">
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
                        <Clock3 className="w-3 h-3" /> <ElapsedTimerText startAt={generationStartedAt} endAt={sessionFinishedAt} />
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </CardFooter>
          </Card>
          <div className="sticky bottom-3 z-20 px-1.5">
            <div className="rounded-xl border border-border/60 bg-background/95 shadow-xl backdrop-blur flex items-center gap-3 p-3">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ready to generate</div>
                <div className="text-sm font-medium truncate">
                  {questionMode === "written" ? "Written Answer" : "Multiple Choice"} · {isPassageMode ? `${passageQuestionCount} passage questions` : `${questionCount} questions`}
                </div>
              </div>
              <Button
                size="sm"
                className="h-9"
                onClick={questionMode === "written" ? (isPassageMode ? handleGeneratePassage : handleGenerateQuestions) : handleGenerateMcQuestions}
                disabled={questionMode === "written" ? (isPassageMode ? !canGeneratePassage : !canGenerate) : !canGenerateMc}
              >
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                {isGenerating ? "Generating" : "Generate"}
              </Button>
            </div>
          </div>
        </>
      ) : showCompletionScreen && isSetComplete ? (
        <Card className="border-0 shadow-xl bg-card/50 backdrop-blur-sm overflow-hidden animate-in fade-in duration-500">
          <CardHeader className="border-b bg-muted/20 p-4">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-xl font-extrabold flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" /> Session Complete
              </CardTitle>
              <CardDescription className="text-xs">
                Nice work. You have finished this {questionMode === "written" ? "written-response" : "multiple-choice"} set.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Accuracy</div>
                <div className="mt-1 text-xl font-bold">{(completionAccuracyPercent ?? 0).toFixed(1)}%</div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Time</div>
                <div className="mt-1 text-xl font-bold"><ElapsedTimerText startAt={generationStartedAt} endAt={sessionFinishedAt} /></div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Difficulty</div>
                <div className="mt-1 text-xl font-bold truncate">{difficulty}</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">{questionMode === "written" ? "Written Answer" : "Multiple Choice"}</Badge>
              <Badge variant="outline">{questionMode === "written" ? `${writtenCompletedCount}/${writtenTotalQuestions}` : `${mcCompletedCount}/${mcQuestions.length}`} completed</Badge>
            </div>
          </CardContent>

          <CardFooter className="bg-muted/20 p-3 border-t flex flex-wrap gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => setShowCompletionScreen(false)}>
              Review Questions
            </Button>
            <Button size="sm" variant={questionMode === "written" ? (activeWrittenSavedSetId ? "default" : "outline") : (activeMcSavedSetId ? "default" : "outline")} onClick={saveCurrentSet}>
              {questionMode === "written" ? (activeWrittenSavedSetId ? "Update Saved Set" : "Save for Later") : (activeMcSavedSetId ? "Update Saved Set" : "Save for Later")}
            </Button>
            <Button size="sm" onClick={handleStartOver}>Start New Set</Button>
          </CardFooter>
        </Card>
      ) : questionMode === "written" ? (
        // ── Written Question View ──
        <div className="flex min-h-full flex-col gap-4 pb-20 animate-in slide-in-from-bottom-4 duration-500">
          {/* Top Navbar */}
          <div className="sticky px-3 top-0 z-10 flex flex-col gap-2 border-b bg-background/80 py-1.5 backdrop-blur-xl shadow-sm">
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                <div className="flex items-baseline gap-1 shrink-0">
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight">Q{writtenCurrentIndex + 1}</h2>
                  <span className="text-xs text-muted-foreground font-medium">/ {writtenTotalQuestions}</span>
                </div>

                {isPassageMode && passage ? (
                  <>
                    <Badge variant="secondary" className="shrink-0 border-primary/20 bg-primary/10 text-primary px-1.5 py-0">English</Badge>
                    <Badge variant="outline" className="shrink-0 text-[10px]">{passage.aosSubtopic}</Badge>
                  </>
                ) : (
                  <>
                    <Badge variant="secondary" className="shrink-0 border-primary/20 bg-primary/10 text-primary px-1.5 py-0">{activeQuestion?.topic}</Badge>
                    <Badge variant="outline" className={`shrink-0 text-[10px] ${getDifficultyBadgeClasses(difficulty)}`}>{difficulty}</Badge>
                  </>
                )}
                <Badge variant="outline" className="shrink-0 text-[10px] font-semibold">{activeWrittenQuestion?.maxMarks} marks</Badge>
                {!isPassageMode && activeQuestion && isMathTopic(activeQuestion.topic) && activeQuestion.techAllowed !== undefined && (
                  <Badge variant={activeQuestion.techAllowed ? "default" : "destructive"} className="shrink-0 text-[10px]">
                    {activeQuestion.techAllowed ? "Tech-active" : "Tech-free"}
                  </Badge>
                )}
              </div>
              
              <div className="flex items-center gap-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon-sm" className="h-7 w-7 rounded-full"><Info className="h-3.5 w-3.5" /></Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="end" sideOffset={8} className="w-72 p-3 text-xs">
                      {/* Telemetry tooltip content unchanged */}
                      <div className="flex flex-col gap-2">
                        <div className="font-semibold text-background">Details</div>
                        {generationStartedAt !== null && (
                          <div className="flex justify-between text-background/80"><span>Time</span><span className="font-mono"><ElapsedTimerText startAt={generationStartedAt} endAt={sessionFinishedAt} /></span></div>
                        )}
                        {activeWrittenTelemetry && (
                          <div className="flex justify-between text-background/80"><span>Generation</span><span>{formatDurationMs(activeWrittenTelemetry.durationMs)}</span></div>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button variant={activeWrittenSavedSetId ? "default" : "outline"} size="sm" onClick={saveCurrentSet} className="h-7 gap-1 px-2 text-xs">
                  <Bookmark className="w-3 h-3" /><span className="hidden sm:inline">{activeWrittenSavedSetId ? "Update" : "Save"}</span>
                </Button>
                {isPassageMode ? (
                  <Button variant="outline" size="sm" onClick={handleResetPassage} className="h-7 px-2 text-xs gap-1">
                    <RefreshCcw className="w-3 h-3" /><span className="hidden sm:inline">New Passage</span>
                  </Button>
                ) : (
                  <Button variant="destructive" size="sm" onClick={handleCancelWrittenQuestion} disabled={questions.length === 0} className="h-7 px-2 text-xs gap-1">
                    <Trash2 className="w-3 h-3" /><span className="hidden sm:inline">Delete</span>
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={handleStartOver} className="h-7 px-2 text-xs">Exit</Button>
                <Button variant="outline" size="sm" onClick={() => { isPassageMode && passage ? setActivePassageQuestionIndex(Math.max(0, activePassageQuestionIndex - 1)) : setActiveQuestionIndex(Math.max(0, activeQuestionIndex - 1)); }} disabled={isPassageMode ? activePassageQuestionIndex === 0 : activeQuestionIndex === 0} className="h-7 px-2 text-xs gap-1">
                  <ArrowLeft className="w-3 h-3" /><span className="hidden sm:inline">Prev</span>
                </Button>
                <Button variant="outline" size="sm" onClick={handleNextWrittenQuestion} disabled={!canAdvanceWritten} className="h-7 px-2 text-xs gap-1">
                  <span className="hidden sm:inline">{isAtLastWrittenQuestion ? "Summary" : "Next"}</span><ArrowRight className="w-3 h-3" />
                </Button>
              </div>
            </div>
            {renderProgressBar(writtenCurrentIndex + 1, writtenTotalQuestions, writtenCompletedCount)}
          </div>

          {activeWrittenQuestion && (
            <div className={isPassageMode ? "grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-3" : "flex flex-col gap-3"}>
              {isPassageMode && passage ? (
                <div className="flex flex-col gap-2 lg:sticky lg:top-14 h-fit">
                  <Card className="shadow-sm">
                    <CardHeader className="py-2 px-3 border-b bg-muted/10">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="flex items-center gap-1.5 text-sm font-semibold"><BookText className="w-4 h-4 text-primary" /> Passage</CardTitle>
                        {canShowPassageRawOutput && (
                          <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-2" onClick={() => setShowPassageRawOutput((prev) => !prev)}>
                            <Bug className="h-3 w-3" /> {showPassageRawOutput ? "Hide" : "Raw"}
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <ScrollArea className="w-full h-[50vh] lg:h-[70vh] bg-background">
                        <div className="flex flex-col py-2 text-[13px] leading-[1.6]">
                          {activeLineItems.map((line) => (
                            <div key={line.lineNumber} className="group flex flex-row px-2 hover:bg-muted/30">
                              <span className="w-8 shrink-0 text-right pr-2 select-none text-muted-foreground/50 border-r border-border/40 group-hover:border-border/80 group-hover:text-muted-foreground">
                                {line.lineNumber}
                              </span>
                              <span className="whitespace-pre-wrap pl-3">{line.text}</span>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                  {showPassageRawOutput && canShowPassageRawOutput && (
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border bg-muted/30 p-2 text-[10px]">{passageRawModelOutput}</pre>
                  )}
                </div>
              ) : null}
              
              <div className="flex flex-col gap-3">
                {/* Question Block */}
                <Card className="shadow-sm border-border/60">
                  <CardHeader className="py-2 px-3 border-b bg-muted/5">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="flex items-center gap-1.5 text-sm font-semibold"><BookOpen className="w-4 h-4 text-primary" /> The Problem</CardTitle>
                      {!isPassageMode && canShowWrittenRawOutput && (
                        <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-2" onClick={() => setShowWrittenRawOutput((prev) => !prev)}>
                          <Bug className="h-3 w-3" /> {showWrittenRawOutput ? "Hide" : "Raw"}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 text-sm">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <MarkdownMath content={activeWrittenQuestion.promptMarkdown} />
                    </div>
                    {!isPassageMode && showWrittenRawOutput && canShowWrittenRawOutput && (
                      <pre className="mt-3 max-h-40 overflow-auto rounded border bg-muted/30 p-2 text-[10px] whitespace-pre-wrap">{writtenRawModelOutput}</pre>
                    )}
                  </CardContent>
                </Card>

                {/* Response / Marking Block */}
                <Card className="shadow-sm border-border/60 flex-1 flex flex-col">
                  <CardHeader className="py-2 px-3 border-b bg-muted/5">
                    <CardTitle className="flex items-center gap-1.5 text-sm font-semibold">
                      <Target className="w-4 h-4 text-primary" /> {activeWrittenFeedback ? "Feedback" : "Your Response"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 flex-1 flex flex-col gap-3">
                    {!activeWrittenFeedback ? (
                      <div className="flex-1 flex flex-col gap-3">
                        <div className="space-y-1.5 flex-1">
                          <Textarea
                            placeholder={isPassageMode ? "Concise response with line references..." : "Type your answer..."}
                            className="min-h-[120px] text-sm p-3 focus-visible:ring-1"
                            value={activeWrittenAnswer}
                            onChange={(e) => {
                              const nextValue = e.target.value;
                              if (isPassageMode && activeWrittenQuestion) {
                                setPassageAnswersByQuestionId((prev) => ({ ...prev, [activeWrittenQuestion.id]: nextValue }));
                                return;
                              }
                              setAnswersByQuestionId((prev: any) => ({ ...prev, [activeQuestion.id]: nextValue }));
                              if (nextValue.trim().length > 0) {
                                setWrittenResponseEnteredAtById((prev) => prev[activeQuestion.id] !== undefined ? prev : { ...prev, [activeQuestion.id]: Date.now() });
                              }
                            }}
                            disabled={isMarking}
                          />
                        </div>

                        {!isPassageMode && (
                          <div className="space-y-1.5">
                            {activeQuestionImage ? (
                              <div className="relative group rounded-md border border-primary/20 bg-muted/10 p-1.5 flex items-center justify-between">
                                <span className="text-xs truncate font-medium max-w-[200px]">{activeQuestionImage.name} attached</span>
                                <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive hover:bg-destructive/10 px-2" onClick={() => setImagesByQuestionId((prev: any) => ({ ...prev, [activeQuestion.id]: undefined }))}>
                                  Remove
                                </Button>
                              </div>
                            ) : (
                              <div className="border border-dashed border-border/80 rounded-md hover:bg-muted/20 transition-colors p-2 text-center text-xs">
                                <Dropzone onDrop={handleDropDropzone} />
                              </div>
                            )}
                          </div>
                        )}

                        <Button size="sm" className="w-full font-semibold h-8" onClick={handleSubmitForMarking} disabled={!canSubmitAnswer || isMarking}>
                          {isMarking ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Evaluating...</> : "Submit"}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4 animate-in fade-in duration-300">
                        {/* Compact Score Inline Banner */}
                        <div className="flex justify-between items-center rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
                          <span className="text-sm font-bold flex items-center gap-2"><Sparkles className="w-4 h-4 text-amber-500"/> Scored</span>
                          <span className="text-lg font-bold">{activeWrittenFeedback.achievedMarks} <span className="text-xs text-muted-foreground">/ {activeWrittenFeedback.maxMarks}</span></span>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Answer</Label>
                          {activeWrittenAnswer.trim().length > 0 ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none bg-muted/10 p-2.5 rounded border border-border/50 text-sm">
                              <MarkdownMath content={activeWrittenAnswer} />
                            </div>
                          ) : <div className="text-xs text-muted-foreground italic border rounded p-2 bg-muted/10">No text submitted.</div>}
                        </div>

                        {/* Side-by-side Argue & Override blocks */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-2.5 rounded border bg-muted/5">
                          <div className="space-y-1.5">
                            <Label className="text-[11px] font-semibold text-muted-foreground uppercase">Argue for Mark</Label>
                            <Textarea placeholder="Reasoning..." className="min-h-[50px] text-xs py-1.5 px-2" value={activeWrittenMarkAppeal} onChange={(e) => setMarkAppealByQuestionId((prev) => ({ ...prev, [activeWrittenQuestion.id]: e.target.value }))} disabled={isMarking} />
                            <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={handleArgueForMark} disabled={isMarking || activeWrittenMarkAppeal.trim().length === 0}>
                              {isMarking ? "Re-marking..." : "Argue"}
                            </Button>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[11px] font-semibold text-muted-foreground uppercase">Override</Label>
                            <div className="flex gap-2 items-center">
                              <Input type="number" min={0} max={activeWrittenFeedback.maxMarks} className="h-7 text-xs w-16" value={activeWrittenOverrideInput} onChange={(e) => setMarkOverrideInputByQuestionId((prev) => ({ ...prev, [activeWrittenQuestion.id]: e.target.value }))} />
                              <span className="text-xs text-muted-foreground">/ {activeWrittenFeedback.maxMarks}</span>
                            </div>
                            <Button size="sm" variant="secondary" className="w-full h-7 text-xs mt-auto" onClick={handleOverrideMark}>Apply</Button>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Feedback</Label>
                          <div className="prose prose-sm dark:prose-invert max-w-none text-sm p-0">
                            <MarkdownMath content={activeWrittenFeedback.feedbackMarkdown} />
                          </div>
                        </div>

                        <div className="space-y-1.5 mt-2">
                          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b pb-1 flex w-full">Marking Scheme</Label>
                          <div className="flex flex-col gap-2">
                            {activeWrittenFeedback.vcaaMarkingScheme.map((item: any, idx: number) => {
                              const isFullMarks = item.achievedMarks === item.maxMarks;
                              return (
                                <div key={idx} className={`p-2.5 rounded border text-sm flex justify-between gap-3 ${isFullMarks ? "bg-green-500/5 border-green-500/20" : "bg-card"}`}>
                                  <div className="flex-1 space-y-1">
                                    <div className="prose prose-sm dark:prose-invert"><MarkdownMath content={item.criterion} /></div>
                                    {item.rationale.trim().length > 0 && <div className="text-[11px] text-muted-foreground"><MarkdownMath content={item.rationale} /></div>}
                                  </div>
                                  <div className={`text-xs font-bold px-1.5 py-0.5 rounded h-fit ${isFullMarks ? "text-green-600 bg-green-500/10" : "bg-muted text-muted-foreground"}`}>
                                    {item.achievedMarks}/{item.maxMarks}
                                  </div>
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
            </div>
          )}
        </div>
      ) : (
        // ── Multiple Choice Question View ──
        <div className="flex flex-col h-full gap-4 pb-20 animate-in slide-in-from-bottom-4 duration-500">
          <div className="sticky top-0 z-10 flex flex-col gap-2 border-b bg-background/80 py-2 backdrop-blur-xl shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold tracking-tight">Q{activeMcQuestionIndex + 1}</h2>
                <span className="text-xs font-medium text-muted-foreground">/ {mcQuestions.length}</span>
                <Badge variant="secondary" className="border-primary/20 bg-primary/10 text-primary px-1.5 py-0 text-[10px]">{activeMcQuestion?.topic}</Badge>
              </div>
              
              <div className="flex items-center gap-1">
                <Button variant={activeMcSavedSetId ? "default" : "outline"} size="sm" onClick={saveCurrentSet} className="h-7 px-2 text-xs gap-1">
                  <Bookmark className="w-3" /><span className="hidden sm:inline">Save</span>
                </Button>
                <Button variant="destructive" size="sm" onClick={handleCancelMcQuestion} disabled={mcQuestions.length === 0} className="h-7 px-2 text-xs gap-1">
                  <Trash2 className="w-3" /><span className="hidden sm:inline">Drop</span>
                </Button>
                <Button variant="ghost" size="sm" onClick={handleStartOver} className="h-7 px-2 text-xs">Exit</Button>
                <Button variant="outline" size="sm" onClick={() => setActiveMcQuestionIndex(Math.max(0, activeMcQuestionIndex - 1))} disabled={activeMcQuestionIndex === 0} className="h-7 px-2 text-xs">
                  <ArrowLeft className="w-3 sm:mr-1" /> <span className="hidden sm:inline">Prev</span>
                </Button>
                <Button variant="outline" size="sm" onClick={handleNextMcQuestion} disabled={!canAdvanceMc} className="h-7 px-2 text-xs">
                  <span className="hidden sm:inline">{isAtLastMcQuestion ? "Summary" : "Next"}</span> <ArrowRight className="w-3 sm:ml-1" />
                </Button>
              </div>
            </div>
            {renderProgressBar(activeMcQuestionIndex + 1, mcQuestions.length, mcCompletedCount)}
          </div>

          {activeMcQuestion && (
            <div className="flex flex-col gap-3">
              <Card className="shadow-sm border-border/60">
                <CardHeader className="py-2 px-3 border-b bg-muted/5 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5"><BookOpen className="w-4 h-4 text-primary" /> The Problem</CardTitle>
                  {canShowMcRawOutput && (
                    <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] px-2 gap-1" onClick={() => setShowMcRawOutput((prev) => !prev)}>
                      <Bug className="h-3 w-3" /> Raw
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="p-3 text-sm">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <MarkdownMath content={activeMcQuestion.promptMarkdown} />
                  </div>
                  {showMcRawOutput && canShowMcRawOutput && (
                    <pre className="mt-2 max-h-40 overflow-auto rounded border bg-muted/30 p-2 text-[10px] whitespace-pre-wrap">{mcRawModelOutput}</pre>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-sm border-border/60 flex-col">
                <CardHeader className="py-2 px-3 border-b bg-muted/5">
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5"><Target className="w-4 h-4 text-primary" /> Options</CardTitle>
                </CardHeader>
                <CardContent className="p-3 space-y-3">
                  <div className="flex flex-col gap-2">
                    {activeMcQuestion.options.map((opt: McOption) => {
                      const answered = Boolean(activeMcAnswer);
                      const isChosen = activeMcAnswer === opt.label;
                      const isCorrect = opt.label === activeMcQuestion.correctAnswer;
                      let dynamicClasses = "border bg-card hover:bg-muted/50";

                      if (answered) {
                        if (isCorrect) dynamicClasses = "border-green-500/50 bg-green-500/10 font-medium";
                        else if (isChosen) dynamicClasses = "border-red-500/50 bg-red-500/10 opacity-90";
                        else dynamicClasses = "border-border/50 bg-card opacity-50 grayscale";
                      }

                      return (
                        <button
                          key={opt.label}
                          disabled={answered}
                          className={`w-full text-left p-2 rounded-md flex gap-3 items-center text-sm transition-all ${dynamicClasses} ${!answered ? "cursor-pointer hover:border-primary/40" : "cursor-default"}`}
                          onClick={() => handleMcAnswer(opt.label)}
                        >
                          <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 font-bold text-xs ${answered && isCorrect ? 'bg-green-500 text-white' : answered && isChosen ? 'bg-red-500 text-white' : 'bg-muted border text-foreground'}`}>
                            {opt.label}
                          </div>
                          <div className="flex-1 prose-sm"><MarkdownMath content={opt.text} /></div>
                        </button>
                      );
                    })}
                  </div>

                  {activeMcAnswer && (
                    <div className="mt-4 space-y-3 animate-in fade-in duration-300">
                      <div className={`p-3 rounded-md border text-sm flex gap-3 items-start ${activeMcAnswer === activeMcQuestion.correctAnswer ? "bg-green-500/10 border-green-500/20 text-green-900 dark:text-green-100" : "bg-red-500/10 border-red-500/20 text-red-900 dark:text-red-100"}`}>
                        {activeMcAnswer === activeMcQuestion.correctAnswer ? <CheckCircle2 className="w-5 h-5 shrink-0 text-green-600" /> : <XCircle className="w-5 h-5 shrink-0 text-red-600" />}
                        <div className="flex-1 space-y-1">
                          <p className="font-bold">{activeMcAnswer === activeMcQuestion.correctAnswer ? "Correct" : `Incorrect. Correct answer is ${activeMcQuestion.correctAnswer}`}</p>
                          <div className="prose prose-sm dark:prose-invert opacity-90 text-[13px]"><MarkdownMath content={activeMcQuestion.explanationMarkdown} /></div>
                        </div>
                      </div>

                      {activeMcAnswer !== activeMcQuestion.correctAnswer && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-2.5 rounded border bg-muted/5">
                           <div className="space-y-1.5">
                            <Label className="text-[11px] font-semibold text-muted-foreground uppercase">Argue for Mark</Label>
                            <Textarea placeholder="Reasoning..." className="min-h-[50px] text-xs py-1.5 px-2" value={activeMcMarkAppeal} onChange={(e) => setMcMarkAppealByQuestionId((prev) => ({ ...prev, [activeMcQuestion.id]: e.target.value }))} disabled={isMarking} />
                            <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={handleArgueForMcMark} disabled={isMarking || activeMcMarkAppeal.trim().length === 0}>
                              {isMarking ? "Re-marking..." : "Argue"}
                            </Button>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[11px] font-semibold text-muted-foreground uppercase flex justify-between">
                              <span>Override</span>
                              <span className="text-foreground">Awarded: {(activeMcAwardedMarks ?? 0).toFixed(0)}/1</span>
                            </Label>
                            <div className="flex gap-2 items-center">
                              <Input type="number" min={0} max={1} className="h-7 text-xs w-16" value={activeMcOverrideInput} onChange={(e) => setMcMarkOverrideInputByQuestionId((prev) => ({ ...prev, [activeMcQuestion.id]: e.target.value }))} />
                            </div>
                            <Button size="sm" variant="secondary" className="w-full h-7 text-xs mt-auto" onClick={handleOverrideMcMark}>Apply</Button>
                          </div>
                        </div>
                      )}
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