import { ArrowLeft, ArrowRight, Bookmark, Trash2, Info, RefreshCw } from "lucide-react";
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
  onPrev, onNext, onSave, onDelete, onExit,
  onRegenerate,
}: WrittenSessionHeaderProps) {
  return (
    <div className="sticky top-0 z-10 flex flex-col gap-2.5 border-b bg-background/90 pb-3 pt-2.5 px-1 backdrop-blur-xl">
      {/* Top row: title + actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Left: question counter + badges */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="flex items-baseline gap-1.5 shrink-0">
            <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">
              Q{questionIndex + 1}
            </h2>
            <span className="text-sm text-muted-foreground font-medium">of {totalQuestions}</span>
          </div>
          {topic && (
            <Badge variant="secondary" className="shrink-0 border-primary/20 bg-primary/10 text-primary text-[11px]">
              {topic}
            </Badge>
          )}
          <Badge variant="outline" className={`shrink-0 font-semibold text-[11px] ${getDifficultyBadgeClasses(difficulty)}`}>
            {difficulty}
          </Badge>
          {maxMarks !== undefined && (
            <Badge variant="outline" className="shrink-0 text-[11px]">
              {maxMarks}mk
            </Badge>
          )}
          {isMathTopic && techAllowed !== undefined && (
            <Badge variant={techAllowed ? "default" : "destructive"} className="shrink-0 text-[11px]">
              {techAllowed ? "CAS" : "No CAS"}
            </Badge>
          )}
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 rounded-full text-muted-foreground hover:text-foreground h-7 w-7"
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

          <Button variant={hasSavedSet ? "default" : "outline"} size="sm" onClick={onSave} className="h-7 gap-1.5 text-xs px-2.5">
            <Bookmark className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{hasSavedSet ? "Saved" : "Save"}</span>
          </Button>
          {onRegenerate && (
            <Button variant="ghost" size="sm" onClick={onRegenerate} className="h-7 px-2">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onDelete} disabled={totalQuestions === 0} className="h-7 px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onExit} className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground">
            Exit
          </Button>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={onPrev} disabled={questionIndex === 0} className="h-7 w-7 p-0">
              <ArrowLeft className="w-3.5 h-3.5" />
            </Button>
            <Button variant={isAtLast && canAdvance ? "default" : "outline"} size="sm" onClick={onNext} disabled={!canAdvance} className="h-7 gap-1 px-2.5 text-xs">
              <span className="hidden sm:inline">{isAtLast ? "Finish" : "Next"}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
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
