import { useAppPreferences } from "@/AppContext";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";
import { ElapsedTimerText } from "./SharedComponents";

interface CompletionScreenProps {
  accuracyPercent: number | null;
  generationStartedAt: number | null;
  sessionFinishedAt: number | null;
  writtenCompletedCount: number;
  writtenTotalQuestions: number;
  mcCompletedCount: number;
  mcQuestionsLength: number;
  activeWrittenSavedSetId: string | null;
  activeMcSavedSetId: string | null;
  onReview: () => void;
  onSave: () => void;
  onStartOver: () => void;
}

export function CompletionScreen({
  accuracyPercent,
  generationStartedAt,
  sessionFinishedAt,
  writtenCompletedCount,
  writtenTotalQuestions,
  mcCompletedCount,
  mcQuestionsLength,
  activeWrittenSavedSetId,
  activeMcSavedSetId,
  onReview,
  onSave,
  onStartOver,
}: CompletionScreenProps) {
  const { difficulty, questionMode } = useAppPreferences();

  const isWritten = questionMode === "written";
  const savedSetId = isWritten ? activeWrittenSavedSetId : activeMcSavedSetId;
  const completedLabel = isWritten
    ? `${writtenCompletedCount}/${writtenTotalQuestions}`
    : `${mcCompletedCount}/${mcQuestionsLength}`;

  return (
    <Card className="border-0 shadow-xl bg-card/50 backdrop-blur-sm overflow-hidden animate-in fade-in duration-500">
      <CardHeader className="border-b bg-muted/20 p-4">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-xl font-extrabold flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-500" /> Session Complete
          </CardTitle>
          <CardDescription className="text-xs">
            Nice work. You have finished this{" "}
            {isWritten ? "written-response" : "multiple-choice"} set.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Accuracy
            </div>
            <div className="mt-1 text-xl font-bold">
              {(accuracyPercent ?? 0).toFixed(1)}%
            </div>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Time
            </div>
            <div className="mt-1 text-xl font-bold">
              <ElapsedTimerText startAt={generationStartedAt} endAt={sessionFinishedAt} />
            </div>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Difficulty
            </div>
            <div className="mt-1 text-xl font-bold truncate">{difficulty}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">
            {isWritten ? "Written Answer" : "Multiple Choice"}
          </Badge>
          <Badge variant="outline">{completedLabel} completed</Badge>
        </div>
      </CardContent>

      <CardFooter className="bg-muted/20 p-3 border-t flex flex-wrap gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={onReview}>
          Review Questions
        </Button>
        <Button
          size="sm"
          variant={savedSetId ? "default" : "outline"}
          onClick={onSave}
        >
          {savedSetId ? "Update Saved Set" : "Save for Later"}
        </Button>
        <Button size="sm" onClick={onStartOver}>
          Start New Set
        </Button>
      </CardFooter>
    </Card>
  );
}
