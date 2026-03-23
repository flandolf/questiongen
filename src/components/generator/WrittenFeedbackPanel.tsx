import { Loader2, Sparkles, Check, BookOpen } from "lucide-react";
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

function ScoreRing({ achieved, max }: { achieved: number; max: number }) {
  const pct = max > 0 ? achieved / max : 0;
  const color = pct >= 0.75 ? "#10b981" : pct >= 0.5 ? "#f59e0b" : "#f43f5e";
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = circ * pct;

  return (
    <div className="relative flex items-center justify-center w-20 h-20 shrink-0">
      <svg className="absolute inset-0 -rotate-90" width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-muted/30" />
        <circle
          cx="40" cy="40" r={r} fill="none"
          stroke={color} strokeWidth="5"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease-out" }}
        />
      </svg>
      <div className="flex flex-col items-center leading-none">
        <span className="text-xl font-black tabular-nums" style={{ color }}>{achieved}</span>
        <span className="text-[10px] text-muted-foreground font-medium">/{max}</span>
      </div>
    </div>
  );
}

import { useState } from "react";

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
  const pct = feedback.maxMarks > 0 ? feedback.achievedMarks / feedback.maxMarks : 0;
  const scoreColor = pct >= 0.75 ? "text-emerald-500" : pct >= 0.5 ? "text-amber-500" : "text-rose-500";
  const scoreBg = pct >= 0.75 ? "from-emerald-500/10" : pct >= 0.5 ? "from-amber-500/10" : "from-rose-500/10";
  const verdict = feedback.verdict?.toLowerCase();
  const isCorrect = verdict === "correct";

  const [showExemplar, setShowExemplar] = useState(false);

  return (
    <Card className="shadow-md border-border/50">
      <CardContent className="pt-5 space-y-5 animate-in slide-in-from-bottom-2 duration-400">

        {/* Score banner — cleaner, ring-based */}
        <div className={`flex items-center gap-5 bg-linear-to-r ${scoreBg} to-transparent border border-border/40 p-4 rounded-2xl`}>
          <ScoreRing achieved={feedback.achievedMarks} max={feedback.maxMarks} />
          <div className="flex-1 min-w-0">
            <div className={`text-2xl font-black tabular-nums ${scoreColor}`}>
              {feedback.scoreOutOf10} <span className="text-base font-semibold text-muted-foreground">/ 10</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {feedback.achievedMarks} of {feedback.maxMarks} marks awarded
            </div>
            <div className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${isCorrect ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                pct >= 0.5 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
                  "bg-rose-500/10 text-rose-600 dark:text-rose-400"
              }`}>
              {isCorrect ? "✓" : pct >= 0.5 ? "~" : "✗"} {feedback.verdict}
            </div>
          </div>
        </div>

        {/* Submitted answer + Exemplar dropdown */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-bold flex items-center gap-2 text-muted-foreground">
              <BookOpen className="w-4 h-4" /> Submitted Answer
            </Label>
            <div className="ml-auto">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowExemplar((v) => !v)}
                className="text-xs px-2 py-1"
              >
                {showExemplar ? "Hide" : "Show"} Exemplar Answer
              </Button>
            </div>
          </div>
          {answer.trim().length > 0 ? (
            <div className="prose prose-slate dark:prose-invert max-w-none bg-muted/20 p-4 rounded-xl border border-border/50 text-sm">
              <MarkdownMath content={answer} />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 px-4 py-3 text-sm text-muted-foreground italic">
              No typed answer was submitted.
            </div>
          )}
          {image && (
            <div className="rounded-xl border border-border/50 bg-muted/20 p-2.5 shadow-sm">
              <img
                src={image.dataUrl}
                alt="Submitted working"
                className="w-full h-auto max-h-80 object-contain rounded-lg"
              />
            </div>
          )}
          {showExemplar && (
            <div className="mt-2">
              <Label className="text-xs font-semibold flex items-center gap-2 text-muted-foreground mb-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Exemplar Answer
              </Label>
              <div className="prose prose-slate dark:prose-invert max-w-none bg-amber-50 dark:bg-amber-900/10 p-4 rounded-xl border border-amber-200 dark:border-amber-700 text-sm">
                <MarkdownMath content={feedback.workedSolutionMarkdown || "No exemplar answer available."} />
              </div>
            </div>
          )}
        </div>

        {/* AI Feedback */}
        <div className="space-y-2">
          <Label className="text-sm font-bold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" /> AI Feedback
          </Label>
          <div className="prose prose-slate dark:prose-invert max-w-none bg-muted/20 p-4 rounded-xl border border-border/50 text-sm">
            <MarkdownMath content={feedback.feedbackMarkdown} />
          </div>
        </div>

        {/* Marking Scheme */}
        <div className="space-y-2">
          <Label className="text-sm font-bold flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-500" /> Marking Scheme
          </Label>
          <div className="rounded-xl border border-border/50 overflow-hidden divide-y divide-border/40">
            {feedback.vcaaMarkingScheme.map((item, idx) => {
              const isFullMarks = item.achievedMarks === item.maxMarks;
              const itemPct = item.maxMarks > 0 ? item.achievedMarks / item.maxMarks : 0;
              return (
                <div
                  key={idx}
                  className={`flex gap-4 p-3.5 text-sm transition-colors ${isFullMarks ? "bg-emerald-50/50 dark:bg-emerald-950/15" : "bg-card hover:bg-muted/20"
                    }`}
                >
                  {/* Score pill */}
                  <div className="shrink-0 pt-0.5">
                    <span className={`inline-flex items-center justify-center w-12 text-center font-bold text-xs px-1.5 py-1 rounded-lg ${isFullMarks
                        ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                        : itemPct >= 0.5
                          ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                          : "bg-rose-100/70 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400"
                      }`}>
                      {item.achievedMarks}/{item.maxMarks}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="leading-relaxed">
                      <MarkdownMath content={item.criterion} />
                    </div>
                    {item.rationale.trim().length > 0 && (
                      <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                        <MarkdownMath content={item.rationale} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Appeal + Override — collapsible-feel section */}
        <div className="rounded-xl border border-border/60 bg-muted/10 p-4 space-y-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">Dispute this mark</p>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Argue for more marks</Label>
            <Textarea
              placeholder="Explain why your response deserves additional marks..."
              className="min-h-[80px] text-sm resize-none"
              value={appealText}
              onChange={(e) => onAppealChange(e.target.value)}
              disabled={isMarking}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onArgueForMark}
              disabled={isMarking || appealText.trim().length === 0}
              className="gap-2"
            >
              {isMarking
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Re-marking…</>
                : <>Request Re-mark</>}
            </Button>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Override mark</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={feedback.maxMarks}
                step={1}
                className="max-w-[80px] text-sm h-8"
                value={overrideInput}
                onChange={(e) => onOverrideInputChange(e.target.value)}
              />
              <span className="text-sm text-muted-foreground">out of {feedback.maxMarks}</span>
              <Button type="button" size="sm" onClick={onApplyOverride} className="h-8">Apply</Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
