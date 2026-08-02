import { listen } from '@tauri-apps/api/event';
import {
  CheckCircle2,
  Coins,
  ImageIcon,
  Loader2,
  Trash2,
  Type,
} from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';

import { useAppSettings } from '@/AppContext';
import { UnifiedWrittenResponseCard } from '@/components/question/UnifiedQuestionBlocks';
import { Button } from '@/components/ui/button';
import { Dropzone } from '@/components/ui/dropzone';
import { Textarea } from '@/components/ui/textarea';
import { useAppStore } from '@/store';
import type { StudentAnswerImage } from '@/types';

type WrittenAnswerCardProps = {
  questionId: string;
  answer: string;
  image: StudentAnswerImage | undefined;
  isMarking: boolean;
  canSubmit: boolean;
  isExamMode?: boolean;
  onAnswerChange: (value: string) => void;
  onImageDrop: (files: File[]) => void;
  onImageRemove: () => void;
  onSubmit: (payload?: { image?: StudentAnswerImage }) => void | Promise<void>;
};

function wordCount(s: string) {
  const t = s.trim();
  return t.length === 0 ? 0 : t.split(/\s+/).length;
}

function getFooterNote(isExamMode: boolean | undefined): string {
  if (isExamMode) {
    return 'Your answer will be submitted for marking when you complete the exam.';
  }

  return 'Your answer is marked immediately using the configured marking model.';
}

// eslint-disable-next-line complexity
export const WrittenAnswerCard = memo(function WrittenAnswerCard({
  questionId,
  answer,
  image,
  isMarking,
  canSubmit,
  isExamMode,
  onAnswerChange,
  onImageDrop,
  onImageRemove,
  onSubmit,
}: WrittenAnswerCardProps) {
  const { showRawLlmOutput } = useAppSettings();
  const { activeTabByQuestionId, setActiveTabByQuestionId } = useAppStore();
  const activeTab = activeTabByQuestionId[questionId] || 'response';
  const setActiveTab = (tab: 'response' | 'upload') =>
    setActiveTabByQuestionId(questionId, tab);
  const [localIsMarking, setLocalIsMarking] = useState(false);
  const [markStreamText, setMarkStreamText] = useState('');
  const [hasReceivedTokens, setHasReceivedTokens] = useState(false);
  const streamBufferRef = useRef('');
  const streamFlushRafRef = useRef<number | null>(null);
  const words = wordCount(answer);
  const hasContent = answer.trim().length > 0 || Boolean(image);
  const footerNote = getFooterNote(isExamMode);

  useEffect(() => {
    const flush = () => {
      streamFlushRafRef.current = null;
      setHasReceivedTokens(true);
      setMarkStreamText((prev) => prev + streamBufferRef.current);
      streamBufferRef.current = '';
    };

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void listen<{ text: string; topic?: string }>(
      'generation-token',
      (event) => {
        if (event.payload.topic === questionId) {
          streamBufferRef.current += event.payload.text;
          if (streamFlushRafRef.current === null) {
            void Promise.resolve().then(() => {
              if (streamBufferRef.current) {
                streamFlushRafRef.current = requestAnimationFrame(flush);
              }
            });
          }
        }
      },
    )
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (streamFlushRafRef.current !== null) {
        cancelAnimationFrame(streamFlushRafRef.current);
      }
      streamBufferRef.current = '';
      setHasReceivedTokens(false);
      unlisten?.();
    };
  }, [questionId]);

  useEffect(() => {
    setLocalIsMarking(isMarking);
  }, [isMarking]);

  useEffect(() => {
    if (!localIsMarking && markStreamText) {
      const t = window.setTimeout(() => {
        setMarkStreamText('');
        setHasReceivedTokens(false);
      }, 2000);
      return () => window.clearTimeout(t);
    }
  }, [localIsMarking, markStreamText]);

  async function handleSubmitClick() {
    setLocalIsMarking(true);
    await onSubmit();
  }

  return (
    <UnifiedWrittenResponseCard
      value={answer}
      onChange={onAnswerChange}
      disabled={isMarking}
      topSlot={
        <div className='grid grid-cols-2 gap-1 pb-2 border-b border-border/15'>
          <Button
            type='button'
            variant={activeTab === 'response' ? 'default' : 'ghost'}
            size='sm'
            className='gap-1.5'
            onClick={() => setActiveTab('response')}
          >
            <Type className='h-3.5 w-3.5' />
            Response
          </Button>
          <Button
            type='button'
            variant={activeTab === 'upload' ? 'default' : 'ghost'}
            size='sm'
            className='gap-1.5'
            onClick={() => setActiveTab('upload')}
          >
            <ImageIcon className='h-3.5 w-3.5' />
            Upload image
          </Button>
        </div>
      }
      inputSlot={
        activeTab === 'response' ? (
          <Textarea
            value={answer}
            onChange={(e) => onAnswerChange(e.target.value)}
            disabled={isMarking}
            placeholder='Draft your solution here...'
            className='min-h-40 sm:min-h-50 text-base p-4 sm:p-5 rounded-lg border-border/20 focus-visible:ring-violet-500/30 focus-visible:border-violet-500/30'
            style={{ fontSize: 'var(--question-text-size)' }}
          />
        ) : (
          <></>
        )
      }
      headerRight={
        words > 0 ? (
          <span className='text-xs font-medium text-muted-foreground tabular-nums'>
            {words} {words === 1 ? 'word' : 'words'}
          </span>
        ) : undefined
      }
      footerNote={footerNote}
    >
      {activeTab === 'upload' && (
        <div className='space-y-2'>
          <div className='flex items-center gap-2 text-muted-foreground/70'>
            <ImageIcon className='w-4 h-4' />
            <span className='text-xs uppercase tracking-wide'>
              Upload Image
            </span>
          </div>
          {image ? (
            <div className='relative group rounded-xl overflow-hidden border-2 border-primary/20 bg-muted/20 p-2'>
              <img
                src={image.dataUrl}
                alt='Uploaded working'
                className='w-full h-auto max-h-96 object-contain rounded-lg'
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
          ) : (
            <div className='border-2 border-dashed border-border/60 rounded-xl hover:border-primary/40 hover:bg-muted/20 transition-colors'>
              <Dropzone onDrop={onImageDrop} />
            </div>
          )}
        </div>
      )}

      <div className='border-t pt-2'>
        <Button
          size='lg'
          className={`mt-4 w-full h-12 text-base font-bold gap-2 transition-all duration-200 rounded-full ${
            hasContent && !localIsMarking
              ? 'shadow-md hover:shadow-primary/20 hover:-translate-y-0.5'
              : ''
          }`}
          onClick={() => void handleSubmitClick()}
          disabled={!canSubmit || localIsMarking}
        >
          {localIsMarking ? (
            <>
              <Loader2 className='w-4 h-4 animate-spin' /> Evaluating…
            </>
          ) : (
            <>
              <CheckCircle2 className='w-4 h-4' /> Submit for Marking
            </>
          )}
        </Button>
        {localIsMarking &&
          (markStreamText.length > 0 ||
            !hasReceivedTokens ||
            showRawLlmOutput) && (
            <div className='mt-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-xs'>
              <div className='flex items-center gap-1 text-[10px] font-mono tabular-nums text-blue-600/60 dark:text-blue-400/60 mb-1'>
                <Coins className='w-2.5 h-2.5' />
                {markStreamText.length > 0 && (
                  <span className='text-blue-600/40 dark:text-blue-400/40'>
                    ~
                  </span>
                )}
                {Math.round(markStreamText.length / 4).toLocaleString()} tok
                <span className='text-blue-600/40 dark:text-blue-400/40'>
                  streamed
                </span>
              </div>
              {showRawLlmOutput &&
                (markStreamText ? (
                  <div className='font-mono text-blue-600 dark:text-blue-400 max-h-48 overflow-auto whitespace-pre-wrap break-all'>
                    {markStreamText}
                  </div>
                ) : (
                  <div className='flex items-center gap-2 text-blue-600/60 dark:text-blue-400/60 font-mono'>
                    <div className='w-1.5 h-1.5 rounded-full bg-blue-500/50 animate-pulse' />
                    Waiting for response…
                  </div>
                ))}
            </div>
          )}
      </div>
    </UnifiedWrittenResponseCard>
  );
});
