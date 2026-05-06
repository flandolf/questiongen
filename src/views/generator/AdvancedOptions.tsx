import { motion } from 'framer-motion';
import { Calculator, Pen } from 'lucide-react';

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
import type {
  CustomSubtopic,
  DiversityStrictness,
  QuestionMode,
  TechMode,
  Topic,
  TopicSubtopicGroup,
} from '@/types';
import {
  BIOLOGY_SUBTOPIC_GROUPS,
  CHEMISTRY_SUBTOPIC_GROUPS,
  GENERAL_MATHEMATICS_SUBTOPIC_GROUPS,
  MATH_METHODS_SUBTOPIC_GROUPS,
  PE_SUBTOPIC_GROUPS,
  SPECIALIST_MATH_SUBTOPIC_GROUPS,
  toScopedSubtopicGroups,
} from '@/types';

import { GroupedSubtopicSelector } from './SetupUI';

const MATH_METHODS_SCOPED_SUBTOPIC_GROUPS = toScopedSubtopicGroups(
  MATH_METHODS_SUBTOPIC_GROUPS,
);

export function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <motion.div
      whileHover={{ y: -1 }}
      whileTap={{ scale: 1 }}
      className={cn(
        'flex min-h-17 items-center justify-between gap-3 px-3 py-3 rounded-lg border transition-colors cursor-pointer group',
        checked
          ? 'bg-primary/5 border-primary/20'
          : 'bg-card border-border hover:bg-muted/50',
      )}
      onClick={() => onCheckedChange(!checked)}
    >
      <div className='flex items-start gap-3 min-w-0'>
        <div className='min-w-0'>
          <Label
            htmlFor={id}
            className='text-sm font-semibold cursor-pointer block text-foreground'
          >
            {label}
          </Label>
          <p className='text-xs mt-0.5 line-clamp-1 text-muted-foreground'>
            {description}
          </p>
        </div>
      </div>
      <Switch
        id={id}
        checked={checked}
        onClick={(e) => e.stopPropagation()}
        onCheckedChange={onCheckedChange}
        className='shrink-0'
      />
    </motion.div>
  );
}

export type AdvancedOptionsGroupProps = {
  questionMode: QuestionMode;
  averageMarksPerQuestion: number;
  onSetAverageMarksPerQuestion: (marks: number) => void;
  selectedTopics: Topic[];
  hasSubtopicSection: boolean;
  selectedSubtopics: Record<string, string[]>;
  onToggleSubtopic: (topic: Topic, sub: string | string[]) => void;
  customSubtopics: Record<Topic, CustomSubtopic[]>;
  hasAnyMathTopic: boolean;
  techMode: TechMode;
  onSetTechMode: (mode: TechMode) => void;
  customFocusArea: string;
  onSetCustomFocusArea: (value: string) => void;
  diversityStrictness: DiversityStrictness;
  onSetDiversityStrictness: (value: DiversityStrictness) => void;
  strictLatexValidation: boolean;
  onSetStrictLatexValidation: (enabled: boolean) => void;
};

export function AdvancedOptionsGroup({
  questionMode,
  averageMarksPerQuestion,
  onSetAverageMarksPerQuestion,
  selectedTopics,
  hasSubtopicSection,
  selectedSubtopics,
  onToggleSubtopic,
  customSubtopics,
  hasAnyMathTopic,
  techMode,
  onSetTechMode,
  customFocusArea,
  onSetCustomFocusArea,
}: AdvancedOptionsGroupProps) {
  const getSubtopicGroups = (topic: Topic): readonly TopicSubtopicGroup[] => {
    let groups: readonly TopicSubtopicGroup[];
    switch (topic) {
      case 'Mathematical Methods':
        groups = MATH_METHODS_SCOPED_SUBTOPIC_GROUPS;
        break;
      case 'Specialist Mathematics':
        groups = SPECIALIST_MATH_SUBTOPIC_GROUPS;
        break;
      case 'Chemistry':
        groups = CHEMISTRY_SUBTOPIC_GROUPS;
        break;
      case 'Physical Education':
        groups = PE_SUBTOPIC_GROUPS;
        break;
      case 'Biology':
        groups = BIOLOGY_SUBTOPIC_GROUPS;
        break;
      case 'General Mathematics':
        groups = GENERAL_MATHEMATICS_SUBTOPIC_GROUPS;
        break;
      default:
        groups = [];
    }

    const customSubs = customSubtopics[topic] || [];
    if (customSubs.length === 0) return groups;

    const customGroup: TopicSubtopicGroup = {
      topic,
      groupId: 'custom',
      unit: 'Custom',
      aos: 'Custom Subtopics',
      label: 'Custom Subtopics',
      subtopics: customSubs.map((s) => s.name),
    };

    return [...groups, customGroup];
  };

  return (
    <div className='flex flex-col gap-6 w-full'>
      {/* Session Size & Marks Row */}
      <div className='flex flex-col gap-2'>
        <motion.div
          className={cn(
            'p-4 rounded-xl border flex flex-col gap-4 transition-colors w-full',
            questionMode === 'multiple-choice'
              ? 'bg-muted/30 border-transparent opacity-60 pointer-events-none'
              : 'bg-card border-border',
          )}
        >
          <div className='flex items-center justify-between'>
            <Label className='text-sm font-semibold flex items-center gap-2'>
              Marks Per Question
            </Label>
            <div className='font-mono text-xl font-bold text-foreground'>
              {averageMarksPerQuestion}
            </div>
          </div>
          <Slider
            min={1}
            max={20}
            step={1}
            value={[averageMarksPerQuestion]}
            onValueChange={(val) => onSetAverageMarksPerQuestion(val[0])}
            disabled={questionMode === 'multiple-choice'}
          />
        </motion.div>
      </div>
      {/* Calculator & Flags Row */}
      {hasAnyMathTopic && (
        <div
          className={cn(
            'flex flex-col gap-2',
            selectedTopics.length <= 1 && 'md:col-span-2',
          )}
        >
          <div className='grid grid-cols-2 gap-3'>
            {(
              [
                {
                  value: 'tech-free' as TechMode,
                  label: 'Tech Free',
                  icon: <Pen className='w-4 h-4' />,
                  desc: 'No calculator allowed',
                },
                {
                  value: 'tech-active' as TechMode,
                  label: 'Tech Active',
                  icon: <Calculator className='w-4 h-4' />,
                  desc: 'Calculator required',
                },
              ] as const
            ).map(({ value, label, desc }) => {
              const isActive = techMode === value;
              return (
                <TooltipProvider key={value}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type='button'
                        onClick={() => onSetTechMode(value)}
                        className={cn(
                          'flex min-h-14 flex-col items-center justify-center gap-1.5 p-3 rounded-xl border transition-all cursor-pointer w-full',
                          isActive
                            ? 'bg-primary/5 border-primary/30 text-primary font-bold'
                            : 'bg-card text-muted-foreground border-border hover:bg-muted/50 hover:text-foreground',
                        )}
                      >
                        <div className='text-sm'>{label}</div>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side='top'>
                      <p>{desc}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
        </div>
      )}

      {/* Direction Override */}
      <div className='flex flex-col gap-2'>
        <div className='flex items-center justify-between w-full'>
          <h2 className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 flex items-center gap-2'>
            Custom Focus Area
          </h2>
          <span className='font-mono text-[9px] text-muted-foreground/30'>
            OPTIONAL
          </span>
        </div>

        <div className='relative'>
          <Input
            value={customFocusArea}
            onChange={(e) => onSetCustomFocusArea(e.target.value)}
            maxLength={160}
            placeholder='e.g. "Focus on differentiation rules"'
            className='pr-16 rounded-xl h-10 bg-card border-border text-sm placeholder:text-muted-foreground/30 focus-visible:ring-primary/20'
          />
          {customFocusArea.length > 0 && (
            <div className='absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground/30 font-medium'>
              {customFocusArea.length}/160
            </div>
          )}
        </div>
      </div>

      {/* Subtopics */}
      {hasSubtopicSection && (
        <div className='flex flex-col gap-6'>
          {selectedTopics.map((topic) => (
            <GroupedSubtopicSelector
              key={topic}
              label={topic}
              groups={getSubtopicGroups(topic)}
              selected={selectedSubtopics[topic] || []}
              onToggle={(sub) => onToggleSubtopic(topic, sub)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
