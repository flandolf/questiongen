import {
  CheckCircle2,
  ImageIcon,
  Loader2,
  PencilRuler,
  Trash2,
  Type,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { UnifiedWrittenResponseCard } from '@/components/question/UnifiedQuestionBlocks';
import Sketchpad from '@/components/Sketchpad';
import { Button } from '@/components/ui/button';
import { Dropzone } from '@/components/ui/dropzone';
import { Textarea } from '@/components/ui/textarea';
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
  onSubmit: () => void;
  onSketchpadActiveChange?: (active: boolean) => void;
};

function wordCount(s: string) {
  const t = s.trim();
  return t.length === 0 ? 0 : t.split(/\s+/).length;
}

export function WrittenAnswerCard({
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
  onSketchpadActiveChange,
}: WrittenAnswerCardProps) {
  const [activeTab, setActiveTab] = useState<
    'response' | 'upload' | 'sketchpad'
  >('response');
  const words = wordCount(answer);
  const hasContent = answer.trim().length > 0 || Boolean(image);

  useEffect(() => {
    setActiveTab('response');
  }, [questionId]);

  useEffect(() => {
    onSketchpadActiveChange?.(activeTab === 'sketchpad');
  }, [activeTab, onSketchpadActiveChange]);

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
    <UnifiedWrittenResponseCard
      value={answer}
      onChange={onAnswerChange}
      disabled={isMarking}
      hideResponseLabel={activeTab === 'sketchpad'}
      topSlot={
        <div className="rounded-xl border border-border/60 bg-muted/20 p-1">
          <div className="grid grid-cols-3 gap-1">
            <Button
              type="button"
              variant={activeTab === 'response' ? 'default' : 'ghost'}
              size="sm"
              className="gap-1.5"
              onClick={() => setActiveTab('response')}
            >
              <Type className="h-3.5 w-3.5" />
              Response
            </Button>
            <Button
              type="button"
              variant={activeTab === 'upload' ? 'default' : 'ghost'}
              size="sm"
              className="gap-1.5"
              onClick={() => setActiveTab('upload')}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Upload image
            </Button>
            <Button
              type="button"
              variant={activeTab === 'sketchpad' ? 'default' : 'ghost'}
              size="sm"
              className="gap-1.5"
              onClick={() => setActiveTab('sketchpad')}
            >
              <PencilRuler className="h-3.5 w-3.5" />
              Sketchpad
            </Button>
          </div>
        </div>
      }
      inputSlot={
        activeTab === 'response' ? (
          <Textarea
            value={answer}
            onChange={(e) => onAnswerChange(e.target.value)}
            disabled={isMarking}
            placeholder="Draft your solution here..."
            className="min-h-[160px] sm:min-h-[200px] text-base p-4 sm:p-5 rounded-lg border-border/20 focus-visible:ring-violet-500/30 focus-visible:border-violet-500/30"
          />
        ) : (
          <></>
        )
      }
      headerRight={
        words > 0 ? (
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            {words} {words === 1 ? 'word' : 'words'}
          </span>
        ) : undefined
      }
      footerNote={
        isExamMode
          ? 'Your answer will be submitted for marking when you complete the exam.'
          : 'Your answer is marked immediately using the configured marking model.'
      }
    >
      {activeTab === 'upload' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground/70">
            <ImageIcon className="w-4 h-4" />
            <span className="text-xs uppercase tracking-wide">
              Upload Image
            </span>
          </div>
          {image ? (
            <div className="relative group rounded-xl overflow-hidden border-2 border-primary/20 bg-muted/20 p-2">
              <img
                src={image.dataUrl}
                alt="Uploaded working"
                className="w-full h-auto max-h-96 object-contain rounded-lg"
              />
              <div className="absolute inset-0 bg-background/50 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center rounded-xl">
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5 shadow-lg"
                  onClick={onImageRemove}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </Button>
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-border/60 rounded-xl hover:border-primary/40 hover:bg-muted/20 transition-colors">
              <Dropzone onDrop={onImageDrop} />
            </div>
          )}
        </div>
      )}

      {activeTab === 'sketchpad' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground/70">
            <PencilRuler className="w-4 h-4" />
            <span className="text-xs uppercase tracking-wide">Sketchpad</span>
          </div>
          <Sketchpad
            embedded
            onSave={(dataUrl) => void handleSketchSave(dataUrl)}
          />

          {image && (
            <div className="relative group rounded-xl overflow-hidden border-2 border-primary/20 bg-muted/20 p-2">
              <img
                src={image.dataUrl}
                alt="Saved sketch"
                className="w-full h-auto max-h-64 object-contain rounded-lg"
              />
              <div className="mt-2 flex justify-end">
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                  onClick={onImageRemove}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove saved sketch
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Submit */}
      {!isExamMode && (
        <Button
          size="lg"
          className={`mt-4 w-full h-12 text-base font-bold gap-2 transition-all duration-200 rounded-full ${
            hasContent && !isMarking
              ? 'shadow-md hover:shadow-primary/20 hover:-translate-y-0.5'
              : ''
          }`}
          onClick={onSubmit}
          disabled={!canSubmit || isMarking}
        >
          {isMarking ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Evaluating…
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" /> Submit for Marking
            </>
          )}
        </Button>
      )}
    </UnifiedWrittenResponseCard>
  );
}
