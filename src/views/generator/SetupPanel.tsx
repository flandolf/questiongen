import { invoke } from '@tauri-apps/api/core';
import { onAuthStateChanged } from 'firebase/auth';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  BookOpen,
  Calculator,
  ChevronDown,
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { getModelCredentials, getProviderLabelForModel } from '@/types/provider';

import { getModelsForProvider } from '../settings/constants';
import {
  BatchTimeline,
  GenerationTimeline,
  LastGenerationStats,
} from './GenerationTimeline';
import { PresetSection } from './PresetSection';

export type { BatchTopicProgress } from '@/types';

// ─── Subject icon map ────────────────────────────────────────────────────────

const TOPIC_ICONS: Partial<Record<Topic, React.ReactNode>> = {
  'Mathematical Methods': <FunctionSquare className='w-3.5 h-3.5' />,
  'Specialist Mathematics': <SigmaSquare className='w-3.5 h-3.5' />,
  Chemistry: <FlaskConical className='w-3.5 h-3.5' />,
  Biology: <TestTubeDiagonal className='w-3.5 h-3.5' />,
  'Physical Education': <Dumbbell className='w-3.5 h-3.5' />,
  'General Mathematics': <Calculator className='w-3.5 h-3.5' />,
};

// ─── Sequence of subjects for the chip rail ──────────────────────────────────

const ALL_TOPICS: Topic[] = [
  'Mathematical Methods',
  'Specialist Mathematics',
  'General Mathematics',
  'Chemistry',
  'Biology',
  'Physical Education',
];

// ─── Difficulty metadata (label + short description only) ────────────────────

const DIFFICULTY_META: Record<Difficulty, { label: string; desc: string }> = {
  'Essential Skills': { label: 'Essential', desc: 'Core skills' },
  Easy: { label: 'Easy', desc: 'Straightforward' },
  Medium: { label: 'Medium', desc: 'Balanced' },
  Hard: { label: 'Hard', desc: 'Complex' },
  Extreme: { label: 'Extreme', desc: 'Edge cases' },
};

const DIFFICULTY_LEVELS: Difficulty[] = [
  'Essential Skills',
  'Easy',
  'Medium',
  'Hard',
  'Extreme',
];

// ─── Precomputed subtopic groups ─────────────────────────────────────────────

const MATH_METHODS_SCOPED_SUBTOPIC_GROUPS = toScopedSubtopicGroups(
  MATH_METHODS_SUBTOPIC_GROUPS,
);

// ─── Module-level helper: topic → subtopic groups (+ custom merge) ───────────

function getSubtopicGroupsFor(
  topic: Topic,
  customSubtopics: Record<Topic, CustomSubtopic[]>,
): readonly TopicSubtopicGroup[] {
  const groups: readonly TopicSubtopicGroup[] =
    topic === 'Mathematical Methods'
      ? MATH_METHODS_SCOPED_SUBTOPIC_GROUPS
      : topic === 'Specialist Mathematics'
        ? SPECIALIST_MATH_SUBTOPIC_GROUPS
        : topic === 'Chemistry'
          ? CHEMISTRY_SUBTOPIC_GROUPS
          : topic === 'Physical Education'
            ? PE_SUBTOPIC_GROUPS
            : topic === 'Biology'
              ? BIOLOGY_SUBTOPIC_GROUPS
              : topic === 'General Mathematics'
                ? GENERAL_MATHEMATICS_SUBTOPIC_GROUPS
                : [];

  const customSubs = customSubtopics[topic] || [];
  if (customSubs.length === 0) return groups;
  return [
    ...groups,
    {
      topic,
      groupId: 'custom',
      unit: 'Custom',
      aos: 'Custom',
      label: 'Custom',
      subtopics: customSubs.map((s) => s.name),
    },
  ];
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
};

// ─── Small primitives (segmented control + chip + toggle row) ───────────────

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: readonly { value: T; label: string; icon?: React.ReactNode }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role='radiogroup'
      aria-label={ariaLabel}
      className='inline-flex w-full rounded-md border border-border bg-card p-0.5'
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type='button'
            role='radio'
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-1.5 h-7 px-2 rounded-[5px] text-xs font-medium transition-colors duration-150',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
            )}
          >
            {opt.icon}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className='flex items-center justify-between gap-3 py-1.5 cursor-pointer select-none'
    >
      <span className='min-w-0'>
        <span className='block text-sm text-foreground leading-tight'>
          {label}
        </span>
        {description && (
          <span className='block text-xs text-muted-foreground/70 mt-0.5 leading-tight'>
            {description}
          </span>
        )}
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}

// ─── Grouped subtopic selector (flat, with search) ───────────────────────────

function GroupedSubtopicSelector({
  label,
  groups,
  selected,
  onToggle,
}: {
  label: string;
  groups: readonly TopicSubtopicGroup[];
  selected: string[];
  onToggle: (item: string | string[]) => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(() => {
    // Expand the first unit by default; rest collapsible.
    const first = groups[0]?.unit;
    return new Set(first ? [first] : []);
  });

  const filteredGroups = useMemo(() => {
    if (!searchTerm.trim()) return groups;
    const lower = searchTerm.toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        subtopics: g.subtopics.filter(
          (s) =>
            toCanonicalSubtopicName(s).toLowerCase().includes(lower) ||
            g.aos.toLowerCase().includes(lower),
        ),
      }))
      .filter((g) => g.subtopics.length > 0);
  }, [groups, searchTerm]);

  const toggleUnit = (unit: string) => {
    setExpandedUnits((prev) => {
      const next = new Set(prev);
      if (next.has(unit)) next.delete(unit);
      else next.add(unit);
      return next;
    });
  };

  const toggleAllInGroup = (group: TopicSubtopicGroup) => {
    const toAdd = group.subtopics.filter((s) => !selected.includes(s));
    if (toAdd.length > 0) {
      onToggle(toAdd);
      return;
    }
    onToggle(group.subtopics.filter((s) => selected.includes(s)));
  };

  const toggleAllInUnit = (unitGroups: TopicSubtopicGroup[]) => {
    const all = unitGroups.flatMap((g) => g.subtopics);
    const allSelected = all.every((s) => selected.includes(s));
    onToggle(allSelected ? all : all.filter((s) => !selected.includes(s)));
  };

  const units = useMemo(
    () =>
      Array.from(new Set(groups.map((g) => g.unit))).sort((a, b) => {
        const numericOf = (v: string) => {
          const m = v.match(/^Unit\s+(\d+)$/i);
          return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
        };
        const diff = numericOf(a) - numericOf(b);
        return diff !== 0 ? diff : a.localeCompare(b);
      }),
    [groups],
  );

  const scope = searchTerm.trim() ? filteredGroups : groups;

  return (
    <div className='flex flex-col gap-2'>
      <div className='relative'>
        <Search className='pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60' />
        <input
          type='text'
          placeholder={`Search ${label} subtopics…`}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          aria-label={`Search subtopics for ${label}`}
          className='w-full h-7 pl-8 pr-7 text-xs rounded-md border border-border bg-card text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/30 focus:ring-0 transition-colors'
        />
        {searchTerm && (
          <button
            type='button'
            onClick={() => setSearchTerm('')}
            aria-label='Clear search'
            className='absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors'
          >
            <X className='h-3 w-3' />
          </button>
        )}
      </div>

      <div className='flex flex-col'>
        {scope.length === 0 ? (
          <p className='text-xs text-muted-foreground/60 py-3 px-1'>
            No matches.
          </p>
        ) : (
          units.map((unit) => {
            const unitGroups = scope.filter((g) => g.unit === unit);
            if (unitGroups.length === 0) return null;
            const open = !!searchTerm.trim() || expandedUnits.has(unit);
            const unitSelectedCount = unitGroups.reduce(
              (sum, g) =>
                sum + g.subtopics.filter((s) => selected.includes(s)).length,
              0,
            );
            const unitTotal = unitGroups.reduce(
              (sum, g) => sum + g.subtopics.length,
              0,
            );

            return (
              <div
                key={unit}
                className='border-t border-border/60 first:border-t-0'
              >
                <button
                  type='button'
                  onClick={() => toggleUnit(unit)}
                  className='w-full flex items-center justify-between gap-2 py-2 text-left'
                  aria-expanded={open}
                >
                  <span className='inline-flex items-center gap-2'>
                    <ChevronDown
                      className={cn(
                        'h-3 w-3 text-muted-foreground/60 transition-transform duration-150',
                        !open && '-rotate-90',
                      )}
                    />
                    <span className='text-xs font-semibold text-foreground'>
                      {unit}
                    </span>
                    <span className='text-[10px] font-mono tabular-nums text-muted-foreground/50'>
                      {unitSelectedCount}/{unitTotal}
                    </span>
                  </span>
                  <button
                    type='button'
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAllInUnit(unitGroups);
                    }}
                    className='text-[10px] font-semibold text-muted-foreground/60 hover:text-foreground transition-colors'
                  >
                    All
                  </button>
                </button>
                {open &&
                  unitGroups.map((group) => (
                    <div key={group.groupId} className='pb-2 pl-5'>
                      <div className='flex items-center justify-between mb-1.5'>
                        <p className='text-[11px] text-muted-foreground'>
                          {group.aos}
                        </p>
                        <button
                          type='button'
                          onClick={() => toggleAllInGroup(group)}
                          className='text-[10px] font-semibold text-muted-foreground/60 hover:text-foreground transition-colors'
                        >
                          Select all
                        </button>
                      </div>
                      <div className='flex flex-wrap gap-1'>
                        {group.subtopics.map((subtopic) => {
                          const active = selected.includes(subtopic);
                          return (
                            <button
                              key={subtopic}
                              type='button'
                              onClick={() => onToggle(subtopic)}
                              aria-pressed={active}
                              className={cn(
                                'px-2 h-6 rounded-md text-[11px] font-medium border transition-colors duration-150',
                                active
                                  ? 'bg-primary/15 text-foreground border-primary/50'
                                  : 'bg-card text-muted-foreground/70 border-border hover:text-foreground hover:border-foreground/20',
                              )}
                            >
                              {toCanonicalSubtopicName(subtopic)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Advanced disclosure (marks/tech/focus/toggles — no subtopics) ───────────

function AdvancedSection(props: AdvancedOptionsGroupProps) {
  const {
    questionMode,
    averageMarksPerQuestion,
    onSetAverageMarksPerQuestion,
    hasAnyMathTopic,
    techMode,
    onSetTechMode,
    customFocusArea,
    onSetCustomFocusArea,
    diversityEnabled,
    onSetDiversityEnabled,
    strictLatexValidation,
    onSetStrictLatexValidation,
  } = props;

  // Static option list — no React state, so a plain const is correct.
  const techOptions: ReadonlyArray<{
    value: TechMode;
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      value: 'tech-free',
      label: 'Tech free',
      icon: <Pen className='h-3 w-3' />,
    },
    {
      value: 'tech-active',
      label: 'Tech active',
      icon: <Calculator className='h-3 w-3' />,
    },
  ];

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center justify-between gap-3'>
        <span className='text-xs text-muted-foreground/70'>
          Marks per question
        </span>
        <span className='text-sm font-mono tabular-nums font-semibold text-foreground'>
          {averageMarksPerQuestion}
        </span>
      </div>
      <Slider
        min={1}
        max={20}
        step={1}
        value={[averageMarksPerQuestion]}
        onValueChange={(val) => onSetAverageMarksPerQuestion(val[0])}
        disabled={questionMode === 'multiple-choice'}
      />

      {hasAnyMathTopic && (
        <SegmentedControl
          ariaLabel='Calculator'
          value={techMode}
          options={techOptions}
          onChange={onSetTechMode}
        />
      )}

      <div className='flex flex-col gap-1'>
        <label
          htmlFor='custom-focus'
          className='text-xs text-muted-foreground/70'
        >
          Custom focus <span className='opacity-50'>(optional)</span>
        </label>
        <div className='relative'>
          <Input
            id='custom-focus'
            value={customFocusArea}
            onChange={(e) => onSetCustomFocusArea(e.target.value)}
            maxLength={160}
            placeholder='e.g. differentiation rules, graph sketching'
            className='h-7 text-xs bg-card border-border pr-12 focus-visible:ring-0 focus-visible:border-foreground/30'
          />
          {customFocusArea.length > 0 && (
            <span className='absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground/50 tabular-nums'>
              {customFocusArea.length}/160
            </span>
          )}
        </div>
      </div>

      <div className='border-t border-border/60 pt-2 flex flex-col'>
        <ToggleRow
          id='diversity-toggle'
          label='Enforce diversity'
          description='Strictly vary question styles.'
          checked={diversityEnabled}
          onCheckedChange={onSetDiversityEnabled}
        />
        <ToggleRow
          id='latex-toggle'
          label='Strict LaTeX'
          description='Reject formulas with syntax errors.'
          checked={strictLatexValidation}
          onCheckedChange={onSetStrictLatexValidation}
        />
      </div>
    </div>
  );
}

// ─── Estimate row (tokens + cost) ────────────────────────────────────────────

function EstimateReadout({
  promptCost,
  completionCost,
  totalTokens,
}: {
  promptCost: number | null;
  completionCost: number | null;
  totalTokens: number;
}) {
  const costShown =
    promptCost != null || completionCost != null
      ? formatCostUsd((promptCost ?? 0) + (completionCost ?? 0)).replace(
          '$',
          '',
        )
      : '—';
  return (
    <div className='flex items-center gap-1.5 text-xs font-mono tabular-nums'>
      <span className='text-muted-foreground/60'>Tokens</span>
      <span className='text-foreground font-semibold'>
        {totalTokens.toLocaleString()}
      </span>
      <span className='text-muted-foreground/30 mx-1'>·</span>
      <span className='text-muted-foreground/60'>Cost</span>
      <span className='text-foreground font-semibold'>${costShown}</span>
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
  batchProgress = [],
  generationSubCallProgress = null,
  generationStrategy = 'single-pass',
}: SetupPanelProps) {
  const navigate = useNavigate();
  const { apiKey, model, setModel, showRawLlmOutput } = useAppSettings();
  const generationHistory = useAppStore((s) => s.generationHistory);
  const customSubtopics = useAppStore((s) => s.customSubtopics);
  const syncCustomSubtopics = useAppStore((s) => s.syncCustomSubtopics);
  const activeProviderId = useAppStore((s) => s.activeProviderId);
  const providers = useAppStore((s) => s.providers);
  const prefersReducedMotion = useReducedMotion();

  const [promptPricePerToken, setPromptPricePerToken] = useState<number | null>(
    null,
  );
  const [completionPricePerToken, setCompletionPricePerToken] = useState<
    number | null
  >(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const hasAnyMathTopic = selectedTopics.some(
    (t) => t === 'Mathematical Methods' || t === 'Specialist Mathematics',
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
      const credentials = getModelCredentials(model, providers, {
        activeProviderId,
      });
      if (!credentials) return;
      try {
        const stats = await invoke<{
          promptPricePerToken?: number | null;
          completionPricePerToken?: number | null;
        }>(
          credentials.providerId === 'openrouter'
            ? 'get_model_stats'
            : 'get_provider_model_stats',
          credentials.providerId === 'openrouter'
            ? { apiKey: credentials.apiKey, modelId: credentials.modelId }
            : {
                apiKey: credentials.apiKey,
                modelId: credentials.modelId,
                providerId: credentials.providerId,
                baseUrl: credentials.baseUrl,
              },
        );
        const resolvedStats =
          'stats' in stats
            ? (
                stats as {
                  stats: {
                    promptPricePerToken?: number | null;
                    completionPricePerToken?: number | null;
                  };
                }
              ).stats
            : stats;
        if (cancelled) return;
        setPromptPricePerToken(resolvedStats.promptPricePerToken ?? null);
        setCompletionPricePerToken(resolvedStats.completionPricePerToken ?? null);
      } catch {
        setPromptPricePerToken(null);
        setCompletionPricePerToken(null);
      }
    }
    void fetchStats();
    return () => {
      cancelled = true;
    };
  }, [apiKey, model, providers, activeProviderId]);

  const flatSelectedSubtopics = useMemo(
    () =>
      Array.from(
        new Set(
          Object.values(selectedSubtopics).flat().map(toCanonicalSubtopicName),
        ),
      ),
    [selectedSubtopics],
  );

  const estimated = useMemo(() => {
    const primaryTopic = selectedTopics[0] ?? 'Mathematical Methods';
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

  const displayModels = useMemo(() => {
    const presets = getModelsForProvider(activeProviderId);
    const known = presets.filter((m) => m.id !== 'custom');
    if (model && model !== 'custom' && !known.some((m) => m.id === model)) {
      return [
        ...known,
        { id: model, name: model.split('/').slice(1).join('/') || model },
      ];
    }
    return known;
  }, [activeProviderId, model]);

  // Display name for the currently-selected model. Falls back to the raw
  // model id if the lookup misses, and to `undefined` when neither the lookup
  // nor the model is set (empty string included) — that's what triggers the
  // SelectValue `placeholder="Select model"` fallback. Uses `||` rather than
  // `??` so an empty-string `model` still falls through.
  const activeModelName = useMemo(
    () => displayModels.find((m) => m.id === model)?.name || model || undefined,
    [displayModels, model],
  );

  // Provider label for the active model, rendered as a static pill beside the
  // trigger so users still see at-a-glance which provider they're sending to
  // (the badge inside each SelectItem only shows when the dropdown is open).
  // Uses providers + activeProviderId so NVIDIA + custom-provider models
  // stop mis-labelling as OpenRouter.
  const activeProviderLabel = useMemo(
    () =>
      model
        ? getProviderLabelForModel(model, providers, activeProviderId)
        : undefined,
    [model, providers, activeProviderId],
  );

  const generationDisabledReasons = useMemo(() => {
    const reasons: string[] = [];
    if (!hasApiKey) {
      const name = activeProviderId === 'deepseek' ? 'DeepSeek' : 'OpenRouter';
      reasons.push(`${name} API key is missing`);
    }
    if (!model || model.trim().length === 0)
      reasons.push('AI model not selected');
    if (selectedTopics.length === 0)
      reasons.push('Select at least one subject');
    if (questionCount < 1) reasons.push('Choose at least one question');
    if (questionCount > 20) reasons.push('Maximum is 20 questions');
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
  const activeDifficulty = normalizeDifficulty(difficulty);
  const showBatchTimeline = batchProgress.length > 1;
  const showGenerationTimeline =
    isGenerating || generationStatus?.stage === 'failed';
  const questionMinutes = Math.max(
    1,
    Math.round((questionCount * averageMarksPerQuestion) / 2.5),
  );
  const difficultyIndex = DIFFICULTY_LEVELS.indexOf(activeDifficulty);
  const questionTypeOptions: ReadonlyArray<{
    value: QuestionMode;
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      value: 'written',
      label: 'Written',
      icon: <BookOpen className='h-3 w-3' />,
    },
    {
      value: 'multiple-choice',
      label: 'MC',
      icon: <Target className='h-3 w-3' />,
    },
  ];

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault();
        if (!isGenerationDisabled && !isGenerating) onGenerate();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'r' && !e.shiftKey) {
        e.preventDefault();
        if (!isGenerating) onStartOver();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGenerationDisabled, isGenerating, onGenerate, onStartOver]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className='flex flex-col h-full bg-background text-foreground overflow-hidden'>
        <div className='flex-1 min-h-0 overflow-y-auto'>
          <div className='px-6 pt-6 pb-8 flex flex-col gap-6'>
            {/* Header */}
            <header className='flex flex-col gap-1'>
              <h1 className='text-lg font-semibold tracking-tight text-foreground'>
                Setup
              </h1>
              <p className='text-sm text-muted-foreground'>
                Configure a revision set, then generate.
              </p>
            </header>

            {/* Two-column grid */}
            <div className='grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-x-10 gap-y-6'>
              {/* ── LEFT COLUMN ── */}
              <aside className='flex flex-col gap-5 min-w-0'>
                {/* Question Type */}
                <fieldset className='flex flex-col gap-2 border-0 p-0 m-0'>
                  <legend className='text-xs text-muted-foreground/70'>
                    Type
                  </legend>
                  <SegmentedControl
                    ariaLabel='Question type'
                    value={questionMode}
                    options={questionTypeOptions}
                    onChange={onSetQuestionMode}
                  />
                </fieldset>

                {/* Difficulty (slider + scale) */}
                <fieldset className='flex flex-col gap-2 border-0 p-0 m-0'>
                  <div className='flex items-center justify-between'>
                    <legend className='text-xs text-muted-foreground/70'>
                      Difficulty
                    </legend>
                    <span className='text-xs font-medium text-foreground'>
                      {DIFFICULTY_META[activeDifficulty].label}{' '}
                      <span className='text-muted-foreground/60 font-normal'>
                        — {DIFFICULTY_META[activeDifficulty].desc}
                      </span>
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={DIFFICULTY_LEVELS.length - 1}
                    step={1}
                    value={[difficultyIndex]}
                    onValueChange={(v) =>
                      onSetDifficulty(
                        DIFFICULTY_LEVELS[v[0]] ?? activeDifficulty,
                      )
                    }
                  />
                  <div className='grid grid-cols-5 gap-1'>
                    {DIFFICULTY_LEVELS.map((lvl, idx) => {
                      const isActive = idx === difficultyIndex;
                      return (
                        <button
                          key={lvl}
                          type='button'
                          onClick={() => onSetDifficulty(lvl)}
                          aria-pressed={isActive}
                          className={cn(
                            'h-5 text-[11px] font-medium transition-colors duration-150',
                            isActive
                              ? 'text-foreground'
                              : 'text-muted-foreground/50 hover:text-muted-foreground',
                          )}
                        >
                          {DIFFICULTY_META[lvl].label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                {/* Question Count */}
                <fieldset className='flex flex-col gap-2 border-0 p-0 m-0'>
                  <div className='flex items-center justify-between'>
                    <legend className='text-xs text-muted-foreground/70'>
                      Questions
                    </legend>
                    <span className='inline-flex items-baseline gap-1.5'>
                      <span className='text-sm font-mono tabular-nums font-semibold text-foreground'>
                        {questionCount}
                      </span>
                      <span className='text-[10px] font-mono text-muted-foreground/50 tabular-nums'>
                        ~{questionMinutes}m
                      </span>
                    </span>
                  </div>
                  <Slider
                    min={1}
                    max={20}
                    step={1}
                    value={[questionCount]}
                    onValueChange={(val) => onSetQuestionCount(val[0])}
                  />
                  <div className='grid grid-cols-3 gap-1.5'>
                    {[
                      { count: 3, label: 'Quick' },
                      { count: 7, label: 'Standard' },
                      { count: 15, label: 'Long' },
                    ].map(({ count, label }) => {
                      const active = questionCount === count;
                      return (
                        <button
                          key={count}
                          type='button'
                          onClick={() => onSetQuestionCount(count)}
                          aria-pressed={active}
                          className={cn(
                            'h-7 rounded-md text-[11px] font-medium border transition-colors duration-150',
                            active
                              ? 'bg-primary/10 text-foreground border-primary/40'
                              : 'border-border bg-card text-muted-foreground/70 hover:text-foreground hover:border-foreground/20',
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                {/* Advanced (collapsible) */}
                <div className='border-t border-border/60 pt-3 flex flex-col gap-3'>
                  <button
                    type='button'
                    onClick={() => setAdvancedOpen((v) => !v)}
                    aria-expanded={advancedOpen}
                    className='flex items-center justify-between gap-2 text-left'
                  >
                    <span className='text-xs text-muted-foreground/70'>
                      Advanced
                    </span>
                    <ChevronDown
                      className={cn(
                        'h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-150',
                        !advancedOpen && '-rotate-90',
                      )}
                    />
                  </button>
                  {advancedOpen && (
                    <AdvancedSection
                      questionMode={questionMode}
                      averageMarksPerQuestion={averageMarksPerQuestion}
                      onSetAverageMarksPerQuestion={
                        onSetAverageMarksPerQuestion
                      }
                      selectedTopics={selectedTopics}
                      hasSubtopicSection={selectedTopics.length > 0}
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
                    />
                  )}
                </div>

                {!hasApiKey && (
                  <div className='flex items-start gap-2.5 rounded-md border border-border bg-card px-3 py-2.5'>
                    <AlertTriangle className='h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5' />
                    <div className='flex-1 min-w-0'>
                      <p className='text-xs font-medium text-foreground'>
                        API key missing
                      </p>
                      <p className='text-[11px] text-muted-foreground mt-0.5'>
                        Configure one in Settings before generating.
                      </p>
                      <Button
                        variant='link'
                        size='sm'
                        onClick={() => void navigate('/settings')}
                        className='mt-0.5 h-auto px-0 text-[11px] font-medium text-foreground hover:no-underline'
                      >
                        Open Settings
                      </Button>
                    </div>
                  </div>
                )}
              </aside>

              {/* ── RIGHT COLUMN ── */}
              <section className='flex flex-col gap-6 min-w-0'>
                {/* Subjects */}
                <fieldset className='flex flex-col gap-2 border-0 p-0 m-0'>
                  <div className='flex items-center justify-between'>
                    <legend className='text-xs text-muted-foreground/70'>
                      Subjects
                    </legend>
                    {selectedTopics.length > 0 && (
                      <span className='text-[10px] font-mono text-muted-foreground/50'>
                        {selectedTopics.length} selected
                      </span>
                    )}
                  </div>
                  <div className='grid grid-cols-2 sm:grid-cols-3 gap-1.5'>
                    {ALL_TOPICS.map((topic) => {
                      const active = selectedTopics.includes(topic);
                      return (
                        <button
                          key={topic}
                          type='button'
                          onClick={() => onToggleTopic(topic)}
                          aria-pressed={active}
                          className={cn(
                            'inline-flex items-center gap-2 h-8 px-2.5 rounded-md border text-xs font-medium transition-colors duration-150',
                            active
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-card text-muted-foreground border-border hover:text-foreground hover:border-foreground/20',
                          )}
                        >
                          {TOPIC_ICONS[topic] ?? (
                            <BookOpen className='h-3.5 w-3.5' />
                          )}
                          <span className='truncate'>{topic}</span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                {/* Subtopics (or empty hint) */}
                {selectedTopics.length === 0 ? (
                  <div className='rounded-md border border-dashed border-border bg-card px-4 py-6 text-center'>
                    <p className='text-xs text-muted-foreground'>
                      Select a subject above to choose subtopics.
                    </p>
                  </div>
                ) : (
                  <div className='flex flex-col gap-4'>
                    {selectedTopics.map((topic) => (
                      <div key={topic} className='flex flex-col gap-1.5'>
                        <p className='text-xs font-semibold text-foreground'>
                          {topic} subtopics
                        </p>
                        <GroupedSubtopicSelector
                          label={topic}
                          groups={getSubtopicGroupsFor(topic, customSubtopics)}
                          selected={selectedSubtopics[topic] || []}
                          onToggle={(sub) => onToggleSubtopic(topic, sub)}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Presets — PresetSection draws its own surface; no nested card. */}
                <fieldset className='flex flex-col gap-2 border-0 p-0 m-0'>
                  <legend className='text-xs text-muted-foreground/70'>
                    Presets
                  </legend>
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
                </fieldset>
              </section>
            </div>

            {!isGenerating &&
              generationStatus?.stage !== 'completed' &&
              lastGenerationTelemetry && (
                <div className='rounded-md border border-border bg-card px-4 py-3'>
                  <LastGenerationStats telemetry={lastGenerationTelemetry} />
                </div>
              )}
          </div>
        </div>

        {/* ── STICKY CONTROL BAR ── */}
        <div className='relative border-t border-border bg-background'>
          <AnimatePresence initial={false}>
            {showGenerationTimeline && (
              <motion.div
                key='generation-timeline-popout'
                initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: prefersReducedMotion ? 0 : 12 }}
                transition={{
                  duration: prefersReducedMotion ? 0.01 : 0.18,
                  ease: 'easeOut',
                }}
                className='absolute inset-x-0 bottom-full z-20 px-6'
              >
                <div className='overflow-hidden rounded-t-md border-x border-t border-border bg-card shadow-lg'>
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
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className='px-6 h-12 flex items-center justify-between gap-6'>
            <div className='flex items-center gap-4 min-w-0'>
              <EstimateReadout
                promptCost={estimated.promptCost}
                completionCost={estimated.completionCost}
                totalTokens={estimated.totalTokens}
              />
              <div className='hidden md:block w-px h-4 bg-border' />{' '}
              <div className='hidden md:flex items-center gap-1.5 min-w-0'>
                <span className='text-xs text-muted-foreground/60 shrink-0'>
                  Model
                </span>
                {activeProviderLabel && (
                  <span className='shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground font-medium leading-none font-mono'>
                    {activeProviderLabel}
                  </span>
                )}
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger className='h-7 w-52 text-xs border-border bg-transparent hover:bg-muted/40 focus:ring-0'>
                    {/*
                     * Explicit children override the ItemText-rendered value,
                     * so the provider badge inside each SelectItem stays in the
                     * dropdown but does NOT clip the model name in the trigger.
                     */}
                    <SelectValue placeholder='Select model'>
                      {activeModelName}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {displayModels.map((m) => {
                      const provider = getProviderLabelForModel(
                        m.id,
                        providers,
                        activeProviderId,
                      );
                      return (
                        <SelectItem key={m.id} value={m.id} className='text-xs'>
                          {/* ItemText content + provider badge share one flex span
                              so the checkmark (absolute right-2) sits in the
                              right-margin space instead of overlapping the badge. */}
                          <span className='flex items-center gap-2 min-w-0'>
                            <span className='truncate'>{m.name}</span>
                            {provider && (
                              <span className='shrink-0 text-[10px] px-1 py-0.5 rounded bg-muted/60 text-muted-foreground font-medium leading-none'>
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
            </div>
            <div className='flex items-center gap-2 shrink-0'>
              <Button
                variant='ghost'
                size='sm'
                onClick={onStartOver}
                disabled={isGenerating}
                className='h-8 px-3 text-xs font-medium text-muted-foreground hover:text-foreground'
              >
                Reset
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={isGenerationDisabled ? 0 : -1}>
                    <Button
                      onClick={onGenerate}
                      disabled={isGenerationDisabled}
                      className={cn(
                        'h-8 px-4 rounded-md font-semibold text-xs gap-1.5 transition-colors',
                        isGenerationDisabled
                          ? 'opacity-50 cursor-not-allowed'
                          : '',
                      )}
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className='h-3.5 w-3.5 animate-spin' />
                          <span>Generating…</span>
                        </>
                      ) : (
                        <>
                          <Zap className='h-3.5 w-3.5' />
                          <span>Generate</span>
                        </>
                      )}
                    </Button>
                  </span>
                </TooltipTrigger>
                {isGenerationDisabled && !isGenerating && (
                  <TooltipContent
                    side='top'
                    className='flex flex-col gap-1 max-w-52 text-xs'
                  >
                    <p className='font-semibold flex items-center gap-1.5'>
                      <AlertTriangle className='h-3 w-3' />
                      Missing requirements
                    </p>
                    <ul className='space-y-0.5 text-[10px]'>
                      {generationDisabledReasons.map((reason, i) => (
                        <li key={i}>· {reason}</li>
                      ))}
                    </ul>
                  </TooltipContent>
                )}
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

export const SetupPanel = memo(SetupPanelImpl);
