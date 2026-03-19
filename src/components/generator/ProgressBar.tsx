type ProgressBarProps = {
  current: number;
  total: number;
  completed: number;
};

export function ProgressBar({ current, total, completed }: ProgressBarProps) {
  if (total === 0) return null;
  const percent          = Math.min(100, Math.round((current   / total) * 100));
  const completedPercent = Math.min(100, Math.round((completed / total) * 100));

  return (
    <div className="w-full flex flex-col gap-1">
      <div className="flex justify-between items-center text-xs font-medium mb-1">
        <span>Question {current} of {total}</span>
        <span className="text-muted-foreground">Completed: {completed} / {total}</span>
      </div>
      <div className="relative w-full h-3 bg-muted/40 rounded-full overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full bg-green-400/70 dark:bg-green-600/70 transition-all"
          style={{ width: `${completedPercent}%` }}
        />
        <div
          className="absolute left-0 top-0 h-full bg-primary/80 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
