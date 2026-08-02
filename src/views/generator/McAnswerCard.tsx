import { CheckCircle2, XCircle } from 'lucide-react';
import { memo } from 'react';

import { MarkdownMath } from '@/components/MarkdownMath';
import { UnifiedMcqOptionsGrid } from '@/components/question/UnifiedQuestionBlocks';
import { Button } from '@/components/ui/button';
import type { McOption } from '@/types';

type McAnswerCardProps = {
  questionId: string;
  options: McOption[];
  correctAnswer: string;
  explanationMarkdown: string;
  selectedAnswer: string;
  hideCorrectAnswer?: boolean;
  onSelectAnswer: (label: string) => void;
  onApplyOverride: () => void;
};

export const McAnswerCard = memo(function McAnswerCard({
  options,
  correctAnswer,
  explanationMarkdown,
  selectedAnswer,
  hideCorrectAnswer,
  onSelectAnswer,
  onApplyOverride,
}: McAnswerCardProps) {
  const answered = Boolean(selectedAnswer);
  const isCorrect = selectedAnswer === correctAnswer;
  const showResult = answered && !hideCorrectAnswer;

  return (
    <div className='flex h-full flex-col gap-4'>
      <UnifiedMcqOptionsGrid
        options={options}
        selectedAnswer={selectedAnswer}
        correctAnswer={correctAnswer}
        answered={answered}
        revealCorrectness={showResult}
        lockSelection={!hideCorrectAnswer}
        onSelect={onSelectAnswer}
        columns={1}
      />

      {showResult ? (
        <div className='space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300'>
          <div
            className={`flex items-start gap-3 rounded-3xl border px-4 py-4 sm:px-5 sm:py-5 ${
              isCorrect
                ? 'border-emerald-500/20 bg-emerald-500/8'
                : 'border-rose-500/20 bg-rose-500/8'
            }`}
          >
            <div
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                isCorrect ? 'bg-emerald-500/15' : 'bg-rose-500/15'
              }`}
            >
              {isCorrect ? (
                <CheckCircle2 className='h-5 w-5 text-emerald-500' />
              ) : (
                <XCircle className='h-5 w-5 text-rose-500' />
              )}
            </div>
            <div className='min-w-0 flex-1'>
              <p
                className={`mb-2 text-base font-semibold ${
                  isCorrect ? 'text-emerald-200' : 'text-rose-200'
                }`}
              >
                {isCorrect
                  ? 'Correct!'
                  : `Incorrect — the answer is ${correctAnswer}.`}
              </p>
              <div className='prose prose-sm max-w-none'>
                <MarkdownMath content={explanationMarkdown} />
              </div>
            </div>
          </div>
          {!isCorrect && (
            <div className='rounded-xl border border-border/40 bg-muted/10 p-4'>
              <Button size='sm' onClick={onApplyOverride}>
                Mark selected as correct
              </Button>
            </div>
          )}
        </div>
      ) : (
        <p className='text-sm text-muted-foreground'>
          Select an answer above to see the result.
        </p>
      )}
    </div>
  );
});
