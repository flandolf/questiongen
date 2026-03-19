import { useEffect, useState } from "react";
import { formatElapsedTime } from "@/views/generatorUtils";

// ── ElapsedTimerText ──────────────────────────────────────────────────────────

interface ElapsedTimerTextProps {
  startAt: number | null;
  endAt: number | null;
}

export function ElapsedTimerText({ startAt, endAt }: ElapsedTimerTextProps) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (startAt === null) return;
    if (endAt !== null) {
      setNow(endAt);
      return;
    }
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [endAt, startAt]);

  return <span>{formatElapsedTime(startAt, endAt, now)}</span>;
}

// ── ProgressBar ───────────────────────────────────────────────────────────────

interface ProgressBarProps {
  current: number;
  total: number;
  completed: number;
}

export function ProgressBar({ current, total, completed }: ProgressBarProps) {
  if (total === 0) return null;
  const percent = Math.min(100, Math.round((current / total) * 100));
  const completedPercent = Math.min(100, Math.round((completed / total) * 100));

  return (
    <div className="w-full flex flex-col gap-1">
      <div className="flex justify-between items-center text-xs font-medium mb-1">
        <span>Question {current} of {total}</span>
        <span className="text-muted-foreground">Completed: {completed} / {total}</span>
      </div>
      <div className="relative w-full h-1.5 bg-muted/40 rounded-full overflow-hidden">
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
