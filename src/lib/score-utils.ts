export function scoreColorClass(pct: number): string {
  if (pct >= 0.9) return 'text-emerald-500';
  if (pct >= 0.75) return 'text-emerald-500';
  if (pct >= 0.5) return 'text-amber-500';
  return 'text-rose-500';
}

export function scoreColorBgClass(pct: number): string {
  if (pct >= 0.9)
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300';
  if (pct >= 0.5)
    return 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300';
  return 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300';
}

export function scoreRingColor(pct: number): string {
  if (pct >= 80) return '#10b981';
  if (pct >= 50) return '#f59e0b';
  return '#f43f5e';
}

export function scoreLabel(pct: number): string {
  if (pct >= 0.9) return 'Excellent';
  if (pct >= 0.75) return 'Good';
  if (pct >= 0.5) return 'Fair';
  return 'Needs work';
}
