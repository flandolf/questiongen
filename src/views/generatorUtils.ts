import { Difficulty } from "../types";
export const MAX_HISTORY_ENTRIES = 200;

export function countWords(value: string): number {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}


export function formatElapsedTime(
  startAt: number | null,
  endAt: number | null,
  now: number,
): string {
  if (startAt === null) return "00:00";
  const effectiveEnd = endAt ?? now;
  const elapsedSeconds = Math.max(0, Math.floor((effectiveEnd - startAt) / 1000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function isMathTopic(topic?: string): boolean {
  return topic === "Mathematical Methods" || topic === "Specialist Mathematics";
}

export function getDifficultyBadgeClasses(level: Difficulty): string {
  switch (level) {
    case "Essential Skills":
      return "border-green-300 bg-green-50 text-green-800 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-200";
    case "Easy":
      return "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200";
    case "Medium":
      return "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200";
    case "Hard":
      return "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-200";
    case "Extreme":
      return "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200";
    default:
      return "";
  }
}

export function removeRecordKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

export function makeToggle<T>(
  setter: React.Dispatch<React.SetStateAction<T[]>>,
): (item: T) => void {
  return (item: T) =>
    setter((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item],
    );
}
