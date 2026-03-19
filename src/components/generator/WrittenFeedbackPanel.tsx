import { Loader2, Target, Sparkles, Check, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownMath } from "../MarkdownMath";
import { MarkAnswerResponse, StudentAnswerImage } from "../../types";

type WrittenFeedbackPanelProps = {
  questionId: string;
  answer: string;
  image: StudentAnswerImage | undefined;
  feedback: MarkAnswerResponse;
  appealText: string;
  overrideInput: string;
  isMarking: boolean;
  onAppealChange: (value: string) => void;
  onOverrideInputChange: (value: string) => void;
  onArgueForMark: () => void;
  onApplyOverride: () => void;
};

export function WrittenFeedbackPanel({
  answer,
  image,
  feedback,
  appealText,
  overrideInput,
  isMarking,
  onAppealChange,
  onOverrideInputChange,
  onArgueForMark,
  onApplyOverride,
}: WrittenFeedbackPanelProps) {
  return (
    <Card className="shadow-md border-border/50">
      <CardContent className="pt-6 space-y-2 animate-in slide-in-from-right-4 duration-500">
        <div className="space-y-4">
          <Label className="text-xl font-bold border-b pb-2 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" /> Submitted Answer
          </Label>
          {answer.trim().length > 0 ? (
            <div className="prose prose-slate dark:prose-invert max-w-none bg-muted/20 p-5 rounded-xl border border-border/50">
              <MarkdownMath content={answer} />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
              No typed answer was submitted.
            </div>
          )}

          {image && (
            <div className="space-y-3">
              <Label className="text-base font-semibold">Uploaded working</Label>
              <div className="rounded-xl border border-border/50 bg-muted/20 p-3 shadow-sm">
                <img
                  src={image.dataUrl}
                  alt="Submitted working"
                  className="w-full h-auto max-h-96 object-contain rounded-lg"
                />
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
            <div className="text-5xl font-extrabold text-foreground">
              {feedback.scoreOutOf10}
              <span className="ml-1 text-2xl text-muted-foreground font-medium">/ 10</span>
            </div>
          </div>
          <div className="text-right relative z-10 bg-background/80 backdrop-blur px-4 py-2 rounded-xl border">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Marks Awarded</div>
            <div className="text-2xl font-bold">
              {feedback.achievedMarks}{" "}
              <span className="text-base text-muted-foreground font-normal">/ {feedback.maxMarks}</span>
            </div>
          </div>
        </div>

        {/* Argue + Override */}
        <div className="p-3.5 rounded-2xl border border-border/60 bg-muted/20 space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Argue for Mark</Label>
            <Textarea
              placeholder="Explain why your response deserves additional marks..."
              className="min-h-[96px]"
              value={appealText}
              onChange={(e) => onAppealChange(e.target.value)}
              disabled={isMarking}
            />
            <Button
              type="button"
              variant="outline"
              onClick={onArgueForMark}
              disabled={isMarking || appealText.trim().length === 0}
            >
              {isMarking
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Re-marking...</>
                : <>Argue for Mark</>}
            </Button>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Override Mark</Label>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <Input
                type="number"
                min={0}
                max={feedback.maxMarks}
                step={1}
                className="sm:max-w-28"
                value={overrideInput}
                onChange={(e) => onOverrideInputChange(e.target.value)}
              />
              <span className="text-sm text-muted-foreground">out of {feedback.maxMarks}</span>
              <Button type="button" onClick={onApplyOverride}>Apply Override</Button>
            </div>
          </div>
        </div>

        {/* AI Feedback */}
        <div className="space-y-4">
          <Label className="text-xl font-bold border-b pb-2 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" /> AI Feedback
          </Label>
          <div className="prose prose-slate dark:prose-invert max-w-none bg-muted/20 p-5 rounded-xl border border-border/50">
            <MarkdownMath content={feedback.feedbackMarkdown} />
          </div>
        </div>

        {/* Marking Scheme */}
        <div className="space-y-4">
          <Label className="text-xl font-bold border-b pb-2 flex items-center gap-2">
            <Check className="w-5 h-5 text-green-500" /> Marking Scheme
          </Label>
          <div className="space-y-3 mt-2">
            {feedback.vcaaMarkingScheme.map((item, idx) => {
              const isFullMarks = item.achievedMarks === item.maxMarks;
              return (
                <div
                  key={idx}
                  className={`p-4 rounded-xl border text-sm flex justify-between gap-6 transition-colors ${
                    isFullMarks
                      ? "bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-900/50"
                      : "bg-card"
                  }`}
                >
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
      </CardContent>
    </Card>
  );
}
