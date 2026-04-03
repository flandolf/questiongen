import {
  ArrowLeft,
  ArrowRight,
  Trash2,
  Info,
  RefreshCw,
  Flag,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Difficulty, GenerationTelemetry } from '@/types';
import { formatDurationMs } from '../../lib/app-utils';
import { useEffect, useState } from 'react';

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
  getDifficultyBadgeClasses: (level: Difficulty) => string;
  onPrev: () => void;
  onNext: () => void;
  onDelete: () => void;
  onExit: () => void;
  onRegenerate?: () => void;
};
export function SessionHeader({
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
  getDifficultyBadgeClasses,
  onPrev,
  onNext,
  onDelete,
  onExit,
  onRegenerate,
}: SessionHeaderProps) {
  const progressPct =
    totalQuestions > 0 ? ((questionIndex + 1) / totalQuestions) * 100 : 0;
  const progressBarColor = type === 'written' ? 'bg-blue-500' : 'bg-violet-500';

  // Live ticking timer display — increments locally between parent re-renders
  // and freezes when the session is paused
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (questionTimeSeconds === undefined) {
      setTick(0);
      return;
    }
    setTick(questionTimeSeconds);
    if (isPaused) return;
    const id = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(id);
  }, [questionTimeSeconds, isPaused]);
  const displaySeconds = questionTimeSeconds !== undefined ? tick : 0;
  const timerDisplay = `${Math.floor(displaySeconds / 60)}:${String(displaySeconds % 60).padStart(2, '0')}`;

  return (
    <div className="sticky top-0 z-20 bg-background/90 backdrop-blur-md">
      {/* Session progress bar at very top */}
      <div className="h-1 w-full bg-muted/30">
        <div
          className={`h-full ${progressBarColor} transition-all duration-500 ease-out`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Navigation row */}
      <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onExit}
            className="gap-2 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 h-9"
          >
            <Flag className="w-4 h-4" /> End Session
          </Button>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <div className="hidden sm:flex items-center gap-2 text-sm font-medium">
            <span className="text-foreground">Q {questionIndex + 1}</span>
            <span className="text-muted-foreground">of {totalQuestions}</span>
          </div>
          {questionTimeSeconds !== undefined && (
            <span className="flex items-center gap-1 text-xs font-mono tabular-nums text-muted-foreground">
              <Clock className="w-3 h-3" />
              {timerDisplay}
            </span>
          )}
          {completedCount > 0 && completedCount < totalQuestions && (
            <span className="text-[10px] text-muted-foreground tabular-nums hidden sm:inline">
              ({completedCount} answered)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <div className="hidden lg:flex items-center gap-1.5 text-xs bg-muted/50 px-3 py-1.5 rounded-full">
            {topic && (
              <Badge
                variant="outline"
                className="h-5 px-1.5 text-[10px] font-medium border-border/50"
              >
                {topic}
              </Badge>
            )}
            <Badge
              variant="outline"
              className={`h-5 px-1.5 text-[10px] font-semibold ${getDifficultyBadgeClasses(difficulty)}`}
            >
              {difficulty}
            </Badge>
            {type === 'written' && maxMarks !== undefined && (
              <Badge
                variant="secondary"
                className="h-5 px-1.5 text-[10px] bg-sky-500/10 text-sky-700 hover:bg-sky-500/20"
              >
                {maxMarks} marks
              </Badge>
            )}
            {isMathTopic && techAllowed !== undefined && (
              <Badge
                variant={techAllowed ? 'default' : 'destructive'}
                className="h-5 px-1.5 text-[10px]"
              >
                {techAllowed ? 'CAS' : 'No CAS'}
              </Badge>
            )}
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 rounded-full text-muted-foreground hover:text-foreground h-9 w-9"
                  aria-label="Question details"
                >
                  <Info className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                align="end"
                sideOffset={8}
                className={
                  type === 'written' ? 'w-72 max-w-[calc(100vw-2rem)] p-3' : ''
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
                    variant="ghost"
                    size="sm"
                    onClick={onRegenerate}
                    className="h-9 w-9 p-0 rounded-full"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Regenerate this question</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDelete}
                  disabled={totalQuestions === 0}
                  className="h-9 w-9 p-0 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Remove question from set</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onPrev}
                    disabled={questionIndex === 0}
                    className="h-9 w-9 p-0 rounded-full"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Previous question (Left arrow)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              variant={isAtLast && canAdvance ? 'default' : 'secondary'}
              size="sm"
              onClick={onNext}
              disabled={!canAdvance}
              className="h-9 rounded-full px-4 gap-1.5 shadow-sm"
            >
              <span>{isAtLast ? 'Complete' : 'Next'}</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
      <div className="text-xs text-background/80">
        No generation diagnostics yet.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="font-semibold text-background">Question details</div>
      {telemetry && (
        <Row
          label="Generation time"
          value={formatDurationMs(telemetry.durationMs)}
        />
      )}
      {telemetry?.totalTokens !== undefined && telemetry.totalTokens > 0 && (
        <Row
          label="Tokens"
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
          label="Distinctness"
          value={`${(telemetry.distinctnessAvg * 100).toFixed(0)}%`}
        />
      )}
      {telemetry?.multiStepDepthAvg !== undefined && (
        <Row
          label="Multi-step depth"
          value={telemetry.multiStepDepthAvg.toFixed(2)}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-background/80">
      <span>{label}</span>
      <span className="text-background">{value}</span>
    </div>
  );
}
