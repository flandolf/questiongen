import { memo } from 'react';
import { Loader2, CheckCircle2, XCircle, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownMath } from '@/components/MarkdownMath';
import { McOption } from '@/types';
import { UnifiedMcqOptionsGrid } from '@/components/question/UnifiedQuestionBlocks';

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
  hideCorrectAnswer?: boolean;
  onSelectAnswer: (label: string) => void;
  onAppealChange: (value: string) => void;
  onOverrideInputChange: (value: string) => void;
  onArgueForMark: () => void;
  onApplyOverride: () => void;
};

export const McAnswerPanel = memo(function McAnswerPanel({
  options,
  correctAnswer,
  explanationMarkdown,
  selectedAnswer,
  awardedMarks,
  appealText,
  overrideInput,
  isMarking,
  hideCorrectAnswer,
  onSelectAnswer,
  onAppealChange,
  onOverrideInputChange,
  onArgueForMark,
  onApplyOverride,
}: McAnswerPanelProps) {
  const answered = Boolean(selectedAnswer);
  const isCorrect = selectedAnswer === correctAnswer;
  const showResult = answered && !hideCorrectAnswer;

  return (
    <div className="overflow-hidden flex-col">
      <div className="flex items-center gap-2">
        <Target className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Select an Answer
        </span>
      </div>
      <div className="my-2 space-y-3">
        {/* Options */}
        <UnifiedMcqOptionsGrid
          options={options}
          selectedAnswer={selectedAnswer}
          correctAnswer={correctAnswer}
          answered={answered}
          revealCorrectness={answered && !hideCorrectAnswer}
          lockSelection={!hideCorrectAnswer}
          onSelect={onSelectAnswer}
        />

        {/* Result + explanation */}
        {showResult && (
          <div className="mt-2 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div
              className={`p-4 rounded-2xl border flex gap-3 items-start ${
                isCorrect
                  ? 'bg-emerald-50/80 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-900/40'
                  : 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40'
              }`}
            >
              <div
                className={`shrink-0 mt-0.5 w-7 h-7 rounded-full flex items-center justify-center ${
                  isCorrect
                    ? 'bg-emerald-100 dark:bg-emerald-900/50'
                    : 'bg-rose-100 dark:bg-rose-900/50'
                }`}
              >
                {isCorrect ? (
                  <CheckCircle2 className="w-[18px] h-[18px] text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <XCircle className="w-[18px] h-[18px] text-rose-600 dark:text-rose-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={`font-bold text-sm mb-2 ${isCorrect ? 'text-emerald-900 dark:text-emerald-100' : 'text-rose-900 dark:text-rose-100'}`}
                >
                  {isCorrect
                    ? 'Correct!'
                    : `Incorrect — the answer is ${correctAnswer}.`}
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
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
                    Dispute this mark
                  </p>
                  <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                    Awarded: {(awardedMarks ?? 0).toFixed(0)}/1
                  </span>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">
                    Argue for mark
                  </Label>
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
                    {isMarking ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />{' '}
                        Re-marking…
                      </>
                    ) : (
                      <>Request Re-mark</>
                    )}
                  </Button>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Override mark</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={1}
                      step={1}
                      className="max-w-[70px] text-sm h-8"
                      value={overrideInput}
                      onChange={(e) => onOverrideInputChange(e.target.value)}
                    />
                    <span className="text-sm text-muted-foreground">
                      out of 1
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8"
                      onClick={onApplyOverride}
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
