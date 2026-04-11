import { invoke } from '@tauri-apps/api/core';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  BookOpen,
  CheckCheck,
  Coins,
  DollarSign,
  Dumbbell,
  FlaskConical,
  FunctionSquare,
  Loader2,
  SigmaSquare,
  Target,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { estimateTokensAndCost, formatCostUsd } from '@/lib/app-utils';
import { useAppStore } from '@/store';
import {
  type BatchTopicProgress,
  type ChemistrySubtopic,
  type Difficulty,
  type DiversityStrictness,
  type GenerationStatusEvent,
  type GenerationSubCallProgress,
  type GenerationTelemetry,
  type MathMethodsSubtopic,
  type PhysicalEducationSubtopic,
  type QuestionMode,
  type SpecialistMathSubtopic,
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
import { SectionLabel } from './SetupUI';

const SPRING = { type: 'spring' as const, stiffness: 300, damping: 20 };

export * from './AdvancedOptions';
export * from './PresetSection';
export * from './SetupUI';
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
  diversityStrictness: DiversityStrictness;
  onSetDiversityStrictness: (value: DiversityStrictness) => void;
  strictLatexValidation: boolean;
  onSetStrictLatexValidation: (enabled: boolean) => void;
  strictSubtopicCoverage: boolean;
  onSetStrictSubtopicCoverage: (enabled: boolean) => void;
  minSubtopicCoverageRatio: number;
  onSetMinSubtopicCoverageRatio: (ratio: number) => void;
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
  /** When several API calls run per subject after local subtopic selection. */
  generationSubCallProgress?: GenerationSubCallProgress | null;
};

// ─── Component ────────────────────────────────────────────────────────────────

/* eslint-disable complexity */
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
  diversityStrictness,
  onSetDiversityStrictness,
  strictLatexValidation,
  onSetStrictLatexValidation,
  strictSubtopicCoverage,
  onSetStrictSubtopicCoverage,
  minSubtopicCoverageRatio,
  onSetMinSubtopicCoverageRatio,
  difficulty,
  onSetDifficulty,
  questionCount,
  onSetQuestionCount,
  averageMarksPerQuestion,
  onSetAverageMarksPerQuestion,
  avoidSimilarQuestions,
  shuffleQuestions,
  onSetShuffleQuestions,
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
  generationSubCallProgress = null,
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
            ? mathMethodsSubtopics.map((sub) => toCanonicalSubtopicName(sub))
            : []),
          ...(selectedTopics.includes('Specialist Mathematics')
            ? specialistMathSubtopics.map((sub) => toCanonicalSubtopicName(sub))
            : []),
          ...(selectedTopics.includes('Chemistry')
            ? chemistrySubtopics.map((sub) => toCanonicalSubtopicName(sub))
            : []),
          ...(selectedTopics.includes('Physical Education')
            ? physicalEducationSubtopics.map((sub) =>
                toCanonicalSubtopicName(sub)
              )
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
            title="Generator"
            description="Setup generation parameters here."
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
                  <motion.button
                    key={topic}
                    type="button"
                    onClick={() => onToggleTopic(topic)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={SPRING}
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
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={SPRING}
                      >
                        <CheckCheck className="w-3.5 h-3.5 shrink-0 opacity-70" />
                      </motion.span>
                    )}
                  </motion.button>
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
            <AdvancedOptionsGroup
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
              shuffleQuestions={shuffleQuestions}
              onSetShuffleQuestions={onSetShuffleQuestions}
              customFocusArea={customFocusArea}
              onSetCustomFocusArea={onSetCustomFocusArea}
              diversityStrictness={diversityStrictness}
              onSetDiversityStrictness={onSetDiversityStrictness}
              strictLatexValidation={strictLatexValidation}
              onSetStrictLatexValidation={onSetStrictLatexValidation}
              strictSubtopicCoverage={strictSubtopicCoverage}
              onSetStrictSubtopicCoverage={onSetStrictSubtopicCoverage}
              minSubtopicCoverageRatio={minSubtopicCoverageRatio}
              onSetMinSubtopicCoverageRatio={onSetMinSubtopicCoverageRatio}
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
                  onClick={() => void navigate('/settings')}
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
                        {TOPIC_ICONS[t] && (
                          <span className="opacity-70">{TOPIC_ICONS[t]}</span>
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
              className="w-full py-5 text-sm font-bold gap-2 transition-all duration-200" // Removed h-full, increased py for better click target
              onClick={onGenerate}
              disabled={!canGenerate}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate Practice Set'
              )}
            </Button>
          </div>

          {/* Generation timeline */}
          {isGenerating &&
            (showBatchTimeline ? (
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
