import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { CustomSubtopic, Topic } from '@/types';

interface SubtopicEditorModalProps {
  open: boolean;
  topic: Topic;
  subtopic?: CustomSubtopic;
  existingGroups: string[];
  onSave: (subtopic: CustomSubtopic) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function SubtopicEditorModal({
  open,
  topic,
  subtopic,
  existingGroups,
  onSave,
  onDelete,
  onClose,
}: SubtopicEditorModalProps) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [customGroup, setCustomGroup] = useState('');
  const [useCustomGroup, setUseCustomGroup] = useState(false);
  const [coreConcepts, setCoreConcepts] = useState('');
  const [examStyleGuidelines, setExamStyleGuidelines] = useState('');
  const [antiPrompts, setAntiPrompts] = useState('');

  useEffect(() => {
    if (subtopic) {
      setName(subtopic.name);
      setGroup(subtopic.group || '');
      setCoreConcepts(subtopic.technique_notes?.core_concepts || '');
      setExamStyleGuidelines(
        subtopic.technique_notes?.exam_style_guidelines || '',
      );
      setAntiPrompts(subtopic.technique_notes?.anti_prompts?.join('\n') || '');
      setUseCustomGroup(!existingGroups.includes(subtopic.group || ''));
      setCustomGroup(subtopic.group || '');
    } else {
      setName('');
      setGroup(existingGroups[0] || '');
      setUseCustomGroup(false);
      setCustomGroup('');
      setCoreConcepts('');
      setExamStyleGuidelines('');
      setAntiPrompts('');
    }
  }, [subtopic, existingGroups, open]);

  if (!open) return null;

  const handleSave = () => {
    const now = Date.now();
    const selectedGroup = useCustomGroup ? customGroup : group;
    const newSubtopic: CustomSubtopic = {
      id: subtopic?.id || crypto.randomUUID(),
      topic,
      name: name.trim(),
      group: selectedGroup || undefined,
      technique_notes: {
        core_concepts: coreConcepts.trim() || undefined,
        exam_style_guidelines: examStyleGuidelines.trim() || undefined,
        anti_prompts: antiPrompts
          .split('\n')
          .map((s) => s.trim())
          .filter((s) => s),
      },
      createdAt: subtopic?.createdAt || now,
      updatedAt: now,
    };
    onSave(newSubtopic);
    onClose();
  };

  const isValid = name.trim().length > 0;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
      <div
        className='absolute inset-0 bg-black/50 backdrop-blur-sm'
        onClick={onClose}
      />
      <div className='relative w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col rounded-xl border bg-background shadow-2xl'>
        <div className='px-6 py-5 border-b border-border/60'>
          <h2 className='text-lg font-semibold text-foreground'>
            {subtopic ? 'Edit Subtopic' : 'Add Custom Subtopic'}
          </h2>
          <p className='text-sm text-muted-foreground mt-1'>
            {topic} — {subtopic ? 'Modify existing' : 'Create new'}
          </p>
        </div>

        <div className='flex-1 overflow-y-auto px-6 py-5 space-y-6'>
          <div className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='name' className='text-sm font-medium'>
                Name <span className='text-destructive'>*</span>
              </Label>
              <Input
                id='name'
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='e.g., Cellular Respiration'
                className='h-10'
              />
            </div>

            <div className='space-y-2'>
              <Label className='text-sm font-medium'>Unit / AOS Group</Label>
              <select
                className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20'
                value={useCustomGroup ? '__custom__' : group}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setUseCustomGroup(true);
                  } else {
                    setUseCustomGroup(false);
                    setGroup(e.target.value);
                  }
                }}
              >
                {existingGroups.map((g) => (
                  <option key={g} value={g}>
                    {g.replace(/-/g, ' / ')}
                  </option>
                ))}
                <option value='__custom__'>+ Custom group...</option>
              </select>
              {useCustomGroup && (
                <Input
                  value={customGroup}
                  onChange={(e) => setCustomGroup(e.target.value)}
                  placeholder='e.g., unit1-How-do-organisms-regulate-their-functions?'
                  className='h-9 mt-2'
                />
              )}
            </div>
          </div>

          <div className='relative'>
            <div className='absolute left-0 top-0 bottom-0 w-px bg-border/40' />
            <div className='pl-4 space-y-4'>
              <div>
                <Label
                  htmlFor='coreConcepts'
                  className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'
                >
                  Core Concepts
                </Label>
                <Textarea
                  id='coreConcepts'
                  value={coreConcepts}
                  onChange={(e) => setCoreConcepts(e.target.value)}
                  placeholder='Brief description of key concepts students need to understand...'
                  rows={3}
                  className='mt-2 resize-none'
                />
              </div>

              <div>
                <Label
                  htmlFor='examStyleGuidelines'
                  className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'
                >
                  Exam Style Guidelines
                </Label>
                <Textarea
                  id='examStyleGuidelines'
                  value={examStyleGuidelines}
                  onChange={(e) => setExamStyleGuidelines(e.target.value)}
                  placeholder='Guidance for creating exam-style questions...'
                  rows={3}
                  className='mt-2 resize-none'
                />
              </div>

              <div>
                <Label
                  htmlFor='antiPrompts'
                  className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'
                >
                  Anti-Prompts
                </Label>
                <Textarea
                  id='antiPrompts'
                  value={antiPrompts}
                  onChange={(e) => setAntiPrompts(e.target.value)}
                  placeholder='Things to avoid in exam questions (one per line)...'
                  rows={3}
                  className='mt-2 resize-none'
                />
              </div>
            </div>
          </div>
        </div>

        <div className='px-6 py-4 border-t border-border/60 flex items-center justify-between bg-muted/20'>
          <div>
            {subtopic && onDelete && (
              <Button
                variant='ghost'
                className='text-destructive hover:text-destructive hover:bg-destructive/10'
                onClick={onDelete}
              >
                Delete
              </Button>
            )}
          </div>
          <div className='flex items-center gap-2'>
            <Button variant='ghost' onClick={onClose} className='px-4'>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!isValid} className='px-4'>
              {subtopic ? 'Update' : 'Create'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SubtopicEditorModal;
