import { useMemo } from "react";
import { useMultipleChoiceSession, useWrittenSession } from "../AppContext";
import { Button } from "../components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { MarkdownMath } from "../components/MarkdownMath";
import { confirmAction, formatDate } from "../lib/app-utils";
import { ScrollArea } from "../components/ui/scroll-area";
import { Separator } from "../components/ui/separator";
import { Badge } from "../components/ui/badge";
import { CheckCircle2, XCircle } from "lucide-react";
import { McHistoryEntry, QuestionHistoryEntry } from "../types";
import { EmptyState } from "../components/EmptyState";

type AnyEntry = ({ kind: "written" } & QuestionHistoryEntry) | ({ kind: "mc" } & McHistoryEntry);

export function HistoryView() {
  const { questionHistory, setQuestionHistory } = useWrittenSession();
  const { mcHistory, setMcHistory } = useMultipleChoiceSession();

  const combined = useMemo<AnyEntry[]>(() => {
    const written = questionHistory.map((e) => ({ kind: "written" as const, ...e }));
    const mc = mcHistory.map((e) => ({ kind: "mc" as const, ...e }));
    return [...written, ...mc].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [questionHistory, mcHistory]);

  function handleClear() {
    const totalCount = questionHistory.length + mcHistory.length;
    if (confirmAction(`Clear ${totalCount} history entries? Saved sets will be kept.`)) {
      setQuestionHistory([]);
      setMcHistory([]);
    }
  }

  if (combined.length === 0) {
    return (
      <EmptyState
        title="No History Yet"
        description="Complete a question to see it here."
      />
    );
  }

  return (
    <div className="p-4.5 min-w-full mx-auto h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">History</h1>
          <p className="text-muted-foreground mt-2">Past questions and your marks.</p>
        </div>
        <Button variant="destructive" onClick={handleClear}>Clear History</Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-6 pb-8">
          {combined.map((item) =>
            item.kind === "mc" ? (
              <Card key={item.id}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle>{item.question.topic}</CardTitle>
                      <Badge variant="secondary">Multiple Choice</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</p>
                  </div>
                  <div>
                    {(item.awardedMarks ?? (item.correct ? 1 : 0)) >= (item.maxMarks ?? 1)
                      ? <span className="inline-flex items-center gap-1.5 bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300 font-medium px-2.5 py-1 rounded-full text-sm"><CheckCircle2 className="w-3.5 h-3.5" /> {(item.awardedMarks ?? (item.correct ? 1 : 0)).toFixed(0)}/{item.maxMarks ?? 1}</span>
                      : <span className="inline-flex items-center gap-1.5 bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 font-medium px-2.5 py-1 rounded-full text-sm"><XCircle className="w-3.5 h-3.5" /> {(item.awardedMarks ?? (item.correct ? 1 : 0)).toFixed(0)}/{item.maxMarks ?? 1}</span>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-muted/50 p-4 rounded-md">
                    <MarkdownMath content={item.question.promptMarkdown} />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {item.question.options.map((opt) => {
                      const isChosen = item.selectedAnswer === opt.label;
                      const isCorrect = opt.label === item.question.correctAnswer;
                      let cls = "p-3 rounded-lg border flex gap-2 items-start text-sm";
                      if (isCorrect) cls += " border-green-500 bg-green-50 dark:bg-green-950/40";
                      else if (isChosen) cls += " border-red-500 bg-red-50 dark:bg-red-950/40";
                      return (
                        <div key={opt.label} className={cls}>
                          <span className="font-bold shrink-0">{opt.label}.</span>
                          <MarkdownMath content={opt.text} />
                        </div>
                      );
                    })}
                  </div>
                  <Separator />
                  <div>
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-2">Explanation</h3>
                    <MarkdownMath content={item.question.explanationMarkdown} />
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card key={item.id}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="space-y-1">
                    <CardTitle>{item.question.topic}</CardTitle>
                    <p className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block bg-primary/10 text-primary font-medium px-2.5 py-1 rounded-full text-sm">
                      {item.markResponse.scoreOutOf10}/10
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-muted/50 p-4 rounded-md">
                    <MarkdownMath content={item.question.promptMarkdown} />
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Your Answer</h3>
                      {item.uploadedAnswerImage ? (
                        <img src={item.uploadedAnswerImage.dataUrl} alt="Uploaded Answer" className="rounded-md border max-w-full h-auto" />
                      ) : (
                        <div className="whitespace-pre-wrap">{item.uploadedAnswer || <span className="italic opacity-50">No text answer provided</span>}</div>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Feedback</h3>
                      <MarkdownMath content={item.markResponse.feedbackMarkdown} />
                    </div>
                  </div>

                  <Separator />
                  
                  <div>
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-2">Breakdown</h3>
                    <div className="space-y-2">
                      {item.markResponse.vcaaMarkingScheme.map((criterion, idx) => (
                        <div key={idx} className="flex flex-col sm:flex-row gap-2 justify-between border-b pb-2 last:border-0 last:pb-0">
                          <div className="flex-1 space-y-2">
                            <MarkdownMath content={criterion.criterion} />
                            {criterion.rationale.trim().length > 0 && (
                              <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Rationale</p>
                                <MarkdownMath content={criterion.rationale} />
                              </div>
                            )}
                          </div>
                          <span className="font-medium whitespace-nowrap">
                            {criterion.achievedMarks} / {criterion.maxMarks}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
