import { memo, useState } from 'react';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
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
  const [disputeOpen, setDisputeOpen] = useState(false);

  return (
    <div className="space-y-4 rounded-md">
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
        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div
            className={`flex gap-3 items-start rounded-[24px] border px-4 py-4 sm:px-5 sm:py-5 ${
              isCorrect
                ? 'bg-emerald-500/8 border-emerald-500/20'
                : 'bg-rose-500/8 border-rose-500/20'
            }`}
          >
            <div
              className={`shrink-0 mt-0.5 w-8 h-8 rounded-full flex items-center justify-center ${
                isCorrect ? 'bg-emerald-500/15' : 'bg-rose-500/15'
              }`}
            >
              {isCorrect ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              ) : (
                <XCircle className="w-5 h-5 text-rose-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className={`font-semibold text-base mb-2 ${isCorrect ? 'text-emerald-200' : 'text-rose-200'}`}
              >
                {isCorrect
                  ? 'Correct!'
                  : `Incorrect — the answer is ${correctAnswer}.`}
              </p>
              <div
                className="prose dark:prose-invert max-w-none opacity-90"
                style={{ fontSize: 'var(--response-text-size)' }}
              >
                <MarkdownMath content={explanationMarkdown} />
              </div>
            </div>
          </div>

          {/* Dispute section — collapsible, only shown when wrong */}
          {!isCorrect && (
            <div className="overflow-hidden rounded-[20px] border border-border/10 bg-background/50">
              <button
                type="button"
                onClick={() => setDisputeOpen(!disputeOpen)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/15 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/70">
                    Dispute this mark
                  </p>
                  <span className="text-xs font-medium text-muted-foreground tabular-nums">
                    Awarded: {(awardedMarks ?? 0).toFixed(0)}/1
                  </span>
                </div>
                {disputeOpen ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
              {disputeOpen && (
                <div className="p-4 pt-0 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">
                      Argue for mark
                    </Label>
                    <Textarea
                      placeholder="Explain why this answer should still receive a mark..."
                      className="min-h-[72px] text-sm resize-none bg-background/70"
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
                    <Label className="text-sm font-medium">Override mark</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={1}
                        step={1}
                        className="max-w-[70px] text-sm h-8 bg-background/70"
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
      )}
    </div>
  );
});
