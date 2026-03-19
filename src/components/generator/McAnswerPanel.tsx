import { Loader2, CheckCircle2, XCircle, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownMath } from "@/components/MarkdownMath";
import { McOption } from "@/types";

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

  return (
    <Card className="flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Target className="w-5 h-5 text-primary" /> Select an Answer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Options */}
        <div className="flex flex-col gap-3">
          {options.map((opt) => {
            const isChosen   = selectedAnswer === opt.label;
            const optCorrect = opt.label === correctAnswer;

            let dynamicClasses = "border-2 bg-card hover:border-primary/50 hover:bg-muted/50";
            if (answered) {
              if (optCorrect)     dynamicClasses = "border-green-500 bg-green-50 dark:bg-green-950/40 shadow-sm ring-1 ring-green-500/20";
              else if (isChosen)  dynamicClasses = "border-red-500 bg-red-50 dark:bg-red-950/40 opacity-90";
              else                dynamicClasses = "border-border bg-card opacity-50 grayscale transition-all";
            }

            return (
              <button
                key={opt.label}
                disabled={answered}
                className={`w-full text-left p-3.5 rounded-2xl flex gap-4 items-center transition-all duration-200 ${dynamicClasses} ${!answered ? "cursor-pointer transform hover:-translate-y-0.5" : "cursor-default"}`}
                onClick={() => onSelectAnswer(opt.label)}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-sm ${answered && optCorrect ? "bg-green-500 text-white" : answered && isChosen ? "bg-red-500 text-white" : "bg-muted text-foreground"}`}>
                  {opt.label}
                </div>
                <div className="flex-1 text-base">
                  <MarkdownMath content={opt.text} />
                </div>
              </button>
            );
          })}
        </div>

        {/* Result + explanation */}
        {answered && (
          <div className="mt-6 space-y-4 animate-in zoom-in-95 duration-300">
            <div className={`p-6 rounded-2xl border-2 flex gap-4 items-start ${
              isCorrect
                ? "bg-green-50/80 dark:bg-green-950/30 border-green-200 dark:border-green-900/50 text-green-900 dark:text-green-100"
                : "bg-red-50/80 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-900 dark:text-red-100"
            }`}>
              {isCorrect
                ? <CheckCircle2 className="w-8 h-8 shrink-0 text-green-600 dark:text-green-400" />
                : <XCircle className="w-8 h-8 shrink-0 text-red-600 dark:text-red-400" />}
              <div className="flex-1">
                <p className="font-extrabold text-lg mb-2">
                  {isCorrect ? "Excellent! That is correct." : `Incorrect. The correct answer is ${correctAnswer}.`}
                </p>
                <div className="prose prose-sm dark:prose-invert max-w-none opacity-90">
                  <MarkdownMath content={explanationMarkdown} />
                </div>
              </div>
            </div>

            {/* Argue / Override — only shown when wrong */}
            {!isCorrect && (
              <div className="p-3.5 rounded-2xl border border-border/60 bg-muted/20 space-y-4">
                {/* Awarded mark display */}
                <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                  <div className="text-sm font-semibold">Awarded mark</div>
                  <div className="text-lg font-bold">
                    {(awardedMarks ?? 0).toFixed(0)} / 1
                  </div>
                </div>

                {/* Argue */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Argue for Mark</Label>
                  <Textarea
                    placeholder="Explain why this answer should still receive a mark..."
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

                {/* Override */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Override Mark</Label>
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <Input
                      type="number"
                      min={0}
                      max={1}
                      step={1}
                      className="sm:max-w-28"
                      value={overrideInput}
                      onChange={(e) => onOverrideInputChange(e.target.value)}
                    />
                    <span className="text-sm text-muted-foreground">out of 1</span>
                    <Button type="button" onClick={onApplyOverride}>Apply Override</Button>
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
