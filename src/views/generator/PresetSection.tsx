import { MoreHorizontal, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store';
import type {
  BiologySubtopic,
  ChemistrySubtopic,
  Difficulty,
  GeneralMathematicsSubtopic,
  MathMethodsSubtopic,
  PhysicalEducationSubtopic,
  Preset,
  QuestionMode,
  SpecialistMathSubtopic,
  TechMode,
  Topic,
} from '@/types';

type PresetSectionProps = {
  selectedTopics: Topic[];
  difficulty: Difficulty;
  techMode: TechMode;
  avoidSimilarQuestions: boolean;
  mathMethodsSubtopics: MathMethodsSubtopic[];
  specialistMathSubtopics: SpecialistMathSubtopic[];
  chemistrySubtopics: ChemistrySubtopic[];
  physicalEducationSubtopics: PhysicalEducationSubtopic[];
  biologySubtopics: BiologySubtopic[];
  generalMathematicsSubtopics: GeneralMathematicsSubtopic[];
  questionCount: number;
  averageMarksPerQuestion: number;
  questionMode: QuestionMode;
};

const DIFFICULTY_META: Record<
  Difficulty,
  { label: string; color: string; bg: string; desc: string }
> = {
  'Essential Skills': {
    label: 'Essential',
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/40',
    desc: 'Core concepts',
  },
  Easy: {
    label: 'Easy',
    color: 'text-sky-600 dark:text-sky-400',
    bg: 'bg-sky-500/10 border-sky-500/40',
    desc: 'Straightforward',
  },
  Medium: {
    label: 'Medium',
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/40',
    desc: 'Balanced',
  },
  Hard: {
    label: 'Hard',
    color: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-500/10 border-orange-500/40',
    desc: 'Complex',
  },
  Extreme: {
    label: 'Extreme',
    color: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-500/10 border-rose-500/40',
    desc: 'Edge cases',
  },
};

export function PresetSection({
  selectedTopics,
  difficulty,
  techMode,
  avoidSimilarQuestions,
  mathMethodsSubtopics,
  specialistMathSubtopics,
  chemistrySubtopics,
  physicalEducationSubtopics,
  biologySubtopics,
  generalMathematicsSubtopics,
  questionCount,
  averageMarksPerQuestion,
  questionMode,
}: PresetSectionProps) {
  const presets = useAppStore((s) => s.presets);
  const addPreset = useAppStore((s) => s.addPreset);
  const updatePreset = useAppStore((s) => s.updatePreset);
  const deletePreset = useAppStore((s) => s.deletePreset);
  const setDifficulty = useAppStore((s) => s.setDifficulty);
  const setTechMode = useAppStore((s) => s.setTechMode);
  const setSelectedTopics = useAppStore((s) => s.setSelectedTopics);
  const setMathMethodsSubtopics = useAppStore((s) => s.setMathMethodsSubtopics);
  const setSpecialistMathSubtopics = useAppStore(
    (s) => s.setSpecialistMathSubtopics,
  );
  const setChemistrySubtopics = useAppStore((s) => s.setChemistrySubtopics);
  const setPhysicalEducationSubtopics = useAppStore(
    (s) => s.setPhysicalEducationSubtopics,
  );
  const setBiologySubtopics = useAppStore((s) => s.setBiologySubtopics);
  const setGeneralMathematicsSubtopics = useAppStore(
    (s) => s.setGeneralMathematicsSubtopics,
  );
  const setQuestionCount = useAppStore((s) => s.setQuestionCount);
  const setAverageMarksPerQuestion = useAppStore(
    (s) => s.setAverageMarksPerQuestion,
  );
  const setQuestionMode = useAppStore((s) => s.setQuestionMode);

  const [presetName, setPresetName] = useState('');
  const [renamingPresetId, setRenamingPresetId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingPresetId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingPresetId]);

  const handleSaveRename = (preset: Preset) => {
    const trimmedName = renamingValue.trim();
    if (trimmedName && trimmedName !== preset.name) {
      updatePreset({
        ...preset,
        name: trimmedName,
        updatedAt: new Date().toISOString(),
      });
    }
    setRenamingPresetId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, preset: Preset) => {
    if (e.key === 'Enter') handleSaveRename(preset);
    else if (e.key === 'Escape') setRenamingPresetId(null);
  };

  const buildCurrentPreferences = () => {
    const topicSet = new Set(selectedTopics);
    return {
      selectedTopics,
      difficulty,
      techMode,
      avoidSimilarQuestions,
      questionCount,
      averageMarksPerQuestion,
      questionMode,
      ...(topicSet.has('Mathematical Methods') ? { mathMethodsSubtopics } : {}),
      ...(topicSet.has('Specialist Mathematics')
        ? { specialistMathSubtopics }
        : {}),
      ...(topicSet.has('Chemistry') ? { chemistrySubtopics } : {}),
      ...(topicSet.has('Physical Education')
        ? { physicalEducationSubtopics }
        : {}),
      ...(topicSet.has('Biology') ? { biologySubtopics } : {}),
      ...(topicSet.has('General Mathematics')
        ? { generalMathematicsSubtopics }
        : {}),
    };
  };

  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const now = new Date().toISOString();
    const existing = presets.find((p) => p.name === name);
    const prefs = buildCurrentPreferences();
    if (existing) {
      updatePreset({ ...existing, preferences: prefs, updatedAt: now });
    } else {
      addPreset({
        id: `preset-${Date.now()}`,
        name,
        preferences: prefs,
        createdAt: now,
        updatedAt: now,
      });
    }
    setPresetName('');
  };

  const handleLoadPreset = (preset: Preset) => {
    const p = preset.preferences;
    setSelectedTopics([...p.selectedTopics]);
    setDifficulty(p.difficulty);
    setTechMode(p.techMode);
    setMathMethodsSubtopics([...(p.mathMethodsSubtopics ?? [])]);
    setSpecialistMathSubtopics([...(p.specialistMathSubtopics ?? [])]);
    setChemistrySubtopics([...(p.chemistrySubtopics ?? [])]);
    setPhysicalEducationSubtopics([...(p.physicalEducationSubtopics ?? [])]);
    setBiologySubtopics([...(p.biologySubtopics ?? [])]);
    setGeneralMathematicsSubtopics([...(p.generalMathematicsSubtopics ?? [])]);
    setQuestionCount(p.questionCount);
    setAverageMarksPerQuestion(p.averageMarksPerQuestion);
    setQuestionMode(p.questionMode);
  };

  const handleUpdatePreset = (preset: Preset) => {
    const now = new Date().toISOString();
    const prefs = buildCurrentPreferences();
    updatePreset({ ...preset, preferences: prefs, updatedAt: now });
  };

  const canSavePreset = presetName.trim().length > 0;

  return (
    <div className='space-y-2'>
      <div className='flex items-center space-x-2'>
        <Input
          id='preset-name'
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          placeholder='New preset name…'
          className='h-8 flex-1 bg-muted/50 text-xs focus-visible:ring-1 focus-visible:ring-primary/50'
          onKeyDown={(e) => {
            if (e.key === 'Enter' && presetName.trim()) {
              e.preventDefault();
              handleSavePreset();
            }
          }}
        />
        <Button
          aria-disabled={!canSavePreset}
          className={cn(
            'h-8 w-8 shrink-0 p-0 leading-none appearance-none overflow-visible',
            canSavePreset
              ? ''
              : 'cursor-not-allowed bg-muted text-muted-foreground hover:bg-muted',
          )}
          onClick={(e) => {
            if (!canSavePreset) {
              e.preventDefault();
              return;
            }
            handleSavePreset();
          }}
          size='icon-lg'
        >
          <Plus className='w-3 h-3' />
        </Button>
      </div>

      {presets.length > 0 && (
        <div className='space-y-1'>
          {presets.map(function (preset) {
            const isRenaming = renamingPresetId === preset.id;
            return (
              <div
                key={preset.id}
                className={cn(
                  'group rounded-md transition-all',
                  isRenaming
                    ? 'bg-accent/50 ring-1 ring-ring/20'
                    : 'hover:bg-accent',
                )}
              >
                <div
                  className='flex items-center justify-between rounded-md px-3 py-2 transition-colors cursor-pointer'
                  onClick={() => !isRenaming && handleLoadPreset(preset)}
                >
                  <div className='flex-1 mr-3 min-w-0'>
                    {isRenaming ? (
                      <div
                        className='flex items-center gap-2'
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Input
                          ref={renameInputRef}
                          value={renamingValue}
                          onChange={(e) => setRenamingValue(e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, preset)}
                          onBlur={() => handleSaveRename(preset)}
                          className='h-7 py-0 px-2 text-sm focus-visible:ring-1'
                        />
                      </div>
                    ) : (
                      <div>
                        <p className='text-sm font-medium leading-none'>
                          {preset.name}
                        </p>
                        <p className='text-[11px] text-muted-foreground mt-0.5 truncate'>
                          {preset.preferences.selectedTopics.join(', ')} ·{' '}
                          {preset.preferences.questionMode === 'written'
                            ? 'Written'
                            : 'MC'}{' '}
                          ·{' '}
                          {
                            DIFFICULTY_META[preset.preferences.difficulty]
                              ?.label
                          }
                          {preset.preferences.questionCount
                            ? ` · ${preset.preferences.questionCount} Qs`
                            : ''}
                          {preset.preferences.techMode !== 'tech-free'
                            ? ` · Tech-Active calculator`
                            : ''}
                        </p>
                      </div>
                    )}
                  </div>
                  {!isRenaming && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant='ghost'
                          size='icon-lg'
                          className='h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity'
                        >
                          <MoreHorizontal className='w-3.5 h-3.5' />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='end' className='w-32'>
                        <DropdownMenuItem
                          className='text-xs'
                          onClick={() => {
                            setRenamingPresetId(preset.id);
                            setRenamingValue(preset.name);
                          }}
                        >
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className='text-xs'
                          onClick={() => handleUpdatePreset(preset)}
                        >
                          Update to current
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className='text-xs text-destructive focus:text-destructive'
                          onClick={() => deletePreset(preset.id)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
