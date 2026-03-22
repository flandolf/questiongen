import { Bug, Copy, Download } from "lucide-react";
import { useState } from "react";
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
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawModelOutput ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // noop
    }
  };

  const handleDownload = () => {
    const blob = new Blob([rawModelOutput ?? ""], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "raw-llm-output.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
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
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Raw LLM Output</Label>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={handleCopy} aria-label="Copy raw output">
                    <Copy className="w-4 h-4 mr-2" /> {copied ? "Copied!" : "Copy"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleDownload} aria-label="Download raw output">
                    <Download className="w-4 h-4 mr-2" /> Download
                  </Button>
                </div>
              </div>
              <pre className="mt-2 max-h-80 overflow-auto rounded-xl border border-border/60 bg-muted/30 p-4 text-xs leading-5 whitespace-pre-wrap wrap-break-word" aria-live="polite">
                {rawModelOutput}
              </pre>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
