import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Loader2, ArrowRight, ArrowLeft, Trash2, CheckCircle2, XCircle, Clock3, Settings2, BookOpen, Target, Sparkles, Check, Bug, Bookmark } from "lucide-react";
import { useAppContext } from "../AppContext";
import { MarkdownMath } from "../components/MarkdownMath";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "../components/ui/card";
import { Dropzone } from "../components/ui/dropzone";
import { Label } from "../components/ui/label";
import { Separator } from "../components/ui/separator";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Slider } from "../components/ui/slider";
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
  GenerationStatusEvent,
  McOption,
  McHistoryEntry,
  QuestionHistoryEntry,
  Difficulty
} from "../types";
import { fileToDataUrl, normalizeMarkResponse, readBackendError } from "../lib/app-utils";

function formatDurationMs(durationMs: number) {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

export function GeneratorView() {
  const [stopwatchStartedAt, setStopwatchStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showWrittenRawOutput, setShowWrittenRawOutput] = useState(false);
  const [showMcRawOutput, setShowMcRawOutput] = useState(false);
  const [renderFallbackByQuestionId, setRenderFallbackByQuestionId] = useState<Record<string, boolean>>({});
  const [generationStatus, setGenerationStatus] = useState<GenerationStatusEvent | null>(null);

  const {
    apiKey, model, errorMessage, setErrorMessage,
    selectedTopics, setSelectedTopics, difficulty, setDifficulty,
    techMode, setTechMode, mathMethodsSubtopics, setMathMethodsSubtopics,
    chemistrySubtopics, setChemistrySubtopics,
    physicalEducationSubtopics, setPhysicalEducationSubtopics,
    questionCount, setQuestionCount, maxMarksPerQuestion, setMaxMarksPerQuestion,
    debugMode, writtenRawModelOutput, setWrittenRawModelOutput, mcRawModelOutput, setMcRawModelOutput,
    writtenGenerationTelemetry, setWrittenGenerationTelemetry, mcGenerationTelemetry, setMcGenerationTelemetry,
    questionMode, setQuestionMode,
    questions, setQuestions, activeQuestionIndex, setActiveQuestionIndex,
    answersByQuestionId, setAnswersByQuestionId, imagesByQuestionId, setImagesByQuestionId,
    feedbackByQuestionId, setFeedbackByQuestionId, setQuestionHistory,
    mcQuestions, setMcQuestions, activeMcQuestionIndex, setActiveMcQuestionIndex,
    mcAnswersByQuestionId, setMcAnswersByQuestionId, setMcHistory,
    activeWrittenSavedSetId, setActiveWrittenSavedSetId, activeMcSavedSetId, setActiveMcSavedSetId,
    saveCurrentSet,
    isGenerating, setIsGenerating, isMarking, setIsMarking
  } = useAppContext();

  const activeQuestion = questions[activeQuestionIndex];
  const activeQuestionAnswer = activeQuestion ? (answersByQuestionId[activeQuestion.id] ?? "") : "";
  const activeQuestionImage = activeQuestion ? imagesByQuestionId[activeQuestion.id] : undefined;
  const activeFeedback = activeQuestion ? feedbackByQuestionId[activeQuestion.id] : undefined;
  const activeQuestionFallbackUsed = activeQuestion ? Boolean(renderFallbackByQuestionId[activeQuestion.id]) : false;

  const activeMcQuestion = mcQuestions[activeMcQuestionIndex];
  const activeMcAnswer = activeMcQuestion ? (mcAnswersByQuestionId[activeMcQuestion.id] ?? "") : "";

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

  const canGenerate =
    selectedTopics.length > 0 &&
    apiKey.trim().length > 0 &&
    model.trim().length > 0 &&
    questionCount >= 1 &&
    questionCount <= 20 &&
    maxMarksPerQuestion >= 1 &&
    maxMarksPerQuestion <= 30 &&
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

  const formattedElapsedTime = useMemo(() => {
    const hours = Math.floor(elapsedSeconds / 3600);
    const minutes = Math.floor((elapsedSeconds % 3600) / 60);
    const seconds = elapsedSeconds % 60;
    if (hours > 0) return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }, [elapsedSeconds]);

  useEffect(() => {
    if (stopwatchStartedAt === null) return;
    const updateElapsed = () => setElapsedSeconds(Math.floor((Date.now() - stopwatchStartedAt) / 1000));
    updateElapsed();
    const timerId = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timerId);
  }, [stopwatchStartedAt]);

  useEffect(() => {
    let unlisten: undefined | (() => void);

    void listen<GenerationStatusEvent>("generation-status", (event) => {
      setGenerationStatus(event.payload);
    }).then((dispose) => {
      unlisten = dispose;
    });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  function startStopwatch() {
    setStopwatchStartedAt(Date.now());
    setElapsedSeconds(0);
  }

  function resetStopwatch() {
    setStopwatchStartedAt(null);
    setElapsedSeconds(0);
  }

  function toggleTopic(topic: Topic) {
    setSelectedTopics((prev) => prev.includes(topic) ? prev.filter((t: Topic) => t !== topic) : [...prev, topic]);
  }

  function toggleSubtopic(sub: MathMethodsSubtopic) {
    setMathMethodsSubtopics((prev: MathMethodsSubtopic[]) => prev.includes(sub) ? prev.filter((s: MathMethodsSubtopic) => s !== sub) : [...prev, sub]);
  }

  function toggleChemistrySubtopic(sub: ChemistrySubtopic) {
    setChemistrySubtopics((prev: ChemistrySubtopic[]) => prev.includes(sub) ? prev.filter((s: ChemistrySubtopic) => s !== sub) : [...prev, sub]);
  }

  function togglePhysicalEducationSubtopic(sub: PhysicalEducationSubtopic) {
    setPhysicalEducationSubtopics((prev: PhysicalEducationSubtopic[]) => prev.includes(sub) ? prev.filter((s: PhysicalEducationSubtopic) => s !== sub) : [...prev, sub]);
  }

  function getSelectedSubtopics() {
    return [
      ...(selectedTopics.includes("Mathematical Methods") ? mathMethodsSubtopics : []),
      ...(selectedTopics.includes("Chemistry") ? chemistrySubtopics : []),
      ...(selectedTopics.includes("Physical Education") ? physicalEducationSubtopics : []),
    ];
  }

  function isMathTopic(topic?: string) {
    return topic === "Mathematical Methods" || topic === "Specialist Mathematics";
  }

  async function handleGenerateQuestions() {
    if (!canGenerate) return;
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
          maxMarksPerQuestion,
          model,
          apiKey,
          techMode,
          subtopics: getSelectedSubtopics(),
        },
      });

      setQuestions(response.questions);
      setWrittenRawModelOutput(response.rawModelOutput ?? "");
      setWrittenGenerationTelemetry(response.telemetry ?? null);
      setShowWrittenRawOutput(false);
      setActiveQuestionIndex(0);
      setActiveWrittenSavedSetId(null);
      setAnswersByQuestionId({});
      setImagesByQuestionId({});
      setFeedbackByQuestionId({});
      setRenderFallbackByQuestionId({});
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
      const rawResponse = await invoke<unknown>("mark_answer", {
        request: {
          question: activeQuestion,
          studentAnswer: activeQuestionAnswer,
          studentAnswerImageDataUrl: activeQuestionImage?.dataUrl,
          model,
          apiKey,
        },
      });

      const response = normalizeMarkResponse(rawResponse, activeQuestion.maxMarks);
      setFeedbackByQuestionId((prev: any) => ({ ...prev, [activeQuestion.id]: response }));

      const historyEntry: QuestionHistoryEntry = {
        id: `${activeQuestion.id}-${Date.now()}`,
        createdAt: new Date().toISOString(),
        question: activeQuestion,
        uploadedAnswer: activeQuestionAnswer,
        uploadedAnswerImage: activeQuestionImage,
        workedSolutionMarkdown: response.workedSolutionMarkdown,
        markResponse: response,
        generationTelemetry: writtenGenerationTelemetry ?? undefined,
      };

      setQuestionHistory((prev: any) => [historyEntry, ...prev].slice(0, 200));
    } catch (error) {
      setErrorMessage(readBackendError(error));
    } finally {
      setIsMarking(false);
    }
  }

  async function handleGenerateMcQuestions() {
    if (!canGenerateMc) return;
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
        request: { topics: selectedTopics, difficulty, questionCount, model, apiKey, techMode, subtopics: getSelectedSubtopics() },
      });
      setMcQuestions(response.questions);
      setMcRawModelOutput(response.rawModelOutput ?? "");
      setMcGenerationTelemetry(response.telemetry ?? null);
      setShowMcRawOutput(false);
      setActiveMcQuestionIndex(0);
      setActiveMcSavedSetId(null);
      setMcAnswersByQuestionId({});
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

  function handleMcAnswer(selectedLabel: string) {
    if (!activeMcQuestion || mcAnswersByQuestionId[activeMcQuestion.id]) return;
    setMcAnswersByQuestionId((prev: any) => ({ ...prev, [activeMcQuestion.id]: selectedLabel }));
    const correct = selectedLabel === activeMcQuestion.correctAnswer;
    const entry: McHistoryEntry = {
      type: "multiple-choice",
      id: `${activeMcQuestion.id}-${Date.now()}`,
      createdAt: new Date().toISOString(),
      question: activeMcQuestion,
      selectedAnswer: selectedLabel,
      correct,
      generationTelemetry: mcGenerationTelemetry ?? undefined,
    };
    setMcHistory((prev: any) => [entry, ...prev].slice(0, 200));
  }

  function handleStartOver() {
    resetStopwatch();
    setQuestions([]);
    setWrittenRawModelOutput("");
    setWrittenGenerationTelemetry(null);
    setShowWrittenRawOutput(false);
    setActiveQuestionIndex(0);
    setActiveWrittenSavedSetId(null);
    setAnswersByQuestionId({});
    setImagesByQuestionId({});
    setFeedbackByQuestionId({});
    setRenderFallbackByQuestionId({});
    setMcQuestions([]);
    setMcRawModelOutput("");
    setMcGenerationTelemetry(null);
    setShowMcRawOutput(false);
    setActiveMcQuestionIndex(0);
    setActiveMcSavedSetId(null);
    setMcAnswersByQuestionId({});
  }

  function handlePromptFallbackChange(isFallback: boolean) {
    if (!activeQuestion) return;
    setRenderFallbackByQuestionId((prev) => {
      if (prev[activeQuestion.id] === isFallback) {
        return prev;
      }
      return { ...prev, [activeQuestion.id]: isFallback };
    });
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
    } catch {
      setErrorMessage("Could not read image file. Try a different file.");
    }
  }

  // --- Render Helpers ---

  const renderProgressBar = (_current: number, total: number, completed: number) => {
    const progressPercent = total > 0 ? (completed / total) * 100 : 0;
    return (
      <div className="flex flex-col gap-2 w-full max-w-sm">
        <div className="flex justify-between text-sm font-medium">
          <span className="text-muted-foreground">Progress</span>
          <span>{completed} / {total}</span>
        </div>
        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all duration-500 ease-in-out" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>
    );
  };

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
            {(selectedTopics.includes("Mathematical Methods") || selectedTopics.includes("Chemistry") || selectedTopics.includes("Physical Education")) && (
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
                          className={`cursor-pointer px-3 py-1.5 text-xs transition-colors ${mathMethodsSubtopics.includes(sub) ? "shadow-md" : "hover:bg-primary/10"}`}
                          onClick={() => toggleSubtopic(sub)}
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
                          className={`cursor-pointer px-3 py-1.5 text-xs transition-colors ${chemistrySubtopics.includes(sub) ? "shadow-md" : "hover:bg-primary/10"}`}
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
                          className={`cursor-pointer px-3 py-1.5 text-xs transition-colors ${physicalEducationSubtopics.includes(sub) ? "shadow-md" : "hover:bg-primary/10"}`}
                          onClick={() => togglePhysicalEducationSubtopic(sub)}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
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
                          {mode === "tech-free" ? "Tech-Free" : mode === "tech-active" ? "Tech-Active" : "Mixed"}
                        </Button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Difficulty</Label>
                <Select value={difficulty} onValueChange={(val) => setDifficulty(val as Difficulty)}>
                  <SelectTrigger className="h-10 bg-background border-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Easy">Easy (Foundation)</SelectItem>
                    <SelectItem value="Medium">Medium (Standard VCE)</SelectItem>
                    <SelectItem value="Hard">Hard (Discriminator)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between items-center">
                  <Label className="text-sm font-semibold">Question Count</Label>
                  <Badge variant="secondary" className="px-2 py-0.5 text-xs">{questionCount}</Badge>
                </div>
                <Slider min={1} max={20} step={1} value={[questionCount]} onValueChange={(val) => setQuestionCount(val[0])} className="py-1" />
              </div>

              {questionMode === "written" && (
                <div className="space-y-1.5 pt-1 md:col-span-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm font-semibold">Max Marks per Question</Label>
                    <Badge variant="secondary" className="px-2 py-0.5 text-xs">{maxMarksPerQuestion} Marks</Badge>
                  </div>
                  <Slider min={1} max={30} step={1} value={[maxMarksPerQuestion]} onValueChange={(val) => setMaxMarksPerQuestion(val[0])} className="py-1" />
                </div>
              )}
            </div>

            {!apiKey && (
              <div className="bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 p-3 rounded-lg text-xs flex items-center gap-2">
                <Settings2 className="w-4 h-4 shrink-0" />
                <span><strong>API Key Missing:</strong> Go to Settings to configure your OpenRouter API Key before generating questions.</span>
              </div>
            )}
            
          </CardContent>

          <CardFooter className="bg-muted/20 p-4 md:p-5 border-t flex flex-col gap-3">
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
            {isGenerating && stopwatchStartedAt !== null && (
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


      ) : questionMode === "written" ? (
        // ── Written Question View ──
        <div className="flex min-h-full flex-col gap-6 pb-20 animate-in slide-in-from-bottom-4 duration-500">
          
          {/* Sticky Header Panel */}
          <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b pb-4 pt-2 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-3xl font-extrabold tracking-tight bg-linear-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
                  Question {activeQuestionIndex + 1}
                </h2>
                <span className="text-xl text-muted-foreground font-medium">of {questions.length}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 transition-colors">{activeQuestion?.topic}</Badge>
                <Badge variant="outline" className="font-semibold">{activeQuestion?.maxMarks} Marks</Badge>
                {activeQuestion && isMathTopic(activeQuestion.topic) && activeQuestion.techAllowed !== undefined && (
                  <Badge variant={activeQuestion.techAllowed ? "default" : "destructive"} className="shadow-sm">
                    {activeQuestion.techAllowed ? "Tech-Active (CAS allowed)" : "Tech-Free (No calculator)"}
                  </Badge>
                )}
                {activeQuestionFallbackUsed && (
                  <Badge variant="outline" className="border-amber-500/60 bg-amber-100/60 text-amber-900 dark:border-amber-500/60 dark:bg-amber-900/40 dark:text-amber-200">
                    LaTeX Recovery Applied
                  </Badge>
                )}
                {stopwatchStartedAt !== null && (
                  <Badge variant="outline" className="inline-flex items-center gap-1.5 font-mono bg-muted/50">
                    <Clock3 className="w-3.5 h-3.5" /> {formattedElapsedTime}
                  </Badge>
                )}
                {writtenGenerationTelemetry && (
                  <Badge variant="outline" className="bg-muted/50">
                    Generated in {formatDurationMs(writtenGenerationTelemetry.durationMs)}
                  </Badge>
                )}
                {writtenGenerationTelemetry && writtenGenerationTelemetry.totalAttempts > 1 && (
                  <Badge variant="outline" className="border-amber-500/60 bg-amber-100/60 text-amber-900 dark:border-amber-500/60 dark:bg-amber-900/40 dark:text-amber-200">
                    {writtenGenerationTelemetry.totalAttempts} attempts • {writtenGenerationTelemetry.repairAttempts} repair pass{writtenGenerationTelemetry.repairAttempts === 1 ? "" : "es"}
                  </Badge>
                )}
                {writtenGenerationTelemetry?.constrainedRegenerationUsed && (
                  <Badge variant="outline" className="border-red-500/60 bg-red-100/60 text-red-900 dark:border-red-500/60 dark:bg-red-900/40 dark:text-red-200">
                    Full regeneration fallback used
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-3 w-full md:w-auto">
              <div className="flex items-center gap-2 w-full justify-end">
                <Button variant={activeWrittenSavedSetId ? "default" : "outline"} size="sm" onClick={saveCurrentSet} className="gap-2 shadow-sm">
                  <Bookmark className="w-4 h-4" />
                  <span className="hidden md:inline">{activeWrittenSavedSetId ? "Update Saved Set" : "Save for Later"}</span>
                </Button>
                <Button variant="ghost" size="sm" onClick={handleStartOver} className="text-muted-foreground hover:text-foreground">Exit Set</Button>
                <Separator orientation="vertical" className="h-6 hidden md:block" />
                <Button variant="outline" size="sm" onClick={() => setActiveQuestionIndex(Math.max(0, activeQuestionIndex - 1))} disabled={activeQuestionIndex === 0} className="shadow-sm">
                  <ArrowLeft className="w-4 h-4 md:mr-2" /> <span className="hidden md:inline">Previous</span>
                </Button>
                <Button variant="outline" size="sm" onClick={() => setActiveQuestionIndex(Math.min(questions.length - 1, activeQuestionIndex + 1))} disabled={activeQuestionIndex === questions.length - 1} className="shadow-sm">
                  <span className="hidden md:inline">Next</span> <ArrowRight className="w-4 h-4 md:ml-2" />
                </Button>
              </div>
              <div className="hidden md:block w-full">
                {renderProgressBar(activeQuestionIndex + 1, questions.length, completedCount)}
              </div>
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
                    <MarkdownMath content={activeQuestion.promptMarkdown} onFallbackChange={handlePromptFallbackChange} />
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
                             onChange={(e) => setAnswersByQuestionId((prev: any) => ({ ...prev, [activeQuestion.id]: e.target.value }))}
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

                      <div className="space-y-4">
                         <Label className="text-xl font-bold border-b pb-2 flex items-center gap-2"><Sparkles className="w-5 h-5 text-amber-500" /> AI Feedback</Label>
                         <div className="prose prose-slate dark:prose-invert max-w-none bg-muted/20 p-5 rounded-xl border border-border/50">
                           <MarkdownMath content={activeFeedback.feedbackMarkdown} />
                         </div>
                      </div>

                      <div className="space-y-4">
                         <Label className="text-xl font-bold border-b pb-2 flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Marking Scheme</Label>
                         <div className="space-y-3 mt-2">
                           {activeFeedback.vcaaMarkingScheme.map((item, idx) => {
                             const isFullMarks = item.achievedMarks === item.maxMarks;
                             return (
                               <div key={idx} className={`p-4 rounded-xl border text-sm flex justify-between gap-6 transition-colors ${isFullMarks ? "bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-900/50" : "bg-card"}`}>
                                 <div className="leading-relaxed flex-1">
                                   <MarkdownMath content={item.criterion} />
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
          
          <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b pb-4 pt-2 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-3xl font-extrabold tracking-tight bg-linear-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
                  Question {activeMcQuestionIndex + 1}
                </h2>
                <span className="text-xl text-muted-foreground font-medium">of {mcQuestions.length}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">{activeMcQuestion?.topic}</Badge>
                <Badge variant="outline" className="font-semibold bg-muted/50">Multiple Choice</Badge>
                {activeMcQuestion && isMathTopic(activeMcQuestion.topic) && activeMcQuestion.techAllowed !== undefined && (
                  <Badge variant={activeMcQuestion.techAllowed ? "default" : "destructive"} className="shadow-sm">
                    {activeMcQuestion.techAllowed ? "Tech-Active (CAS allowed)" : "Tech-Free (No calculator)"}
                  </Badge>
                )}
                {stopwatchStartedAt !== null && (
                  <Badge variant="outline" className="inline-flex items-center gap-1.5 font-mono bg-muted/50">
                    <Clock3 className="w-3.5 h-3.5" /> {formattedElapsedTime}
                  </Badge>
                )}
                {mcGenerationTelemetry && (
                  <Badge variant="outline" className="bg-muted/50">
                    Generated in {formatDurationMs(mcGenerationTelemetry.durationMs)}
                  </Badge>
                )}
                {mcGenerationTelemetry && mcGenerationTelemetry.totalAttempts > 1 && (
                  <Badge variant="outline" className="border-amber-500/60 bg-amber-100/60 text-amber-900 dark:border-amber-500/60 dark:bg-amber-900/40 dark:text-amber-200">
                    {mcGenerationTelemetry.totalAttempts} attempts • {mcGenerationTelemetry.repairAttempts} repair pass{mcGenerationTelemetry.repairAttempts === 1 ? "" : "es"}
                  </Badge>
                )}
                {mcGenerationTelemetry?.constrainedRegenerationUsed && (
                  <Badge variant="outline" className="border-red-500/60 bg-red-100/60 text-red-900 dark:border-red-500/60 dark:bg-red-900/40 dark:text-red-200">
                    Full regeneration fallback used
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-3 w-full md:w-auto">
              <div className="flex items-center gap-2 w-full justify-end">
                <Button variant={activeMcSavedSetId ? "default" : "outline"} size="sm" onClick={saveCurrentSet} className="gap-2 shadow-sm">
                  <Bookmark className="w-4 h-4" />
                  <span className="hidden md:inline">{activeMcSavedSetId ? "Update Saved Set" : "Save for Later"}</span>
                </Button>
                <Button variant="ghost" size="sm" onClick={handleStartOver} className="text-muted-foreground hover:text-foreground">Exit Set</Button>
                <Separator orientation="vertical" className="h-6 hidden md:block" />
                <Button variant="outline" size="sm" onClick={() => setActiveMcQuestionIndex(Math.max(0, activeMcQuestionIndex - 1))} disabled={activeMcQuestionIndex === 0} className="shadow-sm">
                  <ArrowLeft className="w-4 h-4 md:mr-2" /> <span className="hidden md:inline">Previous</span>
                </Button>
                <Button variant="outline" size="sm" onClick={() => setActiveMcQuestionIndex(Math.min(mcQuestions.length - 1, activeMcQuestionIndex + 1))} disabled={activeMcQuestionIndex === mcQuestions.length - 1} className="shadow-sm">
                  <span className="hidden md:inline">Next</span> <ArrowRight className="w-4 h-4 md:ml-2" />
                </Button>
              </div>
              <div className="hidden md:block w-full">
                {renderProgressBar(activeMcQuestionIndex + 1, mcQuestions.length, mcCompletedCount)}
              </div>
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
                        <pre className="mt-2 max-h-80 overflow-auto rounded-xl border border-border/60 bg-muted/30 p-4 text-xs leading-5 whitespace-pre-wrap wrap-break-word">{mcRawModelOutput}</pre>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl"><Target className="w-5 h-5 text-primary" /> Select an Answer</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
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
                          className={`w-full text-left p-5 rounded-2xl flex gap-4 items-center transition-all duration-200 ${dynamicClasses} ${!answered ? "cursor-pointer transform hover:-translate-y-0.5" : "cursor-default"}`}
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
                    <div className={`mt-6 p-6 rounded-2xl border-2 flex gap-4 items-start animate-in zoom-in-95 duration-300 ${
                      activeMcAnswer === activeMcQuestion.correctAnswer
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