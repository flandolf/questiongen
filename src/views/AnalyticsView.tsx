import { BarChartIcon, Clock3, PlusCircle, Type } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PieSectorShapeProps } from 'recharts';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  Sector,
  XAxis,
  YAxis,
} from 'recharts';

import { PageContainer, PageHeader } from '@/components/layout/primitives';
import { getDayKey } from '@/lib/utils';

import { useMultipleChoiceSession, useWrittenSession } from '../AppContext';
import { EmptyState } from '../components/EmptyState';
import { MarkdownMath } from '../components/MarkdownMath';
import { Button } from '../components/ui/button';
import type { ChartConfig } from '../components/ui/chart';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '../components/ui/chart';
import { formatDurationMs, formatPercent } from '../lib/app-utils';
import { useAppStore } from '../store';
import type {
  GenerationRecord,
  McHistoryEntry,
  QuestionHistoryEntry,
} from '../types';
import type {
  AttemptRow,
  CriterionWeakPointRow,
  SubtopicPerformanceRow,
} from './useAnalyticsData';
import { ALL_TOPICS, useAnalyticsData } from './useAnalyticsData';

// ─── Chart configs (Restored Vibrant Palette) ─────────────────────────────────

const trendChartConfig = {
  firstAttemptAccuracy: { label: 'First attempt', color: 'hsl(158 64% 52%)' },
  overallAccuracy: {
    label: 'Overall (incl. reattempts)',
    color: 'hsl(34 100% 50%)',
  },
  writtenAccuracy: { label: 'Written score', color: 'hsl(220 83% 60%)' },
  mcAccuracy: { label: 'Multiple choice', color: 'hsl(340 82% 52%)' },
} satisfies ChartConfig;

const topicChartConfig = {
  accuracy: { label: 'Accuracy', color: 'hsl(158 64% 52%)' },
} satisfies ChartConfig;

const marksChartConfig = {
  attempts: { label: 'Attempts', color: 'hsl(34 100% 50%)' },
} satisfies ChartConfig;

const effortChartConfig = {
  avgScorePercent: { label: 'Average score', color: 'hsl(220 83% 60%)' },
} satisfies ChartConfig;

const responseLatencyChartConfig = {
  avgResponseSeconds: {
    label: 'Avg response seconds',
    color: 'hsl(220 83% 60%)',
  },
} satisfies ChartConfig;

const subjectSpreadChartConfig = {
  count: { label: 'Attempts', color: 'hsl(158 64% 52%)' },
} satisfies ChartConfig;

const FOCUS_AREA_COLORS: readonly string[] = [
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

// ─── Custom Pie Shape ─────────────────────────────────────────────────────────

function CustomPieShape(props: PieSectorShapeProps) {
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

// ─── Helpers & UI Wrappers ────────────────────────────────────────────────────

function Card({
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

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-medium tracking-tight text-foreground">
        {title}
      </h2>
      {description && (
        <p className="text-sm  text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-48 items-center justify-center rounded-sm border border-dashed border-border/50 text-sm text-muted-foreground/60 ">
      {message}
    </div>
  );
}

function accuracyColor(pct: number | undefined): string {
  if (pct === undefined) return 'text-muted-foreground';
  if (pct >= 75) return 'text-emerald-500';
  if (pct >= 50) return 'text-amber-500';
  return 'text-rose-500';
}

function Kpi({
  label,
  value,
  detail,
  accent,
  delta,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: 'default' | 'success' | 'warning' | 'danger';
  delta?: number | null;
}) {
  const valueColor = {
    default: 'text-foreground',
    success: 'text-emerald-500',
    warning: 'text-amber-500',
    danger: 'text-rose-500',
  }[accent ?? 'default'];

  return (
    <Card className="flex flex-col p-6 space-y-2">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className={`text-3xl  tracking-tighter ${valueColor}`}>
          {value}
        </span>
        {delta !== null && delta !== undefined && (
          <span
            className={`text-xs font-medium ${delta > 0 ? 'text-emerald-500' : 'text-rose-500'}`}
          >
            {delta > 0 ? '+' : ''}
            {delta.toFixed(1)}%
          </span>
        )}
      </div>
      <span className="text-xs text-muted-foreground/70 truncate">
        {detail}
      </span>
    </Card>
  );
}

// ─── Daily usage helpers ──────────────────────────────────────────────────────

function formatCostShort(v: number) {
  if (v === 0) return '$0';
  if (v < 0.001) return '<$0.001';
  if (v < 0.01) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(2)}`;
}

function formatTokensShort(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

function useDailyStats(
  questionHistory: QuestionHistoryEntry[],
  mcHistory: McHistoryEntry[],
  generationHistory: GenerationRecord[]
) {
  return useMemo(() => {
    const byDay = new Map<
      string,
      { tokens: number; cost: number; questions: number }
    >();

    const addQuestion = (createdAt: string) => {
      const day = getDayKey(createdAt);
      const bucket = byDay.get(day) ?? { tokens: 0, cost: 0, questions: 0 };
      bucket.questions += 1;
      byDay.set(day, bucket);
    };

    for (const e of questionHistory) addQuestion(e.createdAt);
    for (const e of mcHistory) addQuestion(e.createdAt);

    for (const record of generationHistory) {
      const day = getDayKey(record.timestamp);
      const bucket = byDay.get(day) ?? { tokens: 0, cost: 0, questions: 0 };
      if (record.outputs?.totalTokens)
        bucket.tokens += record.outputs.totalTokens;
      if (record.outputs?.estimatedCostUsd)
        bucket.cost += record.outputs.estimatedCostUsd;
      byDay.set(day, bucket);
    }

    const sorted = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30);
    const totalDays = sorted.length;
    if (totalDays === 0)
      return {
        sorted: [],
        avgTokens: 0,
        avgCost: 0,
        avgQuestions: 0,
        totalDays: 0,
      };

    const totalTokens = sorted.reduce((s, [, d]) => s + d.tokens, 0);
    const totalCost = sorted.reduce((s, [, d]) => s + d.cost, 0);
    const totalQuestions = sorted.reduce((s, [, d]) => s + d.questions, 0);

    return {
      sorted: sorted.map(([day, data]) => ({
        day,
        label: new Date(day + 'T12:00:00').toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        }),
        ...data,
      })),
      avgTokens: totalTokens / totalDays,
      avgCost: totalCost / totalDays,
      avgQuestions: totalQuestions / totalDays,
      totalDays,
    };
  }, [questionHistory, mcHistory, generationHistory]);
}

// ─── Main view ────────────────────────────────────────────────────────────────

// eslint-disable-next-line complexity
export function AnalyticsView() {
  const navigate = useNavigate();
  const { questionHistory } = useWrittenSession();
  const { mcHistory } = useMultipleChoiceSession();
  const generationHistory = useAppStore((s) => s.generationHistory);

  const {
    allAttempts,
    topicFilter,
    summary,
    trendData,
    topicPerformance,
    displayedSubtopics,
    writtenMarksDistribution,
    writtenEffortDistribution,
    recentCriterionWeakPoints,
    mcTopicAccuracy,
    mcResponseLatency,
    writtenResponseLatency,
    writtenTopicAccuracy,
    lowestScoringWritten,
    earlyOverallAccuracy,
    recentOverallAccuracy,
    earlyWrittenAvg,
    recentWrittenAvg,
    earlyMcAccuracy,
    recentMcAccuracy,
    earlyFirstAttemptAccuracy,
    recentFirstAttemptAccuracy,
  } = useAnalyticsData();

  const dailyStats = useDailyStats(
    questionHistory,
    mcHistory,
    generationHistory
  );
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const hasAnyAttempts = allAttempts.length > 0;

  const subjectList = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const attempt of allAttempts) {
      if (!seen.has(attempt.topic)) {
        seen.add(attempt.topic);
        ordered.push(attempt.topic);
      }
    }
    return ordered.sort((a, b) => a.localeCompare(b));
  }, [allAttempts]);

  const focusAreaData = useMemo(() => {
    const filtered = subjectFilter
      ? allAttempts.filter((a) => a.topic === subjectFilter)
      : allAttempts;
    const counts = new Map<string, number>();
    for (const attempt of filtered) {
      const area = attempt.subtopic ?? 'Unspecified';
      counts.set(area, (counts.get(area) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, value], i) => ({
        name,
        value,
        fill: FOCUS_AREA_COLORS[i % FOCUS_AREA_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [allAttempts, subjectFilter]);

  const subjectSpreadData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const attempt of allAttempts) {
      counts.set(attempt.topic, (counts.get(attempt.topic) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([subject, count]) => ({ subject, count }))
      .sort((a, b) => b.count - a.count);
  }, [allAttempts]);

  const firstAttemptPct = summary.firstAttemptAccuracy;
  const overallPct = summary.overallAccuracy;
  const writtenPct = summary.writtenAverageScore;
  const mcPct = summary.mcAttempts
    ? (summary.mcCorrect / summary.mcAttempts) * 100
    : 0;

  const toAccent = (pct: number) =>
    pct >= 75
      ? 'success'
      : pct >= 50
        ? 'warning'
        : pct > 0
          ? 'danger'
          : 'default';

  const firstAttemptDelta =
    recentFirstAttemptAccuracy != null && earlyFirstAttemptAccuracy != null
      ? recentFirstAttemptAccuracy - earlyFirstAttemptAccuracy
      : null;
  const overallDelta =
    recentOverallAccuracy != null && earlyOverallAccuracy != null
      ? recentOverallAccuracy - earlyOverallAccuracy
      : null;
  const writtenDelta =
    recentWrittenAvg != null && earlyWrittenAvg != null
      ? recentWrittenAvg - earlyWrittenAvg
      : null;
  const mcDelta =
    recentMcAccuracy != null && earlyMcAccuracy != null
      ? recentMcAccuracy - earlyMcAccuracy
      : null;

  const chartData = [
    {
      format: 'mcAttempts',
      value: summary.mcAttempts,
      fill: 'var(--color-mcAttempts)',
    },
    {
      format: 'writtenAttempts',
      value: summary.writtenAttempts,
      fill: 'var(--color-writtenAttempts)',
    },
  ];

  const chartConfig = {
    mcAttempts: {
      label: 'Multiple Choice',
      color: 'oklch(54.6% 0.245 262.881)',
    },
    writtenAttempts: {
      label: 'Written',
      color: 'oklch(51.1% 0.262 276.966)',
    },
  } satisfies ChartConfig;

  if (!hasAnyAttempts) {
    return (
      <PageContainer>
        <EmptyState
          title="No Analytics Yet."
          description="Complete sessions to populate analytics."
          icon={BarChartIcon}
          actions={
            <Button onClick={() => void navigate('/')}>
              <PlusCircle className="h-4 w-4" />
              Generate your first set
            </Button>
          }
        />
      </PageContainer>
    );
  }

  return (
    <div className="min-h-full px-6 pt-6 pb-12 space-y-4 bg-background">
      <PageHeader
        title="Analytics"
        description="In-depth performance insights and trends."
      />

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          label="Overall Accuracy"
          value={formatPercent(overallPct)}
          detail={`${summary.totalCorrect} / ${summary.totalAttempts}`}
          accent={toAccent(overallPct)}
          delta={overallDelta}
        />
        <Kpi
          label="First Attempt"
          value={formatPercent(firstAttemptPct)}
          detail={`${summary.firstAttemptCorrect} / ${summary.firstAttemptTotal}`}
          accent={toAccent(firstAttemptPct)}
          delta={firstAttemptDelta}
        />
        <Kpi
          label="Written Average"
          value={formatPercent(writtenPct)}
          detail={`${summary.writtenAttempts} attempts`}
          accent={toAccent(writtenPct)}
          delta={writtenDelta}
        />
        <Kpi
          label="Multiple Choice"
          value={formatPercent(mcPct)}
          detail={`${summary.mcCorrect} / ${summary.mcAttempts}`}
          accent={toAccent(mcPct)}
          delta={mcDelta}
        />
      </div>

      {/* Main Trend Chart */}
      <Card className="p-6">
        <SectionHeading
          title="Performance Trends"
          description="Accuracy progression over recent attempts."
        />
        <div className="h-[350px] mt-4">
          <ChartContainer config={trendChartConfig} className="h-full w-full">
            <LineChart
              data={trendData}
              margin={{ left: -20, right: 10, top: 10, bottom: 0 }}
            >
              <CartesianGrid
                vertical={false}
                horizontal={true}
                strokeDasharray="3 3"
                opacity={0.1}
              />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                dy={10}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
              />
              <ChartTooltip
                content={<ChartTooltipContent indicator="line" />}
              />
              <ChartLegend
                content={<ChartLegendContent payload={undefined} />}
                className="pt-6"
              />
              <Line
                type="monotone"
                dataKey="firstAttemptAccuracy"
                stroke="var(--color-firstAttemptAccuracy)"
                strokeWidth={3}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="overallAccuracy"
                stroke="var(--color-overallAccuracy)"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="writtenAccuracy"
                stroke="var(--color-writtenAccuracy)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="mcAccuracy"
                stroke="var(--color-mcAccuracy)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ChartContainer>
        </div>
      </Card>

      {/* Daily Usage - Only show if data exists */}
      {dailyStats.totalDays > 0 && (
        <Card className="p-6">
          <SectionHeading
            title="System Usage"
            description="Token and cost metrics over active days."
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-6">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-muted-foreground">
                Avg questions / day
              </span>
              <span className="text-2xl ">
                {dailyStats.avgQuestions.toFixed(1)}
              </span>
              <span className="text-xs text-muted-foreground/60">
                over {dailyStats.totalDays} active days
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-muted-foreground">
                Avg tokens / day
              </span>
              <span className="text-2xl ">
                {formatTokensShort(Math.round(dailyStats.avgTokens))}
              </span>
              <span className="text-xs text-muted-foreground/60">
                {formatTokensShort(
                  dailyStats.sorted.reduce((s, d) => s + d.tokens, 0)
                )}{' '}
                total
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-muted-foreground">
                Avg cost / day
              </span>
              <span className="text-2xl ">
                {dailyStats.avgCost === 0
                  ? '—'
                  : formatCostShort(dailyStats.avgCost)}
              </span>
              <span className="text-xs text-muted-foreground/60">
                {formatCostShort(
                  dailyStats.sorted.reduce((s, d) => s + d.cost, 0)
                )}{' '}
                total
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* Two Column Layout for Deep Dives */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Written Insights */}
        <div className="flex flex-col gap-6">
          <Card className="p-6">
            <SectionHeading
              title="Written Insights"
              description="Distribution of marks and effort."
            />

            <div className="mt-6 space-y-8">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-4">
                  Score Distribution
                </h3>
                <div className="h-[200px]">
                  <ChartContainer
                    config={marksChartConfig}
                    className="w-full h-full"
                  >
                    <BarChart
                      data={writtenMarksDistribution}
                      margin={{ top: 0, bottom: 0, left: -20, right: 0 }}
                    >
                      <CartesianGrid
                        vertical={false}
                        strokeDasharray="3 3"
                        opacity={0.1}
                      />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar
                        dataKey="attempts"
                        fill="var(--color-attempts)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-4">
                  Effort vs Score
                </h3>
                <div className="h-[200px]">
                  <ChartContainer
                    config={effortChartConfig}
                    className="w-full h-full"
                  >
                    <BarChart
                      data={writtenEffortDistribution}
                      margin={{ top: 0, bottom: 0, left: -20, right: 0 }}
                    >
                      <CartesianGrid
                        vertical={false}
                        strokeDasharray="3 3"
                        opacity={0.1}
                      />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${v}%`}
                        tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar
                        dataKey="avgScorePercent"
                        fill="var(--color-avgScorePercent)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <SectionHeading
              title="Format Distribution"
              description="Multiple Choice versus Written attempts."
            />
            <div className="h-[250px] mt-4">
              <ChartContainer config={chartConfig} className="w-full h-full">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="format"
                    innerRadius={60}
                    outerRadius={100}
                    stroke="none"
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                </PieChart>
              </ChartContainer>
            </div>
          </Card>

          <Card className="p-6">
            <SectionHeading
              title="Needs Improvement"
              description="Lowest scoring written attempts."
            />
            <div className="mt-4">
              {lowestScoringWritten.length === 0 ? (
                <ChartEmpty message="No written attempts to display." />
              ) : (
                <div className="flex flex-col gap-4">
                  {lowestScoringWritten.map((attempt: AttemptRow) => {
                    const scorePct = attempt.scorePercent ?? 0;
                    return (
                      <div
                        key={attempt.id}
                        className="flex flex-col gap-2 pb-4 border-b border-border/20 last:border-0 last:pb-0"
                      >
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <h3 className="text-sm font-medium">
                              {attempt.topic}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              {attempt.subtopic}
                            </p>
                          </div>
                          <span
                            className={`text-lg font-medium ${accuracyColor(scorePct)}`}
                          >
                            {formatPercent(scorePct)}
                          </span>
                        </div>
                        <div className="flex gap-4 text-xs text-muted-foreground/70">
                          <span className="flex items-center gap-1.5">
                            <Type className="h-3.5 w-3.5" />{' '}
                            {attempt.answerWordCount ?? 0} words
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Clock3 className="h-3.5 w-3.5" />{' '}
                            {formatDurationMs(attempt.markingLatencyMs)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <SectionHeading
              title="Subject Spread"
              description="Question distribution across subjects."
            />
            <div className="h-[300px] mt-4">
              {subjectSpreadData.length === 0 ? (
                <ChartEmpty message="No attempts to display." />
              ) : (
                <ChartContainer
                  config={subjectSpreadChartConfig}
                  className="w-full h-full"
                >
                  <RadarChart
                    data={subjectSpreadData}
                    cx="50%"
                    cy="50%"
                    outerRadius="70%"
                  >
                    <PolarGrid stroke="var(--border)" strokeOpacity={0.3} />
                    <PolarAngleAxis
                      dataKey="subject"
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    />
                    <PolarRadiusAxis
                      tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    />
                    <Radar
                      name="Attempts"
                      dataKey="count"
                      stroke="var(--color-count)"
                      fill="var(--color-count)"
                      fillOpacity={0.25}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </RadarChart>
                </ChartContainer>
              )}
            </div>
          </Card>
        </div>

        {/* Right Column: MC & Topic Insights */}
        <div className="flex flex-col gap-6">
          <Card className="p-6">
            <SectionHeading
              title="Topic Performance"
              description="Accuracy breakdown across subjects."
            />

            <div className="mt-6 space-y-8">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-4">
                  Overall Topic Accuracy
                </h3>
                <div className="h-[200px]">
                  <ChartContainer
                    config={topicChartConfig}
                    className="w-full h-full"
                  >
                    <BarChart
                      data={topicPerformance}
                      layout="vertical"
                      margin={{ left: 0, right: 0, top: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        horizontal={false}
                        strokeDasharray="3 3"
                        opacity={0.1}
                      />
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="topic"
                        type="category"
                        tickLine={false}
                        axisLine={false}
                        width={120}
                        tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar
                        dataKey="accuracy"
                        fill="var(--color-accuracy)"
                        radius={[0, 4, 4, 0]}
                        barSize={12}
                      />
                    </BarChart>
                  </ChartContainer>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-4">
                  MC Accuracy by Topic
                </h3>
                <div className="h-[200px]">
                  <ChartContainer
                    config={topicChartConfig}
                    className="w-full h-full"
                  >
                    <BarChart
                      data={mcTopicAccuracy}
                      layout="vertical"
                      margin={{ left: 0, right: 0, top: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        horizontal={false}
                        strokeDasharray="3 3"
                        opacity={0.1}
                      />
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="topic"
                        type="category"
                        tickLine={false}
                        axisLine={false}
                        width={120}
                        tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar
                        dataKey="accuracy"
                        fill="var(--color-accuracy)"
                        radius={[0, 4, 4, 0]}
                        barSize={12}
                      />
                    </BarChart>
                  </ChartContainer>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-4">
                  Written Accuracy by Topic
                </h3>
                <div className="h-[200px]">
                  <ChartContainer
                    config={topicChartConfig}
                    className="w-full h-full"
                  >
                    <BarChart
                      data={writtenTopicAccuracy}
                      layout="vertical"
                      margin={{ left: 0, right: 0, top: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        horizontal={false}
                        strokeDasharray="3 3"
                        opacity={0.1}
                      />
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="topic"
                        type="category"
                        tickLine={false}
                        axisLine={false}
                        width={120}
                        tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar
                        dataKey="accuracy"
                        fill="var(--color-accuracy)"
                        radius={[0, 4, 4, 0]}
                        barSize={12}
                      />
                    </BarChart>
                  </ChartContainer>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <SectionHeading
              title="Response Time"
              description="Average time taken to answer questions by topic and question type."
            />
            <h3 className="text-sm font-medium text-muted-foreground">
              Multiple Choice Response Time
            </h3>
            <div className="h-[250px]">
              {mcResponseLatency.length === 0 ? (
                <ChartEmpty message="No response time data yet." />
              ) : (
                <ChartContainer
                  config={responseLatencyChartConfig}
                  className="w-full h-full"
                >
                  <BarChart
                    data={mcResponseLatency}
                    layout="vertical"
                    margin={{ left: 0, right: 0, top: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      horizontal={false}
                      strokeDasharray="3 3"
                      opacity={0.1}
                    />
                    <XAxis
                      type="number"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v) => `${v}s`}
                    />
                    <YAxis
                      dataKey="topic"
                      type="category"
                      tickLine={false}
                      axisLine={false}
                      width={120}
                      tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar
                      dataKey="avgResponseSeconds"
                      fill="var(--color-avgResponseSeconds)"
                      radius={[0, 4, 4, 0]}
                      barSize={12}
                    />
                  </BarChart>
                </ChartContainer>
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">
                Written Response Time
              </h3>
              <div className="h-[250px]">
                {writtenResponseLatency.length === 0 ? (
                  <ChartEmpty message="No response time data yet." />
                ) : (
                  <ChartContainer
                    config={responseLatencyChartConfig}
                    className="w-full h-full"
                  >
                    <BarChart
                      data={writtenResponseLatency}
                      layout="vertical"
                      margin={{ left: 0, right: 0, top: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        horizontal={false}
                        strokeDasharray="3 3"
                        opacity={0.1}
                      />
                      <XAxis
                        type="number"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 12 }}
                        tickFormatter={(v) => `${v}s`}
                      />
                      <YAxis
                        dataKey="topic"
                        type="category"
                        tickLine={false}
                        axisLine={false}
                        width={120}
                        tick={{
                          fontSize: 12,
                          fill: 'var(--muted-foreground)',
                        }}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar
                        dataKey="avgResponseSeconds"
                        fill="var(--color-avgResponseSeconds)"
                        radius={[0, 4, 4, 0]}
                        barSize={12}
                      />
                    </BarChart>
                  </ChartContainer>
                )}
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <SectionHeading
              title="Focus Areas"
              description={
                subjectFilter
                  ? `Filtered by ${subjectFilter}`
                  : 'Question spread across all subjects'
              }
            />

            <div className="flex flex-wrap gap-2 mt-4 mb-6">
              <button
                type="button"
                onClick={() => setSubjectFilter(null)}
                className={`inline-flex items-center gap-2 rounded-sm px-4 py-1.5 text-xs font-medium border transition-colors ${
                  subjectFilter === null
                    ? 'border-foreground/30 bg-secondary text-secondary-foreground'
                    : 'border-border/50 bg-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                }`}
              >
                All subjects
                <span className="text-[10px] font-bold opacity-80 bg-muted px-1.5 py-0.5 rounded-sm ml-1">
                  {allAttempts.length}
                </span>
              </button>

              {subjectList.map((topic) => {
                const count = allAttempts.filter(
                  (a) => a.topic === topic
                ).length;
                const isActive = subjectFilter === topic;

                return (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => setSubjectFilter(isActive ? null : topic)}
                    className={`inline-flex items-center gap-2 rounded-sm px-4 py-1.5 text-xs font-medium border transition-colors ${
                      isActive
                        ? 'border-foreground/30 bg-secondary text-secondary-foreground'
                        : 'border-border/50 bg-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                    }`}
                  >
                    {topic}
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm ml-1 ${
                        isActive
                          ? 'bg-background/80 text-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="h-[250px]">
              {focusAreaData.length === 0 ? (
                <ChartEmpty message="No attempts to display." />
              ) : (
                <ChartContainer config={{}} className="w-full h-full">
                  <PieChart>
                    <Pie
                      data={focusAreaData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      dataKey="value"
                      nameKey="name"
                      paddingAngle={3}
                      stroke="none"
                      shape={CustomPieShape}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ChartContainer>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <SectionHeading
              title="Actionable Review"
              description="Specific subtopics and criteria to target next."
            />
            <div className="mt-4 space-y-6">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground border-b border-border/20 pb-2 mb-3">
                  Subtopics
                </h3>
                <div className="space-y-1">
                  {displayedSubtopics
                    .filter(
                      (row: SubtopicPerformanceRow) =>
                        topicFilter === ALL_TOPICS || row.topic === topicFilter
                    )
                    .slice(0, 4)
                    .map((row: SubtopicPerformanceRow) => (
                      <div
                        key={row.key}
                        className="flex justify-between items-center py-2 group hover:bg-muted/50 rounded-sm px-2 -mx-2 transition-colors"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">
                            {row.subtopic}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {row.topic}
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span
                            className={`text-sm font-medium ${accuracyColor(row.accuracy)}`}
                          >
                            {formatPercent(row.accuracy)}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() =>
                              void navigate(
                                `/?topic=${encodeURIComponent(row.topic)}&subtopic=${encodeURIComponent(row.subtopic)}`
                              )
                            }
                          >
                            <PlusCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-muted-foreground border-b border-border/20 pb-2 mb-3 mt-6">
                  Criterion Drop-offs
                </h3>
                <div className="space-y-4">
                  {recentCriterionWeakPoints
                    .filter(
                      (row: CriterionWeakPointRow) =>
                        topicFilter === ALL_TOPICS ||
                        row.topicSummary === topicFilter
                    )
                    .slice(0, 3)
                    .map((row: CriterionWeakPointRow) => (
                      <div
                        key={row.criterion}
                        className="flex flex-col gap-1.5 pb-4 border-b border-border/20 last:border-0 last:pb-0"
                      >
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/60">
                          {row.topicSummary || 'Mixed'}
                        </span>
                        <div className="text-sm  leading-relaxed text-foreground">
                          <MarkdownMath content={row.criterion} />
                        </div>
                        <div className="flex justify-between items-center mt-2 rounded-sm px-3 py-2">
                          <span
                            className={`text-xs font-medium ${accuracyColor(row.successPercent)}`}
                          >
                            {formatPercent(row.successPercent)} success
                          </span>
                          <span className="text-xs text-muted-foreground font-medium">
                            {row.achievedMarks}/{row.availableMarks} kept
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
