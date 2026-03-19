import { ArrowLeft, ArrowRight, Bookmark, Trash2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ProgressBar } from "@/components/generator/ProgressBar";
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

export function McSessionHeader({
  questionIndex, totalQuestions, completedCount,
  topic, difficulty, techAllowed, isMathTopic,
  isAtLast, canAdvance, hasSavedSet,
  generationStartedAt, formattedElapsedTime, telemetry,
  getDifficultyBadgeClasses,
  onPrev, onNext, onSave, onDelete, onExit,
}: McSessionHeaderProps) {
  return (
    <div className="sticky top-0 z-10 flex flex-col gap-3 border-b bg-background/80 pb-4 pt-2 backdrop-blur-xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* Left: counter + badges */}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h2 className="bg-linear-to-br from-foreground to-foreground/70 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent sm:text-3xl">
              Question {questionIndex + 1}
            </h2>
            <span className="text-base font-medium text-muted-foreground sm:text-xl">of {totalQuestions}</span>
          </div>
          <div className="flex flex-row justify-between">
            <div className="mt-1 flex max-w-full items-center gap-1.5 overflow-x-auto pb-1 text-xs sm:text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Badge variant="secondary" className="shrink-0 border-primary/20 bg-primary/10 text-primary">
                {topic}
              </Badge>
              <Badge variant="outline" className={`shrink-0 font-semibold ${getDifficultyBadgeClasses(difficulty)}`}>
                Difficulty: {difficulty}
              </Badge>
              {isMathTopic && techAllowed !== undefined && (
                <Badge variant={techAllowed ? "default" : "destructive"} className="shrink-0 shadow-sm">
                  <span className="hidden sm:inline">{techAllowed ? "CAS allowed" : "No calculator"}</span>
                </Badge>
              )}
            </div>

            {/* Right: info + action buttons */}
            <div className="flex flex-row gap-x-1.5">
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
                  <TooltipContent side="bottom" align="end" sideOffset={8}>
                    <TelemetryTooltip
                      generationStartedAt={generationStartedAt}
                      formattedElapsedTime={formattedElapsedTime}
                      telemetry={telemetry}
                    />
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <Button variant={hasSavedSet ? "default" : "outline"} size="sm" onClick={onSave} className="gap-2 shadow-sm">
                <Bookmark className="w-4 h-4" />
                <span className="hidden xl:inline">{hasSavedSet ? "Update Saved Set" : "Save for Later"}</span>
              </Button>
              <Button variant="destructive" size="sm" onClick={onDelete} disabled={totalQuestions === 0} className="shadow-sm">
                <Trash2 className="w-4 h-4 xl:mr-2" />
                <span className="hidden xl:inline">Cancel Question</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={onExit} className="text-muted-foreground hover:text-foreground">
                Exit Set
              </Button>
              <Button variant="outline" size="sm" onClick={onPrev} disabled={questionIndex === 0} className="shadow-sm">
                <ArrowLeft className="w-4 h-4 xl:mr-2" />
                <span className="hidden xl:inline">Previous</span>
              </Button>
              <Button variant="outline" size="sm" onClick={onNext} disabled={!canAdvance} className="shadow-sm">
                <span className="hidden xl:inline">{isAtLast ? "View Summary" : "Next"}</span>
                <ArrowRight className="w-4 h-4 xl:ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ProgressBar current={questionIndex + 1} total={totalQuestions} completed={completedCount} />
    </div>
  );
}
