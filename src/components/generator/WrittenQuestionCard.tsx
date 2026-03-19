import { Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { BookOpen } from "lucide-react";
import { MarkdownMath } from "../MarkdownMath";

type WrittenQuestionCardProps = {
  promptMarkdown: string;
  canShowRawOutput: boolean;
  showRawOutput: boolean;
  rawModelOutput: string;
  onToggleRawOutput: () => void;
};

export function WrittenQuestionCard({
  promptMarkdown,
  canShowRawOutput,
  showRawOutput,
  rawModelOutput,
  onToggleRawOutput,
}: WrittenQuestionCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-xl">
            <BookOpen className="w-5 h-5 text-primary" /> The Problem
          </CardTitle>
          {canShowRawOutput && (
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onToggleRawOutput}>
              <Bug className="h-4 w-4" />
              {showRawOutput ? "Hide Raw Output" : "Show Raw Output"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <MarkdownMath content={promptMarkdown} />
        </div>
        {showRawOutput && canShowRawOutput && (
          <div className="space-y-2">
            <Separator />
            <div>
              <Label className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Raw LLM Output</Label>
              <pre className="mt-2 max-h-80 overflow-auto rounded-xl border border-border/60 bg-muted/30 p-4 text-xs leading-5 whitespace-pre-wrap wrap-break-word">
                {rawModelOutput}
              </pre>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
