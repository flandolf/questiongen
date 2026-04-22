import { CheckCircle2, PencilRuler, Trash2, XCircle } from 'lucide-react';
import { memo } from 'react';

import { MarkdownMath } from '@/components/MarkdownMath';
import { UnifiedMcqOptionsGrid } from '@/components/question/UnifiedQuestionBlocks';
import Sketchpad from '@/components/Sketchpad';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { McOption, StudentAnswerImage } from '@/types';

type McAnswerCardProps = {
  questionId: string;
  options: McOption[];
  correctAnswer: string;
  explanationMarkdown: string;
  selectedAnswer: string;
  image?: StudentAnswerImage;
  hideCorrectAnswer?: boolean;
  onSelectAnswer: (label: string) => void;
  onApplyOverride: () => void;
  isSketchpadOpen: boolean;
  onToggleSketchpad: () => void;
  onImageDrop: (files: File[]) => void;
  onImageRemove: () => void;
  renderSketchpadInline?: boolean;
  sketchSessionKey?: string;
};

type McSketchpadPanelProps = {
  questionId?: string;
  sketchSessionKey?: string;
  image?: StudentAnswerImage;
  onImageDrop: (files: File[]) => void;
  onImageRemove: () => void;
};

export const McSketchpadPanel = memo(function McSketchpadPanel({
  questionId,
  sketchSessionKey,
  image,
  onImageDrop,
  onImageRemove,
}: McSketchpadPanelProps) {
  async function handleSketchSave(dataUrl: string) {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `sketch-${Date.now()}.webp`, {
        type: blob.type || 'image/webp',
      });
      onImageDrop([file]);
    } catch {
      // noop
    }
  }

  return (
    <div className='space-y-2 animate-in fade-in slide-in-from-top-2 duration-300'>
      <div className='flex items-center gap-2 text-muted-foreground/70'>
        <PencilRuler className='w-4 h-4' />
        <span className='text-[11px] font-semibold uppercase tracking-[0.22em]'>
          Sketchpad
        </span>
      </div>
      <Sketchpad
        embedded
        sessionKey={sketchSessionKey ?? questionId}
        onSave={(dataUrl) => void handleSketchSave(dataUrl)}
      />
      {image && (
        <div className='relative group rounded-xl overflow-hidden border-2 border-primary/20 bg-muted/20 p-2'>
          <img
            src={image.downloadUrl || image.dataUrl}
            alt='Saved sketch'
            className='w-full h-auto max-h-64 object-contain rounded-lg'
          />
          <div className='mt-2 flex justify-end'>
            <Button
              variant='destructive'
              size='sm'
              className='gap-1.5'
              onClick={onImageRemove}
            >
              <Trash2 className='w-3.5 h-3.5' /> Remove
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});

export const McAnswerCard = memo(function McAnswerCard({
  questionId,
  options,
  correctAnswer,
  explanationMarkdown,
  selectedAnswer,
  image,
  hideCorrectAnswer,
  onSelectAnswer,
  onApplyOverride,
  isSketchpadOpen,
  onToggleSketchpad,
  onImageDrop,
  onImageRemove,
  renderSketchpadInline = true,
  sketchSessionKey,
}: McAnswerCardProps) {
  const answered = Boolean(selectedAnswer);
  const isCorrect = selectedAnswer === correctAnswer;
  const showResult = answered && !hideCorrectAnswer;

  return (
    <div className='space-y-4 flex flex-col h-full'>
      <div
        className={cn(
          'space-y-4 flex flex-col h-full',
          !isSketchpadOpen && renderSketchpadInline && 'hidden',
        )}
      >
        {renderSketchpadInline && (
          <McSketchpadPanel
            questionId={questionId}
            sketchSessionKey={sketchSessionKey}
            image={image}
            onImageDrop={onImageDrop}
            onImageRemove={onImageRemove}
          />
        )}
      </div>

      <div
        className={cn(
          'space-y-4 flex flex-col h-full',
          isSketchpadOpen && renderSketchpadInline && 'hidden',
        )}
      >
        <UnifiedMcqOptionsGrid
          options={options}
          selectedAnswer={selectedAnswer}
          correctAnswer={correctAnswer}
          answered={answered}
          revealCorrectness={answered && !hideCorrectAnswer}
          lockSelection={!hideCorrectAnswer}
          onSelect={onSelectAnswer}
          columns={1}
        />

        {showResult ? (
          <div className='space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300'>
            <div
              className={`flex gap-3 items-start rounded-3xl border px-4 py-4 sm:px-5 sm:py-5 ${
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
                  <CheckCircle2 className='w-5 h-5 text-emerald-500' />
                ) : (
                  <XCircle className='w-5 h-5 text-rose-500' />
                )}
              </div>
              <div className='flex-1 min-w-0'>
                <p
                  className={`font-semibold text-base mb-2 ${
                    isCorrect ? 'text-emerald-200' : 'text-rose-200'
                  }`}
                >
                  {isCorrect
                    ? 'Correct!'
                    : `Incorrect — the answer is ${correctAnswer}.`}
                </p>
                <div
                  className={`prose prose-sm max-w-none ${
                    isCorrect ? 'prose-emerald' : 'prose-rose'
                  }`}
                >
                  <MarkdownMath content={explanationMarkdown} />
                </div>
              </div>
            </div>

            {image && (
              <div className='relative group rounded-xl overflow-hidden border-2 border-primary/20 bg-muted/20 p-2'>
                <img
                  src={image.downloadUrl || image.dataUrl}
                  alt='Uploaded sketch'
                  className='w-full h-auto max-h-64 object-contain rounded-lg'
                />
                <div className='absolute inset-0 bg-background/50 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center rounded-xl'>
                  <Button
                    variant='destructive'
                    size='sm'
                    className='gap-1.5 shadow-lg'
                    onClick={onImageRemove}
                  >
                    <Trash2 className='w-3.5 h-3.5' /> Remove
                  </Button>
                </div>
              </div>
            )}

            {!isCorrect && (
              <div className='rounded-xl border border-border/40 bg-muted/10 p-4 space-y-3'>
                <Button size='sm' onClick={onApplyOverride}>
                  Mark selected as correct
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className='grid grid-cols-2 justify-between items-center'>
            <div className='text-sm text-muted-foreground animate-in fade-in duration-200'>
              Select an answer above to see the result.
            </div>
            <div className='flex w-full justify-end'>
              <Button
                type='button'
                variant={isSketchpadOpen ? 'default' : 'outline'}
                size='sm'
                onClick={onToggleSketchpad}
              >
                <PencilRuler size={10} />
                {isSketchpadOpen ? 'Hide Sketchpad' : 'Show Sketchpad'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
