import {
  BarChart3,
  Blend,
  Calculator,
  Crosshair,
  Hash,
  Pen,
  Shuffle,
} from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  CHEMISTRY_SUBTOPIC_GROUPS,
  type ChemistrySubtopic,
  MATH_METHODS_SUBTOPIC_GROUPS,
  type MathMethodsSubtopic,
  PE_SUBTOPIC_GROUPS,
  type PhysicalEducationSubtopic,
  type QuestionMode,
  SPECIALIST_MATH_SUBTOPIC_GROUPS,
  type SpecialistMathSubtopic,
  type TechMode,
  type Topic,
} from '@/types';

import { GroupedSubtopicSelector, SectionLabel } from './SetupUI';

export function ToggleRow({
  id,
  icon,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 py-3.5 px-4 rounded-xl border transition-all duration-200 cursor-pointer shadow-sm group hover:shadow-md',
        checked
          ? 'bg-primary/5 border-primary/30'
          : 'bg-card hover:border-primary/20 border-border/60'
      )}
      onClick={() => onCheckedChange(!checked)}
    >
      <div className="flex items-start gap-3 min-w-0 transition-transform duration-200 group-hover:translate-x-0.5">
        <span
          className={cn(
            'mt-0.5 shrink-0 transition-colors duration-200',
            checked
              ? 'text-primary drop-shadow-[0_0_8px_rgba(var(--primary),0.5)]'
              : 'text-muted-foreground group-hover:text-foreground'
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <Label
            htmlFor={id}
            className="text-sm font-semibold cursor-pointer user-select-none"
          >
            {label}
          </Label>
          <p className="text-[11px] text-muted-foreground/80 mt-[2px] leading-relaxed">
            {description}
          </p>
        </div>
      </div>
      <Switch
        id={id}
        checked={checked}
        onClick={(e) => e.stopPropagation()}
        onCheckedChange={onCheckedChange}
        className="shrink-0 mt-1 shadow-inner"
      />
    </div>
  );
}

export type AdvancedOptionsGroupProps = {
  questionMode: QuestionMode;
  questionCount: number;
  onSetQuestionCount: (count: number) => void;
  averageMarksPerQuestion: number;
  onSetAverageMarksPerQuestion: (marks: number) => void;
  selectedTopics: Topic[];
  hasSubtopicSection: boolean;
  mathMethodsSubtopics: MathMethodsSubtopic[];
  onToggleMathMethodsSubtopic: (sub: MathMethodsSubtopic) => void;
  specialistMathSubtopics: SpecialistMathSubtopic[];
  onToggleSpecialistMathSubtopic: (sub: SpecialistMathSubtopic) => void;
  chemistrySubtopics: ChemistrySubtopic[];
  onToggleChemistrySubtopic: (sub: ChemistrySubtopic) => void;
  physicalEducationSubtopics: PhysicalEducationSubtopic[];
  onTogglePhysicalEducationSubtopic: (sub: PhysicalEducationSubtopic) => void;
  hasAnyMathTopic: boolean;
  techMode: TechMode;
  onSetTechMode: (mode: TechMode) => void;
  shuffleQuestions: boolean;
  onSetShuffleQuestions: (enabled: boolean) => void;
  customFocusArea: string;
  onSetCustomFocusArea: (value: string) => void;
};

export function AdvancedOptionsGroup({
  questionMode,
  questionCount,
  onSetQuestionCount,
  averageMarksPerQuestion,
  onSetAverageMarksPerQuestion,
  selectedTopics,
  hasSubtopicSection,
  mathMethodsSubtopics,
  onToggleMathMethodsSubtopic,
  specialistMathSubtopics,
  onToggleSpecialistMathSubtopic,
  chemistrySubtopics,
  onToggleChemistrySubtopic,
  physicalEducationSubtopics,
  onTogglePhysicalEducationSubtopic,
  hasAnyMathTopic,
  techMode,
  onSetTechMode,
  shuffleQuestions,
  onSetShuffleQuestions,
  customFocusArea,
  onSetCustomFocusArea,
}: AdvancedOptionsGroupProps) {
  return (
    <div className="space-y-2 pt-3">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <SectionLabel>Session Size</SectionLabel>
          <div className="bg-card rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Hash className="w-4 h-4 text-primary" /> Questions
              </Label>
              <div className="bg-primary/10 text-primary font-bold px-3 py-1 rounded-md min-w-[2.5rem] text-center tabular-nums text-sm">
                {questionCount}
              </div>
            </div>
            <Slider
              min={1}
              max={20}
              step={1}
              value={[questionCount]}
              onValueChange={(val) => onSetQuestionCount(val[0])}
              className="py-2"
            />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              x<span>1 min</span>
              <span>20 max</span>
            </div>
          </div>
        </div>

        {questionMode === 'written' ? (
          <div className="space-y-2">
            <SectionLabel>Target marks</SectionLabel>
            <div className="bg-card rounded-lg border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" /> Target marks
                </Label>
                <div className="bg-primary/10 text-primary font-bold px-3 py-1 rounded-md min-w-[2.5rem] text-center tabular-nums text-sm">
                  {averageMarksPerQuestion}
                </div>
              </div>
              <Slider
                min={1}
                max={15}
                step={1}
                value={[averageMarksPerQuestion]}
                onValueChange={(val) => onSetAverageMarksPerQuestion(val[0])}
                className="py-2"
              />
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>1 min</span>
                <span>15 max</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <SectionLabel>Avg marks per question</SectionLabel>
            <div className="flex items-center justify-between px-4 py-3.5 rounded-lg bg-card border">
              <Label className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <BarChart3 className="w-4 h-4" /> Avg marks per question
              </Label>
              <div className="text-xs font-bold px-2 py-1 rounded bg-muted/20 text-muted-foreground/60">
                1 (Fixed)
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2 pt-3">
        <SectionLabel>Generation Flags</SectionLabel>
        <div className="flex flex-col gap-2.5">
          {selectedTopics.length > 1 && (
            <ToggleRow
              id="shuffle-questions"
              icon={<Shuffle className="w-4 h-4" />}
              label="Shuffle Output"
              description="Interleaves questions from all selected subjects."
              checked={shuffleQuestions}
              onCheckedChange={onSetShuffleQuestions}
            />
          )}
        </div>
        <div>
          <div className="bg-card border p-4 rounded-xl space-y-2 min-h-[90px]">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center text-primary">
                <Crosshair className="w-3 h-3" />
              </div>
              Direction Override
              <span className="font-medium text-[10px] uppercase text-muted-foreground tracking-wider ml-auto">
                Optional
              </span>
            </Label>
            <div className="relative">
              <Input
                value={customFocusArea}
                onChange={(e) => onSetCustomFocusArea(e.target.value)}
                maxLength={160}
                placeholder="e.g. projectile motion with optimisation..."
                className="text-sm rounded-lg bg-background border-border/60 shadow-inner resize-none transition-colors hover:border-primary/30 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/50"
              />
              {customFocusArea.length > 0 && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/50 font-medium tracking-tighter">
                  {customFocusArea.length}/160
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {hasSubtopicSection && (
        <div className="space-y-3 pt-6">
          <SectionLabel>
            Subtopics{' '}
            <span className="ml-1 normal-case font-medium tracking-normal text-muted-foreground/50">
              (Leave blank for all)
            </span>
          </SectionLabel>
          <div className="space-y-4">
            {selectedTopics.includes('Mathematical Methods') && (
              <GroupedSubtopicSelector
                label="Mathematical Methods"
                groups={MATH_METHODS_SUBTOPIC_GROUPS}
                selected={mathMethodsSubtopics}
                onToggle={onToggleMathMethodsSubtopic as (s: string) => void}
              />
            )}
            {selectedTopics.includes('Specialist Mathematics') && (
              <GroupedSubtopicSelector
                label="Specialist Mathematics"
                groups={SPECIALIST_MATH_SUBTOPIC_GROUPS}
                selected={specialistMathSubtopics}
                onToggle={onToggleSpecialistMathSubtopic as (s: string) => void}
              />
            )}
            {selectedTopics.includes('Chemistry') && (
              <GroupedSubtopicSelector
                label="Chemistry"
                groups={CHEMISTRY_SUBTOPIC_GROUPS}
                selected={chemistrySubtopics}
                onToggle={onToggleChemistrySubtopic as (s: string) => void}
              />
            )}
            {selectedTopics.includes('Physical Education') && (
              <GroupedSubtopicSelector
                label="Physical Education"
                groups={PE_SUBTOPIC_GROUPS}
                selected={physicalEducationSubtopics}
                onToggle={
                  onTogglePhysicalEducationSubtopic as (s: string) => void
                }
              />
            )}
          </div>
        </div>
      )}

      {hasAnyMathTopic && (
        <div className="space-y-3 pt-6">
          <SectionLabel>Calculator Settings</SectionLabel>
          <div className="grid grid-cols-3 gap-2 bg-card p-1.5 rounded-xl border">
            {(
              [
                {
                  value: 'tech-free' as TechMode,
                  label: 'Tech Free',
                  icon: <Pen className="w-4 h-4" />,
                  desc: 'Questions that do not require a calculator',
                },
                {
                  value: 'mix' as TechMode,
                  label: 'Mixed',
                  icon: <Blend className="w-4 h-4" />,
                  desc: 'Mix of calculator and non-calculator questions',
                },
                {
                  value: 'tech-active' as TechMode,
                  label: 'Tech Active',
                  icon: <Calculator className="w-4 h-4" />,
                  desc: 'Questions that may require a calculator',
                },
              ] as const
            ).map(({ value, label, icon, desc }) => {
              const isActive = techMode === value;
              return (
                <TooltipProvider key={value}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        key={value}
                        type="button"
                        onClick={() => onSetTechMode(value)}
                        className={cn(
                          'flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-lg text-sm font-semibold transition-all cursor-pointer overflow-hidden relative',
                          isActive
                            ? 'bg-primary text-primary-foreground shadow-md'
                            : 'bg-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                        )}
                      >
                        {isActive && (
                          <div className="absolute inset-0 bg-white/10 dark:bg-black/10 rounded-lg pointer-events-none" />
                        )}
                        <span
                          className={cn(
                            'transition-transform',
                            isActive ? 'scale-110' : ''
                          )}
                        >
                          {icon}
                        </span>
                        <span className="text-[11px] leading-none">
                          {label}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>{desc}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
