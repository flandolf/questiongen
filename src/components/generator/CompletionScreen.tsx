import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../ui/card";
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
  const modeLabel = questionMode === "written" ? "written-response" : "multiple-choice";

  return (
    <Card className="border-0 shadow-xl bg-card/50 backdrop-blur-sm overflow-hidden animate-in fade-in duration-500">
      <CardHeader className="border-b bg-muted/20 p-5 md:p-6">
        <div className="flex flex-col gap-2">
          <CardTitle className="text-2xl font-extrabold flex items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-green-500" /> Session Complete
          </CardTitle>
          <CardDescription>
            Nice work. You have finished this {modeLabel} set.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="p-5 md:p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Accuracy</div>
            <div className="mt-1 text-3xl font-extrabold">{accuracyPercent.toFixed(1)}%</div>
          </div>
          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Time</div>
            <div className="mt-1 text-3xl font-extrabold">{formattedElapsedTime}</div>
          </div>
          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Difficulty</div>
            <div className="mt-1 text-3xl font-extrabold">{difficulty}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="secondary">{questionMode === "written" ? "Written Answer" : "Multiple Choice"}</Badge>
          <Badge variant="outline">{completedCount}/{totalCount} completed</Badge>
        </div>
      </CardContent>

      <CardFooter className="bg-muted/20 p-4 md:p-5 border-t flex flex-wrap gap-2 justify-end">
        <Button variant="outline" onClick={onReview}>Review Questions</Button>
        <Button variant={hasSavedSet ? "default" : "outline"} onClick={onSave}>
          {hasSavedSet ? "Update Saved Set" : "Save for Later"}
        </Button>
        <Button onClick={onStartOver}>Start New Set</Button>
      </CardFooter>
    </Card>
  );
}
