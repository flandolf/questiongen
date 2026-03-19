import { CheckCircle2, Clock, Target, BarChart2, BookOpen, Save, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "../ui/card";
import { Difficulty, QuestionMode } from "@/types";

type CompletionScreenProps = {
  questionMode: QuestionMode;
  difficulty: Difficulty;
  accuracyPercent: number;
  formattedElapsedTime: string;
  completedCount: number;
  totalCount: number;
  hasSavedSet: boolean;
  onReview: () => void;
  onSave: () => void;
  onStartOver: () => void;
};

function getAccuracyMeta(pct: number): { label: string; color: string } {
  if (pct >= 90) return { label: "Excellent", color: "text-emerald-500" };
  if (pct >= 70) return { label: "Good", color: "text-sky-500" };
  if (pct >= 50) return { label: "Fair", color: "text-amber-500" };
  return { label: "Keep Practicing", color: "text-rose-500" };
}

export function CompletionScreen({
  questionMode,
  difficulty,
  accuracyPercent,
  formattedElapsedTime,
  completedCount,
  totalCount,
  hasSavedSet,
  onReview,
  onSave,
  onStartOver,
}: CompletionScreenProps) {
  const modeLabel =
    questionMode === "written" ? "Written Response" : "Multiple Choice";
  const { label: accuracyLabel, color: accuracyColor } =
    getAccuracyMeta(accuracyPercent);

  return (
    <Card className="border shadow-lg overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <CardHeader className="border-b px-4 py-2">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500" />
              Session Complete
            </CardTitle>
            <CardDescription className="text-sm">
              You finished a{" "}
              <span className="font-medium text-foreground">{modeLabel}</span>{" "}
              set on{" "}
              <span className="font-medium text-foreground capitalize">
                {difficulty}
              </span>{" "}
              difficulty.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="shrink-0 mt-0.5">
            {completedCount}/{totalCount} completed
          </Badge>
        </div>
      </CardHeader>

      {/* Stats */}
      <CardContent className="px-4 py-2 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {/* Accuracy */}
          <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Target className="w-3.5 h-3.5" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                Accuracy
              </span>
            </div>
            <div className={`text-3xl font-bold tabular-nums ${accuracyColor}`}>
              {accuracyPercent.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">{accuracyLabel}</div>
          </div>

          {/* Time */}
          <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                Time
              </span>
            </div>
            <div className="text-3xl font-bold tabular-nums">
              {formattedElapsedTime}
            </div>
            <div className="text-xs text-muted-foreground">elapsed</div>
          </div>

          {/* Difficulty */}
          <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <BarChart2 className="w-3.5 h-3.5" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                Difficulty
              </span>
            </div>
            <div className="text-3xl font-bold capitalize">{difficulty}</div>
            <div className="text-xs text-muted-foreground">{modeLabel}</div>
          </div>
        </div>

        {/* Accuracy bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Score</span>
            <span>{accuracyPercent.toFixed(1)}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-700 ease-out"
              style={{ width: `${accuracyPercent}%` }}
            />
          </div>
        </div>
      </CardContent>

      {/* Footer */}
      <CardFooter className="border-t bg-muted/20 px-6 py-4 flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onReview}
          className="gap-1.5"
        >
          <BookOpen className="w-4 h-4" />
          Review
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onSave}
          className="gap-1.5"
        >
          <Save className="w-4 h-4" />
          {hasSavedSet ? "Update Saved Set" : "Save for Later"}
        </Button>
        <Button size="sm" onClick={onStartOver} className="gap-1.5">
          <RefreshCw className="w-4 h-4" />
          New Set
        </Button>
      </CardFooter>
    </Card>
  );
}