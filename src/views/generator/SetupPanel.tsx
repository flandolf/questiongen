import { invoke } from '@tauri-apps/api/core';
import { onAuthStateChanged } from 'firebase/auth';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  BookOpen,
  Calculator,
  Dumbbell,
  FlaskConical,
  FunctionSquare,
  Loader2,
  Pen,
  Search,
  SigmaSquare,
  Target,
  TestTubeDiagonal,
  X,
  Zap,
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAppSettings } from '@/AppContext';
import { PageHeader } from '@/components/layout/primitives';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { auth } from '@/context/modules/firebase-init';
import { estimateTokensAndCost, formatCostUsd } from '@/lib/app-utils';
import {
  fadeInUp,
  SPRING,
  SPRING_OVERSHOOT,
  staggerContainer,
} from '@/lib/motion';
import { normalizeDifficulty } from '@/lib/persistence';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store';
import type {
  BatchTopicProgress,
  CustomSubtopic,
  Difficulty,
  GenerationStatusEvent,
  GenerationSubCallProgress,
  GenerationTelemetry,
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
  toCanonicalSubtopicName,
  toScopedSubtopicGroups,
} from '@/types';

import { getModelsForProvider, getProviderLabel } from '../settings/constants';
import {
  BatchTimeline,
  GenerationTimeline,
  LastGenerationStats,
} from './GenerationTimeline';
import { PresetSection } from './PresetSection';

export type { BatchTopicProgress } from '@/types';

// ─── Precomputed subtopic groups ──────────────────────────────────────────────

const MATH_METHODS_SCOPED_SUBTOPIC_GROUPS = toScopedSubtopicGroups(
  MATH_METHODS_SUBTOPIC_GROUPS,
);

// ─── Topic icon map ───────────────────────────────────────────────────────────

const TOPIC_ICONS: Partial<Record<Topic, React.ReactNode>> = {
  'Mathematical Methods': <FunctionSquare className='w-4 h-4' />,
  'Specialist Mathematics': <SigmaSquare className='w-4 h-4' />,
  Chemistry: <FlaskConical className='w-4 h-4' />,
  Biology: <TestTubeDiagonal className='w-4 h-4' />,
  'Physical Education': <Dumbbell className='w-4 h-4' />,
  'General Mathematics': <Calculator className='w-4 h-4' />,
};

// ─── Difficulty metadata ──────────────────────────────────────────────────────

const DIFFICULTY_META: Record<
  Difficulty,
  {
    label: string;
    color: string;
    bg: string;
    border: string;
    desc: string;
    width: string;
    themeColor: string;
    pill: string;
  }
> = {
  'Essential Skills': {
    label: 'Essential',
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    desc: 'Core concepts',
    width: '20%',
    themeColor: '#10b981',
    pill: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
  },
  Easy: {
    label: 'Easy',
    color: 'text-sky-600 dark:text-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/30',
    desc: 'Straightforward',
    width: '40%',
    themeColor: '#0ea5e9',
    pill: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/25',
  },
  Medium: {
    label: 'Medium',
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    desc: 'Balanced',
    width: '60%',
    themeColor: '#f59e0b',
    pill: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25',
  },
  Hard: {
    label: 'Hard',
    color: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    desc: 'Complex',
    width: '80%',
    themeColor: '#f97316',
    pill: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/25',
  },
  Extreme: {
    label: 'Extreme',
    color: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    desc: 'Edge cases',
    width: '100%',
    themeColor: '#f43f5e',
    pill: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/25',
  },
};

type GlowTone = 'quiet' | 'active' | 'strong' | 'cta';
type GlowAnchor = 'center' | 'top' | 'bottom' | 'left' | 'right';

const GLOW_KEYFRAMES = `
  @keyframes pulse-glow {
    0%, 100% {
      opacity: 0.92;
      filter: saturate(1) brightness(1);
    }
    50% {
      opacity: 1;
      filter: saturate(1.08) brightness(1.03);
    }
  }
`;

const GLOW_SHADOWS: Record<GlowTone, (color: string) => string> = {
  quiet: (color) =>
    `0 0 0 1px color-mix(in srgb, ${color} 10%, transparent), 0 8px 18px -16px color-mix(in srgb, ${color} 38%, transparent)`,
  active: (color) =>
    `0 0 0 1px color-mix(in srgb, ${color} 18%, transparent), 0 12px 24px -18px color-mix(in srgb, ${color} 50%, transparent), inset 0 1px 0 color-mix(in srgb, ${color} 8%, transparent)`,
  strong: (color) =>
    `0 0 0 1px color-mix(in srgb, ${color} 24%, transparent), 0 0 16px -6px color-mix(in srgb, ${color} 38%, transparent), 0 16px 32px -22px color-mix(in srgb, ${color} 55%, transparent)`,
  cta: (color) =>
    `0 0 0 1px color-mix(in srgb, ${color} 30%, transparent), 0 0 18px -6px color-mix(in srgb, ${color} 55%, transparent), 0 14px 28px -16px color-mix(in srgb, ${color} 65%, transparent)`,
};

function glowStyle(
  color: string,
  tone: GlowTone = 'active',
): React.CSSProperties {
  return { boxShadow: GLOW_SHADOWS[tone](color) };
}

function auraBackground(
  color: string,
  anchor: GlowAnchor = 'center',
  strength = 12,
) {
  const anchors: Record<GlowAnchor, string> = {
    center: '50% 50%',
    top: '50% 0%',
    bottom: '50% 100%',
    left: '0% 50%',
    right: '100% 50%',
  };

  return [
    `radial-gradient(ellipse at ${anchors[anchor]}, color-mix(in srgb, ${color} ${strength}%, transparent), transparent 66%)`,
    `linear-gradient(135deg, color-mix(in srgb, ${color} ${Math.max(strength - 7, 3)}%, transparent), transparent 52%)`,
  ].join(', ');
}

function GlowAura({
  color,
  anchor = 'center',
  strength = 12,
  className,
  pulse = false,
}: {
  color: string;
  anchor?: GlowAnchor;
  strength?: number;
  className?: string;
  pulse?: boolean;
}) {
  return (
    <motion.div
      aria-hidden='true'
      className={cn('absolute inset-0 z-0 pointer-events-none', className)}
      initial={false}
      animate={pulse ? { opacity: [0.8, 1, 0.8] } : { opacity: 1 }}
      transition={
        pulse
          ? { duration: 4, repeat: Infinity, ease: 'easeInOut' }
          : { duration: 0.4 }
      }
      style={{ background: auraBackground(color, anchor, strength) }}
    />
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

type SetupPanelProps = {
  questionMode: QuestionMode;
  onSetQuestionMode: (mode: QuestionMode) => void;
  selectedTopics: Topic[];
  onToggleTopic: (topic: Topic) => void;
  selectedSubtopics: Record<string, string[]>;
  onToggleSubtopic: (topic: Topic, sub: string | string[]) => void;
  techMode: TechMode;
  onSetTechMode: (mode: TechMode) => void;
  customFocusArea: string;
  onSetCustomFocusArea: (value: string) => void;
  diversityEnabled: boolean;
  onSetDiversityEnabled: (enabled: boolean) => void;
  strictLatexValidation: boolean;
  onSetStrictLatexValidation: (enabled: boolean) => void;
  difficulty: Difficulty;
  onSetDifficulty: (level: Difficulty) => void;
  questionCount: number;
  onSetQuestionCount: (count: number) => void;
  averageMarksPerQuestion: number;
  onSetAverageMarksPerQuestion: (marks: number) => void;
  avoidSimilarQuestions: boolean;
  onSetAvoidSimilarQuestions: (enabled: boolean) => void;
  hasApiKey: boolean;
  canGenerate: boolean;
  isGenerating: boolean;
  isPaused: boolean;
  onTogglePause: () => void;
  onAbort: () => void;
  generationStatus: GenerationStatusEvent | null;
  generationStartedAt: number | null;
  formattedElapsedTime: string;
  onGenerate: () => void;
  onStartOver: () => void;
  lastGenerationTelemetry?: GenerationTelemetry | null;
  streamText?: string;
  batchProgress?: BatchTopicProgress[];
  generationStrategy?: 'single-pass' | 'multi-pass';
  generationSubCallProgress?: GenerationSubCallProgress | null;
};

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
  diversityEnabled: boolean;
  onSetDiversityEnabled: (enabled: boolean) => void;
  strictLatexValidation: boolean;
  onSetStrictLatexValidation: (enabled: boolean) => void;
  themeColor?: string;
};

const EMPTY_BATCH_PROGRESS: BatchTopicProgress[] = [];

function GroupedSubtopicSelector({
  label,
  groups,
  selected,
  onToggle,
  themeColor = '#f59e0b',
}: {
  label: string;
  groups: readonly TopicSubtopicGroup[];
  selected: string[];
  onToggle: (item: string | string[]) => void;
  themeColor?: string;
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

  const [searchTerm, setSearchTerm] = useState('');

  const filteredGroups = useMemo(() => {
    if (!searchTerm.trim()) return groups;
    const lowerSearch = searchTerm.toLowerCase();
    return groups
      .map((group) => ({
        ...group,
        subtopics: group.subtopics.filter(
          (s) =>
            toCanonicalSubtopicName(s).toLowerCase().includes(lowerSearch) ||
            group.aos.toLowerCase().includes(lowerSearch),
        ),
      }))
      .filter((group) => group.subtopics.length > 0);
  }, [groups, searchTerm]);

  const toggleSelectAllInUnit = (unit: string) => {
    const unitGroups = (searchTerm.trim() ? filteredGroups : groups).filter(
      (g) => g.unit === unit,
    );
    const allSubtopics = unitGroups.flatMap((g) => g.subtopics);

    const toSelect = allSubtopics.filter((s) => !selected.includes(s));
    if (toSelect.length > 0) {
      onToggle(toSelect);
      return;
    }

    const toDeselect = allSubtopics.filter((s) => selected.includes(s));
    onToggle(toDeselect);
  };

  const toggleSelectAllInGroup = (group: TopicSubtopicGroup) => {
    const toSelect = group.subtopics.filter((s) => !selected.includes(s));
    if (toSelect.length > 0) {
      onToggle(toSelect);
      return;
    }

    const toDeselect = group.subtopics.filter((s) => selected.includes(s));
    onToggle(toDeselect);
  };

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
    [groups],
  );

  const visibleGroups = useMemo(() => {
    if (searchTerm.trim()) return filteredGroups;
    return groups.filter((group) => selectedUnits.has(group.unit));
  }, [groups, selectedUnits, searchTerm, filteredGroups]);

  const unitsWithMatches = useMemo(() => {
    if (!searchTerm.trim()) return new Set(units);
    return new Set(filteredGroups.map((g) => g.unit));
  }, [filteredGroups, searchTerm, units]);

  return (
    <div className='flex flex-col gap-6 w-full'>
      <div className='flex flex-col gap-4'>
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
          <h3 className='text-sm font-bold text-foreground'>{label}</h3>
          <div className='relative w-full sm:w-64'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground' />
            <input
              type='text'
              placeholder='Search subtopics...'
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label='Search subtopics'
              className='w-full h-9 pl-9 pr-8 text-xs rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all'
            />
            {searchTerm && (
              <button
                type='button'
                onClick={() => setSearchTerm('')}
                aria-label='Clear search'
                className='absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground'
              >
                <X className='h-3.5 w-3.5' />
              </button>
            )}
          </div>
        </div>

        {/* High-density Unit Selector Cards */}
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
          {units.map((unit) => {
            const hasMatches = unitsWithMatches.has(unit);
            if (!hasMatches && searchTerm.trim()) return null;

            const isActive = searchTerm.trim() || selectedUnits.has(unit);
            const unitGroups = groups.filter((g) => g.unit === unit);
            const totalSubs = unitGroups.reduce(
              (sum, g) => sum + g.subtopics.length,
              0,
            );
            const selectedCount = unitGroups.reduce(
              (sum, g) =>
                sum + g.subtopics.filter((s) => selected.includes(s)).length,
              0,
            );

            return (
              <motion.button
                key={unit}
                type='button'
                onClick={() => toggleUnit(unit)}
                whileHover={{ y: -1.5 }}
                whileTap={{ scale: 0.97 }}
                transition={SPRING_OVERSHOOT}
                className={cn(
                  'group relative flex items-center justify-between p-3 rounded-xl transition-all border overflow-hidden',
                  isActive
                    ? 'border-transparent'
                    : 'bg-card border-border hover:bg-muted/50 text-muted-foreground',
                )}
                style={
                  isActive
                    ? {
                        backgroundColor: `color-mix(in srgb, ${themeColor} 6%, transparent)`,
                        borderColor: `color-mix(in srgb, ${themeColor} 22%, transparent)`,
                        ...glowStyle(themeColor, 'quiet'),
                      }
                    : undefined
                }
              >
                {isActive && (
                  <GlowAura color={themeColor} anchor='left' strength={5} />
                )}

                <div className='flex flex-col items-start relative z-10'>
                  <span
                    className={cn(
                      'font-bold text-xs',
                      isActive ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {unit}
                  </span>
                  <motion.span
                    animate={{
                      scale: selectedCount > 0 ? [1, 1.1, 1] : 1,
                    }}
                    transition={{ duration: 0.2 }}
                    className={cn(
                      'text-[10px] tabular-nums',
                      selectedCount > 0
                        ? 'text-primary/70 font-bold'
                        : 'text-muted-foreground/40',
                    )}
                  >
                    {selectedCount}/{totalSubs}
                  </motion.span>
                </div>

                <div
                  role='button'
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    toggleSelectAllInUnit(unit);
                  }}
                  className='cursor-pointer text-[10px] font-bold text-muted-foreground/50 hover:text-foreground px-2 py-1 rounded bg-muted/30 hover:bg-muted transition-colors relative z-10'
                >
                  ALL
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode='popLayout'>
        {visibleGroups.length > 0 && (
          <motion.div
            initial='hidden'
            animate='visible'
            exit={{ opacity: 0, y: 10 }}
            variants={staggerContainer}
            className='grid grid-cols-1 lg:grid-cols-2 gap-4'
          >
            {visibleGroups.map((group) => {
              const selectedCount = group.subtopics.filter((s) =>
                selected.includes(s),
              ).length;
              const allSelected = selectedCount === group.subtopics.length;

              return (
                <motion.div
                  layout
                  key={group.groupId}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    boxShadow: allSelected
                      ? GLOW_SHADOWS.active(themeColor)
                      : '0 0 0px transparent',
                  }}
                  exit={{ opacity: 0, y: 8 }}
                  className={cn(
                    'flex flex-col gap-3 p-4 rounded-xl border transition-colors relative overflow-hidden',
                    allSelected
                      ? 'border-transparent'
                      : 'bg-card border-border',
                  )}
                  style={
                    allSelected
                      ? {
                          backgroundColor: `color-mix(in srgb, ${themeColor} 5%, transparent)`,
                          borderColor: `color-mix(in srgb, ${themeColor} 24%, transparent)`,
                        }
                      : undefined
                  }
                  whileHover={{ y: -1 }}
                  transition={SPRING}
                >
                  {allSelected && (
                    <GlowAura color={themeColor} anchor='top' strength={6} />
                  )}
                  <div className='flex items-center justify-between relative z-10'>
                    <h4 className='text-xs font-bold text-foreground leading-tight'>
                      {group.aos}
                    </h4>
                    <motion.button
                      type='button'
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelectAllInGroup(group);
                      }}
                      whileTap={{ scale: 0.93 }}
                      transition={SPRING_OVERSHOOT}
                      className='text-[10px] font-bold text-muted-foreground/40 hover:text-foreground bg-muted/30 hover:bg-muted px-2 py-1 rounded transition-colors shrink-0'
                    >
                      {allSelected ? 'CLEAR' : 'SELECT ALL'}
                    </motion.button>
                  </div>

                  <motion.div
                    className='flex flex-wrap gap-1.5 relative z-10'
                    variants={staggerContainer}
                    initial='hidden'
                    animate='visible'
                  >
                    {group.subtopics.map((subtopic, chipIdx) => {
                      const isSelected = selected.includes(subtopic);
                      return (
                        <motion.button
                          key={subtopic}
                          type='button'
                          variants={fadeInUp}
                          custom={chipIdx}
                          whileHover={{ scale: 1.05, y: -1 }}
                          whileTap={{ scale: 0.93 }}
                          transition={SPRING_OVERSHOOT}
                          onClick={() => onToggle(subtopic)}
                          className={cn(
                            'inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors border select-none',
                            isSelected
                              ? 'bg-primary/10 text-primary border-primary/25 font-bold shadow-sm'
                              : 'bg-background text-muted-foreground/60 border-border hover:bg-muted/50',
                          )}
                          style={
                            isSelected
                              ? {
                                  backgroundColor: `color-mix(in srgb, ${themeColor} 10%, transparent)`,
                                  borderColor: `color-mix(in srgb, ${themeColor} 34%, transparent)`,
                                  color: themeColor,
                                  ...glowStyle(themeColor, 'quiet'),
                                }
                              : undefined
                          }
                        >
                          {toCanonicalSubtopicName(subtopic)}
                        </motion.button>
                      );
                    })}
                  </motion.div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Advanced options components ──────────────────────────────────────────────

function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  themeColor = '#f59e0b',
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  themeColor?: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -1 }}
      whileTap={{ scale: 1 }}
      className={cn(
        'relative flex min-h-17 items-center justify-between gap-3 px-3 py-3 rounded-lg border transition-colors cursor-pointer group overflow-hidden',
        checked ? '' : 'bg-card border-border hover:bg-muted/50',
      )}
      style={
        checked
          ? {
              backgroundColor: `color-mix(in srgb, ${themeColor} 5%, transparent)`,
              borderColor: `color-mix(in srgb, ${themeColor} 20%, transparent)`,
              ...glowStyle(themeColor, 'quiet'),
            }
          : undefined
      }
      onClick={() => onCheckedChange(!checked)}
    >
      {checked && <GlowAura color={themeColor} anchor='right' strength={5} />}
      <div className='flex items-start gap-3 min-w-0 relative z-10'>
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
        className='shrink-0 relative z-10'
      />
    </motion.div>
  );
}

function AdvancedOptionsGroup({
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
  diversityEnabled,
  onSetDiversityEnabled,
  strictLatexValidation,
  onSetStrictLatexValidation,
  themeColor = '#f59e0b',
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
            'p-4 rounded-xl border flex flex-col gap-4 transition-colors w-full relative overflow-hidden',
            questionMode === 'multiple-choice'
              ? 'bg-muted/30 border-transparent opacity-60 pointer-events-none'
              : 'bg-card border-border/70',
          )}
          style={
            questionMode !== 'multiple-choice'
              ? glowStyle(themeColor, 'quiet')
              : undefined
          }
        >
          {questionMode !== 'multiple-choice' && (
            <GlowAura color={themeColor} anchor='right' strength={5} />
          )}
          <div className='flex items-center justify-between relative z-10'>
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
            className='relative z-10'
          />
        </motion.div>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        <ToggleRow
          id='diversity-toggle'
          label='Enforce Diversity'
          description='Strictly varies question styles and context.'
          checked={diversityEnabled}
          onCheckedChange={onSetDiversityEnabled}
          themeColor={themeColor}
        />
        <ToggleRow
          id='latex-toggle'
          label='Strict LaTeX'
          description='Rejects formulas with syntax errors.'
          checked={strictLatexValidation}
          onCheckedChange={onSetStrictLatexValidation}
          themeColor={themeColor}
        />
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
                          'relative flex min-h-14 flex-col items-center justify-center gap-1.5 p-3 rounded-xl border transition-all cursor-pointer w-full overflow-hidden',
                          isActive
                            ? 'font-bold'
                            : 'bg-card text-muted-foreground border-border hover:bg-muted/50 hover:text-foreground',
                        )}
                        style={
                          isActive
                            ? {
                                backgroundColor: `color-mix(in srgb, ${themeColor} 5%, transparent)`,
                                borderColor: `color-mix(in srgb, ${themeColor} 30%, transparent)`,
                                color: themeColor,
                                ...glowStyle(themeColor, 'quiet'),
                              }
                            : undefined
                        }
                      >
                        {isActive && (
                          <GlowAura
                            color={themeColor}
                            anchor='bottom'
                            strength={6}
                          />
                        )}
                        <div className='text-sm relative z-10'>{label}</div>
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
            className='pr-16 rounded-xl h-10 bg-card border-border text-sm placeholder:text-muted-foreground/30 focus-visible:ring-primary/20 focus-visible:border-transparent transition-all'
            style={
              customFocusArea.length > 0
                ? glowStyle(themeColor, 'quiet')
                : undefined
            }
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
              themeColor={themeColor}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  label,
  children,
  className,
  dense,
}: {
  label?: string;
  children: React.ReactNode;
  className?: string;
  dense?: boolean;
}) {
  return (
    <div className={cn('flex flex-col', dense ? 'gap-3' : 'gap-5', className)}>
      {label && (
        <div className='flex items-center gap-3'>
          <p className='text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60'>
            {label}
          </p>
          <div className='flex-1 border-t border-border/20' />
        </div>
      )}
      {children}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

/* eslint-disable complexity */
function SetupPanelImpl({
  questionMode,
  onSetQuestionMode,
  selectedTopics,
  onToggleTopic,
  selectedSubtopics,
  onToggleSubtopic,
  techMode,
  onSetTechMode,
  customFocusArea,
  onSetCustomFocusArea,
  diversityEnabled,
  onSetDiversityEnabled,
  strictLatexValidation,
  onSetStrictLatexValidation,
  difficulty,
  onSetDifficulty,
  questionCount,
  onSetQuestionCount,
  averageMarksPerQuestion,
  onSetAverageMarksPerQuestion,
  hasApiKey,
  isGenerating,
  isPaused,
  onTogglePause,
  onAbort,
  generationStatus,
  generationStartedAt,
  formattedElapsedTime,
  onGenerate,
  onStartOver,
  lastGenerationTelemetry,
  streamText = '',
  batchProgress = EMPTY_BATCH_PROGRESS,
  generationSubCallProgress = null,
  generationStrategy = 'single-pass',
}: SetupPanelProps) {
  const navigate = useNavigate();
  const { apiKey, model, setModel, showRawLlmOutput } = useAppSettings();
  const generationHistory = useAppStore((s) => s.generationHistory);
  const customSubtopics = useAppStore((s) => s.customSubtopics);
  const syncCustomSubtopics = useAppStore((s) => s.syncCustomSubtopics);
  const [promptPricePerToken, setPromptPricePerToken] = useState<number | null>(
    null,
  );
  const [completionPricePerToken, setCompletionPricePerToken] = useState<
    number | null
  >(null);

  const hasAnyMathTopic = selectedTopics.some(
    (t) => t === 'Mathematical Methods' || t === 'Specialist Mathematics',
  );
  const hasSubtopicSection = selectedTopics.length > 0;

  const SUBJECT_GROUPS = [
    {
      id: 'math',
      label: 'Mathematics',
      topics: [
        'Mathematical Methods',
        'Specialist Mathematics',
        'General Mathematics',
      ],
    },
    { id: 'science', label: 'Sciences', topics: ['Chemistry', 'Biology'] },
    { id: 'pe', label: 'Health & PE', topics: ['Physical Education'] },
  ] as const;
  type SubjectGroupId = (typeof SUBJECT_GROUPS)[number]['id'];
  const [activeGroup, setActiveGroup] = useState<SubjectGroupId>('math');
  const visibleTopics =
    SUBJECT_GROUPS.find((g) => g.id === activeGroup)?.topics ?? [];

  const activeDifficulty = normalizeDifficulty(difficulty);
  const activeDifficultyMeta = DIFFICULTY_META[activeDifficulty];
  const themeColor = activeDifficultyMeta.themeColor;
  const showBatchTimeline = batchProgress.length > 1;
  const activeProviderId = useAppStore((s) => s.activeProviderId);

  const displayModels = useMemo(() => {
    const presets = getModelsForProvider();
    const known = presets.filter((m) => m.id !== 'custom');
    if (model && model !== 'custom' && !known.some((m) => m.id === model)) {
      return [
        ...known,
        { id: model, name: model.split('/').slice(1).join('/') || model },
      ];
    }
    return known;
  }, [model]);

  const flatSelectedSubtopics = useMemo(
    () =>
      Array.from(
        new Set(
          Object.values(selectedSubtopics).flat().map(toCanonicalSubtopicName),
        ),
      ),
    [selectedSubtopics],
  );

  const syncCustomSubtopicsCb = useCallback(
    () => syncCustomSubtopics(),
    [syncCustomSubtopics],
  );

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (cancelled || !user) return;
      void syncCustomSubtopicsCb();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [syncCustomSubtopicsCb]);

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
      flatSelectedSubtopics.length > 0 ? flatSelectedSubtopics : undefined,
      customFocusArea.trim() || undefined,
      promptPricePerToken ?? undefined,
      completionPricePerToken ?? undefined,
      generationStrategy,
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
    flatSelectedSubtopics,
    generationStrategy,
  ]);

  const generationDisabledReasons = useMemo(() => {
    const reasons: string[] = [];
    if (!hasApiKey) {
      const name = activeProviderId === 'deepseek' ? 'DeepSeek' : 'OpenRouter';
      reasons.push(`${name} API key is missing`);
    }
    if (!model || model.trim().length === 0)
      reasons.push('AI model not selected');
    if (selectedTopics.length === 0) reasons.push('Select at least one topic');
    if (questionCount < 1) reasons.push('Question count must be at least 1');
    if (questionCount > 20) reasons.push('Question count cannot exceed 20');
    if (isGenerating) reasons.push('Generation in progress');
    return reasons;
  }, [
    hasApiKey,
    activeProviderId,
    model,
    selectedTopics.length,
    questionCount,
    isGenerating,
  ]);

  const isGenerationDisabled = generationDisabledReasons.length > 0;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault();
        if (!isGenerationDisabled && !isGenerating) {
          onGenerate();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'r' && !e.shiftKey) {
        e.preventDefault();
        if (!isGenerating) {
          onStartOver();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGenerationDisabled, isGenerating, onGenerate, onStartOver]);

  const levels = [
    'Essential Skills',
    'Easy',
    'Medium',
    'Hard',
    'Extreme',
  ] as Difficulty[];
  const diffIndex = levels.indexOf(activeDifficulty);

  return (
    <TooltipProvider>
      <div
        className='selection:bg-foreground/10 flex flex-col h-screen'
        style={{ '--theme-color': themeColor } as React.CSSProperties}
      >
        <style>{GLOW_KEYFRAMES}</style>
        <div className='relative px-6 py-8 flex flex-col lg:flex-row gap-12 flex-1 overflow-y-auto overflow-x-hidden'>
          <GlowAura
            color={themeColor}
            anchor='top'
            strength={5}
            className='h-72 bottom-auto opacity-60'
          />
          {/* ── LEFT COLUMN ── */}
          <div className='w-full lg:w-104 xl:w-md flex flex-col gap-6 shrink-0 relative z-10'>
            {/* Header */}
            <PageHeader
              title='Generator'
              description='Configure revision settings.'
            />

            {/* Question Mode */}
            <Section label='Question Type'>
              <div className='grid grid-cols-2 gap-3'>
                {[
                  {
                    mode: 'written' as QuestionMode,
                    label: 'Written',
                    icon: <BookOpen className='w-4 h-4' />,
                  },
                  {
                    mode: 'multiple-choice' as QuestionMode,
                    label: 'Multiple Choice',
                    icon: <Target className='w-4 h-4' />,
                  },
                ].map(({ mode, label, icon }) => {
                  const isActive = questionMode === mode;
                  const modeColor = mode === 'written' ? '#0ea5e9' : '#8b5cf6';
                  const activeClass =
                    mode === 'written'
                      ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
                      : 'bg-violet-500/10 border-violet-500/30 text-violet-600 dark:text-violet-400';
                  return (
                    <motion.button
                      key={mode}
                      type='button'
                      onClick={() => onSetQuestionMode(mode)}
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.98 }}
                      transition={SPRING}
                      className={cn(
                        'relative flex items-center justify-center gap-2.5 h-11 rounded-xl border text-sm font-semibold transition-all overflow-hidden',
                        isActive
                          ? activeClass
                          : 'bg-card border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                      )}
                      style={
                        isActive ? glowStyle(modeColor, 'quiet') : undefined
                      }
                    >
                      {isActive && (
                        <GlowAura
                          color={modeColor}
                          anchor='bottom'
                          strength={6}
                        />
                      )}
                      <span className='relative z-10'>{icon}</span>
                      <span className='relative z-10'>{label}</span>
                    </motion.button>
                  );
                })}
              </div>
            </Section>

            {/* Topics */}
            <Section label='Subjects'>
              <ButtonGroup className='w-full'>
                {SUBJECT_GROUPS.map(({ id, label }) => (
                  <Button
                    key={id}
                    variant='outline'
                    onClick={() => setActiveGroup(id)}
                    className={cn(
                      'h-8 rounded-md border-border/70 text-xs flex-1',
                      activeGroup === id
                        ? ''
                        : 'hover:bg-muted/50 hover:border-foreground/20',
                    )}
                    style={
                      activeGroup === id
                        ? {
                            backgroundColor: `color-mix(in srgb, ${themeColor} 10%, transparent)`,
                            borderColor: `color-mix(in srgb, ${themeColor} 30%, transparent)`,
                            color: themeColor,
                            ...glowStyle(themeColor, 'quiet'),
                          }
                        : undefined
                    }
                  >
                    {label}
                  </Button>
                ))}
              </ButtonGroup>
              <div className='relative'>
                <AnimatePresence mode='wait' initial={false}>
                  <motion.div
                    key={activeGroup}
                    initial={{ opacity: 0, x: 4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -4 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className='grid grid-cols-2 gap-3'
                  >
                    {visibleTopics.map((topic) => {
                      const isSelected = selectedTopics.includes(topic);
                      return (
                        <motion.button
                          key={topic}
                          type='button'
                          onClick={() => onToggleTopic(topic)}
                          whileHover={{ y: -2, scale: 1.02 }}
                          whileTap={{ scale: 0.97 }}
                          transition={SPRING_OVERSHOOT}
                          className={cn(
                            'relative flex flex-col items-center justify-center gap-2 p-3 rounded-xl border text-center transition-all cursor-pointer select-none group overflow-hidden',
                            isSelected
                              ? 'border-transparent'
                              : 'bg-card border-border hover:border-foreground/20 hover:bg-muted/30',
                          )}
                          style={
                            isSelected
                              ? {
                                  borderColor: `color-mix(in srgb, ${themeColor} 30%, transparent)`,
                                  backgroundColor: `color-mix(in srgb, ${themeColor} 5%, transparent)`,
                                  ...glowStyle(themeColor, 'active'),
                                }
                              : undefined
                          }
                        >
                          {isSelected && (
                            <GlowAura
                              color={themeColor}
                              anchor='center'
                              strength={7}
                            />
                          )}

                          {/* Hero icon */}
                          <motion.div
                            className={cn(
                              'relative flex items-center justify-center rounded-2xl transition-all duration-300 z-10',
                              isSelected
                                ? 'p-2.5'
                                : 'p-2 bg-muted/60 text-muted-foreground group-hover:text-foreground',
                            )}
                            style={
                              isSelected
                                ? {
                                    backgroundColor: `color-mix(in srgb, ${themeColor} 15%, transparent)`,
                                    color: themeColor,
                                    ...glowStyle(themeColor, 'quiet'),
                                  }
                                : undefined
                            }
                            animate={isSelected ? { scale: [1, 1.03, 1] } : {}}
                            transition={{ duration: 0.5, ease: 'easeOut' }}
                          >
                            <span
                              className={
                                isSelected
                                  ? 'scale-110 transition-transform duration-300'
                                  : ''
                              }
                            >
                              {TOPIC_ICONS[topic] ?? (
                                <BookOpen className='w-4 h-4' />
                              )}
                            </span>
                          </motion.div>

                          {/* Subject name */}
                          <p
                            className={cn(
                              'text-xs font-bold leading-tight relative z-10',
                              isSelected
                                ? 'text-foreground'
                                : 'text-muted-foreground group-hover:text-foreground',
                            )}
                          >
                            {topic}
                          </p>

                          {/* Accent bar at bottom */}
                          <motion.div
                            className='h-0.5 rounded-full relative z-10'
                            initial={false}
                            animate={{
                              width: isSelected ? '60%' : '0%',
                              backgroundColor: isSelected
                                ? themeColor
                                : 'transparent',
                              opacity: isSelected ? 0.6 : 0,
                            }}
                            transition={SPRING_OVERSHOOT}
                          />
                        </motion.button>
                      );
                    })}
                  </motion.div>
                </AnimatePresence>
              </div>
            </Section>

            {/* Difficulty */}
            <Section label='Difficulty' className='mt-2'>
              <div
                className='rounded-xl bg-muted/15 p-5 flex flex-col gap-4 relative overflow-hidden'
                style={glowStyle(themeColor, 'quiet')}
              >
                <GlowAura color={themeColor} anchor='bottom' strength={8} />
                <div className='flex items-center justify-between relative z-10'>
                  <div className='flex items-center gap-3'>
                    <motion.div
                      className='w-2 h-2 rounded-full'
                      animate={{ backgroundColor: themeColor }}
                      transition={{ duration: 0.4 }}
                    />
                    <span
                      className={cn(
                        'text-base font-black tracking-tight',
                        activeDifficultyMeta.color,
                      )}
                    >
                      {activeDifficultyMeta.label}
                    </span>
                    <span className='text-xs text-muted-foreground/60'>
                      — {activeDifficultyMeta.desc}
                    </span>
                  </div>
                </div>
                <div className='flex gap-1.5 h-10 items-end relative z-10'>
                  {levels.map((level, idx) => {
                    const isActive = idx <= diffIndex;
                    const isCurrent = idx === diffIndex;
                    const barHeights = [28, 40, 55, 70, 88];
                    return (
                      <button
                        key={level}
                        type='button'
                        onClick={() => onSetDifficulty(level)}
                        className='group/bar relative flex-1 h-full flex items-end justify-center cursor-pointer outline-none'
                      >
                        {isCurrent && (
                          <motion.div
                            className='absolute bottom-0 left-1/2 -translate-x-1/2 w-full blur-md pointer-events-none z-0'
                            initial={false}
                            animate={{
                              height: '86%',
                              backgroundColor: `color-mix(in srgb, ${themeColor} 28%, transparent)`,
                            }}
                            transition={SPRING_OVERSHOOT}
                          />
                        )}
                        <motion.div
                          initial={false}
                          animate={{
                            height: `${barHeights[idx]}%`,
                            backgroundColor: isCurrent
                              ? themeColor
                              : isActive
                                ? `color-mix(in srgb, ${themeColor} 30%, transparent)`
                                : 'color-mix(in srgb, var(--color-border) 40%, transparent)',
                          }}
                          transition={SPRING_OVERSHOOT}
                          className='w-full rounded-sm relative z-10'
                        >
                          {isCurrent && (
                            <motion.div
                              className='absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full'
                              initial={false}
                              animate={{ backgroundColor: themeColor }}
                              transition={{ duration: 0.3 }}
                              style={{
                                boxShadow: `0 0 6px color-mix(in srgb, ${themeColor} 35%, transparent), 0 0 2px color-mix(in srgb, ${themeColor} 20%, transparent)`,
                              }}
                            />
                          )}
                        </motion.div>
                      </button>
                    );
                  })}
                </div>
                <div className='flex gap-1.5 relative z-10'>
                  {levels.map((level, idx) => (
                    <button
                      key={level}
                      type='button'
                      onClick={() => onSetDifficulty(level)}
                      className={cn(
                        'flex-1 text-center text-[10px] font-bold tracking-wider uppercase transition-colors cursor-pointer truncate',
                        idx === diffIndex
                          ? activeDifficultyMeta.color
                          : 'text-muted-foreground/30 hover:text-muted-foreground',
                      )}
                    >
                      {DIFFICULTY_META[level].label}
                    </button>
                  ))}
                </div>
              </div>
            </Section>

            {/* Question Count */}
            <Section label='Questions'>
              <div
                className='rounded-xl bg-muted/15 px-5 py-5 flex flex-col gap-4 relative overflow-hidden'
                style={glowStyle(themeColor, 'quiet')}
              >
                <GlowAura color={themeColor} anchor='right' strength={7} />
                {/* Header with count and context */}
                <div className='flex items-start justify-between relative z-10'>
                  <div className='flex items-start gap-3'>
                    <div className='flex flex-col gap-1'>
                      <span className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60'>
                        Total Questions
                      </span>
                      <span className='text-3xl font-black font-mono tabular-nums text-foreground leading-none'>
                        {questionCount}
                      </span>
                    </div>
                  </div>
                  <div className='text-right'>
                    <p
                      className='text-xs font-bold mt-1'
                      style={{ color: themeColor, opacity: 0.8 }}
                    >
                      {Math.ceil((questionCount * 2.5) / 10) * 10}–
                      {Math.ceil((questionCount * 3.5) / 10) * 10} mins
                    </p>
                  </div>
                </div>

                {/* Slider with visual fill */}
                <div className='flex flex-col gap-2 relative z-10'>
                  <Slider
                    min={1}
                    max={20}
                    step={1}
                    value={[questionCount]}
                    onValueChange={(val) => onSetQuestionCount(val[0])}
                    className='cursor-pointer'
                  />
                  <div className='flex justify-between font-mono text-[10px] text-muted-foreground/40 font-bold uppercase tracking-wider'>
                    <span>1</span>
                    <span>20</span>
                  </div>
                </div>

                {/* Quick presets */}
                <div className='flex gap-2 relative z-10'>
                  {[
                    { count: 3, label: 'Quick' },
                    { count: 7, label: 'Balanced' },
                    { count: 15, label: 'Thorough' },
                  ].map(({ count, label }) => (
                    <motion.button
                      key={count}
                      type='button'
                      onClick={() => onSetQuestionCount(count)}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      transition={SPRING}
                      className={cn(
                        'flex-1 px-2 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border',
                        questionCount === count
                          ? 'text-white shadow-sm'
                          : 'border-border/40 bg-muted/30 text-muted-foreground hover:border-border/70 hover:bg-muted/50',
                      )}
                      style={
                        questionCount === count
                          ? {
                              backgroundColor: themeColor,
                              borderColor: themeColor,
                              ...glowStyle(themeColor, 'quiet'),
                            }
                          : undefined
                      }
                    >
                      {label}
                    </motion.button>
                  ))}
                </div>
              </div>
            </Section>

            {/* API key warning */}
            {!hasApiKey && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className='relative flex items-start gap-3.5 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 mt-2 overflow-hidden'
                style={glowStyle('#f59e0b', 'quiet')}
              >
                <GlowAura color='#f59e0b' anchor='left' strength={6} />
                <div className='p-1.5 bg-amber-500/10 rounded-lg mt-0.5 shrink-0 relative z-10'>
                  <AlertTriangle className='w-4 h-4 text-amber-600 dark:text-amber-400' />
                </div>
                <div className='flex-1 space-y-2 relative z-10'>
                  <p className='text-sm font-semibold text-foreground leading-snug'>
                    API key missing
                  </p>
                  <p className='text-xs text-muted-foreground leading-relaxed'>
                    An API key is required before generating questions.
                  </p>
                  <Button
                    size='sm'
                    variant='outline'
                    className='rounded-lg border-border/60 hover:bg-muted/50 mt-1 h-8 text-xs'
                    onClick={() => void navigate('/settings')}
                  >
                    Configure Settings
                  </Button>
                </div>
              </motion.div>
            )}
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div className='w-full lg:flex-1 flex flex-col gap-6 relative z-10'>
            {/* Presets */}
            <div className='flex flex-col gap-4'>
              <div className='flex items-center gap-3'>
                <p className='text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60'>
                  Presets
                </p>
                <div className='flex-1 border-t border-border/20' />
              </div>
              <div
                className='rounded-xl border border-border/40 bg-card p-5 relative overflow-hidden'
                style={glowStyle(themeColor, 'quiet')}
              >
                <GlowAura color={themeColor} anchor='top' strength={4} />
                <div className='relative z-10'>
                  <PresetSection
                    selectedTopics={selectedTopics}
                    difficulty={difficulty}
                    techMode={techMode}
                    selectedSubtopics={selectedSubtopics}
                    questionCount={questionCount}
                    averageMarksPerQuestion={averageMarksPerQuestion}
                    questionMode={questionMode}
                    customFocusArea={customFocusArea}
                  />
                </div>
              </div>
            </div>

            {/* Advanced Options */}
            <div className='flex flex-col gap-3 mt-2'>
              <p className='text-[11px] font-bold uppercase tracking-wider text-muted-foreground/50'>
                Advanced Options
              </p>
              <AdvancedOptionsGroup
                questionMode={questionMode}
                averageMarksPerQuestion={averageMarksPerQuestion}
                onSetAverageMarksPerQuestion={onSetAverageMarksPerQuestion}
                selectedTopics={selectedTopics}
                hasSubtopicSection={hasSubtopicSection}
                selectedSubtopics={selectedSubtopics}
                onToggleSubtopic={onToggleSubtopic}
                customSubtopics={customSubtopics}
                hasAnyMathTopic={hasAnyMathTopic}
                techMode={techMode}
                onSetTechMode={onSetTechMode}
                customFocusArea={customFocusArea}
                onSetCustomFocusArea={onSetCustomFocusArea}
                diversityEnabled={diversityEnabled}
                onSetDiversityEnabled={onSetDiversityEnabled}
                strictLatexValidation={strictLatexValidation}
                onSetStrictLatexValidation={onSetStrictLatexValidation}
                themeColor={themeColor}
              />
            </div>
          </div>
        </div>

        {/* ── STICKY CONTROL BAR ── */}
        <div
          className='sticky bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border/40 overflow-hidden'
          style={glowStyle(themeColor, 'quiet')}
        >
          <GlowAura
            color={themeColor}
            anchor='bottom'
            strength={5}
            className='top-auto h-28'
          />
          <div className='px-6 py-4 relative z-10'>
            <AnimatePresence>
              {isGenerating && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className='overflow-hidden pb-4'
                >
                  {showBatchTimeline ? (
                    <BatchTimeline
                      entries={batchProgress}
                      generationSubCallProgress={generationSubCallProgress}
                      generationStartedAt={generationStartedAt}
                      formattedElapsedTime={formattedElapsedTime}
                      streamText={streamText}
                      isGenerating={isGenerating}
                      isPaused={isPaused}
                      onTogglePause={onTogglePause}
                      onAbort={onAbort}
                      showRawLlmOutput={showRawLlmOutput}
                    />
                  ) : (
                    <GenerationTimeline
                      generationStatus={generationStatus}
                      generationSubCallProgress={generationSubCallProgress}
                      generationStartedAt={generationStartedAt}
                      formattedElapsedTime={formattedElapsedTime}
                      streamText={streamText}
                      isGenerating={isGenerating}
                      isPaused={isPaused}
                      onTogglePause={onTogglePause}
                      onAbort={onAbort}
                      showRawLlmOutput={showRawLlmOutput}
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className='flex items-center justify-between gap-10'>
              {/* Cost & token estimates */}
              <div className='flex items-center gap-4'>
                <div className='flex flex-col'>
                  <span className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground/40'>
                    Est. Cost
                  </span>
                  <div className='flex items-baseline gap-1'>
                    <span className='text-lg font-mono font-bold tabular-nums text-foreground'>
                      {estimated.promptCost != null ||
                      estimated.completionCost != null
                        ? formatCostUsd(estimated.totalCost).replace('$', '')
                        : '--'}
                    </span>
                    <span className='text-[10px] font-bold text-muted-foreground/50'>
                      USD
                    </span>
                  </div>
                </div>

                <div className='flex flex-col'>
                  <span className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground/40'>
                    Tokens
                  </span>
                  <span className='text-lg font-mono font-bold tabular-nums text-foreground'>
                    {estimated.totalTokens.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className='flex items-center gap-3'>
                <div className='hidden sm:flex items-center gap-2'>
                  <span className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground/40 whitespace-nowrap'>
                    Model
                  </span>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger className='h-9 w-44 text-xs bg-muted/20 border-border/40 hover:bg-muted/30 transition-colors shadow-none focus:ring-0'>
                      <SelectValue placeholder='Select model' />
                    </SelectTrigger>
                    <SelectContent>
                      {displayModels.map((m) => {
                        const provider = getProviderLabel(m.id);
                        return (
                          <SelectItem
                            key={m.id}
                            value={m.id}
                            className='text-xs'
                          >
                            <span className='flex items-center gap-2 min-w-0'>
                              <span className='truncate'>{m.name}</span>
                              {provider && (
                                <span className='shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground font-medium leading-none'>
                                  {provider}
                                </span>
                              )}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  variant='ghost'
                  size='sm'
                  onClick={onStartOver}
                  disabled={isGenerating}
                  className='text-muted-foreground hover:text-foreground'
                >
                  Reset
                </Button>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Button
                        onClick={onGenerate}
                        disabled={isGenerationDisabled}
                        className={cn(
                          'h-10 px-6 rounded-full font-bold text-sm gap-2 transition-all relative overflow-hidden',
                          isGenerationDisabled
                            ? 'opacity-50 cursor-not-allowed'
                            : 'shadow-sm hover:shadow-md',
                        )}
                        style={
                          !isGenerationDisabled
                            ? {
                                ...glowStyle(themeColor, 'strong'),
                                animation:
                                  'pulse-glow 2.8s ease-in-out infinite',
                              }
                            : undefined
                        }
                      >
                        {!isGenerationDisabled && (
                          <GlowAura
                            color={themeColor}
                            anchor='left'
                            strength={10}
                            pulse={isGenerating}
                          />
                        )}
                        {isGenerating ? (
                          <>
                            <Loader2 className='w-4 h-4 animate-spin relative z-10' />
                            <span className='relative z-10'>Generating…</span>
                          </>
                        ) : (
                          <>
                            <Zap className='w-4 h-4 relative z-10' />
                            <span className='relative z-10'>Generate</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </TooltipTrigger>
                  {isGenerationDisabled && !isGenerating && (
                    <TooltipContent
                      side='top'
                      className='flex flex-col gap-1.5 max-w-52'
                    >
                      <p className='flex items-center gap-1.5 text-xs font-semibold'>
                        <AlertTriangle className='w-3 h-3' /> Missing
                        requirements
                      </p>
                      <ul className='space-y-0.5'>
                        {generationDisabledReasons.map((reason, i) => (
                          <li
                            key={i}
                            className='text-[10px] flex items-center gap-1.5'
                          >
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </TooltipContent>
                  )}
                </Tooltip>
              </div>
            </div>

            {!isGenerating &&
              generationStatus?.stage !== 'completed' &&
              lastGenerationTelemetry && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className='mt-2'
                >
                  <LastGenerationStats telemetry={lastGenerationTelemetry} />
                </motion.div>
              )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

export const SetupPanel = memo(SetupPanelImpl);
