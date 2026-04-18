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
  Hash,
  Loader2,
  SigmaSquare,
  Target,
  TestTubeDiagonal,
  Zap,
} from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAppSettings } from '@/AppContext';
import {
  FilterButton,
  FilterGroup,
  PageHeader,
} from '@/components/layout/primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
  TOPICS,
} from '@/types';

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
  },
  Easy: {
    label: 'Easy',
    color: 'text-sky-600 dark:text-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/30',
    desc: 'Straightforward',
    width: '40%',
    themeColor: '#0ea5e9',
  },
  Medium: {
    label: 'Medium',
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    desc: 'Balanced',
    width: '60%',
    themeColor: '#f59e0b',
  },
  Hard: {
    label: 'Hard',
    color: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    desc: 'Complex',
    width: '80%',
    themeColor: '#f97316',
  },
  Extreme: {
    label: 'Extreme',
    color: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    desc: 'Edge cases',
    width: '100%',
    themeColor: '#f43f5e',
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
  generationStatus: GenerationStatusEvent | null;
  generationStartedAt: number | null;
  formattedElapsedTime: string;
  onGenerate: () => void;
  onStartOver: () => void;
  lastGenerationTelemetry?: GenerationTelemetry | null;
  streamText?: string;
  batchProgress?: BatchTopicProgress[];
  generationStrategy?: 'single-pass' | 'multi-pass';
  /** When several API calls run per subject after local subtopic selection. */
  generationSubCallProgress?: GenerationSubCallProgress | null;
};

const EMPTY_BATCH_PROGRESS: BatchTopicProgress[] = [];

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
  generationStatus,
  formattedElapsedTime,
  onGenerate,
  onStartOver,
  lastGenerationTelemetry,
  streamText = '',
  batchProgress = EMPTY_BATCH_PROGRESS,
  generationSubCallProgress = null,
  generationStrategy = 'multi-pass',
}: SetupPanelProps) {
  const navigate = useNavigate();
  const { apiKey, model } = useAppSettings();
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
  const activeDifficulty = normalizeDifficulty(difficulty);
  const activeDifficultyMeta = DIFFICULTY_META[activeDifficulty];

  const showBatchTimeline = batchProgress.length > 1;

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
    if (!hasApiKey) {
      reasons.push('OpenRouter API key is missing');
    }
    if (!model || model.trim().length === 0) {
      reasons.push('AI model not selected');
    }
    if (selectedTopics.length === 0) {
      reasons.push('Select at least one topic');
    }
    if (questionCount < 1) {
      reasons.push('Question count must be at least 1');
    }
    if (questionCount > 20) {
      reasons.push('Question count cannot exceed 20');
    }
    if (isGenerating) {
      reasons.push('Generation in progress');
    }
    return reasons;
  }, [hasApiKey, model, selectedTopics.length, questionCount, isGenerating]);

  const isGenerationDisabled = generationDisabledReasons.length > 0;

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
        <div className='relative px-6 flex flex-col lg:flex-row gap-8 flex-1 overflow-y-auto'>
          {/* ── LEFT COLUMN: Core Configuration & Generate ── */}
          <div className='w-full lg:w-105 xl:w-120 flex flex-col gap-6 shrink-0'>
            {/* Header */}
            <div className='space-y-6'>
              <PageHeader
                title='Generator'
                description='Configure revision settings.'
              />
            </div>

            <FilterGroup className='w-full justify-between'>
              <FilterButton
                active={questionMode === 'written'}
                onClick={() => onSetQuestionMode('written')}
                className={cn(
                  'flex-1 h-12 transition-all duration-300',
                  questionMode === 'written'
                    ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
                    : 'hover:bg-blue-500/5 hover:text-blue-500/80 hover:border-blue-500/20',
                )}
              >
                <BookOpen className='w-4 h-4 mr-2' /> Written
              </FilterButton>
              <FilterButton
                active={questionMode === 'multiple-choice'}
                onClick={() => onSetQuestionMode('multiple-choice')}
                className={cn(
                  'flex-1 h-12 transition-all duration-300',
                  questionMode === 'multiple-choice'
                    ? 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30'
                    : 'hover:bg-violet-500/5 hover:text-violet-500/80 hover:border-violet-500/20',
                )}
              >
                <Target className='w-4 h-4 mr-2' /> Multiple Choice
              </FilterButton>
            </FilterGroup>
            <div className='grid grid-cols-2 gap-3'>
              {TOPICS.map((topic) => {
                const isSelected = selectedTopics.includes(topic);
                return (
                  <motion.button
                    key={topic}
                    type='button'
                    onClick={() => onToggleTopic(topic)}
                    whileHover={{ y: -2, scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    transition={SPRING}
                    className={cn(
                      'relative flex flex-col items-start gap-4 p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer select-none group',
                      isSelected
                        ? 'bg-primary/5 border-primary/30'
                        : 'bg-transparent border-border/60 hover:border-foreground/30 hover:bg-muted/30',
                    )}
                  >
                    <div className='flex items-start justify-between w-full relative z-10'>
                      <div
                        className={cn(
                          'p-2 rounded-lg transition-colors duration-200',
                          isSelected
                            ? 'bg-primary/5 border-primary/30 text-primary'
                            : 'bg-muted/50 text-muted-foreground group-hover:text-foreground',
                        )}
                      >
                        {TOPIC_ICONS[topic] ?? <BookOpen className='w-4 h-4' />}
                      </div>
                      <div
                        className={cn(
                          'w-4 h-4 rounded-sm border flex items-center justify-center transition-all duration-200',
                          isSelected
                            ? 'bg-primary/5 border-primary/30 text-primary'
                            : 'border-border/60 bg-transparent',
                        )}
                      >
                        {isSelected && (
                          <Check
                            className='w-3 h-3 text-current'
                            strokeWidth={3}
                          />
                        )}
                      </div>
                    </div>
                    <div className='relative z-10'>
                      <h3
                        className={cn(
                          'text-sm font-medium leading-tight',
                          isSelected
                            ? 'text-foreground'
                            : 'text-muted-foreground group-hover:text-foreground',
                        )}
                      >
                        {topic}
                      </h3>
                    </div>
                  </motion.button>
                );
              })}
            </div>
            <div className='p-6 bg-transparent rounded-xl border border-border/60 relative flex flex-col gap-6'>
              <div className='flex items-center justify-between px-1'>
                <span
                  className={cn(
                    'text-sm font-black uppercase tracking-widest',
                    activeDifficultyMeta.color,
                  )}
                >
                  {activeDifficultyMeta.label}
                </span>
                <Badge
                  variant='outline'
                  className={cn(
                    'font-mono text-[10px] tracking-widest',
                    activeDifficultyMeta.border,
                    activeDifficultyMeta.color,
                  )}
                >
                  LVL.0{diffIndex + 1}
                </Badge>
              </div>

              {/* Stepped Equalizer/Gauge */}
              <div className='flex gap-2 h-14 items-end px-1 group/gauge'>
                {levels.map((level, idx) => {
                  const isActive = idx <= diffIndex;
                  const isCurrent = idx === diffIndex;
                  return (
                    <button
                      key={level}
                      type='button'
                      onClick={() => onSetDifficulty(level)}
                      className='group/bar relative flex-1 h-full flex items-end justify-center cursor-pointer outline-none'
                    >
                      {/* Background Slot */}
                      <div className='absolute inset-0 w-full h-full bg-muted/10 rounded-sm' />

                      {/* Active Level Fill */}
                      <motion.div
                        initial={false}
                        animate={{
                          height: isCurrent
                            ? `${60 + idx * 12}%`
                            : isActive
                              ? `${40 + idx * 12}%`
                              : '20%',
                          backgroundColor: isCurrent
                            ? activeDifficultyMeta.themeColor
                            : isActive
                              ? `color-mix(in srgb, ${activeDifficultyMeta.themeColor} 40%, transparent)`
                              : 'color-mix(in srgb, var(--color-muted) 60%, transparent)',
                        }}
                        whileHover={{
                          height: `${60 + idx * 12}%`,
                          backgroundColor:
                            activeDifficultyMeta.themeColor,
                          transition: { duration: 0.1 },
                        }}
                        transition={SPRING}
                        className={cn(
                          'w-full rounded-sm relative z-10 shadow-sm transition-shadow duration-300',
                          isCurrent &&
                          'shadow-[0_0_12px_rgba(var(--color-foreground),0.3)]',
                        )}
                      />

                      {/* Selection Indicator */}
                      {isCurrent && (
                        <motion.div
                          layoutId='active-difficulty-dot'
                          className='absolute -bottom-2 w-1.5 h-1.5 rounded-full shadow-[0_0_8px_currentColor]'
                          style={{
                            backgroundColor:
                              activeDifficultyMeta.themeColor,
                            color: activeDifficultyMeta.themeColor,
                          }}
                          transition={SPRING}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className='p-6 bg-transparent rounded-xl border border-border/60 relative flex flex-col gap-2'>
              <div className='flex items-center justify-between'>
                <Label className='text-sm font-semibold flex items-center gap-2 text-foreground'>
                  <Hash className='w-4 h-4 text-muted-foreground' /> Total
                  Questions
                </Label>
                <div className='text-xl font-medium text-foreground'>
                  {questionCount}
                </div>
              </div>
              <div>
                <Slider
                  min={1}
                  max={20}
                  step={1}
                  value={[questionCount]}
                  onValueChange={(val) => onSetQuestionCount(val[0])}
                />
                <div className='flex justify-between mt-2 font-mono text-[10px] text-muted-foreground font-medium'>
                  <span>1</span>
                  <span>20</span>
                </div>
              </div>
            </div>

            {/* API key warning */}
            {!hasApiKey && (
              <div className='flex items-start gap-4 rounded-xl border border-border/60 bg-muted/30 p-5'>
                <div className='p-2 bg-muted/50 rounded-md border border-border/60'>
                  <AlertTriangle className='w-5 h-5 text-foreground shrink-0' />
                </div>
                <div className='flex-1 space-y-2 pt-0.5'>
                  <p className='text-sm text-foreground leading-snug font-medium'>
                    <strong>SYSTEM WARNING:</strong> OpenRouter API key missing.
                    Configuration required before synthesis sequence.
                  </p>
                  <Button
                    size='sm'
                    variant='outline'
                    className='rounded-md border-border/60 hover:bg-muted/50'
                    onClick={() => void navigate('/settings')}
                  >
                    Configure Settings
                  </Button>
                </div>
              </div>
            )}
          </div>
          {/* ── RIGHT COLUMN: Advanced Configuration ── */}
          <div className='w-full lg:flex-1 flex flex-col gap-6 pt-2'>
            {/* Presets */}
            <div className='space-y-4'>
              <Label className='text-xs font-black uppercase tracking-[0.2em] text-muted-foreground/80 flex flex-row items-center gap-2'>
                <TestTubeDiagonal className='w-3.5 h-3.5' /> Presets
              </Label>
              <PresetSection
                selectedTopics={selectedTopics}
                difficulty={difficulty}
                techMode={techMode}
                selectedSubtopics={selectedSubtopics}
                questionCount={questionCount}
                averageMarksPerQuestion={averageMarksPerQuestion}
                questionMode={questionMode}
              />
            </div>
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

        {/* ── STICKY CONTROL BAR ── */}
        <div className='sticky bottom-0 left-0 right-0 z-50 bg-background/80 border-t border-border/40 px-6 py-3'>
          <div className='mx-auto relative'>
            <div className='flex flex-col gap-2'>
              {/* Generation Progress (Full Width when active) */}
              <AnimatePresence>
                {isGenerating && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className='overflow-hidden'
                  >
                    <div className='pb-3'>
                      {showBatchTimeline ? (
                        <BatchTimeline
                          entries={batchProgress}
                          generationSubCallProgress={generationSubCallProgress}
                          formattedElapsedTime={formattedElapsedTime}
                          streamText={streamText}
                          isGenerating={isGenerating}
                          isPaused={isPaused}
                          onTogglePause={onTogglePause}
                        />
                      ) : (
                        <GenerationTimeline
                          generationStatus={generationStatus}
                          generationSubCallProgress={generationSubCallProgress}
                          formattedElapsedTime={formattedElapsedTime}
                          streamText={streamText}
                          isGenerating={isGenerating}
                          isPaused={isPaused}
                          onTogglePause={onTogglePause}
                        />
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className='flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4'>
                {/* Telemetry Cluster - Industrial Cluster */}
                <div className='flex flex-wrap items-center gap-x-8 gap-y-3'>
                  {/* Cost Cluster */}
                  <div className='relative'>
                    <div className='flex items-baseline gap-1.5'>
                      <span className='text-xl font-mono font-black tabular-nums tracking-tight text-foreground'>
                        {estimated.promptCost != null ||
                          estimated.completionCost != null
                          ? formatCostUsd(estimated.totalCost).replace('$', '')
                          : '--.--'}
                      </span>
                      <span className='text-xs font-bold text-muted-foreground uppercase tracking-widest'>
                        USD
                      </span>
                    </div>
                  </div>

                  {/* Load Cluster */}
                  <div className='relative min-w-40'>
                    <div className='flex items-baseline gap-2'>
                      <span className='text-xl font-mono font-black tabular-nums tracking-tight text-foreground'>
                        {estimated.totalTokens.toLocaleString()}
                      </span>
                      <span className='text-[10px] font-bold text-muted-foreground uppercase tracking-tighter'>
                        Tokens
                      </span>
                    </div>

                    {estimated.confidence != null && (
                      <div className='flex items-center gap-2'>
                        <div className='flex-1 h-1 bg-muted/40 rounded-full overflow-hidden'>
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{
                              width: `${estimated.confidence * 100}%`,
                            }}
                            transition={{ duration: 1, ease: 'circOut' }}
                            className='h-full bg-foreground shadow-[0_0_8px_rgba(var(--color-foreground),0.5)]'
                          />
                        </div>
                        <span className='text-[9px] font-mono font-black text-foreground/80'>
                          {Math.round(estimated.confidence * 100)}% confidence
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className='items-center flex flex-row'>
                  <Button
                    variant='destructive'
                    onClick={onStartOver}
                    disabled={isGenerating}
                  >
                    Start Over
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className='inline-block'>
                        <Button
                          variant='ghost'
                          onClick={onGenerate}
                          disabled={isGenerationDisabled}
                        >
                          <span className='relative flex items-center justify-center gap-4 text-sm'>
                            {isGenerating ? (
                              <>
                                <div className='relative'>
                                  <Loader2 className='w-5 h-5 animate-spin' />
                                  <div className='absolute inset-0 w-5 h-5 animate-ping bg-background/30 rounded-full' />
                                </div>
                                <span className='animate-pulse'>
                                  Loading...
                                </span>
                              </>
                            ) : (
                              <span className='flex flex-row items-center gap-3 text-md'>
                                <Zap className='w-5 h-5 -rotate-12' /> Generate
                              </span>
                            )}
                          </span>
                        </Button>
                      </div>
                    </TooltipTrigger>
                    {isGenerationDisabled && (
                      <TooltipContent
                        side='top'
                        className='flex flex-col gap-1.5'
                      >
                        <p className='flex items-center gap-2'>
                          <AlertTriangle className='w-3.5 h-3.5' /> Missing
                          Requirements
                        </p>
                        <ul className='space-y-1'>
                          {generationDisabledReasons.map((reason, i) => (
                            <li
                              key={i}
                              className='text-[10px] flex items-center gap-2'
                            >
                              <div className='w-1 h-1 rounded-full bg-destructive-foreground/50' />
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
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <LastGenerationStats telemetry={lastGenerationTelemetry} />
                  </motion.div>
                )}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

export const SetupPanel = memo(SetupPanelImpl);
