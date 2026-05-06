import { invoke } from '@tauri-apps/api/core';
import { Loader2, Sparkles, Wand2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAppStore } from '@/store';
import type { CustomSubtopic, GeneratedSubtopic, Topic } from '@/types';
import { PRESET_MODELS } from '@/views/settings/constants';

interface AiGenerateSubtopicsModalProps {
  open: boolean;
  topic: Topic;
  existingSubtopicNames: string[];
  onAdd: (subtopics: CustomSubtopic[]) => void;
  onClose: () => void;
}

export function AiGenerateSubtopicsModal({
  open,
  topic,
  existingSubtopicNames,
  onAdd,
  onClose,
}: AiGenerateSubtopicsModalProps) {
  const apiKey = useAppStore((s) => s.apiKey);
  const [model, setModel] = useState(
    PRESET_MODELS[0]?.id || 'anthropic/claude-3.5-sonnet',
  );
  const [focusArea, setFocusArea] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedSubtopic[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleGenerate = () => {
    setIsGenerating(true);
    setError(null);
    void (async () => {
      try {
        const response = await invoke<{ subtopics: GeneratedSubtopic[] }>(
          'generate_subtopics',
          {
            request: {
              topic,
              model,
              apiKey,
              existingSubtopics: existingSubtopicNames,
              focusArea,
            },
          },
        );
        if (!response.subtopics || response.subtopics.length === 0) {
          setError('No subtopics were generated. Please try again.');
        } else {
          setGenerated(response.subtopics);
          setSelected(new Set(response.subtopics.map((_, i) => i)));
        }
      } catch (e) {
        let msg = 'Failed to generate subtopics';
        if (e && typeof e === 'object') {
          const err = e as { message?: unknown; code?: string };
          if (err.message) {
            msg =
              typeof err.message === 'string'
                ? err.message
                : JSON.stringify(err.message);
          } else if (err.code) {
            msg = `Error: ${err.code}`;
          }
        } else if (typeof e === 'string') {
          msg = e;
        }
        setError(msg);
      } finally {
        setIsGenerating(false);
      }
    })();
  };

  const handleAddSelected = () => {
    const toAdd: CustomSubtopic[] = Array.from(selected).map((i) => {
      const gen = generated[i];
      const now = Date.now();
      return {
        id: crypto.randomUUID(),
        topic,
        name: gen.name,
        group: gen.group,
        technique_notes: gen.technique_notes
          ? {
              core_concepts: gen.technique_notes.core_concepts,
              exam_style_guidelines: gen.technique_notes.exam_style_guidelines,
              anti_prompts: gen.technique_notes.anti_prompts,
            }
          : undefined,
        createdAt: now,
        updatedAt: now,
      };
    });
    onAdd(toAdd);
    onClose();
  };

  const toggleSelect = (index: number) => {
    const newSelected = new Set(selected);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelected(newSelected);
  };

  const selectAll = () => {
    if (selected.size === generated.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(generated.map((_, i) => i)));
    }
  };

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
      <div
        className='absolute inset-0 bg-black/50 backdrop-blur-sm'
        onClick={onClose}
      />
      <div className='relative w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col rounded-xl border bg-background shadow-2xl'>
        <div className='px-6 py-5 border-b border-border/60 bg-gradient-to-r from-primary/5 to-transparent'>
          <div className='flex items-center gap-3'>
            <div className='p-2 rounded-lg bg-primary/10'>
              <Sparkles className='w-5 h-5 text-primary' />
            </div>
            <div>
              <h2 className='text-lg font-semibold text-foreground'>
                AI Generate Subtopics
              </h2>
              <p className='text-sm text-muted-foreground'>
                {topic} — AI will generate diverse subtopics
              </p>
            </div>
          </div>
        </div>

        <div className='flex-1 overflow-y-auto'>
          <div className='px-6 py-5 space-y-6'>
            <div className='space-y-2'>
              <Label className='text-sm font-medium'>Model</Label>
              <select
                className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20'
                value={model}
                onChange={(e) => setModel(e.target.value)}
              >
                {PRESET_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div className='space-y-2'>
              <Label className='text-sm font-medium text-muted-foreground'>
                Focus area (optional)
              </Label>
              <Textarea
                value={focusArea}
                onChange={(e) => setFocusArea(e.target.value)}
                placeholder='e.g., Focus on molecular biology aspects, enzyme kinetics...'
                rows={2}
                className='resize-none'
              />
            </div>

            {error && (
              <div className='p-4 rounded-lg bg-destructive/10 border border-destructive/20'>
                <p className='text-sm text-destructive font-medium'>Error</p>
                <p className='text-sm text-destructive/80 mt-1'>{error}</p>
              </div>
            )}

            <div className='flex items-center justify-between pt-2'>
              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                className='gap-2'
              >
                {isGenerating ? (
                  <Loader2 className='w-4 h-4 animate-spin' />
                ) : (
                  <Wand2 className='w-4 h-4' />
                )}
                {isGenerating ? 'Generating...' : 'Generate Subtopics'}
              </Button>

              {generated.length > 0 && (
                <button
                  type='button'
                  onClick={selectAll}
                  className='text-sm text-muted-foreground hover:text-foreground transition-colors'
                >
                  {selected.size === generated.length
                    ? 'Deselect all'
                    : `Select all (${generated.length})`}
                </button>
              )}
            </div>

            {generated.length > 0 && (
              <div className='space-y-3 pt-4 border-t border-border/40'>
                <div className='flex items-center justify-between'>
                  <Label className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
                    Generated Results
                  </Label>
                  {selected.size > 0 && (
                    <span className='text-xs text-primary font-medium'>
                      {selected.size} selected
                    </span>
                  )}
                </div>

                <div className='grid gap-2 max-h-64 overflow-y-auto pr-1'>
                  {generated.map((sub, i) => {
                    const isSelected = selected.has(i);
                    return (
                      <button
                        key={i}
                        type='button'
                        className={`group relative flex items-start gap-3 p-4 rounded-lg border text-left transition-all duration-150 ${
                          isSelected
                            ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
                            : 'border-border/60 hover:border-border hover:bg-muted/40'
                        }`}
                        onClick={() => toggleSelect(i)}
                      >
                        <div
                          className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'bg-primary border-primary'
                              : 'border-muted-foreground/40 group-hover:border-primary/50'
                          }`}
                        >
                          {isSelected && (
                            <svg
                              className='w-3 h-3 text-primary-foreground'
                              fill='none'
                              viewBox='0 0 24 24'
                              stroke='currentColor'
                              strokeWidth='3'
                            >
                              <path d='M5 12l5 5L20 7' />
                            </svg>
                          )}
                        </div>

                        <div className='flex-1 min-w-0'>
                          <div className='font-medium text-sm text-foreground'>
                            {sub.name}
                          </div>
                          {sub.group && (
                            <div className='text-xs text-muted-foreground mt-0.5'>
                              {sub.group.replace(/-/g, ' / ')}
                            </div>
                          )}
                          {sub.technique_notes?.core_concepts && (
                            <div className='text-xs text-muted-foreground/80 mt-1.5 line-clamp-2'>
                              {sub.technique_notes.core_concepts}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className='px-6 py-4 border-t border-border/60 bg-muted/20 flex items-center justify-between'>
          <p className='text-sm text-muted-foreground'>
            {generated.length === 0
              ? 'Configure and generate to preview subtopics'
              : `${selected.size} of ${generated.length} will be added`}
          </p>
          <div className='flex items-center gap-2'>
            <Button variant='ghost' onClick={onClose} className='px-4'>
              Cancel
            </Button>
            <Button
              onClick={handleAddSelected}
              disabled={selected.size === 0}
              className='px-4'
            >
              Add {selected.size > 0 ? `(${selected.size})` : ''}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AiGenerateSubtopicsModal;
