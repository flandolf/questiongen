import { Bug, Copy, Download } from "lucide-react";
import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { UnifiedQuestionPromptCard } from "@/components/question/UnifiedQuestionBlocks";


import { QuestionTimerBar } from "@/components/generator/QuestionTimerBar";
import { GenerationMode } from "@/types";

type McQuestionCardProps = {
  promptMarkdown: string;
  canShowRawOutput: boolean;
  showRawOutput: boolean;
  rawModelOutput: string;
  onToggleRawOutput: () => void;
  // Timer props
  timerProps?: {
    questionNumber: number;
    totalQuestions: number;
    currentQuestionTimeUsed: number;
    currentQuestionTimeLimit: number;
    currentQuestionRemaining: number;
    formattedQuestionTime: string;
    parTimeSeconds: number;
    bankedSeconds: number;
    formattedBank: string;
    bankStatus: "ahead" | "behind" | "on-pace";
    formattedSessionTime: string;
    isQuestionExpired: boolean;
    mode: GenerationMode;
  };
  isSubmitDisabled?: boolean;
};

export const McQuestionCard = memo(function McQuestionCard({
  promptMarkdown,
  canShowRawOutput,
  showRawOutput,
  rawModelOutput,
  onToggleRawOutput,
  timerProps,
}: McQuestionCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawModelOutput ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  };

  const handleDownload = () => {
    const blob = new Blob([rawModelOutput ?? ""], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "raw-llm-output.txt";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3 relative">
      {timerProps && (
        <QuestionTimerBar {...timerProps} />
      )}
      <UnifiedQuestionPromptCard
        promptMarkdown={promptMarkdown}
        rightSlot={canShowRawOutput ? (
          <Button type="button" variant="ghost" size="sm" className="gap-1.5 h-7 text-xs text-muted-foreground" onClick={onToggleRawOutput}>
            <Bug className="h-3.5 w-3.5" />
            {showRawOutput ? "Hide raw" : "Show raw"}
          </Button>
        ) : undefined}
      />
      {showRawOutput && canShowRawOutput && (
        <div className="rounded-2xl border border-border/50 bg-card/70 px-4 py-3 space-y-2">
          <Separator />
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Raw LLM Output</Label>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" onClick={handleCopy} className="h-7 text-xs gap-1.5">
                  <Copy className="w-3 h-3" /> {copied ? "Copied!" : "Copy"}
                </Button>
                <Button size="sm" variant="outline" onClick={handleDownload} className="h-7 text-xs gap-1.5">
                  <Download className="w-3 h-3" /> Download
                </Button>
              </div>
            </div>
            <pre className="max-h-72 overflow-auto rounded-xl border border-border/60 bg-muted/30 p-3.5 text-xs leading-relaxed whitespace-pre-wrap break-all" aria-live="polite">
              {rawModelOutput}
            </pre>
          </div>
        </div>
      )}
      {/* Time Expired overlay */}
      {timerProps?.isQuestionExpired && timerProps?.mode === "exam" && (
        <div className="absolute inset-0 flex items-center justify-center bg-rose-600/80 text-white font-bold text-lg rounded-xl z-20">
          <span className="flex items-center gap-2"><span className="material-icons">lock</span> Time Expired</span>
        </div>
      )}
    </div>
  );
});
