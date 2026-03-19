import { useAppContext, useMultipleChoiceSession } from "@/AppContext";
import { MarkdownMath } from "@/components/MarkdownMath";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { XCircle, BookOpen, Target, Bookmark, Trash2, ArrowLeft, ArrowRight, Bug, CheckCircle2 } from "lucide-react";
import { ProgressBar } from "./SharedComponents";
import { McOption } from "@/types";

interface McSessionViewProps {
  mcMarkAppealByQuestionId: Record<string, string>;
  setMcMarkAppealByQuestionId: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  mcMarkOverrideInputByQuestionId: Record<string, string>;
  setMcMarkOverrideInputByQuestionId: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  mcAwardedMarksByQuestionId: Record<string, number>;
  // Computed values
  activeMcQuestion: ReturnType<typeof useMultipleChoiceSession>["mcQuestions"][number] | undefined;
  activeMcAnswer: string;
  activeMcMarkAppeal: string;
  activeMcAwardedMarks: number | undefined;
  activeMcOverrideInput: string;
  mcCompletedCount: number;
  isAtLastMcQuestion: boolean;
  canAdvanceMc: boolean;
  canShowMcRawOutput: boolean;
  showMcRawOutput: boolean;
  setShowMcRawOutput: React.Dispatch<React.SetStateAction<boolean>>;
  onMcAnswer: (label: string) => void;
  onArgueForMcMark: () => void;
  onOverrideMcMark: () => void;
  onCancelMcQuestion: () => void;
  onNextMcQuestion: () => void;
  onStartOver: () => void;
}

export function McSessionView({
  setMcMarkAppealByQuestionId,
  setMcMarkOverrideInputByQuestionId,
  activeMcQuestion,
  activeMcAnswer,
  activeMcMarkAppeal,
  activeMcAwardedMarks,
  activeMcOverrideInput,
  mcCompletedCount,
  isAtLastMcQuestion,
  canAdvanceMc,
  canShowMcRawOutput,
  showMcRawOutput,
  setShowMcRawOutput,
  onMcAnswer,
  onArgueForMcMark,
  onOverrideMcMark,
  onCancelMcQuestion,
  onNextMcQuestion,
  onStartOver,
}: McSessionViewProps) {
  const { mcQuestions, activeMcQuestionIndex, setActiveMcQuestionIndex, mcRawModelOutput, activeMcSavedSetId } =
    useMultipleChoiceSession();
  const { isMarking, saveCurrentSet } = useAppContext();

  return (
    <div className="flex flex-col h-full gap-4 pb-20 animate-in slide-in-from-bottom-4 duration-500">
      {/* Sticky Navbar */}
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b bg-background/80 py-2 backdrop-blur-xl shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-xl font-bold tracking-tight">
              Q{activeMcQuestionIndex + 1}
            </h2>
            <span className="text-xs font-medium text-muted-foreground">
              / {mcQuestions.length}
            </span>
            <Badge variant="secondary" className="border-primary/20 bg-primary/10 text-primary px-1.5 py-0 text-[10px]">
              {activeMcQuestion?.topic}
            </Badge>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant={activeMcSavedSetId ? "default" : "outline"}
              size="sm"
              onClick={saveCurrentSet}
              className="h-7 px-2 text-xs gap-1"
            >
              <Bookmark className="w-3" />
              <span className="hidden sm:inline">Save</span>
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={onCancelMcQuestion}
              disabled={mcQuestions.length === 0}
              className="h-7 px-2 text-xs gap-1"
            >
              <Trash2 className="w-3" />
              <span className="hidden sm:inline">Drop</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={onStartOver} className="h-7 px-2 text-xs">
              Exit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveMcQuestionIndex(Math.max(0, activeMcQuestionIndex - 1))}
              disabled={activeMcQuestionIndex === 0}
              className="h-7 px-2 text-xs"
            >
              <ArrowLeft className="w-3 sm:mr-1" />
              <span className="hidden sm:inline">Prev</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onNextMcQuestion}
              disabled={!canAdvanceMc}
              className="h-7 px-2 text-xs"
            >
              <span className="hidden sm:inline">{isAtLastMcQuestion ? "Summary" : "Next"}</span>
              <ArrowRight className="w-3 sm:ml-1" />
            </Button>
          </div>
        </div>
        <ProgressBar
          current={activeMcQuestionIndex + 1}
          total={mcQuestions.length}
          completed={mcCompletedCount}
        />
      </div>

      {activeMcQuestion && (
        <div className="flex flex-col gap-3">
          {/* Question card */}
          <Card className="shadow-sm border-border/60">
            <CardHeader className="py-2 px-3 border-b bg-muted/5 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-primary" /> The Problem
              </CardTitle>
              {canShowMcRawOutput && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] px-2 gap-1"
                  onClick={() => setShowMcRawOutput((prev) => !prev)}
                >
                  <Bug className="h-3 w-3" /> Raw
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-3 text-sm">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <MarkdownMath content={activeMcQuestion.promptMarkdown} />
              </div>
              {showMcRawOutput && canShowMcRawOutput && (
                <pre className="mt-2 max-h-40 overflow-auto rounded border bg-muted/30 p-2 text-[10px] whitespace-pre-wrap">
                  {mcRawModelOutput}
                </pre>
              )}
            </CardContent>
          </Card>

          {/* Options card */}
          <Card className="shadow-sm border-border/60 flex-col">
            <CardHeader className="py-2 px-3 border-b bg-muted/5">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Target className="w-4 h-4 text-primary" /> Options
              </CardTitle>
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
                      aria-pressed={isChosen}
                      aria-label={`Option ${opt.label}: ${opt.text}`}
                      className={`w-full text-left p-2 rounded-md flex gap-3 items-center text-sm transition-all ${dynamicClasses} ${!answered ? "cursor-pointer hover:border-primary/40" : "cursor-default"}`}
                      onClick={() => onMcAnswer(opt.label)}
                    >
                      <div
                        className={`w-6 h-6 rounded flex items-center justify-center shrink-0 font-bold text-xs ${answered && isCorrect ? "bg-green-500 text-white" : answered && isChosen ? "bg-red-500 text-white" : "bg-muted border text-foreground"}`}
                        aria-hidden="true"
                      >
                        {opt.label}
                      </div>
                      <div className="flex-1 prose-sm">
                        <MarkdownMath content={opt.text} />
                      </div>
                    </button>
                  );
                })}
              </div>

              {activeMcAnswer && (
                <div className="mt-4 space-y-3 animate-in fade-in duration-300">
                  <div
                    className={`p-3 rounded-md border text-sm flex gap-3 items-start ${activeMcAnswer === activeMcQuestion.correctAnswer ? "bg-green-500/10 border-green-500/20 text-green-900 dark:text-green-100" : "bg-red-500/10 border-red-500/20 text-red-900 dark:text-red-100"}`}
                  >
                    {activeMcAnswer === activeMcQuestion.correctAnswer ? (
                      <CheckCircle2 className="w-5 h-5 shrink-0 text-green-600" aria-hidden="true" />
                    ) : (
                      <XCircle className="w-5 h-5 shrink-0 text-red-600" aria-hidden="true" />
                    )}
                    <div className="flex-1 space-y-1">
                      <p className="font-bold">
                        {activeMcAnswer === activeMcQuestion.correctAnswer
                          ? "Correct"
                          : `Incorrect. Correct answer is ${activeMcQuestion.correctAnswer}`}
                      </p>
                      <div className="prose prose-sm dark:prose-invert opacity-90 text-[13px]">
                        <MarkdownMath content={activeMcQuestion.explanationMarkdown} />
                      </div>
                    </div>
                  </div>

                  {activeMcAnswer !== activeMcQuestion.correctAnswer && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-2.5 rounded border bg-muted/5">
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-semibold text-muted-foreground uppercase">
                          Argue for Mark
                        </Label>
                        <Textarea
                          placeholder="Reasoning..."
                          className="min-h-[50px] text-xs py-1.5 px-2"
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
                          size="sm"
                          variant="outline"
                          className="w-full h-7 text-xs"
                          onClick={onArgueForMcMark}
                          disabled={isMarking || activeMcMarkAppeal.trim().length === 0}
                        >
                          {isMarking ? "Re-marking..." : "Argue"}
                        </Button>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-semibold text-muted-foreground uppercase flex justify-between">
                          <span>Override</span>
                          <span className="text-foreground">
                            Awarded: {(activeMcAwardedMarks ?? 0).toFixed(0)}/1
                          </span>
                        </Label>
                        <div className="flex gap-2 items-center">
                          <Input
                            type="number"
                            min={0}
                            max={1}
                            className="h-7 text-xs w-16"
                            value={activeMcOverrideInput}
                            onChange={(e) =>
                              setMcMarkOverrideInputByQuestionId((prev) => ({
                                ...prev,
                                [activeMcQuestion.id]: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="w-full h-7 text-xs mt-auto"
                          onClick={onOverrideMcMark}
                        >
                          Apply
                        </Button>
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
  );
}
