import {
  ArrowLeft,
  ArrowRight,
  Trash2,
  Info,
  RefreshCw,
  Flag,
  Timer,
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
import { TelemetryTooltip } from '@/views/generator/WrittenSessionHeader';
import { cn } from '@/lib/utils';
import { useTimerBar } from '@/context/TimerBarContext';

type McSessionHeaderProps = {
  questionIndex: number;
  totalQuestions: number;
  completedCount: number;
  topic: string | undefined;
  difficulty: Difficulty;
  techAllowed: boolean | undefined;
  isMathTopic: boolean;
  isAtLast: boolean;
  canAdvance: boolean;
  generationStartedAt: number | null;
  telemetry: GenerationTelemetry | null;
  getDifficultyBadgeClasses: (level: Difficulty) => string;
  onPrev: () => void;
  onNext: () => void;
  onDelete: () => void;
  onExit: () => void;
  onRegenerate?: () => void;
};

export function McSessionHeader({
  questionIndex,
  totalQuestions,
  completedCount,
  topic,
  difficulty,
  techAllowed,
  isMathTopic,
  isAtLast,
  canAdvance,
  generationStartedAt,
  telemetry,
  getDifficultyBadgeClasses,
  onPrev,
  onNext,
  onDelete,
  onExit,
  onRegenerate,
}: McSessionHeaderProps) {
  const progressPct =
    totalQuestions > 0 ? ((questionIndex + 1) / totalQuestions) * 100 : 0;

  const timerBar = useTimerBar();
  const formatTimerValue = (seconds: number) => {
    const floored = Math.floor(Math.max(0, seconds));
    const mins = Math.floor(floored / 60);
    const secs = floored % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const TimeDisplay = ({
    icon: Icon,
    value,
    className,
  }: {
    icon: React.ElementType;
    value: string;
    className?: string;
  }) => (
    <div className="flex items-center gap-1.5">
      <Icon className={cn('w-3.5 h-3.5', className)} />
      <span
        className={cn('text-sm font-bold tabular-nums font-mono', className)}
      >
        {value}
      </span>
    </div>
  );

  return (
    <div className="sticky top-0 z-20 bg-background/90 backdrop-blur-md">
      {/* Session progress bar at very top */}
      <div className="h-1 w-full bg-muted/30">
        <div
          className="h-full bg-violet-500 transition-all duration-500 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="border-b border-border/40">
        {/* Mode + timer row */}
        <div className="px-4 pt-2 pb-0 flex items-center justify-between">
          {/* Current question timer */}
          {timerBar && (
            <TimeDisplay
              icon={Timer}
              value={formatTimerValue(
                timerBar.timerBarData?.currentQuestionTimeUsed ?? 0
              )}
              className="text-muted-foreground"
            />
          )}
        </div>
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
              <TooltipContent side="bottom" align="end" sideOffset={8}>
                <TelemetryTooltip
                  generationStartedAt={generationStartedAt}
                  telemetry={telemetry}
                />
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {onRegenerate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRegenerate}
              className="h-9 w-9 p-0 rounded-full"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={totalQuestions === 0}
            className="h-9 w-9 p-0 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={onPrev}
              disabled={questionIndex === 0}
              className="h-9 w-9 p-0 rounded-full"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant={isAtLast ? 'default' : 'secondary'}
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
