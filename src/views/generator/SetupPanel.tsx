import {
  Loader2,
  BookOpen,
  Target,
  Sparkles,
  Calculator,
  Pen,
  AlertTriangle,
  Shuffle,
  CheckCheck,
  Hash,
  BarChart3,
  Blend,
  FlaskConical,
  Dumbbell,
  FunctionSquare,
  SigmaSquare,
  Crosshair,
  Coins,
  DollarSign,
  Trash2,
  Edit3,
  MoreHorizontal,
  Plus,
  Save,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppSettings } from '@/AppContext';
import { invoke } from '@tauri-apps/api/core';
import { useNavigate } from 'react-router-dom';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { formatCostUsd, estimateTokensAndCost } from '@/lib/app-utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
// import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  TOPICS,
  Topic,
  TechMode,
  MathMethodsSubtopic,
  SpecialistMathSubtopic,
  ChemistrySubtopic,
  PhysicalEducationSubtopic,
  TopicSubtopicGroup,
  MATH_METHODS_SUBTOPIC_GROUPS,
  SPECIALIST_MATH_SUBTOPIC_GROUPS,
  CHEMISTRY_SUBTOPIC_GROUPS,
  PE_SUBTOPIC_GROUPS,
  Difficulty,
  QuestionMode,
  GenerationStatusEvent,
  GenerationTelemetry,
  Preset,
  PersistedGeneratorPreferences,
  BatchTopicProgress,
} from '@/types';
import {
  PageHeader,
  FilterGroup,
  FilterButton,
} from '@/components/layout/primitives';
import { useAppStore } from '@/store';
import {
  GenerationTimeline,
  BatchTimeline,
  LastGenerationStats,
} from './GenerationTimeline';
import {
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenu,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type { BatchTopicProgress } from '@/types';

// ─── Topic icon map ───────────────────────────────────────────────────────────

const TOPIC_ICONS: Partial<Record<Topic, React.ReactNode>> = {
  'Mathematical Methods': <FunctionSquare className="w-4 h-4" />,
  'Specialist Mathematics': <SigmaSquare className="w-4 h-4" />,
  Chemistry: <FlaskConical className="w-4 h-4" />,
  'Physical Education': <Dumbbell className="w-4 h-4" />,
};

// ─── Difficulty metadata ──────────────────────────────────────────────────────

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

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <p className="text-[10px] font-bold text-primary/80 uppercase tracking-[0.15em]">
        {children}
      </p>
    </div>
  );
}

export function SectionDivider() {
  return <div className="h-4" />;
}

// ─── Subtopic chip group ──────────────────────────────────────────────────────

function GroupedSubtopicSelector({
  label,
  groups,
  selected,
  onToggle,
}: {
  label: string;
  groups: readonly TopicSubtopicGroup[];
  selected: string[];
  onToggle: (item: string) => void;
}) {
  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(() => {
    const units = new Set<string>();
    for (const group of groups) {
      if (group.subtopics.some((s) => selected.includes(s))) {
        units.add(group.unit);
      }
    }
    return units;
  });

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const group of groups) {
      if (group.subtopics.some((s) => selected.includes(s))) {
        initial.add(group.groupId);
      }
    }
    return initial;
  });

  const toggleUnit = (unit: string) => {
    setSelectedUnits((prev) => {
      const next = new Set(prev);
      if (next.has(unit)) {
        next.delete(unit);
      } else {
        next.add(unit);
      }
      return next;
    });
  };

  const toggleGroup = (groupId: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const units = useMemo(
    () =>
      Array.from(new Set(groups.map((group) => group.unit))).sort((a, b) => {
        const unitNumber = (value: string) => {
          const match = value.match(/^Unit\s+(\d+)$/i);
          return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
        };
        const numberDiff = unitNumber(a) - unitNumber(b);
        if (numberDiff !== 0) return numberDiff;
        return a.localeCompare(b);
      }),
    [groups]
  );

  const visibleGroups = useMemo(
    () => groups.filter((group) => selectedUnits.has(group.unit)),
    [groups, selectedUnits]
  );

  return (
    <div className="mt-5 mb-2 space-y-4">
      <div className="flex items-baseline justify-between px-1">
        <p className="text-[13px] font-semibold text-foreground/90">{label}</p>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
          Select unit & area
        </p>
      </div>

      {/* Unit selector */}
      <div
        className={cn(
          'grid gap-2',
          units.length > 2 ? 'grid-cols-3' : 'grid-cols-2'
        )}
      >
        {units.map((unit) => {
          const isActive = selectedUnits.has(unit);
          const unitGroups = groups.filter((g) => g.unit === unit);
          const totalSubs = unitGroups.reduce(
            (sum, g) => sum + g.subtopics.length,
            0
          );
          const selectedCount = unitGroups.reduce(
            (sum, g) =>
              sum + g.subtopics.filter((s) => selected.includes(s)).length,
            0
          );

          return (
            <button
              key={unit}
              type="button"
              onClick={() => toggleUnit(unit)}
              className={cn(
                'relative flex items-center justify-between px-3 py-3 rounded-lg border text-[13px] font-medium transition-all duration-200 cursor-pointer select-none overflow-hidden',
                isActive
                  ? 'bg-primary/5 border-primary shadow-[0_2px_10px_-4px_rgba(var(--primary),0.3)] text-primary'
                  : 'bg-background border-border/50 text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-muted/10 hover:shadow-sm'
              )}
            >
              {isActive && (
                <div className="absolute top-0 left-0 w-full h-[2px] bg-primary rounded-t-lg opacity-80" />
              )}
              <span className="relative z-10">{unit}</span>
              {selectedCount > 0 && (
                <Badge
                  variant={isActive ? 'default' : 'secondary'}
                  className={cn(
                    'text-[10px] relative z-10',
                    isActive ? 'bg-primary text-primary-foreground' : ''
                  )}
                >
                  {selectedCount}/{totalSubs}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* AoS groups for selected units */}
      {visibleGroups.length > 0 && (
        <div className="space-y-2.5">
          {visibleGroups.map((group) => {
            const isOpen = openGroups.has(group.groupId);
            const groupSelected = group.subtopics.filter((s) =>
              selected.includes(s)
            );
            const allSelected = groupSelected.length === group.subtopics.length;
            const someSelected = groupSelected.length > 0 && !allSelected;

            return (
              <div
                key={group.groupId}
                className="bg-card rounded-lg border border-border/60 shadow-sm overflow-hidden transition-all duration-200 hover:border-border/80"
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.groupId)}
                  className="flex items-center justify-between w-full px-3.5 py-3 text-left hover:bg-muted/20 transition-colors group/aos"
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <span className="text-[12px] font-semibold text-foreground/90 truncate group-hover/aos:text-foreground transition-colors">
                      {group.aos}
                    </span>
                    {groupSelected.length > 0 && (
                      <Badge
                        variant="secondary"
                        className="text-[9px] uppercase font-bold tracking-wider shrink-0 bg-primary/10 text-primary border-0"
                      >
                        {groupSelected.length}/{group.subtopics.length}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (allSelected) {
                          group.subtopics.forEach((s) => {
                            if (selected.includes(s)) onToggle(s);
                          });
                        } else {
                          group.subtopics.forEach((s) => {
                            if (!selected.includes(s)) onToggle(s);
                          });
                        }
                      }}
                      className={cn(
                        'text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider border transition-all',
                        allSelected
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : someSelected
                            ? 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20'
                            : 'bg-transparent border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                      )}
                    >
                      {allSelected ? 'All' : someSelected ? 'Some' : 'None'}
                    </button>
                    <div className="w-px h-4 bg-border/50" />
                    <svg
                      className={cn(
                        'w-4 h-4 text-muted-foreground/60 transition-transform duration-200',
                        isOpen && 'rotate-180 text-foreground/80'
                      )}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </button>
                {isOpen && (
                  <div className="px-3.5 pb-3.5 pt-2 bg-muted/5 border-t border-border/40">
                    <div className="flex flex-wrap gap-1.5">
                      {group.subtopics.map((item) => {
                        const active = selected.includes(item);
                        return (
                          <button
                            key={item}
                            type="button"
                            onClick={() => onToggle(item)}
                            className={cn(
                              'text-[11px] px-3 py-1.5 rounded-full border transition-all duration-200 cursor-pointer select-none font-medium',
                              active
                                ? 'bg-primary border-primary text-primary-foreground shadow-sm shadow-primary/20'
                                : 'bg-background border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-muted/30 hover:shadow-sm'
                            )}
                          >
                            {item}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Toggle option row (Switch-based) ────────────────────────────────────────

function ToggleRow({
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

// ─── Advanced Options Accordion ───────────────────────────────────────────────

type AdvancedOptionsAccordionProps = {
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
  avoidSimilarQuestions: boolean;
  onSetAvoidSimilarQuestions: (enabled: boolean) => void;
  shuffleQuestions: boolean;
  onSetShuffleQuestions: (enabled: boolean) => void;
  customFocusArea: string;
  onSetCustomFocusArea: (value: string) => void;
  aiDifficultyScalingEnabled: boolean;
  onSetAiDifficultyScalingEnabled: (enabled: boolean) => void;
  difficultyThresholds: { increase: number; decrease: number };
  onSetDifficultyThresholds: (thresholds: {
    increase: number;
    decrease: number;
  }) => void;
};

function AdvancedOptionsAccordion({
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
  avoidSimilarQuestions,
  onSetAvoidSimilarQuestions,
  shuffleQuestions,
  onSetShuffleQuestions,
  customFocusArea,
  onSetCustomFocusArea,
  aiDifficultyScalingEnabled,
  onSetAiDifficultyScalingEnabled,
  difficultyThresholds,
  onSetDifficultyThresholds,
}: AdvancedOptionsAccordionProps) {
  return (
    <Accordion
      type="single"
      collapsible
      className="rounded-md border border-border/60 bg-linear-to-b from-card/30 to-background/5 shadow-sm overflow-y-auto"
    >
      <AccordionItem value="advanced" className="border-0">
        <AccordionTrigger className="px-5 py-4 hover:bg-muted/10 hover:no-underline data-[state=open]:bg-primary/5 transition-all group">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0 transition-colors group-hover:bg-primary/10 group-hover:text-primary shadow-sm ring-1 ring-border/50">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div className="text-left flex flex-col justify-center">
              <p className="text-sm font-bold tracking-tight">
                Advanced Settings
              </p>
              <p className="text-[11px] text-muted-foreground/80 font-medium">
                Fine-tune constraints, counts & parameters
              </p>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-8">
          {/* ── Session Size ── */}
          <div className="space-y-4 pt-3">
            <div className="space-y-2">
              <SectionLabel>Session Size</SectionLabel>
              <div className="bg-card rounded-lg border border-border/40 p-4 shadow-sm space-y-4">
                <div className="flex items-center justify-between user-select-none">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <Hash className="w-4 h-4 text-primary" /> Questions
                  </Label>
                  <div className="bg-primary/10 text-primary font-bold px-3 py-1 rounded-md min-w-[2.5rem] text-center tabular-nums text-sm ring-1 ring-primary/20">
                    {questionCount}
                  </div>
                </div>
                <Slider
                  min={1}
                  max={20}
                  step={1}
                  value={[questionCount]}
                  onValueChange={(val) => onSetQuestionCount(val[0])}
                  className="py-2 cursor-pointer"
                />
                <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
                  <span>1 min</span>
                  <span>20 max</span>
                </div>
              </div>
            </div>

            {selectedTopics.length > 1 && (
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-card/80 border border-border/40 w-fit max-w-full shadow-sm ring-1 ring-black/5 dark:ring-white/5">
                <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest border-r border-border/50 pr-3 h-4 flex items-center shrink-0">
                  Topics
                </span>
                <div className="flex items-center gap-4 overflow-x-auto no-scrollbar scroll-smooth">
                  {selectedTopics.map((topic, i) => {
                    const count =
                      Math.floor(questionCount / selectedTopics.length) +
                      (i < questionCount % selectedTopics.length ? 1 : 0);
                    return (
                      <div
                        key={topic}
                        className="flex items-center gap-2 shrink-0 bg-background rounded-md px-2 py-1 ring-1 ring-border/40"
                      >
                        <span className="text-primary/70 w-3.5 h-3.5 flex items-center justify-center shrink-0">
                          {TOPIC_ICONS[topic]}
                        </span>
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="font-semibold text-foreground/80 truncate max-w-[100px]">
                            {topic}
                          </span>
                          <span className="font-bold text-primary tabular-nums">
                            {count}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {questionMode === 'written' ? (
              <div className="bg-card rounded-lg border border-border/40 p-4 shadow-sm space-y-4">
                <div className="flex items-center justify-between user-select-none">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary" /> Target marks
                  </Label>
                  <div className="bg-primary/10 text-primary font-bold px-3 py-1 rounded-md min-w-[2.5rem] text-center tabular-nums text-sm ring-1 ring-primary/20">
                    {averageMarksPerQuestion}
                  </div>
                </div>
                <Slider
                  min={1}
                  max={15}
                  step={1}
                  value={[averageMarksPerQuestion]}
                  onValueChange={(val) => onSetAverageMarksPerQuestion(val[0])}
                  className="py-2 cursor-pointer"
                />
                <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
                  <span>1 min</span>
                  <span>15 max</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between px-4 py-3.5 rounded-lg bg-card border border-border/40 shadow-sm">
                <Label className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" /> Avg marks per question
                </Label>
                <div className="text-xs font-bold px-2 py-1 rounded ring-1 ring-border text-muted-foreground/60 bg-muted/20">
                  1 (Fixed)
                </div>
              </div>
            )}
          </div>

          {/* ── Focus Areas ── */}
          {hasSubtopicSection && (
            <div className="space-y-3 pt-6">
              <SectionLabel>
                Focus Areas{' '}
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
                    onToggle={
                      onToggleMathMethodsSubtopic as (s: string) => void
                    }
                  />
                )}
                {selectedTopics.includes('Specialist Mathematics') && (
                  <GroupedSubtopicSelector
                    label="Specialist Mathematics"
                    groups={SPECIALIST_MATH_SUBTOPIC_GROUPS}
                    selected={specialistMathSubtopics}
                    onToggle={
                      onToggleSpecialistMathSubtopic as (s: string) => void
                    }
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

          {/* ── Calculator Mode ── */}
          {hasAnyMathTopic && (
            <div className="space-y-3 pt-6">
              <SectionLabel>Calculator Settings</SectionLabel>
              <div className="grid grid-cols-3 gap-2 bg-card p-1.5 rounded-xl border border-border/40 shadow-sm">
                {(
                  [
                    {
                      value: 'tech-free' as TechMode,
                      label: 'Tech Free',
                      icon: <Pen className="w-4 h-4" />,
                    },
                    {
                      value: 'mix' as TechMode,
                      label: 'Mixed',
                      icon: <Blend className="w-4 h-4" />,
                    },
                    {
                      value: 'tech-active' as TechMode,
                      label: 'Tech Active',
                      icon: <Calculator className="w-4 h-4" />,
                    },
                  ] as const
                ).map(({ value, label, icon }) => {
                  const isActive = techMode === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onSetTechMode(value)}
                      className={cn(
                        'flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer overflow-hidden relative',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-[1.02]'
                          : 'bg-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                      )}
                    >
                      {isActive && (
                        <div className="absolute inset-0 bg-white/10 dark:bg-black/10 rounded-lg pointer-events-none" />
                      )}
                      <span
                        className={cn(
                          'transition-transform duration-200',
                          isActive ? 'scale-110 drop-shadow-md' : ''
                        )}
                      >
                        {icon}
                      </span>
                      <span className="text-[11px] leading-none tracking-wide">
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Options ── */}
          <div className="space-y-3 pt-6">
            <SectionLabel>Generation Flags</SectionLabel>
            <div className="flex flex-col gap-2.5">
              <ToggleRow
                id="avoid-similar"
                icon={<Shuffle className="w-4 h-4" />}
                label="De-duplicate"
                description="Steers the model away from past question shapes."
                checked={avoidSimilarQuestions}
                onCheckedChange={onSetAvoidSimilarQuestions}
              />
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
            <div className="pt-2 user-select-none">
              <div className="bg-card border border-border/40 p-4 rounded-xl shadow-sm space-y-2.5">
                <Label className="text-sm font-semibold flex items-center gap-2 text-foreground/90">
                  <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center text-primary ring-1 ring-primary/20">
                    <Crosshair className="w-3 h-3" />
                  </div>
                  Direction Override
                  <span className="font-medium text-[10px] uppercase text-muted-foreground/60 tracking-wider ml-auto">
                    Optional
                  </span>
                </Label>
                <div className="relative">
                  <Input
                    value={customFocusArea}
                    onChange={(e) => onSetCustomFocusArea(e.target.value)}
                    maxLength={160}
                    placeholder="e.g. projectile motion with optimisation..."
                    className="pl-3.5 pr-12 py-5 text-sm rounded-lg bg-background border-border/60 shadow-inner resize-none transition-colors hover:border-primary/30 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/50"
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

          {/* ── AI Difficulty Scaling ── */}
          <div className="space-y-4 pt-8">
            <div className="flex items-center justify-between">
              <SectionLabel>Dynamic Scaling</SectionLabel>
              <Badge
                variant="outline"
                className={cn(
                  'uppercase text-[9px] tracking-widest font-bold',
                  aiDifficultyScalingEnabled
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-[0_0_10px_-2px_rgba(16,185,129,0.3)]'
                    : 'border-border text-muted-foreground'
                )}
              >
                {aiDifficultyScalingEnabled ? 'Active' : 'Offline'}
              </Badge>
            </div>

            <div className="bg-card border border-border/40 rounded-xl p-1 shadow-sm">
              <ToggleRow
                id="ai-scaling"
                icon={<TrendingUp className="w-4 h-4" />}
                label="Self-calibrating Engine"
                description="Adapts question parameters dynamically based on past accuracy."
                checked={aiDifficultyScalingEnabled}
                onCheckedChange={onSetAiDifficultyScalingEnabled}
              />

              {aiDifficultyScalingEnabled && (
                <div className="grid grid-cols-2 gap-3 p-3.5 border-t border-border/30 mt-1 bg-muted/10 rounded-b-xl">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-foreground/80 flex justify-between">
                      Promote %
                    </Label>
                    <div className="relative">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={difficultyThresholds.increase}
                        className="font-mono text-sm bg-background border-border/60 pr-8 p-4"
                        onChange={(e) =>
                          onSetDifficultyThresholds({
                            ...difficultyThresholds,
                            increase: parseInt(e.target.value) || 85,
                          })
                        }
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-xs">
                        %
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-foreground/80 flex justify-between">
                      Demote %
                    </Label>
                    <div className="relative">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={difficultyThresholds.decrease}
                        className="font-mono text-sm bg-background border-border/60 pr-8 p-4"
                        onChange={(e) =>
                          onSetDifficultyThresholds({
                            ...difficultyThresholds,
                            decrease: parseInt(e.target.value) || 70,
                          })
                        }
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-xs">
                        %
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

// ─── Preset section ───────────────────────────────────────────────────────────

function buildPreferencesSnapshot(props: {
  selectedTopics: Topic[];
  difficulty: Difficulty;
  techMode: TechMode;
  avoidSimilarQuestions: boolean;
  mathMethodsSubtopics: MathMethodsSubtopic[];
  specialistMathSubtopics: SpecialistMathSubtopic[];
  chemistrySubtopics: ChemistrySubtopic[];
  physicalEducationSubtopics: PhysicalEducationSubtopic[];
  questionCount: number;
  averageMarksPerQuestion: number;
  questionMode: QuestionMode;
  aiDifficultyScalingEnabled: boolean;
  difficultyThresholds: { increase: number; decrease: number };
}): PersistedGeneratorPreferences {
  return {
    selectedTopics: props.selectedTopics,
    difficulty: props.difficulty,
    techMode: props.techMode,
    avoidSimilarQuestions: props.avoidSimilarQuestions,
    mathMethodsSubtopics: props.mathMethodsSubtopics,
    specialistMathSubtopics: props.specialistMathSubtopics,
    chemistrySubtopics: props.chemistrySubtopics,
    physicalEducationSubtopics: props.physicalEducationSubtopics,
    questionCount: props.questionCount,
    averageMarksPerQuestion: props.averageMarksPerQuestion,
    questionMode: props.questionMode,
    aiDifficultyScalingEnabled: props.aiDifficultyScalingEnabled,
    difficultyThresholds: props.difficultyThresholds,
  };
}

function PresetSection({
  selectedTopics,
  difficulty,
  techMode,
  avoidSimilarQuestions,
  mathMethodsSubtopics,
  specialistMathSubtopics,
  chemistrySubtopics,
  physicalEducationSubtopics,
  questionCount,
  averageMarksPerQuestion,
  questionMode,
  aiDifficultyScalingEnabled,
  difficultyThresholds,
}: {
  selectedTopics: Topic[];
  difficulty: Difficulty;
  techMode: TechMode;
  avoidSimilarQuestions: boolean;
  mathMethodsSubtopics: MathMethodsSubtopic[];
  specialistMathSubtopics: SpecialistMathSubtopic[];
  chemistrySubtopics: ChemistrySubtopic[];
  physicalEducationSubtopics: PhysicalEducationSubtopic[];
  questionCount: number;
  averageMarksPerQuestion: number;
  questionMode: QuestionMode;
  aiDifficultyScalingEnabled: boolean;
  difficultyThresholds: { increase: number; decrease: number };
}) {
  const presets = useAppStore((s) => s.presets);
  const addPreset = useAppStore((s) => s.addPreset);
  const updatePreset = useAppStore((s) => s.updatePreset);
  const deletePreset = useAppStore((s) => s.deletePreset);
  const setDifficulty = useAppStore((s) => s.setDifficulty);
  const setTechMode = useAppStore((s) => s.setTechMode);
  const setAvoidSimilarQuestions = useAppStore(
    (s) => s.setAvoidSimilarQuestions
  );
  const setSelectedTopics = useAppStore((s) => s.setSelectedTopics);
  const setMathMethodsSubtopics = useAppStore((s) => s.setMathMethodsSubtopics);
  const setSpecialistMathSubtopics = useAppStore(
    (s) => s.setSpecialistMathSubtopics
  );
  const setChemistrySubtopics = useAppStore((s) => s.setChemistrySubtopics);
  const setPhysicalEducationSubtopics = useAppStore(
    (s) => s.setPhysicalEducationSubtopics
  );
  const setQuestionCount = useAppStore((s) => s.setQuestionCount);
  const setAverageMarksPerQuestion = useAppStore(
    (s) => s.setAverageMarksPerQuestion
  );
  const setQuestionMode = useAppStore((s) => s.setQuestionMode);
  const setAiDifficultyScalingEnabled = useAppStore(
    (s) => s.setAiDifficultyScalingEnabled
  );
  const setDifficultyThresholds = useAppStore((s) => s.setDifficultyThresholds);

  const [presetName, setPresetName] = useState('');
  const [renamingPresetId, setRenamingPresetId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingPrefs, setEditingPrefs] =
    useState<PersistedGeneratorPreferences | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const editPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (renamingPresetId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingPresetId]);

  const startEditingPreset = (preset: Preset) => {
    setEditingPresetId(preset.id);
    setEditingPrefs({ ...preset.preferences });
  };

  const cancelEditingPreset = () => {
    setEditingPresetId(null);
    setEditingPrefs(null);
  };

  const saveEditingPreset = (preset: Preset) => {
    if (!editingPrefs) return;
    const now = new Date().toISOString();
    updatePreset({
      ...preset,
      preferences: editingPrefs,
      updatedAt: now,
    });
    setEditingPresetId(null);
    setEditingPrefs(null);
  };

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

  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const now = new Date().toISOString();
    const existing = presets.find((p) => p.name === name);
    const prefs = buildPreferencesSnapshot({
      selectedTopics,
      difficulty,
      techMode,
      avoidSimilarQuestions,
      mathMethodsSubtopics,
      specialistMathSubtopics,
      chemistrySubtopics,
      physicalEducationSubtopics,
      questionCount,
      averageMarksPerQuestion,
      questionMode,
      aiDifficultyScalingEnabled,
      difficultyThresholds,
    });
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
    if (editingPresetId) return;
    const p = preset.preferences;
    setSelectedTopics([...p.selectedTopics]);
    setDifficulty(p.difficulty);
    setTechMode(p.techMode);
    setAvoidSimilarQuestions(p.avoidSimilarQuestions);
    setMathMethodsSubtopics([...p.mathMethodsSubtopics]);
    setSpecialistMathSubtopics([...p.specialistMathSubtopics]);
    setChemistrySubtopics([...p.chemistrySubtopics]);
    setPhysicalEducationSubtopics([...p.physicalEducationSubtopics]);
    setQuestionCount(p.questionCount);
    setAverageMarksPerQuestion(p.averageMarksPerQuestion);
    setQuestionMode(p.questionMode);
    setAiDifficultyScalingEnabled(p.aiDifficultyScalingEnabled ?? true);
    setDifficultyThresholds(
      p.difficultyThresholds ?? { increase: 85, decrease: 70 }
    );
  };

  const handleUpdatePreset = (preset: Preset) => {
    const now = new Date().toISOString();
    const prefs = buildPreferencesSnapshot({
      selectedTopics,
      difficulty,
      techMode,
      avoidSimilarQuestions,
      mathMethodsSubtopics,
      specialistMathSubtopics,
      chemistrySubtopics,
      physicalEducationSubtopics,
      questionCount,
      averageMarksPerQuestion,
      questionMode,
      aiDifficultyScalingEnabled,
      difficultyThresholds,
    });
    updatePreset({ ...preset, preferences: prefs, updatedAt: now });
  };

  const updateEditingPref = <K extends keyof PersistedGeneratorPreferences>(
    key: K,
    value: PersistedGeneratorPreferences[K]
  ) => {
    setEditingPrefs((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  return (
    <div className="space-y-1">
      {/* Save new preset */}
      <div className="flex items-center gap-2 mb-2">
        <Input
          id="preset-name"
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          placeholder="New preset name…"
          className="h-8 flex-1 bg-muted/50 text-xs focus-visible:ring-1 focus-visible:ring-primary/50"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && presetName.trim()) {
              e.preventDefault();
              handleSavePreset();
            }
          }}
        />
        <Button
          size="sm"
          className="h-8 px-3 shrink-0"
          onClick={handleSavePreset}
          disabled={!presetName.trim()}
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Save
        </Button>
      </div>

      {/* Preset list */}
      {presets.length > 0 && (
        <div className="space-y-1">
          {presets.map((preset) => {
            const isRenaming = renamingPresetId === preset.id;
            const isEditing = editingPresetId === preset.id;
            return (
              <div
                key={preset.id}
                className={[
                  'group rounded-md transition-all',
                  isRenaming
                    ? 'bg-accent/50 ring-1 ring-ring/20'
                    : isEditing
                      ? 'bg-accent/30 ring-1 ring-primary/30'
                      : 'hover:bg-accent',
                ].join(' ')}
              >
                <div
                  className={[
                    'flex items-center justify-between rounded-md px-3 py-2 transition-colors',
                    isEditing ? '' : 'cursor-pointer',
                  ].join(' ')}
                  onClick={() =>
                    !isRenaming && !isEditing && handleLoadPreset(preset)
                  }
                >
                  <div className="flex-1 mr-3 min-w-0">
                    {isRenaming ? (
                      <div
                        className="flex items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Input
                          ref={renameInputRef}
                          value={renamingValue}
                          onChange={(e) => setRenamingValue(e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, preset)}
                          onBlur={() => handleSaveRename(preset)}
                          className="h-7 py-0 px-2 text-sm focus-visible:ring-1"
                        />
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-medium leading-none">
                          {preset.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
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
                            ? ` · ${preset.preferences.techMode === 'mix' ? 'Mixed' : 'Tech-Active'} calculator`
                            : ''}
                        </p>
                      </div>
                    )}
                  </div>
                  {!isRenaming && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditingPreset(preset);
                          }}
                        >
                          <Edit3 className="mr-2 h-4 w-4" /> Edit preferences
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingPresetId(preset.id);
                            setRenamingValue(preset.name);
                          }}
                        >
                          <Edit3 className="mr-2 h-4 w-4" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdatePreset(preset);
                          }}
                        >
                          <Save className="mr-2 h-4 w-4" /> Update with current
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            deletePreset(preset.id);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {/* Inline editor panel */}
                {isEditing && editingPrefs && (
                  <div
                    ref={editPanelRef}
                    className="px-3 pb-3 pt-1 border-t border-border/50"
                  >
                    <div className="space-y-3">
                      {/* Question mode */}
                      <div className="flex items-center gap-2">
                        <Label className="text-[11px] font-medium text-muted-foreground shrink-0">
                          Mode
                        </Label>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              updateEditingPref('questionMode', 'written')
                            }
                            className={cn(
                              'text-xs px-2 py-1 rounded border transition-colors',
                              editingPrefs.questionMode === 'written'
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'border-border text-muted-foreground hover:border-primary/40'
                            )}
                          >
                            Written
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateEditingPref(
                                'questionMode',
                                'multiple-choice'
                              )
                            }
                            className={cn(
                              'text-xs px-2 py-1 rounded border transition-colors',
                              editingPrefs.questionMode === 'multiple-choice'
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'border-border text-muted-foreground hover:border-primary/40'
                            )}
                          >
                            MC
                          </button>
                        </div>
                      </div>

                      {/* Difficulty */}
                      <div className="flex items-center gap-2">
                        <Label className="text-[11px] font-medium text-muted-foreground shrink-0">
                          Difficulty
                        </Label>
                        <div className="flex flex-wrap gap-1">
                          {(Object.keys(DIFFICULTY_META) as Difficulty[]).map(
                            (level) => (
                              <button
                                key={level}
                                type="button"
                                onClick={() =>
                                  updateEditingPref('difficulty', level)
                                }
                                className={cn(
                                  'text-[10px] px-2 py-0.5 rounded border transition-colors',
                                  editingPrefs.difficulty === level
                                    ? `${DIFFICULTY_META[level].bg} ${DIFFICULTY_META[level].color} border-current`
                                    : 'border-border text-muted-foreground hover:border-primary/40'
                                )}
                              >
                                {DIFFICULTY_META[level].label}
                              </button>
                            )
                          )}
                        </div>
                      </div>

                      {/* Question count */}
                      <div className="flex items-center gap-2">
                        <Label className="text-[11px] font-medium text-muted-foreground shrink-0">
                          Questions
                        </Label>
                        <div className="flex items-center gap-2 flex-1">
                          <Slider
                            min={1}
                            max={20}
                            step={1}
                            value={[editingPrefs.questionCount]}
                            onValueChange={(val) =>
                              updateEditingPref('questionCount', val[0])
                            }
                            className="flex-1 py-1"
                          />
                          <Badge
                            variant="secondary"
                            className="text-[10px] tabular-nums shrink-0"
                          >
                            {editingPrefs.questionCount}
                          </Badge>
                        </div>
                      </div>

                      {/* Tech mode (for math topics) */}
                      {editingPrefs.selectedTopics.some(
                        (t) =>
                          t === 'Mathematical Methods' ||
                          t === 'Specialist Mathematics'
                      ) && (
                          <div className="flex items-center gap-2">
                            <Label className="text-[11px] font-medium text-muted-foreground shrink-0">
                              Calculator
                            </Label>
                            <div className="flex gap-1">
                              {(
                                [
                                  {
                                    value: 'tech-free' as TechMode,
                                    label: 'Tech-Free',
                                  },
                                  { value: 'mix' as TechMode, label: 'Mixed' },
                                  {
                                    value: 'tech-active' as TechMode,
                                    label: 'Tech-Active',
                                  },
                                ] as const
                              ).map(({ value, label }) => (
                                <button
                                  key={value}
                                  type="button"
                                  onClick={() =>
                                    updateEditingPref('techMode', value)
                                  }
                                  className={cn(
                                    'text-[10px] px-2 py-0.5 rounded border transition-colors',
                                    editingPrefs.techMode === value
                                      ? 'bg-primary text-primary-foreground border-primary'
                                      : 'border-border text-muted-foreground hover:border-primary/40'
                                  )}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                      {/* Avg marks (for written mode) */}
                      {editingPrefs.questionMode === 'written' && (
                        <div className="flex items-center gap-2">
                          <Label className="text-[11px] font-medium text-muted-foreground shrink-0">
                            Avg marks
                          </Label>
                          <div className="flex items-center gap-2 flex-1">
                            <Slider
                              min={1}
                              max={15}
                              step={1}
                              value={[
                                editingPrefs.averageMarksPerQuestion ?? 5,
                              ]}
                              onValueChange={(val) =>
                                updateEditingPref(
                                  'averageMarksPerQuestion',
                                  val[0]
                                )
                              }
                              className="flex-1 py-1"
                            />
                            <Badge
                              variant="secondary"
                              className="text-[10px] tabular-nums shrink-0"
                            >
                              {editingPrefs.averageMarksPerQuestion ?? 5}
                            </Badge>
                          </div>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/40">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={cancelEditingPreset}
                          className="h-7 px-3 text-xs"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => saveEditingPreset(preset)}
                          className="h-7 px-3 text-xs"
                        >
                          <Save className="w-3 h-3 mr-1" /> Save
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

type SetupPanelProps = {
  questionMode: QuestionMode;
  onSetQuestionMode: (mode: QuestionMode) => void;
  selectedTopics: Topic[];
  onToggleTopic: (topic: Topic) => void;
  mathMethodsSubtopics: MathMethodsSubtopic[];
  onToggleMathMethodsSubtopic: (sub: MathMethodsSubtopic) => void;
  specialistMathSubtopics: SpecialistMathSubtopic[];
  onToggleSpecialistMathSubtopic: (sub: SpecialistMathSubtopic) => void;
  chemistrySubtopics: ChemistrySubtopic[];
  onToggleChemistrySubtopic: (sub: ChemistrySubtopic) => void;
  physicalEducationSubtopics: PhysicalEducationSubtopic[];
  onTogglePhysicalEducationSubtopic: (sub: PhysicalEducationSubtopic) => void;
  techMode: TechMode;
  onSetTechMode: (mode: TechMode) => void;
  customFocusArea: string;
  onSetCustomFocusArea: (value: string) => void;
  difficulty: Difficulty;
  onSetDifficulty: (level: Difficulty) => void;
  questionCount: number;
  onSetQuestionCount: (count: number) => void;
  averageMarksPerQuestion: number;
  onSetAverageMarksPerQuestion: (marks: number) => void;
  avoidSimilarQuestions: boolean;
  onSetAvoidSimilarQuestions: (enabled: boolean) => void;
  shuffleQuestions: boolean;
  onSetShuffleQuestions: (enabled: boolean) => void;
  aiDifficultyScalingEnabled: boolean;
  onSetAiDifficultyScalingEnabled: (enabled: boolean) => void;
  difficultyThresholds: { increase: number; decrease: number };
  onSetDifficultyThresholds: (thresholds: {
    increase: number;
    decrease: number;
  }) => void;
  hasApiKey: boolean;
  canGenerate: boolean;
  isGenerating: boolean;
  isPaused: boolean;
  onTogglePause: () => void;
  generationStatus: GenerationStatusEvent | null;
  generationStartedAt: number | null;
  formattedElapsedTime: string;
  onGenerate: () => void;
  lastGenerationTelemetry?: GenerationTelemetry | null;
  streamText?: string;
  batchProgress?: BatchTopicProgress[];
};

// ─── Component ────────────────────────────────────────────────────────────────

function SetupPanelImpl({
  questionMode,
  onSetQuestionMode,
  selectedTopics,
  onToggleTopic,
  mathMethodsSubtopics,
  onToggleMathMethodsSubtopic,
  specialistMathSubtopics,
  onToggleSpecialistMathSubtopic,
  chemistrySubtopics,
  onToggleChemistrySubtopic,
  physicalEducationSubtopics,
  onTogglePhysicalEducationSubtopic,
  techMode,
  onSetTechMode,
  customFocusArea,
  onSetCustomFocusArea,
  difficulty,
  onSetDifficulty,
  questionCount,
  onSetQuestionCount,
  averageMarksPerQuestion,
  onSetAverageMarksPerQuestion,
  avoidSimilarQuestions,
  onSetAvoidSimilarQuestions,
  shuffleQuestions,
  onSetShuffleQuestions,
  aiDifficultyScalingEnabled = true,
  onSetAiDifficultyScalingEnabled,
  difficultyThresholds,
  onSetDifficultyThresholds,
  hasApiKey,
  canGenerate,
  isGenerating,
  isPaused,
  onTogglePause,
  generationStatus,
  formattedElapsedTime,
  onGenerate,
  lastGenerationTelemetry,
  streamText = '',
  batchProgress = [],
}: SetupPanelProps) {
  const navigate = useNavigate();
  const { apiKey, model } = useAppSettings();
  const generationHistory = useAppStore((s) => s.generationHistory);
  const [promptPricePerToken, setPromptPricePerToken] = useState<number | null>(
    null
  );
  const [completionPricePerToken, setCompletionPricePerToken] = useState<
    number | null
  >(null);

  const hasAnyMathTopic = selectedTopics.some(
    (t) => t === 'Mathematical Methods' || t === 'Specialist Mathematics'
  );
  const hasSubtopicSection =
    selectedTopics.includes('Mathematical Methods') ||
    selectedTopics.includes('Specialist Mathematics') ||
    selectedTopics.includes('Chemistry') ||
    selectedTopics.includes('Physical Education');

  const showBatchTimeline = batchProgress.length > 1;

  const selectedSubtopics = useMemo(
    () =>
      Array.from(
        new Set([
          ...(selectedTopics.includes('Mathematical Methods')
            ? mathMethodsSubtopics
            : []),
          ...(selectedTopics.includes('Specialist Mathematics')
            ? specialistMathSubtopics
            : []),
          ...(selectedTopics.includes('Chemistry') ? chemistrySubtopics : []),
          ...(selectedTopics.includes('Physical Education')
            ? physicalEducationSubtopics
            : []),
        ])
      ),
    [
      selectedTopics,
      mathMethodsSubtopics,
      specialistMathSubtopics,
      chemistrySubtopics,
      physicalEducationSubtopics,
    ]
  );

  useEffect(() => {
    let cancelled = false;
    async function fetchStats() {
      if (!apiKey || !model || model === 'custom') return;
      try {
        const stats = await invoke<{
          promptPricePerToken?: number | null;
          completionPricePerToken?: number | null;
        }>('get_model_stats', { apiKey, modelId: model });
        if (cancelled) return;
        setPromptPricePerToken(stats.promptPricePerToken ?? null);
        setCompletionPricePerToken(stats.completionPricePerToken ?? null);
      } catch {
        setPromptPricePerToken(null);
        setCompletionPricePerToken(null);
      }
    }
    void fetchStats();
    return () => {
      cancelled = true;
    };
  }, [apiKey, model]);

  const estimated = useMemo(() => {
    const primaryTopic = selectedTopics[0] || 'Mathematical Methods';
    return estimateTokensAndCost(
      generationHistory,
      primaryTopic,
      difficulty,
      questionCount,
      questionMode,
      techMode,
      averageMarksPerQuestion,
      selectedSubtopics.length > 0 ? selectedSubtopics : undefined,
      customFocusArea.trim() || undefined,
      promptPricePerToken ?? undefined,
      completionPricePerToken ?? undefined
    );
  }, [
    generationHistory,
    selectedTopics,
    difficulty,
    questionCount,
    questionMode,
    techMode,
    averageMarksPerQuestion,
    customFocusArea,
    promptPricePerToken,
    completionPricePerToken,
    selectedSubtopics,
  ]);

  return (
    <TooltipProvider>
      <div className="px-6 py-6 space-y-6">
        {/* ── Header ── */}
        <div className="space-y-4">
          <PageHeader
            title="Practice Generator"
            description="Configure your VCE revision session"
            actions={
              <FilterGroup>
                <FilterButton
                  active={questionMode === 'written'}
                  onClick={() => onSetQuestionMode('written')}
                >
                  <BookOpen className="w-3.5 h-3.5 mr-1.5" /> Written
                </FilterButton>
                <FilterButton
                  active={questionMode === 'multiple-choice'}
                  onClick={() => onSetQuestionMode('multiple-choice')}
                >
                  <Target className="w-3.5 h-3.5 mr-1.5" /> Multiple Choice
                </FilterButton>
              </FilterGroup>
            }
          />
        </div>

        <div className="space-y-6">
          {/* ── Subjects ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <SectionLabel>Subjects</SectionLabel>
              {selectedTopics.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {selectedTopics.length} selected
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {TOPICS.map((topic) => {
                const isSelected = selectedTopics.includes(topic);
                return (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => onToggleTopic(topic)}
                    className={[
                      'flex items-center gap-2.5 px-3 py-3 rounded-md border text-sm font-medium text-left transition-all duration-150 cursor-pointer select-none',
                      isSelected
                        ? 'bg-primary/10 border-primary/50 text-primary shadow-sm'
                        : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-muted/30',
                    ].join(' ')}
                  >
                    <span className="shrink-0">
                      {TOPIC_ICONS[topic] ?? <BookOpen className="w-4 h-4" />}
                    </span>
                    <span className="flex-1 leading-tight">{topic}</span>
                    {isSelected && (
                      <CheckCheck className="w-3.5 h-3.5 shrink-0 opacity-70" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Difficulty ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <SectionLabel>Difficulty</SectionLabel>
              <span
                className={`text-xs font-semibold ${DIFFICULTY_META[difficulty].color}`}
              >
                {DIFFICULTY_META[difficulty].desc}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {(
                [
                  'Essential Skills',
                  'Easy',
                  'Medium',
                  'Hard',
                  'Extreme',
                ] as Difficulty[]
              ).map((level) => {
                const isSelected = difficulty === level;
                const meta = DIFFICULTY_META[level];
                return (
                  <Tooltip key={level}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => onSetDifficulty(level)}
                        className={[
                          'flex flex-col items-center gap-1 py-2.5 px-1 rounded-md border text-center transition-all duration-150 cursor-pointer',
                          isSelected
                            ? `${meta.bg} shadow-sm`
                            : 'border-border hover:border-primary/40 hover:bg-muted/30',
                        ].join(' ')}
                      >
                        <span
                          className={`text-xs font-bold leading-tight ${isSelected ? meta.color : 'text-muted-foreground'}`}
                        >
                          {meta.label}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p className="text-xs">{meta.desc}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>

          {/* ── Advanced Options ── */}
          <div>
            <AdvancedOptionsAccordion
              questionMode={questionMode}
              questionCount={questionCount}
              onSetQuestionCount={onSetQuestionCount}
              averageMarksPerQuestion={averageMarksPerQuestion}
              onSetAverageMarksPerQuestion={onSetAverageMarksPerQuestion}
              selectedTopics={selectedTopics}
              hasSubtopicSection={hasSubtopicSection}
              mathMethodsSubtopics={mathMethodsSubtopics}
              onToggleMathMethodsSubtopic={onToggleMathMethodsSubtopic}
              specialistMathSubtopics={specialistMathSubtopics}
              onToggleSpecialistMathSubtopic={onToggleSpecialistMathSubtopic}
              chemistrySubtopics={chemistrySubtopics}
              onToggleChemistrySubtopic={onToggleChemistrySubtopic}
              physicalEducationSubtopics={physicalEducationSubtopics}
              onTogglePhysicalEducationSubtopic={
                onTogglePhysicalEducationSubtopic
              }
              hasAnyMathTopic={hasAnyMathTopic}
              techMode={techMode}
              onSetTechMode={onSetTechMode}
              avoidSimilarQuestions={avoidSimilarQuestions}
              onSetAvoidSimilarQuestions={onSetAvoidSimilarQuestions}
              shuffleQuestions={shuffleQuestions}
              onSetShuffleQuestions={onSetShuffleQuestions}
              customFocusArea={customFocusArea}
              onSetCustomFocusArea={onSetCustomFocusArea}
              aiDifficultyScalingEnabled={aiDifficultyScalingEnabled}
              onSetAiDifficultyScalingEnabled={onSetAiDifficultyScalingEnabled}
              difficultyThresholds={difficultyThresholds}
              onSetDifficultyThresholds={onSetDifficultyThresholds}
            />
          </div>

          {/* ── Presets ── */}
          <div className="space-y-2">
            <SectionLabel>Presets</SectionLabel>
            <PresetSection
              selectedTopics={selectedTopics}
              difficulty={difficulty}
              techMode={techMode}
              avoidSimilarQuestions={avoidSimilarQuestions}
              mathMethodsSubtopics={mathMethodsSubtopics}
              specialistMathSubtopics={specialistMathSubtopics}
              chemistrySubtopics={chemistrySubtopics}
              physicalEducationSubtopics={physicalEducationSubtopics}
              questionCount={questionCount}
              averageMarksPerQuestion={averageMarksPerQuestion}
              questionMode={questionMode}
              aiDifficultyScalingEnabled={aiDifficultyScalingEnabled}
              difficultyThresholds={difficultyThresholds}
            />
          </div>

          {/* ── API key warning ── */}
          {!hasApiKey && (
            <div className="flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-500/5 px-3 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <p className="text-xs text-amber-700 dark:text-amber-400 leading-snug">
                  <strong>API key missing.</strong> Configure your OpenRouter
                  key in Settings before generating.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate('/settings')}
                >
                  Open Settings
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer / Generate ── */}
        <div className="border-t pt-4 space-y-1">
          {/* Session Summary */}
          {!isGenerating && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Session Summary
              </p>

              {/* Subjects row */}
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wide w-14 shrink-0 pt-0.5">
                  Subjects
                </span>
                <div className="flex flex-wrap gap-1 flex-1">
                  {selectedTopics.length === 0 ? (
                    <span className="text-[11px] font-medium text-amber-500 dark:text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> None selected
                    </span>
                  ) : (
                    selectedTopics.map((t) => (
                      <span
                        key={t}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-medium text-[11px]"
                      >
                        {TOPIC_ICONS[t as Topic] && (
                          <span className="opacity-70">
                            {TOPIC_ICONS[t as Topic]}
                          </span>
                        )}
                        {t}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Details pills */}
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
                <span className="flex items-center gap-1">
                  <span className="text-muted-foreground/60">Difficulty</span>
                  <span
                    className={`font-semibold ${DIFFICULTY_META[difficulty].color}`}
                  >
                    {DIFFICULTY_META[difficulty].label}
                  </span>
                </span>
                <span className="text-border">·</span>
                <span className="flex items-center gap-1">
                  <span className="text-muted-foreground/60">Questions</span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {questionCount}
                  </span>
                </span>
                {questionMode === 'written' && (
                  <>
                    <span className="text-border">·</span>
                    <span className="flex items-center gap-1">
                      <span className="text-muted-foreground/60">
                        Avg marks
                      </span>
                      <span className="font-semibold text-foreground tabular-nums">
                        {averageMarksPerQuestion}
                      </span>
                    </span>
                  </>
                )}
                <span className="text-border">·</span>
                <span
                  className={`font-semibold ${questionMode === 'written' ? 'text-sky-600 dark:text-sky-400' : 'text-violet-600 dark:text-violet-400'}`}
                >
                  {questionMode === 'written' ? 'Written' : 'MC'}
                </span>
              </div>

              {/* Cost estimate */}
              <div className="flex items-center justify-between text-[11px] border-t border-border/40 pt-1.5">
                <span className="text-muted-foreground/70 tabular-nums flex items-center gap-1">
                  <Coins className="w-3 h-3" />~
                  {estimated.totalTokens.toLocaleString()} tokens
                  {estimated.confidence != null && (
                    <span
                      className={[
                        'text-[10px] px-1.5 mx-1 rounded',
                        estimated.confidence > 0.7
                          ? 'bg-green-100 text-green-700'
                          : estimated.confidence > 0.4
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700',
                      ].join(' ')}
                    >
                      {Math.round(estimated.confidence * 100)}%
                    </span>
                  )}
                </span>
                {estimated.promptCost != null ||
                  estimated.completionCost != null ? (
                  <span className="font-semibold text-foreground tabular-nums flex items-center gap-1">
                    <DollarSign className="w-3 h-3 text-muted-foreground" />
                    {formatCostUsd(estimated.totalCost)}
                  </span>
                ) : (
                  <span className="text-muted-foreground/50 text-[10px]">
                    cost unavailable
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Generate button */}
          <div className="mt-2">
            <Button
              size="lg"
              className="w-full h-10 text-sm font-bold gap-2 transition-all duration-200"
              onClick={onGenerate}
              disabled={!canGenerate}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {showBatchTimeline
                    ? `Generating… (${batchProgress.filter((e) => e.status === 'done').length + batchProgress.filter((e) => e.status === 'error').length}/${batchProgress.length})`
                    : 'Crafting questions…'}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate
                </>
              )}
            </Button>
          </div>

          {/* Generation timeline */}
          {isGenerating &&
            (showBatchTimeline ? (
              <BatchTimeline
                entries={batchProgress}
                formattedElapsedTime={formattedElapsedTime}
                streamText={streamText}
                isGenerating={isGenerating}
                isPaused={isPaused}
                onTogglePause={onTogglePause}
              />
            ) : (
              <GenerationTimeline
                generationStatus={generationStatus}
                formattedElapsedTime={formattedElapsedTime}
                streamText={streamText}
                isGenerating={isGenerating}
                isPaused={isPaused}
                onTogglePause={onTogglePause}
              />
            ))}

          {!isGenerating &&
            generationStatus?.stage !== 'completed' &&
            lastGenerationTelemetry && (
              <LastGenerationStats telemetry={lastGenerationTelemetry} />
            )}
        </div>
      </div>
    </TooltipProvider>
  );
}

export const SetupPanel = memo(SetupPanelImpl);
