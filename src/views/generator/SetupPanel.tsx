import { invoke } from '@tauri-apps/api/core';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  BookOpen,
  Calculator,
  Check,
  Dumbbell,
  FlaskConical,
  FunctionSquare,
  Loader2,
  SigmaSquare,
  Target,
  TestTubeDiagonal,
  Zap,
} from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAppSettings } from '@/AppContext';
import { PageHeader } from '@/components/layout/primitives';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { estimateTokensAndCost, formatCostUsd } from '@/lib/app-utils';
import { normalizeDifficulty } from '@/lib/persistence';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store';
import {
  type BatchTopicProgress,
  type Difficulty,
  type DiversityStrictness,
  type GenerationStatusEvent,
  type GenerationSubCallProgress,
  type GenerationTelemetry,
  type QuestionMode,
  type TechMode,
  toCanonicalSubtopicName,
  type Topic,
} from '@/types';

import { PRESET_MODELS } from '../settings/constants';
import { AdvancedOptionsGroup } from './AdvancedOptions';
import {
  BatchTimeline,
  GenerationTimeline,
  LastGenerationStats,
} from './GenerationTimeline';
import { PresetSection } from './PresetSection';

const SPRING = { type: 'spring' as const, stiffness: 300, damping: 30 };

export type { BatchTopicProgress } from '@/types';

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
  diversityStrictness: DiversityStrictness;
  onSetDiversityStrictness: (value: DiversityStrictness) => void;
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

const EMPTY_BATCH_PROGRESS: BatchTopicProgress[] = [];

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  label,
  children,
  className,
}: {
  label?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {label && (
        <p className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50'>
          {label}
        </p>
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
  diversityStrictness,
  onSetDiversityStrictness,
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
  const { apiKey, model, setModel } = useAppSettings();
  const generationHistory = useAppStore((s) => s.generationHistory);
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
  const showBatchTimeline = batchProgress.length > 1;

  const displayModels = useMemo(() => {
    const known = PRESET_MODELS.filter((m) => m.id !== 'custom');
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
    if (!hasApiKey) reasons.push('OpenRouter API key is missing');
    if (!model || model.trim().length === 0)
      reasons.push('AI model not selected');
    if (selectedTopics.length === 0) reasons.push('Select at least one topic');
    if (questionCount < 1) reasons.push('Question count must be at least 1');
    if (questionCount > 20) reasons.push('Question count cannot exceed 20');
    if (isGenerating) reasons.push('Generation in progress');
    return reasons;
  }, [hasApiKey, model, selectedTopics.length, questionCount, isGenerating]);

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
      <div className='selection:bg-foreground/10 flex flex-col h-screen'>
        <div className='relative px-6 py-8 flex flex-col lg:flex-row gap-12 flex-1 overflow-y-auto'>
          {/* ── LEFT COLUMN ── */}
          <div className='w-full lg:w-104 xl:w-md flex flex-col gap-8 shrink-0'>
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
                        'flex items-center justify-center gap-2.5 h-11 rounded-xl border text-sm font-semibold transition-all',
                        isActive
                          ? activeClass
                          : 'bg-card border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                      )}
                    >
                      {icon}
                      {label}
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
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'hover:bg-muted/50 hover:border-foreground/20',
                    )}
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
                          whileHover={{ y: -2, scale: 1.01 }}
                          whileTap={{ scale: 0.98 }}
                          transition={SPRING}
                          className={cn(
                            'relative flex flex-col items-start gap-3 p-4 rounded-xl border text-left transition-all cursor-pointer select-none group overflow-hidden',
                            isSelected
                              ? 'bg-primary/5 border-primary/25 shadow-sm'
                              : 'bg-card border-border hover:border-foreground/20 hover:bg-muted/30',
                          )}
                        >
                          <div className='flex items-start justify-between w-full relative z-10'>
                            <div
                              className={cn(
                                'p-1.5 rounded-lg transition-colors duration-200',
                                isSelected
                                  ? 'bg-primary/10 text-primary'
                                  : 'bg-muted/60 text-muted-foreground group-hover:text-foreground',
                              )}
                            >
                              {TOPIC_ICONS[topic] ?? (
                                <BookOpen className='w-4 h-4' />
                              )}
                            </div>
                            <div
                              className={cn(
                                'w-4 h-4 rounded-sm border-[1.5px] flex items-center justify-center transition-all duration-200 mt-0.5',
                                isSelected
                                  ? 'bg-primary border-primary text-primary-foreground'
                                  : 'border-border/70',
                              )}
                            >
                              {isSelected && (
                                <Check
                                  className='w-2.5 h-2.5'
                                  strokeWidth={3}
                                />
                              )}
                            </div>
                          </div>

                          <p
                            className={cn(
                              'text-xs font-semibold leading-tight relative z-10',
                              isSelected
                                ? 'text-foreground'
                                : 'text-muted-foreground group-hover:text-foreground',
                            )}
                          >
                            {topic}
                          </p>
                        </motion.button>
                      );
                    })}
                  </motion.div>
                </AnimatePresence>
              </div>
            </Section>

            {/* Difficulty */}
            <Section label='Difficulty'>
              <div className='rounded-xl border border-border/70 bg-card p-5 flex flex-col gap-4'>
                {/* Header row */}
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-2'>
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

                {/* Gauge bars */}
                <div className='flex gap-1.5 h-10 items-end'>
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
                        <motion.div
                          initial={false}
                          animate={{
                            height: `${barHeights[idx]}%`,
                            backgroundColor: isCurrent
                              ? activeDifficultyMeta.themeColor
                              : isActive
                                ? `color-mix(in srgb, ${activeDifficultyMeta.themeColor} 30%, transparent)`
                                : 'color-mix(in srgb, var(--color-border) 40%, transparent)',
                          }}
                          transition={SPRING}
                          className='w-full rounded-sm relative z-10'
                        />
                      </button>
                    );
                  })}
                </div>

                {/* Level labels */}
                <div className='flex gap-1.5'>
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
              <div className='rounded-xl border border-border/70 bg-card px-5 py-5 flex flex-col gap-4'>
                {/* Header with count and context */}
                <div className='flex items-start justify-between'>
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
                    <p className='text-xs font-bold text-primary/80 mt-1'>
                      {Math.ceil((questionCount * 2.5) / 10) * 10}–
                      {Math.ceil((questionCount * 3.5) / 10) * 10} mins
                    </p>
                  </div>
                </div>

                {/* Slider with visual fill */}
                <div className='flex flex-col gap-2'>
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
                <div className='flex gap-2'>
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
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : 'border-border/40 bg-muted/30 text-muted-foreground hover:border-border/70 hover:bg-muted/50',
                      )}
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
                className='flex items-start gap-3.5 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4'
              >
                <div className='p-1.5 bg-amber-500/10 rounded-lg mt-0.5 shrink-0'>
                  <AlertTriangle className='w-4 h-4 text-amber-600 dark:text-amber-400' />
                </div>
                <div className='flex-1 space-y-2'>
                  <p className='text-sm font-semibold text-foreground leading-snug'>
                    API key missing
                  </p>
                  <p className='text-xs text-muted-foreground leading-relaxed'>
                    An OpenRouter API key is required before generating
                    questions.
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
          <div className='w-full lg:flex-1 flex flex-col gap-8'>
            {/* Presets */}
            <div className='flex flex-col gap-3'>
              <p className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50'>
                Presets
              </p>
              <div className='rounded-xl border border-border/70 bg-card p-4'>
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

            {/* Advanced Options */}
            <div className='flex flex-col gap-3'>
              <p className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50'>
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
                hasAnyMathTopic={hasAnyMathTopic}
                techMode={techMode}
                onSetTechMode={onSetTechMode}
                customFocusArea={customFocusArea}
                onSetCustomFocusArea={onSetCustomFocusArea}
                diversityStrictness={diversityStrictness}
                onSetDiversityStrictness={onSetDiversityStrictness}
                strictLatexValidation={strictLatexValidation}
                onSetStrictLatexValidation={onSetStrictLatexValidation}
              />
            </div>
          </div>
        </div>

        {/* ── STICKY CONTROL BAR ── */}
        <div className='sticky bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border/40'>
          <div className='px-6 py-4'>
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
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className='flex items-center justify-between gap-6'>
              {/* Cost & token estimates */}
              <div className='flex items-center gap-6'>
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
                <div className='hidden sm:flex items-center gap-2 mr-2'>
                  <span className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground/40 whitespace-nowrap'>
                    Model
                  </span>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger className='h-9 w-44 text-xs bg-muted/20 border-border/40 hover:bg-muted/30 transition-colors shadow-none focus:ring-0'>
                      <SelectValue placeholder='Select model' />
                    </SelectTrigger>
                    <SelectContent>
                      {displayModels.map((m) => (
                        <SelectItem key={m.id} value={m.id} className='text-xs'>
                          {m.name}
                        </SelectItem>
                      ))}
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
                          'h-10 px-6 rounded-full font-bold text-sm gap-2 transition-all',
                          isGenerationDisabled
                            ? 'opacity-50 cursor-not-allowed'
                            : 'shadow-sm',
                        )}
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className='w-4 h-4 animate-spin' />
                            <span>Generating…</span>
                          </>
                        ) : (
                          <>
                            <Zap className='w-4 h-4' />
                            Generate
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
