interface QuestionTimerBarProps {
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
  mode: "exam" | "practice";
}

export function QuestionTimerBar({
  questionNumber,
  totalQuestions,
  currentQuestionTimeLimit,
  currentQuestionRemaining,
  formattedQuestionTime,
  parTimeSeconds,
  bankedSeconds,
  formattedBank,
  bankStatus,
  formattedSessionTime,
  isQuestionExpired,
  mode,
}: QuestionTimerBarProps) {
  // Color logic
  const pctRemaining = currentQuestionTimeLimit > 0 ? currentQuestionRemaining / currentQuestionTimeLimit : 1;
  let barColor = "bg-emerald-500";
  if (pctRemaining <= 0.25) barColor = "bg-rose-500 animate-pulse";
  else if (pctRemaining <= 0.5) barColor = "bg-amber-400";

  // Bank color
  let bankColor = "text-muted-foreground";
  if (bankStatus === "ahead") bankColor = "text-emerald-600";
  else if (bankStatus === "behind") bankColor = "text-rose-600";

  return (
    <div className="w-full flex items-center justify-between gap-2 px-2 py-1 bg-muted/60 rounded-lg border border-border/40 mb-2">
      {/* Left: Q number and timer */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-xs font-semibold text-muted-foreground">Q{questionNumber} / {totalQuestions}</span>
        <span className={`font-mono text-sm font-bold px-2 py-0.5 rounded ${barColor} text-white`}>{formattedQuestionTime}</span>
        {mode === "exam" && (
          <span className="ml-1 text-xs text-muted-foreground">/ {Math.floor(parTimeSeconds/60)}:{(parTimeSeconds%60).toString().padStart(2,"0")} par</span>
        )}
      </div>
      {/* Center: Bank */}
      <div className={`font-mono text-xs font-semibold px-2 py-0.5 rounded ${bankColor}`}>Bank: {bankedSeconds >= 0 ? "+" : ""}{formattedBank}</div>
      {/* Right: Session timer */}
      <div className="flex items-center gap-1 font-mono text-xs font-semibold text-muted-foreground">
        <span>{formattedSessionTime}</span>
      </div>
      {/* Expired overlay */}
      {isQuestionExpired && mode === "exam" && (
        <div className="absolute inset-0 flex items-center justify-center bg-rose-600/80 text-white font-bold text-xs rounded-lg z-10">
          <span className="flex items-center gap-1"><span className="material-icons">lock</span> Time Expired</span>
        </div>
      )}
    </div>
  );
}
