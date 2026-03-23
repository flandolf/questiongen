type ProgressBarProps = {
  current: number;
  total: number;
  completed: number;
};

export function ProgressBar({ current, total, completed }: ProgressBarProps) {
  if (total === 0) return null;
  const percent          = Math.min(100, Math.round((current   / total) * 100));
  const completedPercent = Math.min(100, Math.round((completed / total) * 100));
  const isComplete = completed === total && total > 0;

  return (
    <div className="w-full space-y-1.5">
      {/* Stats row */}
      <div className="flex justify-between items-center text-[11px] font-medium text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="font-bold text-foreground tabular-nums">{current}</span>
          <span className="text-muted-foreground/50">/</span>
          <span className="tabular-nums">{total}</span>
          <span className="text-muted-foreground/60 hidden sm:inline">questions</span>
        </span>
        <span className={`flex items-center gap-1 tabular-nums transition-colors ${
          isComplete ? "text-emerald-500 font-semibold" : ""
        }`}>
          {isComplete ? (
            <span className="inline-flex items-center gap-1">
              <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              All done
            </span>
          ) : (
            <span>{completed} <span className="text-muted-foreground/60">completed</span></span>
          )}
        </span>
      </div>

      {/* Track */}
      <div className="relative w-full h-2 bg-muted/40 rounded-full overflow-hidden">
        {/* Completed (green, underneath) */}
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${completedPercent}%`,
            background: isComplete
              ? "linear-gradient(90deg, #10b981, #34d399)"
              : "rgba(74, 222, 128, 0.55)",
          }}
        />
        {/* Current position indicator */}
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-300 ease-out"
          style={{
            width: `${percent}%`,
            background: "hsl(var(--primary) / 0.75)",
          }}
        />
      </div>
    </div>
  );
}
