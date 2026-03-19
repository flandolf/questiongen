import { ArrowLeft, ArrowRight, Bookmark, Trash2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ProgressBar } from "@/components/generator/ProgressBar";
import { Difficulty, GenerationTelemetry } from "../../types";
import { formatDurationMs } from "../../lib/app-utils";

type WrittenSessionHeaderProps = {
  questionIndex: number;
  totalQuestions: number;
  completedCount: number;
  topic: string | undefined;
  difficulty: Difficulty;
  maxMarks: number | undefined;
  techAllowed: boolean | undefined;
  isMathTopic: boolean;
  isAtLast: boolean;
  canAdvance: boolean;
  hasSavedSet: boolean;
  generationStartedAt: number | null;
  formattedElapsedTime: string;
  telemetry: GenerationTelemetry | null;
  getDifficultyBadgeClasses: (level: Difficulty) => string;
  onPrev: () => void;
  onNext: () => void;
  onSave: () => void;
  onDelete: () => void;
  onExit: () => void;
};

export function WrittenSessionHeader({
  questionIndex, totalQuestions, completedCount,
  topic, difficulty, maxMarks, techAllowed, isMathTopic,
  isAtLast, canAdvance, hasSavedSet,
  generationStartedAt, formattedElapsedTime, telemetry,
  getDifficultyBadgeClasses,
  onPrev, onNext, onSave, onDelete, onExit,
}: WrittenSessionHeaderProps) {
  return (
    <div className="sticky px-4.5 top-0 z-10 flex flex-col gap-3 border-b bg-background/80 pb-3 pt-2 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {/* Left: question counter + badges */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="flex items-baseline gap-1.5 shrink-0">
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              Question {questionIndex + 1}
            </h2>
            <span className="text-sm text-muted-foreground font-medium">/ {totalQuestions}</span>
          </div>
          <Badge variant="secondary" className="shrink-0 border-primary/20 bg-primary/10 text-primary">
            {topic}
          </Badge>
          <Badge variant="outline" className={`shrink-0 font-semibold ${getDifficultyBadgeClasses(difficulty)}`}>
            Difficulty: {difficulty}
          </Badge>
          <Badge variant="outline" className="shrink-0 font-semibold">
            {maxMarks} marks
          </Badge>
          {isMathTopic && techAllowed !== undefined && (
            <Badge variant={techAllowed ? "default" : "destructive"} className="shrink-0">
              {techAllowed ? "Tech-active" : "Tech-free"}
            </Badge>
          )}
        </div>

        {/* Right: info tooltip + action buttons */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                aria-label="Question details"
              >
                <Info className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end" sideOffset={8} className="w-72 max-w-[calc(100vw-2rem)] p-3">
              <div className="flex flex-col gap-2 text-xs">
                <div className="font-semibold text-background">Question details</div>
                {generationStartedAt !== null && (
                  <div className="flex items-center justify-between gap-3 text-background/80">
                    <span>Timer</span>
                    <span className="font-mono text-background">{formattedElapsedTime}</span>
                  </div>
                )}
                {telemetry && (
                  <div className="flex items-center justify-between gap-3 text-background/80">
                    <span>Generation time</span>
                    <span className="text-background">{formatDurationMs(telemetry.durationMs)}</span>
                  </div>
                )}
                {telemetry?.distinctnessAvg !== undefined && (
                  <div className="flex items-center justify-between gap-3 text-background/80">
                    <span>Distinctness</span>
                    <span className="text-background">{(telemetry.distinctnessAvg * 100).toFixed(0)}%</span>
                  </div>
                )}
                {telemetry?.multiStepDepthAvg !== undefined && (
                  <div className="flex items-center justify-between gap-3 text-background/80">
                    <span>Multi-step depth</span>
                    <span className="text-background">{telemetry.multiStepDepthAvg.toFixed(2)}</span>
                  </div>
                )}
                {generationStartedAt === null && !telemetry && (
                  <div className="text-background/80">No generation diagnostics yet.</div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Button variant={hasSavedSet ? "default" : "outline"} size="sm" onClick={onSave} className="h-8 gap-1.5">
          <Bookmark className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{hasSavedSet ? "Update" : "Save"}</span>
        </Button>
        <Button variant="destructive" size="sm" onClick={onDelete} disabled={totalQuestions === 0} className="h-8">
          <Trash2 className="w-3.5 h-3.5 sm:mr-1.5" />
          <span className="hidden sm:inline">Delete</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={onExit} className="h-8 text-muted-foreground hover:text-foreground">
          Exit
        </Button>
        <Button variant="outline" size="sm" onClick={onPrev} disabled={questionIndex === 0} className="h-8">
          <ArrowLeft className="w-3.5 h-3.5 sm:mr-1.5" />
          <span className="hidden sm:inline">Prev</span>
        </Button>
        <Button variant="outline" size="sm" onClick={onNext} disabled={!canAdvance} className="h-8">
          <span className="hidden sm:inline">{isAtLast ? "Summary" : "Next"}</span>
          <ArrowRight className="w-3.5 h-3.5 sm:ml-1.5" />
        </Button>
      </div>

      <ProgressBar current={questionIndex + 1} total={totalQuestions} completed={completedCount} />
    </div>
  );
}
