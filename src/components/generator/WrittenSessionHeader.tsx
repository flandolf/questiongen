import { ArrowLeft, ArrowRight, Bookmark, Trash2, Info, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ProgressBar } from "@/components/generator/ProgressBar";
import { Difficulty, GenerationTelemetry } from "../../types";
import { formatDurationMs } from "../../lib/app-utils";
import { formatDate } from "../../lib/app-utils";

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
  lastSavedAt?: string | null;
  generationStartedAt: number | null;
  formattedElapsedTime: string;
  telemetry: GenerationTelemetry | null;
  getDifficultyBadgeClasses: (level: Difficulty) => string;
  onPrev: () => void;
  onNext: () => void;
  onSave: () => void;
  onDelete: () => void;
  onExit: () => void;
  onRegenerate?: () => void;
};

export function WrittenSessionHeader({
  questionIndex, totalQuestions, completedCount,
  topic, difficulty, maxMarks, techAllowed, isMathTopic,
  isAtLast, canAdvance, hasSavedSet,
  generationStartedAt, formattedElapsedTime, telemetry,
  getDifficultyBadgeClasses,
  onPrev, onNext, onSave, onDelete, onExit, lastSavedAt,
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
              <TelemetryTooltip
                generationStartedAt={generationStartedAt}
                formattedElapsedTime={formattedElapsedTime}
                telemetry={telemetry}
              />
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Button variant={hasSavedSet ? "default" : "outline"} size="sm" onClick={onSave} className="h-8 gap-1.5">
          <Bookmark className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{hasSavedSet ? "Update" : "Save"}</span>
        </Button>
        {onRegenerate && (
          <Button variant="ghost" size="sm" onClick={onRegenerate} className="h-8">
            <RefreshCw className="w-3.5 h-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Regenerate</span>
          </Button>
        )}
        {lastSavedAt && (
          <span className="ml-2 hidden sm:inline text-xs text-muted-foreground">Saved at {formatDate(lastSavedAt)}</span>
        )}
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

// ─── Shared telemetry tooltip ─────────────────────────────────────────────────

type TelemetryTooltipProps = {
  generationStartedAt: number | null;
  formattedElapsedTime: string;
  telemetry: GenerationTelemetry | null;
};

export function TelemetryTooltip({ generationStartedAt, formattedElapsedTime, telemetry }: TelemetryTooltipProps) {
  const hasAny = generationStartedAt !== null || telemetry;
  if (!hasAny) {
    return <div className="text-xs text-background/80">No generation diagnostics yet.</div>;
  }
  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="font-semibold text-background">Question details</div>

      {generationStartedAt !== null && (
        <Row label="Timer" value={<span className="font-mono">{formattedElapsedTime}</span>} />
      )}
      {telemetry && (
        <Row label="Generation time" value={formatDurationMs(telemetry.durationMs)} />
      )}
      {telemetry?.totalTokens !== undefined && telemetry.totalTokens > 0 && (
        <Row
          label="Tokens"
          value={
            <span title={`Prompt: ${telemetry.promptTokens ?? 0} · Completion: ${telemetry.completionTokens ?? 0}`}>
              {telemetry.totalTokens.toLocaleString()}
            </span>
          }
        />
      )}
      {telemetry?.distinctnessAvg !== undefined && (
        <Row label="Distinctness" value={`${(telemetry.distinctnessAvg * 100).toFixed(0)}%`} />
      )}
      {telemetry?.multiStepDepthAvg !== undefined && (
        <Row label="Multi-step depth" value={telemetry.multiStepDepthAvg.toFixed(2)} />
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
