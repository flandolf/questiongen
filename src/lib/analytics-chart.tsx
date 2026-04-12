import type { PieSectorShapeProps } from 'recharts';
import { Sector } from 'recharts';

import type { ChartConfig } from '@/components/ui/chart';

export const FOCUS_AREA_COLORS: readonly string[] = [
  'hsl(158 64% 52%)',
  'hsl(220 83% 60%)',
  'hsl(34 100% 50%)',
  'hsl(340 82% 52%)',
  'hsl(190 70% 45%)',
  'hsl(270 60% 55%)',
  'hsl(60 80% 45%)',
  'hsl(120 50% 45%)',
  'hsl(0 70% 55%)',
  'hsl(30 90% 50%)',
] as const;

export function CustomPieShape(props: PieSectorShapeProps) {
  return (
    <Sector
      {...props}
      fill={
        props.fill ??
        FOCUS_AREA_COLORS[(props.index ?? 0) % FOCUS_AREA_COLORS.length]
      }
    />
  );
}

export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-sm border border-border/40 bg-muted/30 text-card-foreground shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className='mb-4'>
      <h2 className='text-lg font-medium tracking-tight text-foreground'>
        {title}
      </h2>
      {description && (
        <p className='text-sm  text-muted-foreground'>{description}</p>
      )}
    </div>
  );
}

export function ChartEmpty({ message }: { message: string }) {
  return (
    <div className='flex h-48 items-center justify-center rounded-sm border border-dashed border-border/50 text-sm text-muted-foreground/60 '>
      {message}
    </div>
  );
}

export function accuracyColor(pct: number | undefined): string {
  if (pct === undefined) return 'text-muted-foreground';
  if (pct >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (pct >= 60) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

export const trendChartConfig = {
  firstAttemptAccuracy: { label: 'First attempt', color: 'hsl(158 64% 52%)' },
  overallAccuracy: {
    label: 'Overall (incl. reattempts)',
    color: 'hsl(34 100% 50%)',
  },
  writtenAccuracy: { label: 'Written score', color: 'hsl(220 83% 60%)' },
  mcAccuracy: { label: 'Multiple choice', color: 'hsl(340 82% 52%)' },
} satisfies ChartConfig;

export const topicChartConfig = {
  accuracy: { label: 'Accuracy', color: 'hsl(158 64% 52%)' },
} satisfies ChartConfig;

export const marksChartConfig = {
  attempts: { label: 'Attempts', color: 'hsl(34 100% 50%)' },
} satisfies ChartConfig;

export const effortChartConfig = {
  avgScorePercent: { label: 'Average score', color: 'hsl(220 83% 60%)' },
} satisfies ChartConfig;

export const responseLatencyChartConfig = {
  avgResponseSeconds: {
    label: 'Avg response seconds',
    color: 'hsl(220 83% 60%)',
  },
} satisfies ChartConfig;

export const subjectSpreadChartConfig = {
  count: { label: 'Attempts', color: 'hsl(158 64% 52%)' },
} satisfies ChartConfig;
