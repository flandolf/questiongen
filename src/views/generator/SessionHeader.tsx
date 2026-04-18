import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Flag,
  Info,
  Pause,
  Play,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { memo, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Difficulty, GenerationTelemetry } from '@/types';

import { formatDurationMs } from '../../lib/app-utils';
import { useAppStore } from '../../store';

type SessionHeaderProps = {
  type: 'written' | 'mc';
  questionIndex: number;
  totalQuestions: number;
  completedCount: number;
  topic: string | undefined;
  difficulty: Difficulty;
  maxMarks?: number;
  techAllowed: boolean | undefined;
  isMathTopic: boolean;
  isAtLast: boolean;
  canAdvance: boolean;
  generationStartedAt: number | null;
  telemetry: GenerationTelemetry | null;
  questionTimeSeconds?: number;
  isPaused?: boolean;
  isQuestionWarning?: boolean;
  questionMarks?: number;
  getDifficultyBadgeClasses: (level: Difficulty) => string;
  onPrev: () => void;
  onNext: () => void;
  onDelete: () => void;
  onExit: () => void;
  onRegenerate?: () => void;
  onTogglePause?: () => void;
  onResetTimer?: () => void;
};

function TimerDisplay({
  questionTimeSeconds,
  isPaused,
  isQuestionWarning,
  recommendedSeconds,
  onTogglePause,
  onResetTimer,
}: {
  questionTimeSeconds: number;
  isPaused?: boolean;
  isQuestionWarning?: boolean;
  recommendedSeconds?: number;
  onTogglePause?: () => void;
  onResetTimer?: () => void;
}) {
  const [tick, setTick] = useState(questionTimeSeconds);

  useEffect(() => {
    setTick(questionTimeSeconds);
    if (isPaused) return;
    const id = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(id);
  }, [questionTimeSeconds, isPaused]);

  const wholeSeconds = Math.max(0, Math.floor(tick));
  const timerDisplay = `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`;
  const formatSeconds = (s: number) => {
    const safeSeconds = Number.isFinite(s) ? Math.max(0, Math.floor(s)) : 0;
    return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
  };

  return (
    <span
      className={`flex items-center gap-1 text-xs font-mono tabular-nums ${isQuestionWarning ? 'text-amber-500 font-bold' : 'text-muted-foreground'}`}
    >
      <Clock
        className={`w-3 h-3 ${isQuestionWarning ? 'animate-pulse' : ''}`}
      />
      <span>
        {timerDisplay} /{' '}
        {recommendedSeconds !== undefined
          ? formatSeconds(recommendedSeconds)
          : '0:00'}
      </span>

      {onTogglePause && (
        <Button
          variant='ghost'
          size='icon-sm'
          onClick={onTogglePause}
          title={isPaused ? 'Resume timer' : 'Pause timer'}
          className='h-6 w-6 p-0 rounded-full ml-1'
        >
          {isPaused ? (
            <Play className='w-3 h-3' />
          ) : (
            <Pause className='w-3 h-3' />
          )}
        </Button>
      )}

      {onResetTimer && (
        <Button
          variant='ghost'
          size='icon-sm'
          onClick={onResetTimer}
          title='Reset timer'
          className='h-6 w-6 p-0 rounded-full'
        >
          <RefreshCw className='w-3 h-3' />
        </Button>
      )}

      {isQuestionWarning && (
        <span className='text-amber-500 text-[10px] font-bold animate-pulse'>
          !
        </span>
      )}
    </span>
  );
}

const SessionProgressBar = ({
  progressPct,
  progressBarColor,
}: {
  progressPct: number;
  progressBarColor: string;
}) => (
  <div className='h-1 w-full bg-muted/30'>
    <div
      className={`h-full ${progressBarColor} transition-all duration-500 ease-out`}
      style={{ width: `${progressPct}%` }}
    />
  </div>
);

const SessionNavigationLeft = ({
  onExit,
  questionIndex,
  totalQuestions,
  questionTimeSeconds,
  isPaused,
  isQuestionWarning,
  recommendedSeconds,
  onTogglePause,
  onResetTimer,
  completedCount,
}: {
  onExit: () => void;
  questionIndex: number;
  totalQuestions: number;
  questionTimeSeconds?: number;
  isPaused?: boolean;
  isQuestionWarning?: boolean;
  recommendedSeconds?: number;
  onTogglePause?: () => void;
  onResetTimer?: () => void;
  completedCount: number;
}) => (
  <div className='flex min-w-0 items-center gap-3'>
    <Button
      variant='ghost'
      size='sm'
      onClick={onExit}
      className='gap-2 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 h-9'
    >
      <Flag className='w-4 h-4' /> End Session
    </Button>
    <div className='h-4 w-px bg-border hidden sm:block' />
    <div className='hidden sm:flex items-center gap-2 text-sm font-medium'>
      <span className='text-foreground'>Q {questionIndex + 1}</span>
      <span className='text-muted-foreground'>of {totalQuestions}</span>
    </div>
    {questionTimeSeconds !== undefined && (
      <TimerDisplay
        questionTimeSeconds={questionTimeSeconds}
        isPaused={isPaused}
        isQuestionWarning={isQuestionWarning}
        recommendedSeconds={recommendedSeconds}
        onTogglePause={onTogglePause}
        onResetTimer={onResetTimer}
      />
    )}
    {completedCount > 0 && completedCount < totalQuestions && (
      <span className='text-[10px] text-muted-foreground tabular-nums hidden sm:inline'>
        ({completedCount} answered)
      </span>
    )}
  </div>
);

export const SessionHeader = memo(function SessionHeader({
  type,
  questionIndex,
  totalQuestions,
  completedCount,
  topic,
  difficulty,
  maxMarks,
  techAllowed,
  isMathTopic,
  isAtLast,
  canAdvance,
  generationStartedAt,
  telemetry,
  questionTimeSeconds,
  isPaused,
  isQuestionWarning,
  questionMarks,
  getDifficultyBadgeClasses,
  onPrev,
  onNext,
  onDelete,
  onExit,
  onRegenerate,
  onTogglePause,
  onResetTimer,
}: SessionHeaderProps) {
  const timeAllocations = useAppStore((s) => s.timeAllocations);
  const difficultyAllocation = timeAllocations.find(
    (a) => a.difficulty === difficulty,
  );
  const progressPct =
    totalQuestions > 0 ? ((questionIndex + 1) / totalQuestions) * 100 : 0;
  const progressBarColor = type === 'written' ? 'bg-blue-500' : 'bg-violet-500';
  const marksRaw = questionMarks ?? maxMarks ?? 1;
  const safeMarks = Number.isFinite(marksRaw) ? Math.max(1, marksRaw) : 1;
  const minutesPerMark = difficultyAllocation?.minutesPerMark;

  const recommendedSeconds =
    typeof minutesPerMark === 'number' && Number.isFinite(minutesPerMark)
      ? Math.round(
          minutesPerMark * safeMarks * (type === 'written' ? 1 : 0.8) * 60,
        )
      : undefined;

  return (
    <div className='sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border'>
      <SessionProgressBar
        progressPct={progressPct}
        progressBarColor={progressBarColor}
      />

      {/* Navigation row */}
      <div className='px-4 py-2 flex flex-wrap items-center justify-between gap-3'>
        <SessionNavigationLeft
          onExit={onExit}
          questionIndex={questionIndex}
          totalQuestions={totalQuestions}
          questionTimeSeconds={questionTimeSeconds}
          isPaused={isPaused}
          isQuestionWarning={isQuestionWarning}
          recommendedSeconds={recommendedSeconds}
          onTogglePause={onTogglePause}
          onResetTimer={onResetTimer}
          completedCount={completedCount}
        />

        <div className='flex items-center gap-2 ml-auto'>
          <InfoBadges
            topic={topic}
            difficulty={difficulty}
            maxMarks={maxMarks}
            type={type}
            isMathTopic={isMathTopic}
            techAllowed={techAllowed}
            getDifficultyBadgeClasses={getDifficultyBadgeClasses}
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant='ghost'
                  size='icon-sm'
                  className='shrink-0 rounded-full text-muted-foreground hover:text-foreground h-9 w-9'
                  aria-label='Question details'
                >
                  <Info className='h-3.5 w-3.5' />
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side='bottom'
                align='end'
                sideOffset={8}
                className={
                  type === 'written'
                    ? 'w-72 max-w-[calc(100vw-2rem)] p-3 z-50'
                    : 'z-50'
                }
              >
                <TelemetryTooltip
                  generationStartedAt={generationStartedAt}
                  telemetry={telemetry}
                />
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {onRegenerate && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={onRegenerate}
                    className='h-9 w-9 p-0 rounded-full'
                  >
                    <RefreshCw className='w-3.5 h-3.5' />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side='bottom' className='z-50'>
                  <p>Regenerate this question</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={onDelete}
                  disabled={totalQuestions === 0}
                  className='h-9 w-9 p-0 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10'
                >
                  <Trash2 className='w-3.5 h-3.5' />
                </Button>
              </TooltipTrigger>
              <TooltipContent side='bottom' className='z-50'>
                <p>Remove question from set</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className='flex items-center gap-1'>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={onPrev}
                    disabled={questionIndex === 0}
                    className='h-9 w-9 p-0 rounded-full'
                  >
                    <ArrowLeft className='w-3.5 h-3.5' />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side='bottom'>
                  <p>Previous question (Left arrow)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              variant={isAtLast && canAdvance ? 'default' : 'secondary'}
              size='sm'
              onClick={onNext}
              disabled={!canAdvance}
              className='h-9 rounded-full px-4 gap-1.5 shadow-sm'
            >
              <span>{isAtLast ? 'Complete' : 'Next'}</span>
              <ArrowRight className='w-4 h-4' />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});

// ─── Shared telemetry tooltip ─────────────────────────────────────────────────

type TelemetryTooltipProps = {
  generationStartedAt: number | null;
  telemetry: GenerationTelemetry | null;
};

export function TelemetryTooltip({
  generationStartedAt,
  telemetry,
}: TelemetryTooltipProps) {
  const hasAny = generationStartedAt !== null || telemetry;
  if (!hasAny) {
    return (
      <div className='text-xs text-background/80'>
        No generation diagnostics yet.
      </div>
    );
  }
  return (
    <div className='flex flex-col gap-2 text-xs'>
      <div className='font-semibold text-background'>Question details</div>
      {telemetry && (
        <Row
          label='Generation time'
          value={formatDurationMs(telemetry.durationMs)}
        />
      )}
      {telemetry?.totalTokens !== undefined && telemetry.totalTokens > 0 && (
        <Row
          label='Tokens'
          value={
            <span
              title={`Prompt: ${telemetry.promptTokens ?? 0} · Completion: ${telemetry.completionTokens ?? 0}`}
            >
              {telemetry.totalTokens.toLocaleString()}
            </span>
          }
        />
      )}
      {telemetry?.distinctnessAvg !== undefined && (
        <Row
          label='Distinctness'
          value={`${(telemetry.distinctnessAvg * 100).toFixed(0)}%`}
        />
      )}
      {telemetry?.multiStepDepthAvg !== undefined && (
        <Row
          label='Multi-step depth'
          value={telemetry.multiStepDepthAvg.toFixed(2)}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className='flex items-center justify-between gap-3 text-background/80'>
      <span>{label}</span>
      <span className='text-background'>{value}</span>
    </div>
  );
}

function InfoBadges({
  topic,
  difficulty,
  maxMarks,
  type,
  isMathTopic,
  techAllowed,
  getDifficultyBadgeClasses,
}: {
  topic: string | undefined;
  difficulty: Difficulty;
  maxMarks?: number;
  type: 'written' | 'mc';
  isMathTopic: boolean;
  techAllowed: boolean | undefined;
  getDifficultyBadgeClasses: (level: Difficulty) => string;
}) {
  return (
    <div className='hidden lg:flex items-center gap-1.5 text-xs bg-muted/50 px-3 py-1.5 rounded-full'>
      {topic && (
        <Badge
          variant='outline'
          className='h-5 px-1.5 text-[10px] font-medium border-border/50'
        >
          {topic}
        </Badge>
      )}
      <Badge
        variant='outline'
        className={`h-5 px-1.5 text-[10px] font-semibold ${getDifficultyBadgeClasses(difficulty)}`}
      >
        {difficulty}
      </Badge>
      {type === 'written' && maxMarks !== undefined && (
        <Badge
          variant='secondary'
          className='h-5 px-1.5 text-[10px] bg-sky-500/10 text-sky-700 hover:bg-sky-500/20'
        >
          {maxMarks} marks
        </Badge>
      )}
      {isMathTopic && techAllowed !== undefined && (
        <Badge
          variant={techAllowed ? 'default' : 'destructive'}
          className='h-5 px-1.5 text-[10px]'
        >
          {techAllowed ? 'CAS' : 'No CAS'}
        </Badge>
      )}
    </div>
  );
}
