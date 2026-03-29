import { memo, useState } from "react";
import {
  Loader2,
  Sparkles,
  Check,
  BookOpen,
  MessageSquareDiff,
  ShieldAlert
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownMath } from "../MarkdownMath";
import { MarkAnswerResponse, StudentAnswerImage } from "../../types";
import { scoreColorClass, scoreRingColor } from "@/lib/score-utils";

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
  onCriterionChange?: (idx: number, achievedMarks: number, rationale: string) => void;
};

// Polished SVG Ring with smoother animations and monospaced typography
function ScoreRing({ achieved, max }: { achieved: number; max: number }) {
  const pct = max > 0 ? achieved / max : 0;
  const color = scoreRingColor(pct * 100);
  const r = 32;
  const circ = 2 * Math.PI * r;
  const dash = circ * pct;

  return (
    <div className="relative flex items-center justify-center w-24 h-24 shrink-0">
      <svg className="absolute inset-0 -rotate-90" width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-muted/20" />
        <circle
          cx="48" cy="48" r={r} fill="none"
          stroke={color} strokeWidth="4"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1s cubic-bezier(0.4, 0, 0.2, 1)" }}
        />
      </svg>
      <div className="flex flex-col items-center leading-none mt-1">
        <span className="text-2xl font-black font-mono tracking-tighter" style={{ color }}>{achieved}</span>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mt-1">/{max}</span>
      </div>
    </div>
  );
}

export const WrittenFeedbackPanel = memo(function WrittenFeedbackPanel({
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
  onCriterionChange,
}: WrittenFeedbackPanelProps) {
  const pct = feedback.maxMarks > 0 ? feedback.achievedMarks / feedback.maxMarks : 0;
  const scoreColor = scoreColorClass(pct);
  const verdict = feedback.verdict?.toLowerCase();
  const isCorrect = verdict === "correct";

  const [showExemplar, setShowExemplar] = useState(false);

  return (
    <Card className="shadow-xs border-border/40 overflow-hidden bg-background">
      {/* HEADER BANNER
        Moves away from generic gradient fills to a structured, technical report look 
      */}
      <div className={`flex items-center gap-6 px-6 py-2 border-b border-border/40`}>
        <ScoreRing achieved={feedback.achievedMarks} max={feedback.maxMarks} />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
            Evaluation Result
          </div>
          <div className="flex items-baseline gap-2">
            <div className={`text-4xl font-black tabular-nums tracking-tight ${scoreColor}`}>
              {feedback.scoreOutOf10}
            </div>
            <div className="text-lg font-medium text-muted-foreground">/ 10</div>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <div className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-md uppercase tracking-wider ${isCorrect ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
              pct >= 0.5 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
                "bg-rose-500/15 text-rose-600 dark:text-rose-400"
              }`}>
              {isCorrect ? <Check className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
              {feedback.verdict}
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              {feedback.achievedMarks} out of {feedback.maxMarks} raw marks awarded
            </span>
          </div>
        </div>
      </div>

      <CardContent className="p-0 animate-in fade-in duration-500">
        <div className="px-6 py-2 space-y-8">

          {/* SUBMISSION & EXEMPLAR */}
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-border/30 pb-2">
              <Label className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 text-foreground">
                <BookOpen className="w-4 h-4 text-muted-foreground" /> Student Submission
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowExemplar(!showExemplar)}
                className={`text-xs h-7 px-3 rounded-full transition-all ${showExemplar ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                {showExemplar ? "Hide Exemplar" : "Compare Exemplar"}
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {answer.trim().length > 0 ? (
                <div className="prose prose-sm dark:prose-invert max-w-none bg-muted/30 p-5 rounded-lg text-foreground/90 leading-relaxed font-medium">
                  <MarkdownMath content={answer} />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border/50 bg-muted/10 p-5 text-sm text-muted-foreground italic flex justify-center items-center">
                  No typed answer was submitted.
                </div>
              )}

              {image && (
                <div className="rounded-lg border border-border/30 bg-muted/10 p-2 shadow-sm">
                  <img
                    src={image.dataUrl}
                    alt="Submitted working"
                    className="w-full h-auto max-h-96 object-contain rounded-md mix-blend-multiply dark:mix-blend-normal"
                  />
                </div>
              )}
            </div>

            {showExemplar && (
              <div className="animate-in slide-in-from-top-2 fade-in duration-300">
                <div className="prose prose-sm dark:prose-invert max-w-none bg-amber-500/5 p-5 rounded-lg border-l-2 border-amber-500/40 text-foreground/90">
                  <Label className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 text-amber-600 dark:text-amber-500 mb-3">
                    <Sparkles className="w-3.5 h-3.5" /> Ideal Solution
                  </Label>
                  <MarkdownMath content={feedback.workedSolutionMarkdown || "No exemplar available."} />
                </div>
              </div>
            )}
          </section>

          {/* AI FEEDBACK */}
          <section className="space-y-4">
            <div className="border-b border-border/30 pb-2">
              <Label className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 text-foreground">
                <MessageSquareDiff className="w-4 h-4 text-muted-foreground" /> General Feedback
              </Label>
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground leading-relaxed px-1">
              <MarkdownMath content={feedback.feedbackMarkdown} />
            </div>
          </section>

          {/* MARKING SCHEME (The Core Redesign) */}
          <section className="space-y-4 pt-4 pb-4">
            <div className="border-b border-border/30 pb-2">
              <Label className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 text-foreground">
                <Check className="w-4 h-4 text-muted-foreground" /> Interactive Rubric
              </Label>
            </div>

            <div className="flex flex-col gap-3">
              {feedback.vcaaMarkingScheme.map((item, idx) => {
                const isFullMarks = item.achievedMarks === item.maxMarks;
                const criterionPct = item.maxMarks > 0 ? item.achievedMarks / item.maxMarks : 0;
                const isPartial = item.achievedMarks > 0 && !isFullMarks;

                return (
                  <div
                    key={idx}
                    className={`group relative flex flex-col xl:flex-row gap-4 xl:gap-6 p-4 xl:p-5 rounded-xl border transition-all duration-200 ${isFullMarks
                      ? "bg-emerald-500/5 border-emerald-500/30"
                      : isPartial
                      ? "bg-amber-500/5 border-amber-500/30"
                      : "bg-muted/10 border-border/40 hover:border-border/80"
                      }`}
                  >
                    {/* Mark Stepper - Now more prominent with color feedback */}
                    <div className="flex flex-row items-center gap-3 xl:w-28 shrink-0">
                      <div className={`flex items-center justify-center w-12 h-12 rounded-lg font-mono font-bold text-lg ${isFullMarks ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : isPartial ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground"}`}>
                        {item.achievedMarks}
                      </div>
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => onCriterionChange?.(idx, Math.min(item.maxMarks, item.achievedMarks + 1), item.rationale || "")}
                          disabled={item.achievedMarks >= item.maxMarks}
                          className="w-6 h-4 flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-20 disabled:hover:bg-transparent rounded transition-colors text-xs"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => onCriterionChange?.(idx, Math.max(0, item.achievedMarks - 1), item.rationale || "")}
                          disabled={item.achievedMarks <= 0}
                          className="w-6 h-4 flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-20 disabled:hover:bg-transparent rounded transition-colors text-xs"
                        >
                          ▼
                        </button>
                      </div>
                      <span className={`text-xs font-medium ${isFullMarks ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                        /{item.maxMarks}
                      </span>
                    </div>

                    {/* Criterion & Rationale */}
                    <div className="flex-1 min-w-0 flex flex-col gap-3">
                      <div className="flex items-start gap-3">
                        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-0.5">
                          {idx + 1}
                        </div>
                        <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 leading-relaxed font-medium">
                          <MarkdownMath content={item.criterion} />
                        </div>
                      </div>

                      {item.rationale && (
                        <div className={`ml-8 pl-3 border-l-2 ${isFullMarks ? "border-emerald-500/40" : isPartial ? "border-amber-500/40" : "border-border/40"}`}>
                          <p className="text-xs text-muted-foreground italic">
                            <MarkdownMath content={item.rationale} />
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Visual indicator bar */}
                    <div className="hidden xl:block w-1.5 self-stretch rounded-full bg-muted/30 overflow-hidden">
                      <div 
                        className={`w-full rounded-full transition-all duration-500 ${isFullMarks ? "bg-emerald-500" : isPartial ? "bg-amber-500" : "bg-muted-foreground/30"}`}
                        style={{ height: `${criterionPct * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

        </div>

        {/* ADJUSTMENTS & OVERRIDES 
          Separated from the main flow, treated as a distinct utility footer
        */}
        <div className="bg-muted/20 border-t border-border/40 p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

            <div className="space-y-3">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Request Re-evaluation
              </Label>
              <div className="flex flex-col gap-2">
                <Textarea
                  placeholder="Justify why this submission deserves a different mark..."
                  className="min-h-[80px] text-sm resize-none bg-background shadow-sm border-border/60 focus:border-primary"
                  value={appealText}
                  onChange={(e) => onAppealChange(e.target.value)}
                  disabled={isMarking}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onArgueForMark}
                  disabled={isMarking || appealText.trim().length === 0}
                  className="w-full sm:w-auto self-start gap-2 shadow-sm"
                >
                  {isMarking ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</>
                  ) : (
                    "Submit Appeal"
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-3 lg:pl-8 lg:border-l border-border/40">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Manual Override
              </Label>
              <p className="text-xs text-muted-foreground mb-4 max-w-sm">
                Bypass the automated marking scheme and forcefully assign a total score.
              </p>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    max={feedback.maxMarks}
                    step={1}
                    className="w-24 h-10 text-lg font-mono font-bold pl-3 pr-8 shadow-sm bg-background border-border/60 focus:border-primary focus:ring-1"
                    value={overrideInput}
                    onChange={(e) => onOverrideInputChange(e.target.value)}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-xs">
                    /{feedback.maxMarks}
                  </span>
                </div>
                <Button
                  type="button"
                  onClick={onApplyOverride}
                  className="h-10 px-6 font-semibold shadow-sm"
                  disabled={!overrideInput}
                >
                  Apply Override
                </Button>
              </div>
            </div>

          </div>
        </div>
      </CardContent>
    </Card>
  );
});