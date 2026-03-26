import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,

} from "recharts";
import { Clock3, Type, PlusCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "../components/ui/button";
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "../components/ui/chart";
import { EmptyState } from "../components/EmptyState";
import { MarkdownMath } from "../components/MarkdownMath";
import { formatDurationMs, formatPercent } from "../lib/app-utils";
import { useAnalyticsData, ALL_TOPICS } from "./useAnalyticsData";
import { useAppSettings } from "../AppContext";
import { useNavigate } from "react-router-dom";
import { useState, useMemo, useEffect, useRef } from "react";
import { useWrittenSession, useMultipleChoiceSession } from "../AppContext";
import { useAppStore } from "../store";
import type { QuestionHistoryEntry, McHistoryEntry, GenerationRecord } from "../types";

// ─── Chart configs (Restored Vibrant Palette) ─────────────────────────────────

const trendChartConfig = {
  firstAttemptAccuracy: { label: "First attempt", color: "hsl(158 64% 52%)" },
  overallAccuracy: { label: "Overall (incl. reattempts)", color: "hsl(34 100% 50%)" },
  writtenAccuracy: { label: "Written", color: "hsl(220 83% 60%)" },
  mcAccuracy: { label: "Multiple choice", color: "hsl(340 82% 52%)" },
} satisfies ChartConfig;

const topicChartConfig = {
  accuracy: { label: "Accuracy", color: "hsl(158 64% 52%)" },
} satisfies ChartConfig;

const marksChartConfig = {
  attempts: { label: "Attempts", color: "hsl(34 100% 50%)" },
} satisfies ChartConfig;

const effortChartConfig = {
  avgScorePercent: { label: "Average score", color: "hsl(220 83% 60%)" },
} satisfies ChartConfig;

const attemptTypeChartConfig = {
  value: { label: "Attempts", color: "hsl(220 83% 60%)" },
  initial: { label: "Initial", color: "hsl(158 64% 52%)" },
  appeal: { label: "Appeal", color: "hsl(34 100% 50% / 0.7)" },
  override: { label: "Override", color: "hsl(340 82% 52% / 0.7)" },
} satisfies ChartConfig;

const responseLatencyChartConfig = {
  avgResponseSeconds: { label: "Avg response seconds", color: "hsl(220 83% 60%)" },
} satisfies ChartConfig;

const generationChartConfig = {
  avgDurationSeconds: { label: "Generation seconds", color: "hsl(158 64% 52%)" },
  avgRepairAttempts: { label: "Repair attempts", color: "hsl(340 82% 52%)" },
} satisfies ChartConfig;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function accuracyColor(pct: number | undefined): string {
  if (pct === undefined) return "text-muted-foreground";
  if (pct >= 75) return "text-emerald-500";
  if (pct >= 50) return "text-amber-500";
  return "text-rose-500";
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-light tracking-tight text-foreground mb-4">
      {children}
    </h2>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-32 items-center justify-center text-xs text-muted-foreground/50 font-light">
      {message}
    </div>
  );
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
  accent?: "default" | "success" | "warning" | "danger";
  delta?: number | null;
}) {
  const valueColor = {
    default: "text-foreground",
    success: "text-emerald-500",
    warning: "text-amber-500",
    danger: "text-rose-500",
  }[accent ?? "default"];

  return (
    <div className="flex flex-col space-y-1">
      <span className="text-xs font-light text-muted-foreground">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className={`text-3xl font-light tracking-tighter ${valueColor}`}>{value}</span>
        {delta !== null && delta !== undefined && (
          <span className="text-xs font-light text-muted-foreground">
            {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
          </span>
        )}
      </div>
      <span className="text-[10px] font-light text-muted-foreground/60 truncate">{detail}</span>
    </div>
  );
}

// ─── Daily usage helpers ──────────────────────────────────────────────────────

function getDayKey(isoString: string): string {
  return isoString.slice(0, 10);
}

function formatCostShort(v: number) {
  if (v === 0) return "$0";
  if (v < 0.001) return "<$0.001";
  if (v < 0.01) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(2)}`;
}

function formatTokensShort(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

function useDailyStats(questionHistory: QuestionHistoryEntry[], mcHistory: McHistoryEntry[], generationHistory: GenerationRecord[]) {
  return useMemo(() => {
    const byDay = new Map<string, { tokens: number; cost: number; questions: number }>();

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
      if (record.outputs?.totalTokens) bucket.tokens += record.outputs.totalTokens;
      if (record.outputs?.estimatedCostUsd) bucket.cost += record.outputs.estimatedCostUsd;
      byDay.set(day, bucket);
    }

    const sorted = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-30);
    const totalDays = sorted.length;
    if (totalDays === 0) return { sorted: [], avgTokens: 0, avgCost: 0, avgQuestions: 0, totalDays: 0 };

    const totalTokens = sorted.reduce((s, [, d]) => s + d.tokens, 0);
    const totalCost = sorted.reduce((s, [, d]) => s + d.cost, 0);
    const totalQuestions = sorted.reduce((s, [, d]) => s + d.questions, 0);

    return {
      sorted: sorted.map(([day, data]) => ({
        day,
        label: new Date(day + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }),
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

export function AnalyticsView() {
  const navigate = useNavigate();
  const { debugMode } = useAppSettings();
  const [showDiagnostics, setShowDiagnostics] = useState(false);
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
    writtenAttemptTypeData,
    recentCriterionWeakPoints,
    mcTopicAccuracy,
    mcResponseLatency,
    qualityRows,
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

  const dailyStats = useDailyStats(questionHistory, mcHistory, generationHistory);
  const hasAnyAttempts = allAttempts.length > 0;

  const firstAttemptPct = summary.firstAttemptAccuracy;
  const overallPct = summary.overallAccuracy;
  const writtenPct = summary.writtenAverageScore;
  const mcPct = summary.mcAttempts ? (summary.mcCorrect / summary.mcAttempts) * 100 : 0;

  const toAccent = (pct: number) =>
    pct >= 75 ? "success" : pct >= 50 ? "warning" : pct > 0 ? "danger" : "default";

  const firstAttemptDelta = recentFirstAttemptAccuracy != null && earlyFirstAttemptAccuracy != null ? recentFirstAttemptAccuracy - earlyFirstAttemptAccuracy : null;
  const overallDelta = recentOverallAccuracy != null && earlyOverallAccuracy != null ? recentOverallAccuracy - earlyOverallAccuracy : null;
  const writtenDelta = recentWrittenAvg != null && earlyWrittenAvg != null ? recentWrittenAvg - earlyWrittenAvg : null;
  const mcDelta = recentMcAccuracy != null && earlyMcAccuracy != null ? recentMcAccuracy - earlyMcAccuracy : null;

  if (!hasAnyAttempts) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <EmptyState
          title="Blank canvas."
          description="Complete sessions to populate analytics."
          actions={<Button variant="outline" className="mt-4 font-light" onClick={() => navigate("/")}>Begin</Button>}
        />
      </div>
    );
  }

  const kpiRef = useRef<HTMLDivElement>(null);
  const [kpiHeight, setKpiHeight] = useState<number>(0);

  useEffect(() => {
    if (!kpiRef.current) return;
    const ro = new ResizeObserver(([entry]) => setKpiHeight(entry.contentRect.height));
    ro.observe(kpiRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="min-h-full px-6 py-10 space-y-16">

      {/* ── Dashboard Header & KPIs ── */}
      <section className="flex flex-col lg:flex-row gap-12">
        <div ref={kpiRef} className="lg:w-1/4 space-y-8">
          <div>
            <h1 className="text-3xl font-light tracking-tight">Analytics</h1>
            <p className="text-xs text-muted-foreground mt-1 font-light">{allAttempts.length} total attempts</p>
          </div>

          <div className="flex flex-col gap-6">
            <Kpi label="Overall Accuracy" value={formatPercent(overallPct)} detail={`${summary.totalCorrect} / ${summary.totalAttempts}`} accent={toAccent(overallPct)} delta={overallDelta} />
            <Kpi label="First Attempt" value={formatPercent(firstAttemptPct)} detail={`${summary.firstAttemptCorrect} / ${summary.firstAttemptTotal}`} accent={toAccent(firstAttemptPct)} delta={firstAttemptDelta} />
            <Kpi label="Written Average" value={formatPercent(writtenPct)} detail={`${summary.writtenAttempts} attempts`} accent={toAccent(writtenPct)} delta={writtenDelta} />
            <Kpi label="Multiple Choice" value={formatPercent(mcPct)} detail={`${summary.mcCorrect} / ${summary.mcAttempts}`} accent={toAccent(mcPct)} delta={mcDelta} />
          </div>
        </div>

{/* ── Main Trend Chart ── */}
        <div className="lg:flex-1" style={{ height: kpiHeight || 300, overflow: 'hidden' }}>
          <ChartContainer config={trendChartConfig} className="w-full" style={{ height: kpiHeight || 300 }}>
            <LineChart data={trendData} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} horizontal={true} strokeDasharray="3 3" opacity={0.05} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} dy={10} />
              <YAxis tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} dx={-10} />
              <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
              <ChartLegend content={<ChartLegendContent payload={undefined} />} className="pt-4" />
              <Line type="monotone" dataKey="firstAttemptAccuracy" stroke="var(--color-firstAttemptAccuracy)" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="overallAccuracy" stroke="var(--color-overallAccuracy)" strokeWidth={1} strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ChartContainer>
        </div>
      </section>

      {/* ── Daily Usage ── */}
      {dailyStats.totalDays > 0 && (
        <section className="space-y-6">
          <SectionHeading>Daily Usage</SectionHeading>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            <Kpi label="Avg questions / day" value={dailyStats.avgQuestions.toFixed(1)} detail={`over ${dailyStats.totalDays} active days`} />
            <Kpi label="Avg tokens / day" value={formatTokensShort(Math.round(dailyStats.avgTokens))} detail={`${formatTokensShort(dailyStats.sorted.reduce((s, d) => s + d.tokens, 0))} total`} />
            <Kpi label="Avg cost / day" value={dailyStats.avgCost === 0 ? "—" : formatCostShort(dailyStats.avgCost)} detail={`${formatCostShort(dailyStats.sorted.reduce((s, d) => s + d.cost, 0))} total`} />
          </div>
        </section>
      )}

      {/* ── Deep Dive ── */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-16">

        {/* Written Focus */}
        <div className="space-y-8">
          <SectionHeading>Written Insights</SectionHeading>

          {/* Marks distribution */}
          <div>
            <h3 className="text-xs font-light text-muted-foreground mb-3">Score Distribution</h3>
            <div className="h-40">
              <ChartContainer config={marksChartConfig} className="w-full h-full">
                <BarChart data={writtenMarksDistribution} margin={{ top: 0, bottom: 0, left: 0, right: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.05} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="attempts" fill="var(--color-attempts)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </div>
          </div>

          {/* Effort distribution */}
          <div>
            <h3 className="text-xs font-light text-muted-foreground mb-3">Effort vs Score</h3>
            <div className="h-40">
              <ChartContainer config={effortChartConfig} className="w-full h-full">
                <BarChart data={writtenEffortDistribution} margin={{ top: 0, bottom: 0, left: 0, right: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.05} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                  <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} dx={-4} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="avgScorePercent" fill="var(--color-avgScorePercent)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </div>
          </div>

          {/* Attempt types */}
          <div>
            <h3 className="text-xs font-light text-muted-foreground mb-3">Attempt Types</h3>
            <div className="h-40">
              <ChartContainer config={attemptTypeChartConfig} className="w-full h-full">
                <BarChart data={writtenAttemptTypeData} margin={{ top: 0, bottom: 0, left: 0, right: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.05} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} dx={-4} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="initial" stackId="a" fill="var(--color-initial)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="appeal" stackId="a" fill="var(--color-appeal)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="override" stackId="a" fill="var(--color-override)" radius={[2, 2, 0, 0]} />
                  <ChartLegend content={<ChartLegendContent />} />
                </BarChart>
              </ChartContainer>
            </div>
          </div>

          {/* Criterion drop-offs — filtered by topicFilter */}
          <div className="space-y-4">
            <h3 className="text-xs font-light text-muted-foreground">Criterion Drop-offs</h3>
            {recentCriterionWeakPoints
              .filter((row: any) => topicFilter === ALL_TOPICS || row.topic === topicFilter || row.topicSummary === topicFilter)
              .slice(0, 3)
              .map((row: any) => (
                <div key={row.criterion} className="flex flex-col gap-1 pb-4 border-b border-border/10 last:border-0">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50">{row.topicSummary || "Mixed"}</span>
                  <div className="text-sm font-light leading-relaxed"><MarkdownMath content={row.criterion} /></div>
                  <div className="flex justify-between items-center mt-1">
                    <span className={`text-xs font-light ${accuracyColor(row.successPercent)}`}>{formatPercent(row.successPercent)} success</span>
                    <span className="text-[10px] text-muted-foreground">{row.achievedMarks}/{row.availableMarks} kept</span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* MC Focus */}
        <div className="space-y-8">
          <div className="flex justify-between items-baseline mb-4">
            <SectionHeading>Topic Accuracies</SectionHeading>
          </div>

          {/* Overall topic accuracy */}
          <div className="h-40">
            <ChartContainer config={topicChartConfig} className="w-full h-full">
              <BarChart data={topicPerformance} layout="vertical" margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" opacity={0.05} />
                <XAxis type="number" hide />
                <YAxis dataKey="topic" type="category" tickLine={false} axisLine={false} width={100} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="accuracy" fill="var(--color-accuracy)" radius={[0, 2, 2, 0]} barSize={8} />
              </BarChart>
            </ChartContainer>
          </div>

          {/* MC per-topic accuracy */}
          <div>
            <h3 className="text-xs font-light text-muted-foreground mb-3">MC Accuracy by Topic</h3>
            <div className="h-40">
              <ChartContainer config={topicChartConfig} className="w-full h-full">
                <BarChart data={mcTopicAccuracy} layout="vertical" margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" opacity={0.05} />
                  <XAxis type="number" hide />
                  <YAxis dataKey="topic" type="category" tickLine={false} axisLine={false} width={100} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="accuracy" fill="var(--color-accuracy)" radius={[0, 2, 2, 0]} barSize={8} />
                </BarChart>
              </ChartContainer>
            </div>
          </div>

          {/* MC response latency */}
          <div>
            <h3 className="text-xs font-light text-muted-foreground mb-3">MC Response Time by Topic</h3>
            <div className="h-40">
              <ChartContainer config={responseLatencyChartConfig} className="w-full h-full">
                <BarChart data={mcResponseLatency} layout="vertical" margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" opacity={0.05} />
                  <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}s`} />
                  <YAxis dataKey="topic" type="category" tickLine={false} axisLine={false} width={100} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="avgResponseSeconds" fill="var(--color-avgResponseSeconds)" radius={[0, 2, 2, 0]} barSize={8} />
                </BarChart>
              </ChartContainer>
            </div>
          </div>

          {/* Actionable subtopics — filtered by topicFilter */}
          <div className="space-y-4 pt-4">
            <h3 className="text-xs font-light text-muted-foreground">Actionable Subtopics</h3>
            {displayedSubtopics
              .filter((row: any) => topicFilter === ALL_TOPICS || row.topic === topicFilter)
              .slice(0, 4)
              .map((row: any) => (
                <div key={row.key} className="flex justify-between items-center py-2 group">
                  <div className="flex flex-col">
                    <span className="text-sm font-light">{row.subtopic}</span>
                    <span className="text-[10px] text-muted-foreground/50">{row.topic}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-sm ${accuracyColor(row.accuracy)}`}>{formatPercent(row.accuracy)}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => navigate(`/?topic=${encodeURIComponent(row.topic)}&subtopic=${encodeURIComponent(row.subtopic)}`)}>
                      <PlusCircle className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </section>

      {/* ── Additional Analytics Grid ── */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-16">

        {/* Lowest Scoring Written */}
        <div className="space-y-6">
          <SectionHeading>Needs Improvement</SectionHeading>
          {lowestScoringWritten.length === 0 ? (
            <ChartEmpty message="No written attempts to display." />
          ) : (
            <div className="flex flex-col gap-4">
              {lowestScoringWritten.slice(0, 3).map((attempt: any) => {
                const scorePct = attempt.scorePercent ?? 0;
                return (
                  <div key={attempt.id} className="flex flex-col gap-2 pb-4 border-b border-border/10 last:border-0">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <h3 className="text-sm font-light">{attempt.topic}</h3>
                        <p className="text-[10px] text-muted-foreground/70">{attempt.subtopic}</p>
                      </div>
                      <span className={`text-lg font-light ${accuracyColor(scorePct)}`}>{formatPercent(scorePct)}</span>
                    </div>
                    <div className="flex gap-4 text-[10px] text-muted-foreground/50">
                      <span className="flex items-center gap-1"><Type className="h-3 w-3" /> {attempt.answerWordCount ?? 0} words</span>
                      <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" /> {formatDurationMs(attempt.markingLatencyMs)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Diagnostics Toggle */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <SectionHeading>Diagnostics</SectionHeading>
            <button type="button" onClick={() => setShowDiagnostics(!showDiagnostics)} className="flex items-center gap-1 text-xs text-muted-foreground font-light hover:text-foreground mb-4">
              {showDiagnostics || debugMode ? <><ChevronUp className="h-3 w-3" /> Hide</> : <><ChevronDown className="h-3 w-3" /> Show</>}
            </button>
          </div>

          {(showDiagnostics || debugMode) && (
            <div className="space-y-8">
              <div className="h-40">
                <ChartContainer config={generationChartConfig} className="w-full h-full">
                  <BarChart data={qualityRows} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.05} />
                    <XAxis dataKey="difficulty" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                    <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                    <Bar dataKey="avgDurationSeconds" fill="var(--color-avgDurationSeconds)" radius={[2, 2, 0, 0]} barSize={12} />
                    <Bar dataKey="avgRepairAttempts" fill="var(--color-avgRepairAttempts)" radius={[2, 2, 0, 0]} barSize={12} />
                  </BarChart>
                </ChartContainer>
              </div>
            </div>
          )}
        </div>
      </section>

    </div>
  );
}