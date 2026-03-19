import { useAppContext, useAppPreferences, useWrittenSession, usePassageSession } from "@/AppContext";
import { MarkdownMath } from "@/components/MarkdownMath";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dropzone } from "@/components/ui/dropzone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BookOpen, Target, Sparkles, Loader2, Info, Bookmark, RefreshCcw,
  Trash2, ArrowLeft, ArrowRight, BookText, Bug,
} from "lucide-react";
import { ElapsedTimerText, ProgressBar } from "./SharedComponents";
import { getDifficultyBadgeClasses, isMathTopic } from "@/views/generatorUtils";
import { formatDurationMs } from "@/lib/app-utils";

interface WrittenSessionViewProps {
  isPassageMode: boolean;
  sessionFinishedAt: number | null;
  markAppealByQuestionId: Record<string, string>;
  setMarkAppealByQuestionId: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  markOverrideInputByQuestionId: Record<string, string>;
  setMarkOverrideInputByQuestionId: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  writtenResponseEnteredAtById: Record<string, number>;
  setWrittenResponseEnteredAtById: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  showWrittenRawOutput: boolean;
  setShowWrittenRawOutput: React.Dispatch<React.SetStateAction<boolean>>;
  showPassageRawOutput: boolean;
  setShowPassageRawOutput: React.Dispatch<React.SetStateAction<boolean>>;
  // Computed values passed in from orchestrator
  activeWrittenQuestion: ReturnType<typeof useWrittenSession>["questions"][number] | ReturnType<typeof usePassageSession>["passage"] extends null | undefined ? undefined : NonNullable<ReturnType<typeof usePassageSession>["passage"]>["questions"][number] | undefined;
  activeWrittenAnswer: string;
  activeWrittenFeedback: any;
  activeWrittenMarkAppeal: string;
  activeWrittenOverrideInput: string;
  activeWrittenTelemetry: any;
  activeLineItems: Array<{ lineNumber: number; text: string }>;
  writtenCurrentIndex: number;
  writtenTotalQuestions: number;
  writtenCompletedCount: number;
  isAtLastWrittenQuestion: boolean;
  canAdvanceWritten: boolean;
  isWrittenSetComplete: boolean;
  canSubmitAnswer: boolean;
  canShowWrittenRawOutput: boolean;
  canShowPassageRawOutput: boolean;
  onSubmitForMarking: () => void;
  onArgueForMark: () => void;
  onOverrideMark: () => void;
  onCancelQuestion: () => void;
  onResetPassage: () => void;
  onStartOver: () => void;
  onNext: () => void;
}

export function WrittenSessionView({
  isPassageMode,
  sessionFinishedAt,
  setMarkAppealByQuestionId,
  setMarkOverrideInputByQuestionId,
  setWrittenResponseEnteredAtById,
  showWrittenRawOutput,
  setShowWrittenRawOutput,
  showPassageRawOutput,
  setShowPassageRawOutput,
  activeWrittenQuestion,
  activeWrittenAnswer,
  activeWrittenFeedback,
  activeWrittenMarkAppeal,
  activeWrittenOverrideInput,
  activeWrittenTelemetry,
  activeLineItems,
  writtenCurrentIndex,
  writtenTotalQuestions,
  writtenCompletedCount,
  isAtLastWrittenQuestion,
  canAdvanceWritten,
  canSubmitAnswer,
  canShowWrittenRawOutput,
  canShowPassageRawOutput,
  onSubmitForMarking,
  onArgueForMark,
  onOverrideMark,
  onCancelQuestion,
  onResetPassage,
  onStartOver,
  onNext,
}: WrittenSessionViewProps) {
  const { difficulty } = useAppPreferences();
  const {
    questions,
    activeQuestionIndex,
    setActiveQuestionIndex,
    setAnswersByQuestionId,
    imagesByQuestionId,
    setImagesByQuestionId,
    writtenRawModelOutput,
    activeWrittenSavedSetId,
  } = useWrittenSession();
  const {
    passage,
    activePassageQuestionIndex,
    setActivePassageQuestionIndex,
    setPassageAnswersByQuestionId,
    passageRawModelOutput,
  } = usePassageSession();
  const { isMarking, saveCurrentSet, generationStartedAt } = useAppContext();

  const activeQuestion = questions[activeQuestionIndex];
  const activeQuestionImage = activeQuestion ? imagesByQuestionId[activeQuestion.id] : undefined;

  function handlePrev() {
    if (isPassageMode && passage) {
      setActivePassageQuestionIndex(Math.max(0, activePassageQuestionIndex - 1));
    } else {
      setActiveQuestionIndex(Math.max(0, activeQuestionIndex - 1));
    }
  }

  const prevDisabled = isPassageMode ? activePassageQuestionIndex === 0 : activeQuestionIndex === 0;

  async function handleDropDropzone(acceptedFiles: File[]) {
    if (isPassageMode || !activeQuestion || acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    try {
      const { fileToDataUrl } = await import("@/lib/app-utils");
      const dataUrl = await fileToDataUrl(file);
      setImagesByQuestionId((prev) => ({
        ...prev,
        [activeQuestion.id]: { name: file.name, dataUrl },
      }));
      setWrittenResponseEnteredAtById((prev) => {
        if (prev[activeQuestion.id] !== undefined) return prev;
        return { ...prev, [activeQuestion.id]: Date.now() };
      });
    } catch {
      // silently ignore — caller can wire setErrorMessage if needed
    }
  }

  return (
    <div className="flex min-h-full flex-col gap-4 pb-20 animate-in slide-in-from-bottom-4 duration-500">
      {/* Sticky Navbar */}
      <div className="sticky px-3 top-0 z-10 flex flex-col gap-2 border-b bg-background/80 py-1.5 backdrop-blur-xl shadow-sm">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <div className="flex items-baseline gap-1 shrink-0">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight">
                Q{writtenCurrentIndex + 1}
              </h2>
              <span className="text-xs text-muted-foreground font-medium">
                / {writtenTotalQuestions}
              </span>
            </div>
            {isPassageMode && passage ? (
              <>
                <Badge variant="secondary" className="shrink-0 border-primary/20 bg-primary/10 text-primary px-1.5 py-0">
                  English
                </Badge>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {passage.aosSubtopic}
                </Badge>
              </>
            ) : (
              <>
                <Badge variant="secondary" className="shrink-0 border-primary/20 bg-primary/10 text-primary px-1.5 py-0">
                  {activeQuestion?.topic}
                </Badge>
                <Badge variant="outline" className={`shrink-0 text-[10px] ${getDifficultyBadgeClasses(difficulty)}`}>
                  {difficulty}
                </Badge>
              </>
            )}
            <Badge variant="outline" className="shrink-0 text-[10px] font-semibold">
              {activeWrittenQuestion?.maxMarks} marks
            </Badge>
            {!isPassageMode && activeQuestion && isMathTopic(activeQuestion.topic) && activeQuestion.techAllowed !== undefined && (
              <Badge
                variant={activeQuestion.techAllowed ? "default" : "destructive"}
                className="shrink-0 text-[10px]"
              >
                {activeQuestion.techAllowed ? "Tech-active" : "Tech-free"}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" className="h-7 w-7 rounded-full">
                    <Info className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="end" sideOffset={8} className="w-72 p-3 text-xs">
                  <div className="flex flex-col gap-2">
                    <div className="font-semibold text-background">Details</div>
                    {generationStartedAt !== null && (
                      <div className="flex justify-between text-background/80">
                        <span>Time</span>
                        <span className="font-mono">
                          <ElapsedTimerText startAt={generationStartedAt} endAt={sessionFinishedAt} />
                        </span>
                      </div>
                    )}
                    {activeWrittenTelemetry && (
                      <div className="flex justify-between text-background/80">
                        <span>Generation</span>
                        <span>{formatDurationMs(activeWrittenTelemetry.durationMs)}</span>
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <Button
              variant={activeWrittenSavedSetId ? "default" : "outline"}
              size="sm"
              onClick={saveCurrentSet}
              className="h-7 gap-1 px-2 text-xs"
            >
              <Bookmark className="w-3 h-3" />
              <span className="hidden sm:inline">{activeWrittenSavedSetId ? "Update" : "Save"}</span>
            </Button>

            {isPassageMode ? (
              <Button variant="outline" size="sm" onClick={onResetPassage} className="h-7 px-2 text-xs gap-1">
                <RefreshCcw className="w-3 h-3" />
                <span className="hidden sm:inline">New Passage</span>
              </Button>
            ) : (
              <Button
                variant="destructive"
                size="sm"
                onClick={onCancelQuestion}
                disabled={questions.length === 0}
                className="h-7 px-2 text-xs gap-1"
              >
                <Trash2 className="w-3 h-3" />
                <span className="hidden sm:inline">Delete</span>
              </Button>
            )}

            <Button variant="ghost" size="sm" onClick={onStartOver} className="h-7 px-2 text-xs">
              Exit
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrev} disabled={prevDisabled} className="h-7 px-2 text-xs gap-1">
              <ArrowLeft className="w-3 h-3" />
              <span className="hidden sm:inline">Prev</span>
            </Button>
            <Button variant="outline" size="sm" onClick={onNext} disabled={!canAdvanceWritten} className="h-7 px-2 text-xs gap-1">
              <span className="hidden sm:inline">{isAtLastWrittenQuestion ? "Summary" : "Next"}</span>
              <ArrowRight className="w-3 h-3" />
            </Button>
          </div>
        </div>
        <ProgressBar
          current={writtenCurrentIndex + 1}
          total={writtenTotalQuestions}
          completed={writtenCompletedCount}
        />
      </div>

      {activeWrittenQuestion && (
        <div className={isPassageMode ? "grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-3" : "flex flex-col gap-3"}>
          {/* Passage panel (passage mode only) */}
          {isPassageMode && passage && (
            <div className="flex flex-col gap-2 lg:sticky lg:top-14 h-fit">
              <Card className="shadow-sm">
                <CardHeader className="py-2 px-3 border-b bg-muted/10">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-1.5 text-sm font-semibold">
                      <BookText className="w-4 h-4 text-primary" /> Passage
                    </CardTitle>
                    {canShowPassageRawOutput && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] gap-1 px-2"
                        onClick={() => setShowPassageRawOutput((prev) => !prev)}
                      >
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
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border bg-muted/30 p-2 text-[10px]">
                  {passageRawModelOutput}
                </pre>
              )}
            </div>
          )}

          {/* Question + response column */}
          <div className="flex flex-col gap-3">
            {/* Question block */}
            <Card className="shadow-sm border-border/60">
              <CardHeader className="py-2 px-3 border-b bg-muted/5">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-1.5 text-sm font-semibold">
                    <BookOpen className="w-4 h-4 text-primary" /> The Problem
                  </CardTitle>
                  {!isPassageMode && canShowWrittenRawOutput && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] gap-1 px-2"
                      onClick={() => setShowWrittenRawOutput((prev) => !prev)}
                    >
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
                  <pre className="mt-3 max-h-40 overflow-auto rounded border bg-muted/30 p-2 text-[10px] whitespace-pre-wrap">
                    {writtenRawModelOutput}
                  </pre>
                )}
              </CardContent>
            </Card>

            {/* Response / Marking block */}
            <Card className="shadow-sm border-border/60 flex-1 flex flex-col">
              <CardHeader className="py-2 px-3 border-b bg-muted/5">
                <CardTitle className="flex items-center gap-1.5 text-sm font-semibold">
                  <Target className="w-4 h-4 text-primary" />
                  {activeWrittenFeedback ? "Feedback" : "Your Response"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 flex-1 flex flex-col gap-3">
                {!activeWrittenFeedback ? (
                  <div className="flex-1 flex flex-col gap-3">
                    <div className="space-y-1.5 flex-1">
                      <Textarea
                        placeholder={
                          isPassageMode
                            ? "Concise response with line references..."
                            : "Type your answer..."
                        }
                        className="min-h-[120px] text-sm p-3 focus-visible:ring-1"
                        value={activeWrittenAnswer}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          if (isPassageMode && activeWrittenQuestion) {
                            setPassageAnswersByQuestionId((prev) => ({
                              ...prev,
                              [activeWrittenQuestion.id]: nextValue,
                            }));
                            return;
                          }
                          setAnswersByQuestionId((prev) => ({
                            ...prev,
                            [activeQuestion.id]: nextValue,
                          }));
                          if (nextValue.trim().length > 0) {
                            setWrittenResponseEnteredAtById((prev) =>
                              prev[activeQuestion.id] !== undefined
                                ? prev
                                : { ...prev, [activeQuestion.id]: Date.now() },
                            );
                          }
                        }}
                        disabled={isMarking}
                      />
                    </div>

                    {!isPassageMode && (
                      <div className="space-y-1.5">
                        {activeQuestionImage ? (
                          <div className="relative group rounded-md border border-primary/20 bg-muted/10 p-1.5 flex items-center justify-between">
                            <span className="text-xs truncate font-medium max-w-[200px]">
                              {activeQuestionImage.name} attached
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs text-destructive hover:bg-destructive/10 px-2"
                              onClick={() =>
                                setImagesByQuestionId((prev) => ({
                                  ...prev,
                                  [activeQuestion.id]: undefined,
                                }))
                              }
                            >
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

                    <Button
                      size="sm"
                      className="w-full font-semibold h-8"
                      onClick={onSubmitForMarking}
                      disabled={!canSubmitAnswer || isMarking}
                    >
                      {isMarking ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Evaluating...
                        </>
                      ) : (
                        "Submit"
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    {/* Score banner */}
                    <div className="flex justify-between items-center rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
                      <span className="text-sm font-bold flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-500" /> Scored
                      </span>
                      <span className="text-lg font-bold">
                        {activeWrittenFeedback.achievedMarks}{" "}
                        <span className="text-xs text-muted-foreground">
                          / {activeWrittenFeedback.maxMarks}
                        </span>
                      </span>
                    </div>

                    {/* Your answer */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Your Answer
                      </Label>
                      {activeWrittenAnswer.trim().length > 0 ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none bg-muted/10 p-2.5 rounded border border-border/50 text-sm">
                          <MarkdownMath content={activeWrittenAnswer} />
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground italic border rounded p-2 bg-muted/10">
                          No text submitted.
                        </div>
                      )}
                    </div>

                    {/* Argue & Override */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-2.5 rounded border bg-muted/5">
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-semibold text-muted-foreground uppercase">
                          Argue for Mark
                        </Label>
                        <Textarea
                          placeholder="Reasoning..."
                          className="min-h-[50px] text-xs py-1.5 px-2"
                          value={activeWrittenMarkAppeal}
                          onChange={(e) =>
                            setMarkAppealByQuestionId((prev) => ({
                              ...prev,
                              [activeWrittenQuestion.id]: e.target.value,
                            }))
                          }
                          disabled={isMarking}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full h-7 text-xs"
                          onClick={onArgueForMark}
                          disabled={isMarking || activeWrittenMarkAppeal.trim().length === 0}
                        >
                          {isMarking ? "Re-marking..." : "Argue"}
                        </Button>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-semibold text-muted-foreground uppercase">
                          Override
                        </Label>
                        <div className="flex gap-2 items-center">
                          <Input
                            type="number"
                            min={0}
                            max={activeWrittenFeedback.maxMarks}
                            className="h-7 text-xs w-16"
                            value={activeWrittenOverrideInput}
                            onChange={(e) =>
                              setMarkOverrideInputByQuestionId((prev) => ({
                                ...prev,
                                [activeWrittenQuestion.id]: e.target.value,
                              }))
                            }
                          />
                          <span className="text-xs text-muted-foreground">
                            / {activeWrittenFeedback.maxMarks}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="w-full h-7 text-xs mt-auto"
                          onClick={onOverrideMark}
                        >
                          Apply
                        </Button>
                      </div>
                    </div>

                    {/* AI Feedback */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        AI Feedback
                      </Label>
                      <div className="prose prose-sm dark:prose-invert max-w-none text-sm p-0">
                        <MarkdownMath content={activeWrittenFeedback.feedbackMarkdown} />
                      </div>
                    </div>

                    {/* Marking scheme */}
                    <div className="space-y-1.5 mt-2">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b pb-1 flex w-full">
                        Marking Scheme
                      </Label>
                      <div className="flex flex-col gap-2">
                        {activeWrittenFeedback.vcaaMarkingScheme.map((item: any, idx: number) => {
                          const isFullMarks = item.achievedMarks === item.maxMarks;
                          return (
                            <div
                              key={idx}
                              className={`p-2.5 rounded border text-sm flex justify-between gap-3 ${isFullMarks ? "bg-green-500/5 border-green-500/20" : "bg-card"}`}
                            >
                              <div className="flex-1 space-y-1">
                                <div className="prose prose-sm dark:prose-invert">
                                  <MarkdownMath content={item.criterion} />
                                </div>
                                {item.rationale.trim().length > 0 && (
                                  <div className="text-[11px] text-muted-foreground">
                                    <MarkdownMath content={item.rationale} />
                                  </div>
                                )}
                              </div>
                              <div
                                className={`text-xs font-bold px-1.5 py-0.5 rounded h-fit ${isFullMarks ? "text-green-600 bg-green-500/10" : "bg-muted text-muted-foreground"}`}
                              >
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
  );
}
