import { ArrowLeft, ArrowRight, Bookmark, Trash2, Info, RefreshCw, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Difficulty, GenerationTelemetry } from "@/types";
import { TelemetryTooltip } from "@/components/generator/WrittenSessionHeader";

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
  hasSavedSet: boolean;
  lastSavedAt?: string | null;
  generationStartedAt: number | null;
  telemetry: GenerationTelemetry | null;
  getDifficultyBadgeClasses: (level: Difficulty) => string;
  onPrev: () => void;
  onNext: () => void;
  onSave: () => void;
  onDelete: () => void;
  onExit: () => void;
  onRegenerate?: () => void;
};

export function McSessionHeader({
  questionIndex, totalQuestions,
  topic, difficulty, techAllowed, isMathTopic,
  isAtLast, canAdvance, hasSavedSet,
  generationStartedAt, telemetry,
  getDifficultyBadgeClasses,
  onPrev, onNext, onSave, onDelete, onExit,
  onRegenerate,
}: McSessionHeaderProps) {
  const progressPct = totalQuestions > 0 ? ((questionIndex + 1) / totalQuestions) * 100 : 0;

  return (
    <div className="sticky top-0 z-20 border-b border-border/40 bg-background/90 backdrop-blur-md">
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onExit} className="gap-2 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 h-9">
            <Flag className="w-4 h-4" /> End Session
          </Button>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <div className="hidden sm:flex items-center gap-2 text-sm font-medium">
            <span className="text-foreground">Q {questionIndex + 1}</span>
            <span className="text-muted-foreground">of {totalQuestions}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <div className="hidden lg:flex items-center gap-1.5 text-xs bg-muted/50 px-3 py-1.5 rounded-full">
            {topic && (
              <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-medium border-border/50">
                {topic}
              </Badge>
            )}
            <Badge variant="outline" className={`h-5 px-1.5 text-[10px] font-semibold ${getDifficultyBadgeClasses(difficulty)}`}>
              {difficulty}
            </Badge>
            {isMathTopic && techAllowed !== undefined && (
              <Badge variant={techAllowed ? "default" : "destructive"} className="h-5 px-1.5 text-[10px]">
                {techAllowed ? "CAS" : "No CAS"}
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

          <Button variant={hasSavedSet ? "default" : "outline"} size="sm" onClick={onSave} className="h-9 gap-1.5 text-xs px-3 rounded-full">
            <Bookmark className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{hasSavedSet ? "Saved" : "Save"}</span>
          </Button>
          {onRegenerate && (
            <Button variant="ghost" size="sm" onClick={onRegenerate} className="h-9 w-9 p-0 rounded-full">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onDelete} disabled={totalQuestions === 0} className="h-9 w-9 p-0 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={onPrev} disabled={questionIndex === 0} className="h-9 w-9 p-0 rounded-full">
              <ArrowLeft className="w-3.5 h-3.5" />
            </Button>
            <Button variant={isAtLast && canAdvance ? "default" : "secondary"} size="sm" onClick={onNext} disabled={!canAdvance} className="h-9 rounded-full px-4 gap-1.5 shadow-sm">
              <span>{isAtLast ? "Complete" : "Next"}</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="h-1 w-full bg-muted/30">
        <div className="h-full bg-violet-500 transition-all duration-500 ease-out" style={{ width: `${progressPct}%` }} />
      </div>
    </div>
  );
}
