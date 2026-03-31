import {
  Loader2,
  BookOpen,
  Target,
  Sparkles,
  Calculator,
  Pen,
  Clock3,
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
  FileText,
  Trash2,
  Edit3,
  MoreHorizontal,
  Plus,
  Save,
  TrendingUp,
  LayoutGrid,
  CheckCircle2,
  Timer,
  Zap,
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
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
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
  MATH_METHODS_SUBTOPICS,
  MathMethodsSubtopic,
  SPECIALIST_MATH_SUBTOPICS,
  SpecialistMathSubtopic,
  CHEMISTRY_SUBTOPICS,
  ChemistrySubtopic,
  PHYSICAL_EDUCATION_SUBTOPICS,
  PhysicalEducationSubtopic,
  Difficulty,
  QuestionMode,
  GenerationMode,
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
} from '../ui/dropdown-menu';
import { ButtonGroup } from '../ui/button-group';
import { cn } from '@/lib/utils';

export type { BatchTopicProgress } from '@/types';

// ─── Topic icon map ───────────────────────────────────────────────────────────

const TOPIC_ICONS: Partial<Record<Topic, React.ReactNode>> = {
  'Mathematical Methods': <FunctionSquare className="w-4 h-4" />,
  'Specialist Mathematics': <SigmaSquare className="w-4 h-4" />,
  Chemistry: <FlaskConical className="w-4 h-4" />,
  'Physical Education': <Dumbbell className="w-4 h-4" />,
};

// ─── Exam PDF mapping ─────────────────────────────────────────────────────────

const TOPIC_EXAM_PDFS: Record<Topic, string[]> = {
  'Mathematical Methods': ['2025-MathMethods1.pdf', '2025-MathMethods2.pdf'],
  'Specialist Mathematics': [
    '2025-SpecialistMaths1.pdf',
    '2025-SpecialistMaths2.pdf',
  ],
  Chemistry: ['2025-Chemistry.pdf'],
  'Physical Education': ['2025-PhysicalEducation.pdf'],
};

function getExamPdfsForTopics(topics: Topic[]): string[] {
  const pdfs = new Set<string>();
  for (const topic of topics) {
    for (const pdf of TOPIC_EXAM_PDFS[topic] ?? []) pdfs.add(pdf);
  }
  return Array.from(pdfs);
}

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
    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
      {children}
    </p>
  );
}

export function SectionDivider() {
  return <Separator className="my-3" />;
}

// ─── Subtopic chip group ──────────────────────────────────────────────────────

function SubtopicGroup({
  label,
  hint,
  items,
  selected,
  onToggle,
}: {
  label: string;
  hint?: string;
  items: readonly string[];
  selected: string[];
  onToggle: (item: string) => void;
}) {
  return (
    <div className="mt-4">
      <div className="flex items-baseline gap-2">
        <p className="text-xs font-semibold">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex flex-wrap gap-1">
        {items.map((item) => {
          const active = selected.includes(item);
          return (
            <button
              key={item}
              type="button"
              onClick={() => onToggle(item)}
              className={[
                'text-xs px-2.5 py-1 rounded-md border transition-all duration-150 cursor-pointer select-none',
                active
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
              ].join(' ')}
            >
              {item}
            </button>
          );
        })}
      </div>
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
    <div className="flex items-start justify-between gap-2 py-2.5 px-3 rounded-md border border-border bg-muted/20">
      <div className="flex items-start gap-2.5 min-w-0">
        <span
          className={`mt-0.5 shrink-0 ${checked ? 'text-primary' : 'text-muted-foreground'}`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <Label htmlFor={id} className="text-xs font-semibold cursor-pointer">
            {label}
          </Label>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
            {description}
          </p>
        </div>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="shrink-0 mt-0.5"
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
      className="rounded-md border border-border overflow-hidden"
    >
      <AccordionItem value="advanced" className="border-0">
        <AccordionTrigger className="px-4 py-3 hover:bg-muted/30 hover:no-underline data-[state=open]:bg-muted/20">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
              <BarChart3 className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold">Advanced Options</p>
              <p className="text-[11px] text-muted-foreground font-normal">
                Question count, focus areas, calculator mode & more
              </p>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 h-min mb-4">
          {/* ── Session Size ── */}
          <div className="space-y-1 pt-2">
            <SectionLabel>Session Size</SectionLabel>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5" /> Questions
                </Label>
                <Badge variant="secondary" className="tabular-nums">
                  {questionCount}
                </Badge>
              </div>
              <Slider
                min={1}
                max={20}
                step={1}
                value={[questionCount]}
                onValueChange={(val) => onSetQuestionCount(val[0])}
                className="py-1"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>1</span>
                <span>20</span>
              </div>
            </div>

            {selectedTopics.length > 1 && (
              <div className="flex items-center gap-2.5 px-2.5 py-1 rounded-full bg-muted/20 border border-border/40 w-fit max-w-full">
                <span className="text-[9px] font-bold text-muted-foreground/70 uppercase tracking-widest border-r border-border/50 pr-2.5 h-3 flex items-center shrink-0 leading-none">
                  Topics
                </span>
                <div className="flex items-center gap-3.5 overflow-x-auto no-scrollbar">
                  {selectedTopics.map((topic, i) => {
                    const count =
                      Math.floor(questionCount / selectedTopics.length) +
                      (i < questionCount % selectedTopics.length ? 1 : 0);
                    return (
                      <div
                        key={topic}
                        className="flex items-center gap-1.5 shrink-0"
                      >
                        <span className="text-muted-foreground/80 w-3 h-3 flex items-center justify-center shrink-0">
                          {TOPIC_ICONS[topic]}
                        </span>
                        <div className="flex items-center gap-1 text-[11px] leading-none">
                          <span className="font-medium text-foreground/70 truncate">
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
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5" /> Avg marks / question
                  </Label>
                  <Badge variant="secondary" className="tabular-nums">
                    {averageMarksPerQuestion}
                  </Badge>
                </div>
                <Slider
                  min={1}
                  max={15}
                  step={1}
                  value={[averageMarksPerQuestion]}
                  onValueChange={(val) => onSetAverageMarksPerQuestion(val[0])}
                  className="py-1"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>1</span>
                  <span>15</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/30 border border-border/60">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5" /> Avg marks / question
                </Label>
                <Badge variant="outline" className="text-muted-foreground">
                  1 mark (fixed)
                </Badge>
              </div>
            )}
          </div>

          <SectionDivider />

          {/* ── Focus Areas ── */}
          {hasSubtopicSection && (
            <div className="space-y-1">
              <SectionLabel>
                Focus Areas{' '}
                <span className="ml-1 normal-case font-normal tracking-normal text-muted-foreground/70">
                  — leave blank to cover all
                </span>
              </SectionLabel>
              {selectedTopics.includes('Mathematical Methods') && (
                <SubtopicGroup
                  label="Mathematical Methods"
                  hint="Unit 3/4"
                  items={MATH_METHODS_SUBTOPICS}
                  selected={mathMethodsSubtopics}
                  onToggle={onToggleMathMethodsSubtopic as (s: string) => void}
                />
              )}
              {selectedTopics.includes('Specialist Mathematics') && (
                <SubtopicGroup
                  label="Specialist Mathematics"
                  hint="Unit 1/2"
                  items={SPECIALIST_MATH_SUBTOPICS}
                  selected={specialistMathSubtopics}
                  onToggle={
                    onToggleSpecialistMathSubtopic as (s: string) => void
                  }
                />
              )}
              {selectedTopics.includes('Chemistry') && (
                <SubtopicGroup
                  label="Chemistry"
                  hint="Unit 1/2"
                  items={CHEMISTRY_SUBTOPICS}
                  selected={chemistrySubtopics}
                  onToggle={onToggleChemistrySubtopic as (s: string) => void}
                />
              )}
              {selectedTopics.includes('Physical Education') && (
                <SubtopicGroup
                  label="Physical Education"
                  hint="Unit 3/4"
                  items={PHYSICAL_EDUCATION_SUBTOPICS}
                  selected={physicalEducationSubtopics}
                  onToggle={
                    onTogglePhysicalEducationSubtopic as (s: string) => void
                  }
                />
              )}
              <SectionDivider />
            </div>
          )}

          {/* ── Calculator Mode ── */}
          {hasAnyMathTopic && (
            <div className="space-y-1">
              <SectionLabel>Calculator Mode</SectionLabel>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    {
                      value: 'tech-free' as TechMode,
                      label: 'Tech-Free',
                      icon: <Pen className="w-3.5 h-3.5" />,
                    },
                    {
                      value: 'mix' as TechMode,
                      label: 'Mixed',
                      icon: <Blend className="w-3.5 h-3.5" />,
                    },
                    {
                      value: 'tech-active' as TechMode,
                      label: 'Tech-Active',
                      icon: <Calculator className="w-3.5 h-3.5" />,
                    },
                  ] as const
                ).map(({ value, label, icon }) => {
                  const isActive = techMode === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onSetTechMode(value)}
                      className={[
                        'flex items-center justify-center gap-1.5 py-2 px-2 rounded-md border text-xs font-medium transition-all duration-150 cursor-pointer',
                        isActive
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                      ].join(' ')}
                    >
                      {icon} {label}
                    </button>
                  );
                })}
              </div>
              <SectionDivider />
            </div>
          )}

          {/* ── Options ── */}
          <div className="space-y-1">
            <SectionLabel>Options</SectionLabel>
            <ToggleRow
              id="avoid-similar"
              icon={<Shuffle className="w-4 h-4" />}
              label="Avoid Similar Questions"
              description="Steers the model away from repeating recently seen question types."
              checked={avoidSimilarQuestions}
              onCheckedChange={onSetAvoidSimilarQuestions}
            />
            {selectedTopics.length > 1 && (
              <ToggleRow
                id="shuffle-questions"
                icon={<Shuffle className="w-4 h-4" />}
                label="Shuffle Questions"
                description="Randomly interleaves questions from all subjects after generation."
                checked={shuffleQuestions}
                onCheckedChange={onSetShuffleQuestions}
              />
            )}
            <div className="space-y-1.5 pt-1">
              <Label className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                <Crosshair className="w-3.5 h-3.5" />
                Custom Focus Area
                <span className="font-normal opacity-70">— optional</span>
              </Label>
              <Input
                value={customFocusArea}
                onChange={(e) => onSetCustomFocusArea(e.target.value)}
                maxLength={160}
                placeholder="e.g. projectile motion with optimisation constraints"
                className="text-xs h-8"
              />
            </div>
          </div>

          <SectionDivider />

          {/* ── AI Difficulty Scaling ── */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <SectionLabel>AI Difficulty Scaling</SectionLabel>
              <Badge
                variant="outline"
                className={
                  aiDifficultyScalingEnabled
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : ''
                }
              >
                {aiDifficultyScalingEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <ToggleRow
              id="ai-scaling"
              icon={<TrendingUp className="w-4 h-4" />}
              label="Adaptive difficulty"
              description="AI adjusts question difficulty based on your recent performance."
              checked={aiDifficultyScalingEnabled}
              onCheckedChange={onSetAiDifficultyScalingEnabled}
            />
            {aiDifficultyScalingEnabled && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">
                    Increase threshold (%)
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={difficultyThresholds.increase}
                    onChange={(e) =>
                      onSetDifficultyThresholds({
                        ...difficultyThresholds,
                        increase: parseInt(e.target.value) || 85,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">
                    Decrease threshold (%)
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={difficultyThresholds.decrease}
                    onChange={(e) =>
                      onSetDifficultyThresholds({
                        ...difficultyThresholds,
                        decrease: parseInt(e.target.value) || 70,
                      })
                    }
                  />
                </div>
              </div>
            )}
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
  generationMode: GenerationMode;
  examTimeLimitMinutes: number;
  subtopicInstructions: Record<string, string>;
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
    generationMode: props.generationMode,
    examTimeLimitMinutes: props.examTimeLimitMinutes,
    subtopicInstructions: props.subtopicInstructions,
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
  generationMode,
  examTimeLimitMinutes,
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
  generationMode: GenerationMode;
  examTimeLimitMinutes: number;
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
  const setGenerationMode = useAppStore((s) => s.setGenerationMode);
  const setExamTimeLimitMinutes = useAppStore((s) => s.setExamTimeLimitMinutes);
  const setAiDifficultyScalingEnabled = useAppStore(
    (s) => s.setAiDifficultyScalingEnabled
  );
  const setDifficultyThresholds = useAppStore((s) => s.setDifficultyThresholds);
  const subtopicInstructions = useAppStore((s) => s.subtopicInstructions);

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
      generationMode,
      examTimeLimitMinutes,
      subtopicInstructions,
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
    setGenerationMode(p.generationMode ?? 'practice');
    setExamTimeLimitMinutes(p.examTimeLimitMinutes ?? 30);
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
      generationMode,
      examTimeLimitMinutes,
      subtopicInstructions,
      aiDifficultyScalingEnabled,
      difficultyThresholds,
    });
    updatePreset({ ...preset, preferences: prefs, updatedAt: now });
  };

  return (
    <div className="space-y-1">
      {/* Save new preset */}
      <div className="flex items-center gap-1">
        <Input
          id="preset-name"
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          placeholder="New preset name…"
          className="h-8 flex-1 bg-muted/50 text-xs"
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
            return (
              <div
                key={preset.id}
                className={[
                  'group flex items-center justify-between rounded-md px-3 py-2 transition-colors',
                  isRenaming
                    ? 'bg-accent/50 ring-1 ring-ring/20'
                    : 'hover:bg-accent cursor-pointer',
                ].join(' ')}
                onClick={() => !isRenaming && handleLoadPreset(preset)}
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
                        {DIFFICULTY_META[preset.preferences.difficulty]?.label}
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
  generationMode: GenerationMode;
  onSetGenerationMode: (mode: GenerationMode) => void;
  examTimeLimitMinutes: number;
  onSetExamTimeLimitMinutes: (minutes: number) => void;
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
  includeExamContext?: boolean;
};

// ─── Component ────────────────────────────────────────────────────────────────

function SetupPanelImpl({
  questionMode,
  onSetQuestionMode,
  generationMode,
  onSetGenerationMode,
  examTimeLimitMinutes,
  onSetExamTimeLimitMinutes,
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
  includeExamContext = false,
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

  const examPresets = [
    { label: 'Quick Sprint', count: 5, time: 15 },
    { label: 'Standard', count: 10, time: 30 },
    { label: 'Deep Dive', count: 15, time: 60 },
    { label: 'Marathon', count: 20, time: 90 },
  ];

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
      <div className="pb-12">
        {/* ── Header ── */}
        <div className="p-6 pb-4">
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

        <div className="px-6 space-y-1">
          {/* ── Subjects ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
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

            {includeExamContext && selectedTopics.length > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-violet-500/20 bg-violet-500/5 p-3">
                <FileText className="w-3.5 h-3.5 text-violet-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-violet-700 dark:text-violet-300">
                    Exam PDF context enabled
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {getExamPdfsForTopics(selectedTopics).map((pdf) => (
                      <span
                        key={pdf}
                        className="inline-flex items-center px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-[10px] font-mono"
                      >
                        {pdf}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Mode ── */}
          <div>
            <SectionLabel>Mode</SectionLabel>
            <ButtonGroup className="flex flex-row w-full">
              <Button
                variant={generationMode === 'practice' ? 'default' : 'outline'}
                onClick={() => onSetGenerationMode('practice')}
                size="lg"
                className="flex-1 p-4"
              >
                <BookOpen className="w-3.5 h-3.5 mr-1.5" /> Practice
              </Button>
              <Button
                variant={generationMode === 'exam' ? 'default' : 'outline'}
                size="lg"
                onClick={() => onSetGenerationMode('exam')}
                className="flex-1 p-4"
              >
                <FileText className="w-3.5 h-3.5 mr-1.5" /> Exam
              </Button>
            </ButtonGroup>

            {generationMode === 'exam' && (
              <Card className="relative overflow-hidden border-border/40 bg-muted/10 my-3 transition-all duration-300">
                {/* Subtle background glow effect */}
                <div className="absolute -right-12 -top-12 h-32 w-32 rounded-md bg-primary/5 blur-3xl" />

                <CardContent className="px-5 py-3 space-y-2">
                  {/* Header Section */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold tracking-tight flex items-center gap-2">
                        <Timer className="w-4 h-4 text-primary" />
                        Exam Configuration
                      </h3>
                      <p className="text-[11px] text-muted-foreground">
                        Define your constraints or choose a preset
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="bg-primary/5 text-primary border-primary/20 px-2 py-1 font-mono text-xs"
                    >
                      {examTimeLimitMinutes}m : {questionCount}Q
                    </Badge>
                  </div>

                  {/* Manual Adjustment Section */}
                  <div className="space-y-4 rounded-xl bg-muted/20 p-4 border border-border/50">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground flex items-center gap-2">
                          <Clock3 className="w-3.5 h-3.5" />
                          Duration Limit
                        </Label>
                        <span className="text-xs font-medium">
                          {examTimeLimitMinutes} minutes
                        </span>
                      </div>

                      <Slider
                        min={5}
                        max={180}
                        step={5}
                        value={[examTimeLimitMinutes]}
                        onValueChange={(val) =>
                          onSetExamTimeLimitMinutes(val[0])
                        }
                        className="py-2"
                      />

                      <div className="flex justify-between px-1">
                        <span className="text-[10px] font-medium text-muted-foreground/60">
                          Short (5m)
                        </span>
                        <span className="text-[10px] font-medium text-muted-foreground/60">
                          Standard (60m)
                        </span>
                        <span className="text-[10px] font-medium text-muted-foreground/60">
                          Long (180m)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Quick Presets Grid */}
                  <div className="space-y-3">
                    <Label className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground flex items-center gap-2 px-1">
                      <Zap className="w-3.5 h-3.5" />
                      Rapid Presets
                    </Label>

                    <div className="grid grid-cols-2 gap-2">
                      {examPresets.map((preset) => {
                        const isActive =
                          questionCount === preset.count &&
                          examTimeLimitMinutes === preset.time;

                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => {
                              onSetQuestionCount(preset.count);
                              onSetExamTimeLimitMinutes(preset.time);
                            }}
                            className={cn(
                              'group relative flex flex-col gap-1 rounded-md border p-3 text-left transition-all duration-200',
                              isActive
                                ? 'border-primary shadow-inner'
                                : 'border-border bg-background hover:border-primary/50 hover:shadow-md'
                            )}
                          >
                            {isActive && (
                              <div className="absolute right-2 top-2">
                                <CheckCircle2 className="h-3 w-3 text-primary" />
                              </div>
                            )}

                            <span
                              className={cn(
                                'text-xs font-bold transition-colors',
                                isActive ? 'text-primary' : 'text-foreground'
                              )}
                            >
                              {preset.label}
                            </span>

                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <LayoutGrid className="w-2.5 h-2.5" />{' '}
                                {preset.count} Qs
                              </span>
                              <span className="h-1 w-1 rounded-md bg-border" />
                              <span>{preset.time} mins</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Difficulty ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
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

          {/* ── Presets ── */}
          <div>
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
              generationMode={generationMode}
              examTimeLimitMinutes={examTimeLimitMinutes}
              aiDifficultyScalingEnabled={aiDifficultyScalingEnabled}
              difficultyThresholds={difficultyThresholds}
            />
          </div>

          {/* ── Advanced Options ── */}
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
        <div className="pt-6 border-t mt-6 space-y-1">
          {/* Session Summary */}
          {!isGenerating && (
            <div className="px-6 space-y-1">
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
                  className={`font-semibold ${generationMode === 'exam' ? 'text-violet-600 dark:text-violet-400' : 'text-sky-600 dark:text-sky-400'}`}
                >
                  {generationMode === 'exam'
                    ? `Exam (${examTimeLimitMinutes}m)`
                    : 'Practice'}
                </span>
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
                        'text-[10px] px-1 rounded',
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
          <div className="px-6 mt-2">
            <Button
              size="lg"
              className="w-full h-11 text-sm font-bold gap-2 transition-all duration-200"
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
                  {generationMode === 'exam'
                    ? 'Generate Exam Set'
                    : 'Generate Question Set'}
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
