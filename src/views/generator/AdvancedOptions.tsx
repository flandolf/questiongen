import { motion } from 'framer-motion';
import {
  BarChart3,
  Book,
  Calculator,
  Pen,
  Terminal,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
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
  BIOLOGY_SUBTOPIC_GROUPS,
  type BiologySubtopic,
  CHEMISTRY_SUBTOPIC_GROUPS,
  type ChemistrySubtopic,
  type DiversityStrictness,
  GENERAL_MATHEMATICS_SUBTOPIC_GROUPS,
  type GeneralMathematicsSubtopic,
  MATH_METHODS_SUBTOPIC_GROUPS,
  type MathMethodsSubtopic,
  PE_SUBTOPIC_GROUPS,
  type PhysicalEducationSubtopic,
  type QuestionMode,
  SPECIALIST_MATH_SUBTOPIC_GROUPS,
  type SpecialistMathSubtopic,
  type TechMode,
  type Topic,
  toScopedSubtopicGroups,
} from '@/types';

import { GroupedSubtopicSelector, SectionLabel } from './SetupUI';

const MATH_METHODS_SCOPED_SUBTOPIC_GROUPS = toScopedSubtopicGroups(
  MATH_METHODS_SUBTOPIC_GROUPS,
);

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
        <div
          className={cn(
            'p-2 rounded-lg flex items-center justify-center shrink-0',
            checked ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          {icon}
        </div>
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
  mathMethodsSubtopics: MathMethodsSubtopic[];
  onToggleMathMethodsSubtopic: (
    sub: MathMethodsSubtopic | MathMethodsSubtopic[],
  ) => void;
  specialistMathSubtopics: SpecialistMathSubtopic[];
  onToggleSpecialistMathSubtopic: (
    sub: SpecialistMathSubtopic | SpecialistMathSubtopic[],
  ) => void;
  chemistrySubtopics: ChemistrySubtopic[];
  onToggleChemistrySubtopic: (
    sub: ChemistrySubtopic | ChemistrySubtopic[],
  ) => void;
  physicalEducationSubtopics: PhysicalEducationSubtopic[];
  onTogglePhysicalEducationSubtopic: (
    sub: PhysicalEducationSubtopic | PhysicalEducationSubtopic[],
  ) => void;
  biologySubtopics: BiologySubtopic[];
  onToggleBiologySubtopic: (sub: BiologySubtopic | BiologySubtopic[]) => void;
  generalMathematicsSubtopics: GeneralMathematicsSubtopic[];
  onToggleGeneralMathematicsSubtopic: (
    sub: GeneralMathematicsSubtopic | GeneralMathematicsSubtopic[],
  ) => void;
  hasAnyMathTopic: boolean;
  techMode: TechMode;
  onSetTechMode: (mode: TechMode) => void;
  customFocusArea: string;
  onSetCustomFocusArea: (value: string) => void;
  diversityStrictness: DiversityStrictness;
  onSetDiversityStrictness: (value: DiversityStrictness) => void;
  strictLatexValidation: boolean;
  onSetStrictLatexValidation: (enabled: boolean) => void;
  strictSubtopicCoverage: boolean;
  onSetStrictSubtopicCoverage: (enabled: boolean) => void;
  minSubtopicCoverageRatio: number;
  onSetMinSubtopicCoverageRatio: (ratio: number) => void;
};

export function AdvancedOptionsGroup({
  questionMode,
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
  biologySubtopics,
  onToggleBiologySubtopic,
  generalMathematicsSubtopics,
  onToggleGeneralMathematicsSubtopic,
  onTogglePhysicalEducationSubtopic,
  hasAnyMathTopic,
  techMode,
  onSetTechMode,
  customFocusArea,
  onSetCustomFocusArea,
}: AdvancedOptionsGroupProps) {
  return (
    <div className='flex flex-col gap-5 w-full'>
      {/* Session Size & Marks Row */}
      <div className='flex flex-col gap-2'>
        <SectionLabel>
          <span className='flex items-center gap-2'>
            <BarChart3 className='w-3.5 h-3.5' /> Target Marks
          </span>
        </SectionLabel>
        <motion.div
          whileHover={{ y: -2 }}
          className={cn(
            'p-4 rounded-lg border flex flex-col gap-3 transition-colors w-full',
            questionMode === 'multiple-choice'
              ? 'bg-muted/30 border-transparent opacity-60 pointer-events-none'
              : 'bg-card border-border',
          )}
        >
          <div className='flex items-center justify-between'>
            <Label className='text-sm font-semibold flex items-center gap-2'>
              <BarChart3 className='w-4 h-4 text-muted-foreground' /> Average
              Marks Per Question
            </Label>
            <div className='font-mono text-xl font-medium text-foreground'>
              {averageMarksPerQuestion}
            </div>
          </div>
          <div>
            <Slider
              min={1}
              max={15}
              step={1}
              value={[averageMarksPerQuestion]}
              onValueChange={(val) => onSetAverageMarksPerQuestion(val[0])}
              disabled={questionMode === 'multiple-choice'}
            />
            <div className='flex justify-between mt-2 font-mono text-[10px] text-muted-foreground font-medium'>
              <span>1</span>
              <span>15</span>
            </div>
          </div>
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
          <SectionLabel>
            <span className='flex items-center gap-2'>
              <Calculator className='w-3.5 h-3.5' /> Calculator Mode
            </span>
          </SectionLabel>

          <div className='grid grid-cols-2 gap-4'>
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
            ).map(({ value, label, icon, desc }) => {
              const isActive = techMode === value;
              return (
                <TooltipProvider key={value}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <motion.button
                        whileHover={{ y: -2, scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        type='button'
                        onClick={() => onSetTechMode(value)}
                        className={cn(
                          'flex min-h-16 flex-col items-center justify-center gap-2 p-3 rounded-lg border transition-all cursor-pointer w-full',
                          isActive
                            ? 'bg-primary/5 border-primary/30 text-primary'
                            : 'bg-card text-muted-foreground border-border hover:bg-muted/50 hover:text-foreground',
                        )}
                      >
                        <div>{icon}</div>
                        <div className='text-sm font-medium'>{label}</div>
                      </motion.button>
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
        <div className='flex items-center justify-between w-full pt-1 pb-2'>
          <h2 className='text-xs font-black uppercase tracking-[0.2em] text-muted-foreground/80 flex items-center gap-2'>
            <Terminal className='w-3.5 h-3.5' /> Custom Focus Area
          </h2>
          <Badge
            variant='secondary'
            className='font-mono text-[10px] tracking-wider bg-muted text-muted-foreground'
          >
            OPTIONAL
          </Badge>
        </div>

        <div className='relative'>
          <Input
            value={customFocusArea}
            onChange={(e) => onSetCustomFocusArea(e.target.value)}
            maxLength={160}
            placeholder='Define specific context, style, or focus topics here...'
            className='pr-16 rounded-lg h-10 bg-card border-border text-sm placeholder:text-muted-foreground/50 focus-visible:ring-primary/20'
          />
          {customFocusArea.length > 0 && (
            <div className='absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground font-medium'>
              {customFocusArea.length}/160
            </div>
          )}
        </div>
      </div>

      {/* Subtopics */}
      {hasSubtopicSection && (
        <div className='flex flex-col gap-2'>
          <SectionLabel>
            <span className='flex items-center gap-2'>
              <Book className='w-3.5 h-3.5' /> Subtopic Focus
            </span>
          </SectionLabel>
          <div className='flex flex-col gap-6'>
            {selectedTopics.includes('Mathematical Methods') && (
              <GroupedSubtopicSelector
                label='Mathematical Methods'
                groups={MATH_METHODS_SCOPED_SUBTOPIC_GROUPS}
                selected={mathMethodsSubtopics}
                onToggle={
                  onToggleMathMethodsSubtopic as (s: string | string[]) => void
                }
              />
            )}
            {selectedTopics.includes('Specialist Mathematics') && (
              <GroupedSubtopicSelector
                label='Specialist Mathematics'
                groups={SPECIALIST_MATH_SUBTOPIC_GROUPS}
                selected={specialistMathSubtopics}
                onToggle={
                  onToggleSpecialistMathSubtopic as (
                    s: string | string[],
                  ) => void
                }
              />
            )}
            {selectedTopics.includes('Chemistry') && (
              <GroupedSubtopicSelector
                label='Chemistry'
                groups={CHEMISTRY_SUBTOPIC_GROUPS}
                selected={chemistrySubtopics}
                onToggle={
                  onToggleChemistrySubtopic as (s: string | string[]) => void
                }
              />
            )}
            {selectedTopics.includes('Physical Education') && (
              <GroupedSubtopicSelector
                label='Physical Education'
                groups={PE_SUBTOPIC_GROUPS}
                selected={physicalEducationSubtopics}
                onToggle={
                  onTogglePhysicalEducationSubtopic as (
                    s: string | string[],
                  ) => void
                }
              />
            )}
            {selectedTopics.includes('Biology') && (
              <GroupedSubtopicSelector
                label='Biology'
                groups={BIOLOGY_SUBTOPIC_GROUPS}
                selected={biologySubtopics}
                onToggle={
                  onToggleBiologySubtopic as (s: string | string[]) => void
                }
              />
            )}
            {selectedTopics.includes('General Mathematics') && (
              <GroupedSubtopicSelector
                label='General Mathematics'
                groups={GENERAL_MATHEMATICS_SUBTOPIC_GROUPS}
                selected={generalMathematicsSubtopics}
                onToggle={
                  onToggleGeneralMathematicsSubtopic as (
                    s: string | string[],
                  ) => void
                }
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
