import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, ArrowRight, ArrowLeft, Trash2, CheckCircle2, XCircle, Clock3 } from "lucide-react";
import { useAppContext } from "../AppContext";
import { MarkdownMath } from "../components/MarkdownMath";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "../components/ui/card";
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
  PHYSICAL_EDUCATION_SUBTOPICS,
  PhysicalEducationSubtopic,
  GenerateQuestionsResponse,
  GenerateMcQuestionsResponse,
  McHistoryEntry,
  QuestionHistoryEntry,
  Difficulty
} from "../types";
import { fileToDataUrl, normalizeMarkResponse, readBackendError } from "../lib/app-utils";

export function GeneratorView() {
  const [stopwatchStartedAt, setStopwatchStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const {
    apiKey, model, errorMessage, setErrorMessage,
    selectedTopics, setSelectedTopics, difficulty, setDifficulty,
    techMode, setTechMode, mathMethodsSubtopics, setMathMethodsSubtopics,
    physicalEducationSubtopics, setPhysicalEducationSubtopics,
    questionCount, setQuestionCount, maxMarksPerQuestion, setMaxMarksPerQuestion,
    questionMode, setQuestionMode,
    questions, setQuestions, activeQuestionIndex, setActiveQuestionIndex,
    answersByQuestionId, setAnswersByQuestionId, imagesByQuestionId, setImagesByQuestionId,
    feedbackByQuestionId, setFeedbackByQuestionId, setQuestionHistory,
    mcQuestions, setMcQuestions, activeMcQuestionIndex, setActiveMcQuestionIndex,
    mcAnswersByQuestionId, setMcAnswersByQuestionId, setMcHistory,
    isGenerating, setIsGenerating, isMarking, setIsMarking
  } = useAppContext();

  const activeQuestion = questions[activeQuestionIndex];
  const activeQuestionAnswer = activeQuestion ? (answersByQuestionId[activeQuestion.id] ?? "") : "";
  const activeQuestionImage = activeQuestion ? imagesByQuestionId[activeQuestion.id] : undefined;
  const activeFeedback = activeQuestion ? feedbackByQuestionId[activeQuestion.id] : undefined;

  const activeMcQuestion = mcQuestions[activeMcQuestionIndex];
  const activeMcAnswer = activeMcQuestion ? (mcAnswersByQuestionId[activeMcQuestion.id] ?? "") : "";

  const showSetup = questionMode === "written" ? questions.length === 0 : mcQuestions.length === 0;
  
  const completedCount = useMemo(
    () => questions.filter((q) => feedbackByQuestionId[q.id]).length,
    [feedbackByQuestionId, questions],
  );

  const mcCompletedCount = useMemo(
    () => mcQuestions.filter((q) => mcAnswersByQuestionId[q.id]).length,
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

    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }

    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }, [elapsedSeconds]);

  useEffect(() => {
    if (stopwatchStartedAt === null) {
      return;
    }

    const updateElapsed = () => {
      setElapsedSeconds(Math.floor((Date.now() - stopwatchStartedAt) / 1000));
    };

    updateElapsed();
    const timerId = window.setInterval(updateElapsed, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [stopwatchStartedAt]);

  function startStopwatch() {
    const now = Date.now();
    setStopwatchStartedAt(now);
    setElapsedSeconds(0);
  }

  function resetStopwatch() {
    setStopwatchStartedAt(null);
    setElapsedSeconds(0);
  }

  function toggleTopic(topic: Topic) {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  }

  function toggleSubtopic(sub: MathMethodsSubtopic) {
    setMathMethodsSubtopics((prev) =>
      prev.includes(sub) ? prev.filter((s) => s !== sub) : [...prev, sub]
    );
  }

  function togglePhysicalEducationSubtopic(sub: PhysicalEducationSubtopic) {
    setPhysicalEducationSubtopics((prev) =>
      prev.includes(sub) ? prev.filter((s) => s !== sub) : [...prev, sub]
    );
  }

  function getSelectedSubtopics() {
    return [
      ...(selectedTopics.includes("Mathematical Methods") ? mathMethodsSubtopics : []),
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
      setActiveQuestionIndex(0);
      setAnswersByQuestionId({});
      setImagesByQuestionId({});
      setFeedbackByQuestionId({});
    } catch (error) {
      resetStopwatch();
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
      setFeedbackByQuestionId((prev) => ({ ...prev, [activeQuestion.id]: response }));

      const historyEntry: QuestionHistoryEntry = {
        id: `${activeQuestion.id}-${Date.now()}`,
        createdAt: new Date().toISOString(),
        question: activeQuestion,
        uploadedAnswer: activeQuestionAnswer,
        uploadedAnswerImage: activeQuestionImage,
        workedSolutionMarkdown: response.workedSolutionMarkdown,
        markResponse: response,
      };

      setQuestionHistory((prev) => [historyEntry, ...prev].slice(0, 200));
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
    setIsGenerating(true);
    try {
      const response = await invoke<GenerateMcQuestionsResponse>("generate_mc_questions", {
        request: { topics: selectedTopics, difficulty, questionCount, model, apiKey, techMode, subtopics: getSelectedSubtopics() },
      });
      setMcQuestions(response.questions);
      setActiveMcQuestionIndex(0);
      setMcAnswersByQuestionId({});
    } catch (error) {
      resetStopwatch();
      setErrorMessage(readBackendError(error));
    } finally {
      setIsGenerating(false);
    }
  }

  function handleMcAnswer(selectedLabel: string) {
    if (!activeMcQuestion || mcAnswersByQuestionId[activeMcQuestion.id]) return;
    setMcAnswersByQuestionId((prev) => ({ ...prev, [activeMcQuestion.id]: selectedLabel }));
    const correct = selectedLabel === activeMcQuestion.correctAnswer;
    const entry: McHistoryEntry = {
      type: "multiple-choice",
      id: `${activeMcQuestion.id}-${Date.now()}`,
      createdAt: new Date().toISOString(),
      question: activeMcQuestion,
      selectedAnswer: selectedLabel,
      correct,
    };
    setMcHistory((prev) => [entry, ...prev].slice(0, 200));
  }

  function handleStartOver() {
    resetStopwatch();
    setQuestions([]);
    setActiveQuestionIndex(0);
    setAnswersByQuestionId({});
    setImagesByQuestionId({});
    setFeedbackByQuestionId({});
    setMcQuestions([]);
    setActiveMcQuestionIndex(0);
    setMcAnswersByQuestionId({});
  }

  async function handleDropDropzone(acceptedFiles: File[]) {
    if (!activeQuestion || acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    
    try {
      const dataUrl = await fileToDataUrl(file);
      setErrorMessage(null);
      setImagesByQuestionId((prev) => ({
        ...prev,
        [activeQuestion.id]: { name: file.name, dataUrl },
      }));
    } catch {
      setErrorMessage("Could not read image file. Try a different file.");
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto h-full flex flex-col gap-6">
      {errorMessage && (
        <div className="bg-destructive/15 text-destructive p-4 rounded-md text-sm mb-4">
          {errorMessage}
        </div>
      )}

      {showSetup ? (
        <Card className="shrink-0 animate-in fade-in zoom-in duration-300">
          <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-2xl">Setup Generation</CardTitle>
            <div className="flex rounded-lg border overflow-hidden">
              <Button
                variant={questionMode === "written" ? "default" : "ghost"}
                size="sm"
                className="rounded-none"
                onClick={() => setQuestionMode("written")}
              >Written Answer</Button>
              <Button
                variant={questionMode === "multiple-choice" ? "default" : "ghost"}
                size="sm"
                className="rounded-none"
                onClick={() => setQuestionMode("multiple-choice")}
              >Multiple Choice</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="space-y-3">
              <Label>Select Topics</Label>
              <div className="flex flex-wrap gap-2">
                {TOPICS.map((topic) => (
                  <Badge
                    key={topic}
                    variant={selectedTopics.includes(topic) ? "default" : "secondary"}
                    className="cursor-pointer text-sm p-4"
                    onClick={() => toggleTopic(topic)}
                  >
                    {topic}
                  </Badge>
                ))}
              </div>
              {selectedTopics.includes("Mathematical Methods") && (
                <p className="text-sm text-muted-foreground">
                  Mathematical Methods generation includes the attached exam PDFs as reference for question style and mark allocations.
                </p>
              )}
              {selectedTopics.includes("Physical Education") && (
                <p className="text-sm text-muted-foreground">
                  Physical Education generation uses Unit 3/4 only and includes the attached 2025 exam PDF as reference.
                </p>
              )}
            </div>

            {selectedTopics.includes("Mathematical Methods") && (
              <div className="space-y-3">
                <Label>Mathematical Methods Subtopics</Label>
                <p className="text-sm text-muted-foreground">Select subtopics to focus on, or leave all unselected to cover everything.</p>
                <div className="flex flex-wrap gap-2">
                  {MATH_METHODS_SUBTOPICS.map((sub) => (
                    <Badge
                      key={sub}
                      variant={mathMethodsSubtopics.includes(sub) ? "default" : "secondary"}
                      className="cursor-pointer text-sm p-3"
                      onClick={() => toggleSubtopic(sub)}
                    >
                      {sub}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {selectedTopics.includes("Physical Education") && (
              <div className="space-y-3">
                <Label>Physical Education Unit 3/4 Subtopics</Label>
                <p className="text-sm text-muted-foreground">Subtopics extracted from the 2025 study design (Units 3/4 only). Leave unselected to cover all Unit 3/4 content.</p>
                <div className="flex flex-wrap gap-2">
                  {PHYSICAL_EDUCATION_SUBTOPICS.map((sub) => (
                    <Badge
                      key={sub}
                      variant={physicalEducationSubtopics.includes(sub) ? "default" : "secondary"}
                      className="cursor-pointer text-sm p-3"
                      onClick={() => togglePhysicalEducationSubtopic(sub)}
                    >
                      {sub}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {(selectedTopics.includes("Mathematical Methods") || selectedTopics.includes("Specialist Mathematics")) && (
              <div className="space-y-3">
                <Label>Calculator Mode</Label>
                <div className="flex rounded-lg border overflow-hidden w-fit">
                  {(["tech-free", "mix", "tech-active"] as TechMode[]).map((mode) => (
                    <Button
                      key={mode}
                      variant={techMode === mode ? "default" : "ghost"}
                      size="sm"
                      className="rounded-none"
                      onClick={() => setTechMode(mode)}
                    >
                      {mode === "tech-free" ? "Tech-Free" : mode === "tech-active" ? "Tech-Active" : "Mix"}
                    </Button>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  {techMode === "tech-free" && "No CAS calculator permitted on any question."}
                  {techMode === "tech-active" && "CAS calculator allowed on all questions."}
                  {techMode === "mix" && "A mix of tech-free and tech-active questions."}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <Label>Difficulty</Label>
                <Select value={difficulty} onValueChange={(val) => setDifficulty(val as Difficulty)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Easy">Easy</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4 pt-1">
                <div className="flex justify-between items-center">
                  <Label>Number of Questions</Label>
                  <span className="text-sm font-medium">{questionCount}</span>
                </div>
                <Slider
                  min={1}
                  max={20}
                  step={1}
                  value={[questionCount]}
                  onValueChange={(val) => setQuestionCount(val[0])}
                />
              </div>

              {questionMode === "written" && (
                <div className="space-y-4 pt-1 md:col-span-2">
                  <div className="flex justify-between items-center">
                    <Label>Max Marks per Question</Label>
                    <span className="text-sm font-medium">{maxMarksPerQuestion}</span>
                  </div>
                  <Slider
                    min={1}
                    max={30}
                    step={1}
                    value={[maxMarksPerQuestion]}
                    onValueChange={(val) => setMaxMarksPerQuestion(val[0])}
                  />
                </div>
              )}
            </div>

            {!apiKey && (
              <div className="bg-muted p-4 rounded-md text-sm border">
                <strong>Almost ready!</strong> Go to Settings to configure your OpenRouter API Key before generating.
              </div>
            )}
            
          </CardContent>
          <CardFooter className="bg-muted/30 pt-6">
            <div className="w-full space-y-2">
              <Button
                size="lg"
                className="w-full text-base"
                onClick={questionMode === "written" ? handleGenerateQuestions : handleGenerateMcQuestions}
                disabled={questionMode === "written" ? !canGenerate : !canGenerateMc}
              >
                {isGenerating ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Generating...</> : "Generate Questions"}
              </Button>
              {isGenerating && stopwatchStartedAt !== null && (
                <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <Clock3 className="w-3.5 h-3.5" />
                  <span>{formattedElapsedTime}</span>
                </div>
              )}
            </div>
          </CardFooter>
        </Card>
      ) : questionMode === "written" ? (
        <div className="flex flex-col h-full gap-4 pb-20">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Question {activeQuestionIndex + 1} of {questions.length}</h2>
              <div className="text-sm text-muted-foreground mt-1 flex items-center gap-4">
                <Badge variant="outline">{activeQuestion?.topic}</Badge>
                <span>{activeQuestion?.maxMarks} Marks</span>
                {activeQuestion && isMathTopic(activeQuestion.topic) && activeQuestion.techAllowed !== undefined && (
                  <Badge variant={activeQuestion.techAllowed ? "secondary" : "outline"} className={activeQuestion.techAllowed ? "border-green-500 text-green-700 dark:text-green-400" : "border-amber-500 text-amber-700 dark:text-amber-400"}>
                    {activeQuestion.techAllowed ? "CAS Calculator" : "No Calculator"}
                  </Badge>
                )}
                {stopwatchStartedAt !== null && (
                  <Badge variant="outline" className="inline-flex items-center gap-1.5">
                    <Clock3 className="w-3.5 h-3.5" />
                    {formattedElapsedTime}
                  </Badge>
                )}
                <span>{completedCount} / {questions.length} Completed</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleStartOver}>Start Over</Button>
              <Separator orientation="vertical" className="h-6" />
              <Button
                variant="outline"
                onClick={() => setActiveQuestionIndex(Math.max(0, activeQuestionIndex - 1))}
                disabled={activeQuestionIndex === 0}
              >
                <ArrowLeft className="w-4 h-4 mr-2" /> Previous
              </Button>
              <Button
                variant="outline"
                onClick={() => setActiveQuestionIndex(Math.min(questions.length - 1, activeQuestionIndex + 1))}
                disabled={activeQuestionIndex === questions.length - 1}
              >
                Next <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>

          {activeQuestion && (
            <div className="grid lg:grid-cols-2 gap-6 items-start">
              
              {/* Question Side */}
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>Problem</CardTitle>
                </CardHeader>
                <CardContent>
                   <MarkdownMath content={activeQuestion.promptMarkdown} />
                </CardContent>
              </Card>

              {/* Answer Side */}
              <Card className="h-full flex flex-col">
                <CardHeader>
                  <CardTitle>Your Answer</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 flex-1">
                  {!activeFeedback ? (
                     <>
                        <div className="space-y-2">
                           <Label>Written Response</Label>
                           <Textarea
                             placeholder="Type your answer here..."
                             className="min-h-30 resize-y"
                             value={activeQuestionAnswer}
                             onChange={(e) => setAnswersByQuestionId((prev) => ({ ...prev, [activeQuestion.id]: e.target.value }))}
                             disabled={isMarking}
                           />
                        </div>

                        <div className="space-y-2">
                          <Label>Or upload an image of your working</Label>
                          {activeQuestionImage ? (
                            <div className="relative group rounded-md overflow-hidden border">
                               <img src={activeQuestionImage.dataUrl} alt="Uploaded text" className="w-full h-auto max-h-75 object-contain bg-muted" />
                               <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <Button variant="destructive" size="sm" onClick={() => setImagesByQuestionId((prev) => ({ ...prev, [activeQuestion.id]: undefined }))}>
                                    <Trash2 className="w-4 h-4 mr-2" /> Remove Image
                                  </Button>
                               </div>
                            </div>
                          ) : (
                            <Dropzone onDrop={handleDropDropzone} />
                          )}
                        </div>

                        <Button 
                          className="w-full mt-4" 
                          onClick={handleSubmitForMarking}
                          disabled={!canSubmitAnswer || isMarking}
                        >
                          {isMarking ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Marking...</> : <><CheckCircle2 className="w-4 h-4 mr-2" /> Submit Answer</>}
                        </Button>
                     </>
                  ) : (
                    <div className="space-y-6">
                      <div className="bg-primary/10 p-4 rounded-lg flex justify-between items-center">
                         <div>
                            <div className="text-sm font-medium text-primary">Score</div>
                            <div className="text-3xl font-bold text-primary">{activeFeedback.scoreOutOf10}<span className="text-lg opacity-75">/10</span></div>
                         </div>
                         <div className="text-right">
                           <div className="text-sm font-medium">Marks</div>
                           <div className="text-xl font-semibold">{activeFeedback.achievedMarks} <span className="text-sm text-muted-foreground">/ {activeFeedback.maxMarks}</span></div>
                         </div>
                      </div>

                      <div className="space-y-2">
                         <Label className="text-base">Feedback</Label>
                         <MarkdownMath content={activeFeedback.feedbackMarkdown} />
                      </div>

                      <Separator />

                      <div className="space-y-2">
                         <Label className="text-base">Marking Scheme Breakdown</Label>
                         <div className="space-y-3 mt-2">
                           {activeFeedback.vcaaMarkingScheme.map((item, idx) => (
                             <div key={idx} className="bg-muted px-4 py-3 rounded-md text-sm flex justify-between gap-4">
                               <span>{item.criterion}</span>
                               <span className="font-medium whitespace-nowrap text-right">{item.achievedMarks}/{item.maxMarks}</span>
                             </div>
                           ))}
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
        /* ── Multiple Choice Question View ── */
        <div className="flex flex-col h-full gap-4 pb-20">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Question {activeMcQuestionIndex + 1} of {mcQuestions.length}</h2>
              <div className="text-sm text-muted-foreground mt-1 flex items-center gap-4">
                <Badge variant="outline">{activeMcQuestion?.topic}</Badge>
                <Badge variant="secondary">Multiple Choice</Badge>
                {activeMcQuestion && isMathTopic(activeMcQuestion.topic) && activeMcQuestion.techAllowed !== undefined && (
                  <Badge variant={activeMcQuestion.techAllowed ? "secondary" : "outline"} className={activeMcQuestion.techAllowed ? "border-green-500 text-green-700 dark:text-green-400" : "border-amber-500 text-amber-700 dark:text-amber-400"}>
                    {activeMcQuestion.techAllowed ? "CAS Calculator" : "No Calculator"}
                  </Badge>
                )}
                {stopwatchStartedAt !== null && (
                  <Badge variant="outline" className="inline-flex items-center gap-1.5">
                    <Clock3 className="w-3.5 h-3.5" />
                    {formattedElapsedTime}
                  </Badge>
                )}
                <span>{mcCompletedCount} / {mcQuestions.length} Answered</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleStartOver}>Start Over</Button>
              <Separator orientation="vertical" className="h-6" />
              <Button
                variant="outline"
                onClick={() => setActiveMcQuestionIndex(Math.max(0, activeMcQuestionIndex - 1))}
                disabled={activeMcQuestionIndex === 0}
              >
                <ArrowLeft className="w-4 h-4 mr-2" /> Previous
              </Button>
              <Button
                variant="outline"
                onClick={() => setActiveMcQuestionIndex(Math.min(mcQuestions.length - 1, activeMcQuestionIndex + 1))}
                disabled={activeMcQuestionIndex === mcQuestions.length - 1}
              >
                Next <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>

          {activeMcQuestion && (
            <div className="grid lg:grid-cols-2 gap-6 items-start">
              <Card>
                <CardHeader><CardTitle>Problem</CardTitle></CardHeader>
                <CardContent>
                  <MarkdownMath content={activeMcQuestion.promptMarkdown} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Choose an Answer</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {activeMcQuestion.options.map((opt) => {
                    const answered = Boolean(activeMcAnswer);
                    const isChosen = activeMcAnswer === opt.label;
                    const isCorrect = opt.label === activeMcQuestion.correctAnswer;
                    let extraClass = "border bg-background hover:bg-muted";
                    if (answered) {
                      if (isCorrect) extraClass = "border-green-500 bg-green-50 dark:bg-green-950/40";
                      else if (isChosen) extraClass = "border-red-500 bg-red-50 dark:bg-red-950/40";
                      else extraClass = "border bg-background opacity-60";
                    }
                    return (
                      <button
                        key={opt.label}
                        disabled={answered}
                        className={`w-full text-left p-3 rounded-lg flex gap-3 items-start transition-colors ${extraClass} ${!answered ? "cursor-pointer" : "cursor-default"}`}
                        onClick={() => handleMcAnswer(opt.label)}
                      >
                        <span className="font-bold shrink-0 w-5">{opt.label}.</span>
                        <span className="flex-1"><MarkdownMath content={opt.text} /></span>
                      </button>
                    );
                  })}

                  {activeMcAnswer && (
                    <div className={`mt-2 p-4 rounded-lg flex gap-3 items-start ${
                      activeMcAnswer === activeMcQuestion.correctAnswer
                        ? "bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-300"
                        : "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300"
                    }`}>
                      {activeMcAnswer === activeMcQuestion.correctAnswer
                        ? <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                        : <XCircle className="w-5 h-5 shrink-0 mt-0.5" />}
                      <div>
                        <p className="font-semibold mb-1">
                          {activeMcAnswer === activeMcQuestion.correctAnswer
                            ? "Correct!"
                            : `Incorrect — the correct answer is ${activeMcQuestion.correctAnswer}`}
                        </p>
                        <div className="text-foreground">
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
