import { Loader2, CheckCircle2, XCircle, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownMath } from "@/components/MarkdownMath";
import { McOption } from "@/types";
import { useRef } from "react";

type McAnswerPanelProps = {
  questionId: string;
  options: McOption[];
  correctAnswer: string;
  explanationMarkdown: string;
  selectedAnswer: string;
  awardedMarks: number | undefined;
  appealText: string;
  overrideInput: string;
  isMarking: boolean;
  onSelectAnswer: (label: string) => void;
  onAppealChange: (value: string) => void;
  onOverrideInputChange: (value: string) => void;
  onArgueForMark: () => void;
  onApplyOverride: () => void;
};

export function McAnswerPanel({
  options,
  correctAnswer,
  explanationMarkdown,
  selectedAnswer,
  awardedMarks,
  appealText,
  overrideInput,
  isMarking,
  onSelectAnswer,
  onAppealChange,
  onOverrideInputChange,
  onArgueForMark,
  onApplyOverride,
}: McAnswerPanelProps) {
  const answered = Boolean(selectedAnswer);
  const isCorrect = selectedAnswer === correctAnswer;
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function focusOption(idx: number) {
    optionRefs.current[idx]?.focus();
  }

  function handleOptionsKeyDown(e: React.KeyboardEvent) {
    const key = e.key;
    const activeIndex = optionRefs.current.findIndex((el) => el === document.activeElement);
    if (key === "ArrowDown" || key === "ArrowRight") {
      e.preventDefault();
      focusOption((activeIndex + 1) % options.length);
    } else if (key === "ArrowUp" || key === "ArrowLeft") {
      e.preventDefault();
      focusOption((activeIndex - 1 + options.length) % options.length);
    } else if (key === "Home") { e.preventDefault(); focusOption(0); }
    else if (key === "End") { e.preventDefault(); focusOption(options.length - 1); }
  }

  // Option label colors
  const optionColors: Record<string, string> = { A: "#3b82f6", B: "#8b5cf6", C: "#f59e0b", D: "#ec4899" };

  return (
    <Card className="flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Target className="w-4.5 h-4.5 text-primary" /> Select an Answer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Options */}
        <div
          className="grid sm:grid-cols-2 gap-2.5"
          role="listbox"
          aria-label="Answer options"
          onKeyDown={handleOptionsKeyDown}
        >
          {options.map((opt, idx) => {
            const isChosen = selectedAnswer === opt.label;
            const optCorrect = opt.label === correctAnswer;
            const color = optionColors[opt.label] ?? "#6b7280";

            let borderClass = "border-border/60 hover:border-primary/40 hover:bg-muted/30";
            let labelBg = "bg-muted text-foreground";

            if (answered) {
              if (optCorrect) {
                borderClass = "border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30 shadow-sm";
                labelBg = "bg-emerald-500 text-white";
              } else if (isChosen) {
                borderClass = "border-rose-400 bg-rose-50/60 dark:bg-rose-950/20 opacity-80";
                labelBg = "bg-rose-500 text-white";
              } else {
                borderClass = "border-border/40 bg-muted/20 opacity-45 grayscale";
              }
            }

            return (
              <button
                key={opt.label}
                ref={(el) => { optionRefs.current[idx] = el; }}
                role="option"
                aria-selected={isChosen}
                tabIndex={answered ? -1 : 0}
                disabled={answered}
                className={`w-full text-left p-3 rounded-xl border-2 flex gap-3 items-start transition-all duration-200 ${borderClass} ${
                  !answered ? "cursor-pointer hover:-translate-y-0.5 active:translate-y-0" : "cursor-default"
                }`}
                onClick={() => onSelectAnswer(opt.label)}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm transition-colors ${labelBg}`}
                  style={!answered ? { backgroundColor: `${color}20`, color } : undefined}
                >
                  {opt.label}
                </div>
                <div className="flex-1 text-sm leading-relaxed pt-0.5">
                  <MarkdownMath content={opt.text} />
                </div>
              </button>
            );
          })}
        </div>

        {/* Result + explanation */}
        {answered && (
          <div className="mt-2 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className={`p-4 rounded-xl border flex gap-3 items-start ${
              isCorrect
                ? "bg-emerald-50/80 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-900/40"
                : "bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40"
            }`}>
              <div className={`shrink-0 mt-0.5 w-7 h-7 rounded-full flex items-center justify-center ${
                isCorrect ? "bg-emerald-100 dark:bg-emerald-900/50" : "bg-rose-100 dark:bg-rose-900/50"
              }`}>
                {isCorrect
                  ? <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
                  : <XCircle className="w-4.5 h-4.5 text-rose-600 dark:text-rose-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-bold text-sm mb-2 ${isCorrect ? "text-emerald-900 dark:text-emerald-100" : "text-rose-900 dark:text-rose-100"}`}>
                  {isCorrect ? "Correct!" : `Incorrect — the answer is ${correctAnswer}.`}
                </p>
                <div className="prose prose-sm dark:prose-invert max-w-none opacity-90 text-sm">
                  <MarkdownMath content={explanationMarkdown} />
                </div>
              </div>
            </div>

            {/* Dispute section — only shown when wrong */}
            {!isCorrect && (
              <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">Dispute this mark</p>
                  <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                    Awarded: {(awardedMarks ?? 0).toFixed(0)}/1
                  </span>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Argue for mark</Label>
                  <Textarea
                    placeholder="Explain why this answer should still receive a mark..."
                    className="min-h-[72px] text-sm resize-none"
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
                      type="number" min={0} max={1} step={1}
                      className="max-w-[70px] text-sm h-8"
                      value={overrideInput}
                      onChange={(e) => onOverrideInputChange(e.target.value)}
                    />
                    <span className="text-sm text-muted-foreground">out of 1</span>
                    <Button type="button" size="sm" className="h-8" onClick={onApplyOverride}>Apply</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
