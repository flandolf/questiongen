import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { Clock3, FileText, Type, AlertTriangle, PlusCircle, Info, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { Badge } from "../components/ui/badge";
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
import { useAnalyticsData, ALL_TOPICS, LOW_SAMPLE_THRESHOLD, RECENT_WRITTEN_CRITERIA_WINDOW } from "./useAnalyticsData";
import { useAppSettings } from "../AppContext";
import { useNavigate } from "react-router-dom";
import { useState, useMemo } from "react";
import { useWrittenSession, useMultipleChoiceSession } from "../AppContext";
import type { QuestionHistoryEntry, McHistoryEntry } from "../types";

// ─── Chart configs ────────────────────────────────────────────────────────────


// Use accent colors for better chart distinction
const trendChartConfig = {
  firstAttemptAccuracy: { label: "First attempt", color: "hsl(158 64% 52%)" }, // emerald-500
  overallAccuracy: { label: "Overall (incl. reattempts)", color: "hsl(34 100% 50%)" }, // amber-500
  writtenAccuracy: { label: "Written", color: "hsl(220 83% 60%)" }, // blue-500
  mcAccuracy: { label: "Multiple choice", color: "hsl(340 82% 52%)" }, // rose-500
} satisfies ChartConfig;

const topicChartConfig = {
  accuracy: { label: "Accuracy", color: "hsl(158 64% 52%)" }, // emerald-500
} satisfies ChartConfig;

const marksChartConfig = {
  attempts: { label: "Attempts", color: "hsl(34 100% 50%)" }, // amber-500
} satisfies ChartConfig;

const effortChartConfig = {
  avgScorePercent: { label: "Average score", color: "hsl(220 83% 60%)" }, // blue-500
} satisfies ChartConfig;

const attemptTypeChartConfig = {
  value: { label: "Attempts", color: "hsl(220 83% 60%)" }, // blue-500
  initial: { label: "Initial", color: "hsl(158 64% 52%)" }, // emerald-500
  appeal: { label: "Appeal", color: "hsl(34 100% 50% / 0.7)" }, // amber-500
  override: { label: "Override", color: "hsl(340 82% 52% / 0.7)" }, // rose-500
} satisfies ChartConfig;

const responseLatencyChartConfig = {
  avgResponseSeconds: { label: "Avg response seconds", color: "hsl(220 83% 60%)" }, // blue-500
} satisfies ChartConfig;

const generationChartConfig = {
  avgDurationSeconds: { label: "Generation seconds", color: "hsl(158 64% 52%)" }, // emerald-500
  avgRepairAttempts: { label: "Repair attempts", color: "hsl(340 82% 52%)" }, // rose-500
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
    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70 border-b border-border/30 pb-2">
      {children}
    </h2>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-40 items-center justify-center text-sm text-muted-foreground/60">
      {message}
    </div>
  );
}

function Tooltip({ content, children }: { content: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center gap-1">
      {children}
      <button
        type="button"
        className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((p) => !p)}
        aria-label="More information"
      >
        <Info className="h-3 w-3" />
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 w-52 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md pointer-events-none">
          {content}
        </span>
      )}
    </span>
  );
}

function Kpi({
  label,
  value,
  detail,
  accent,
  delta,
  deltaLabel,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: "default" | "success" | "warning" | "danger";
  delta?: number | null;
  deltaLabel?: string;
}) {
  const valueColor = {
    default: "text-foreground",
    success: "text-emerald-500",
    warning: "text-amber-500",
    danger: "text-rose-500",
  }[accent ?? "default"];

  return (
    <div className="space-y-1 py-1">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold tabular-nums leading-none ${valueColor}`}>{value}</div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground/70 truncate">{detail}</span>
        {delta !== null && delta !== undefined && (
          <span className={`shrink-0 text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded ${delta > 0
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : delta < 0
              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
              : "bg-muted/50 text-muted-foreground"
            }`}>
            {delta > 0 ? "+" : ""}{delta.toFixed(1)}%{deltaLabel ? ` ${deltaLabel}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}

function ChartSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {children}
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

function useDailyStats(
  questionHistory: QuestionHistoryEntry[],
  mcHistory: McHistoryEntry[],
) {
  return useMemo(() => {
    const byDay = new Map<string, { tokens: number; cost: number; questions: number }>();

    const addEntry = (createdAt: string, telemetry?: { totalTokens?: number; estimatedCostUsd?: number } | null) => {
      const day = getDayKey(createdAt);
      const bucket = byDay.get(day) ?? { tokens: 0, cost: 0, questions: 0 };
      bucket.questions += 1;
      if (telemetry?.totalTokens) bucket.tokens += telemetry.totalTokens;
      if (telemetry?.estimatedCostUsd) bucket.cost += telemetry.estimatedCostUsd;
      byDay.set(day, bucket);
    };

    for (const e of questionHistory) addEntry(e.createdAt, e.generationTelemetry);
    for (const e of mcHistory) addEntry(e.createdAt, e.generationTelemetry);

    const sorted = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30);

    const totalDays = sorted.length;
    if (totalDays === 0) {
      return { sorted: [], avgTokens: 0, avgCost: 0, avgQuestions: 0, totalDays: 0 };
    }

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
  }, [questionHistory, mcHistory]);
}

// ─── Main view ────────────────────────────────────────────────────────────────
export function AnalyticsView() {
  const navigate = useNavigate();
  const { debugMode } = useAppSettings();
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const { questionHistory } = useWrittenSession();
  const { mcHistory } = useMultipleChoiceSession();

  const {
    allAttempts,
    writtenAttempts,
    topicFilter,
    setTopicFilter,
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
    questionHistoryLength,
    earlyOverallAccuracy,
    recentOverallAccuracy,
    earlyWrittenAvg,
    recentWrittenAvg,
    earlyMcAccuracy,
    recentMcAccuracy,
    earlyFirstAttemptAccuracy,
    recentFirstAttemptAccuracy,
  } = useAnalyticsData();

  const dailyStats = useDailyStats(questionHistory, mcHistory);

  const hasAnyAttempts = allAttempts.length > 0;

  const firstAttemptPct = summary.firstAttemptAccuracy;
  const writtenFirstPct = summary.writtenFirstAttemptAverageScore;
  const mcFirstPct = summary.mcFirstAttemptTotal > 0 ? (summary.mcFirstAttemptCorrect / summary.mcFirstAttemptTotal) * 100 : 0;
  const overallPct = summary.overallAccuracy;
  const writtenPct = summary.writtenAverageScore;
  const mcPct = summary.mcAttempts ? (summary.mcCorrect / summary.mcAttempts) * 100 : 0;
  const toAccent = (pct: number) =>
    pct >= 75 ? "success" : pct >= 50 ? "warning" : pct > 0 ? "danger" : "default";

  const firstAttemptDelta = recentFirstAttemptAccuracy != null && earlyFirstAttemptAccuracy != null
    ? recentFirstAttemptAccuracy - earlyFirstAttemptAccuracy
    : null;
  const overallDelta = recentOverallAccuracy != null && earlyOverallAccuracy != null
    ? recentOverallAccuracy - earlyOverallAccuracy
    : null;
  const writtenDelta = recentWrittenAvg != null && earlyWrittenAvg != null
    ? recentWrittenAvg - earlyWrittenAvg
    : null;
  const mcDelta = recentMcAccuracy != null && earlyMcAccuracy != null
    ? recentMcAccuracy - earlyMcAccuracy
    : null;

  return (
    <div className="w-full min-h-full space-y-10 px-8 py-8 pb-16 max-w-none">
      {/* ── Page header ── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {hasAnyAttempts
            ? `${allAttempts.length} attempts tracked`
            : "Complete questions to see analytics"}
        </p>
      </div>

      {/* ── Empty state ── */}
      {!hasAnyAttempts ? (
        <EmptyState
          compact
          title="No analytics yet"
          description="Complete some written or multiple-choice questions and this page will build trend lines, topic breakdowns, and generation diagnostics automatically."
          className="py-20"
          actions={
            <Button variant="default" size="sm" className="gap-2 mt-2" onClick={() => navigate("/")}>
              <PlusCircle className="h-4 w-4" />
              Generate your first set
            </Button>
          }
        />
      ) : (
        <div className="space-y-10">

          {/* ── KPIs ── */}
          <section className="space-y-6">
            <SectionHeading>Performance</SectionHeading>

            <div className="grid gap-x-12 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
              <Kpi
                label="First-attempt overall"
                value={formatPercent(firstAttemptPct)}
                detail={`${summary.firstAttemptCorrect} / ${summary.firstAttemptTotal}`}
                accent={toAccent(firstAttemptPct)}
                delta={firstAttemptDelta}
                deltaLabel="vs early"
              />
              <Kpi
                label="First-attempt written"
                value={formatPercent(writtenFirstPct)}
                detail={`${summary.writtenFirstAttemptCorrect} / ${summary.writtenFirstAttemptTotal}`}
                accent={toAccent(writtenFirstPct)}
                delta={writtenDelta}
                deltaLabel="vs early"
              />
              <Kpi
                label="First-attempt MC"
                value={formatPercent(mcFirstPct)}
                detail={`${summary.mcFirstAttemptCorrect} / ${summary.mcFirstAttemptTotal}`}
                accent={toAccent(mcFirstPct)}
                delta={mcDelta}
                deltaLabel="vs early"
              />
              <Kpi
                label="Overall accuracy"
                value={formatPercent(overallPct)}
                detail={`${summary.totalCorrect} / ${summary.totalAttempts}`}
                accent={toAccent(overallPct)}
                delta={overallDelta}
                deltaLabel="vs early"
              />
              <Kpi
                label="Written avg"
                value={formatPercent(writtenPct)}
                detail={`${summary.writtenAttempts} attempts`}
                accent={toAccent(writtenPct)}
              />
              <Kpi
                label="MC accuracy"
                value={formatPercent(mcPct)}
                detail={`${summary.mcCorrect} / ${summary.mcAttempts}`}
                accent={toAccent(mcPct)}
              />
            </div>

            <div className="grid gap-x-12 gap-y-4 sm:grid-cols-4">
              <Kpi
                label="Interventions"
                value={`${summary.appealCount + summary.overrideCount}`}
                detail={`${summary.appealCount} appeals, ${summary.overrideCount} overrides`}
                accent={summary.appealCount + summary.overrideCount > 0 ? "warning" : "default"}
              />
              <Kpi
                label="Marking latency"
                value={formatDurationMs(summary.averageMarkingLatencyMs)}
                detail="Avg AI turnaround"
              />
              <Kpi
                label="Generation latency"
                value={formatDurationMs(summary.averageGenerationLatencyMs)}
                detail="Avg generation time"
              />
            </div>
          </section>

          {/* ── Daily usage ── */}
          {dailyStats.totalDays > 0 && (
            <section className="space-y-6">
              <SectionHeading>Daily usage</SectionHeading>

              <div className="grid gap-x-12 gap-y-4 sm:grid-cols-3">
                <Kpi
                  label="Avg questions / day"
                  value={dailyStats.avgQuestions.toFixed(1)}
                  detail={`over ${dailyStats.totalDays} active day${dailyStats.totalDays !== 1 ? "s" : ""}`}
                />
                <Kpi
                  label="Avg tokens / day"
                  value={formatTokensShort(Math.round(dailyStats.avgTokens))}
                  detail={dailyStats.avgTokens === 0 ? "No data" : `${formatTokensShort(dailyStats.sorted.reduce((s, d) => s + d.tokens, 0))} total`}
                />
                <Kpi
                  label="Avg cost / day"
                  value={dailyStats.avgCost === 0 ? "—" : formatCostShort(dailyStats.avgCost)}
                  detail={dailyStats.avgCost === 0 ? "No data" : `${formatCostShort(dailyStats.sorted.reduce((s, d) => s + d.cost, 0))} total`}
                />
              </div>

              {dailyStats.sorted.length > 1 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Questions per active day</span>
                    <span className="text-xs text-muted-foreground/60">Last {dailyStats.totalDays} active day{dailyStats.totalDays !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="flex items-end gap-1 h-12">
                    {(() => {
                      const maxQ = Math.max(...dailyStats.sorted.map(d => d.questions), 1);
                      return dailyStats.sorted.map((d) => (
                        <div
                          key={d.day}
                          className="flex-1 relative group"
                          title={`${d.label}: ${d.questions} question${d.questions !== 1 ? "s" : ""}`}
                        >
                          <div
                            className="w-full rounded-t-sm bg-muted-foreground/20 hover:bg-muted-foreground/40 transition-colors cursor-default"
                            style={{ height: `${Math.max((d.questions / maxQ) * 48, d.questions > 0 ? 3 : 0)}px` }}
                          />
                          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 pointer-events-none">
                            <div className="rounded border bg-popover px-2 py-1 shadow text-[10px] text-foreground whitespace-nowrap">
                              {d.label}: {d.questions}q
                              {d.cost > 0 && ` · ${formatCostShort(d.cost)}`}
                            </div>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground/50">{dailyStats.sorted[0]?.label}</span>
                    <span className="text-[10px] text-muted-foreground/50">{dailyStats.sorted[dailyStats.sorted.length - 1]?.label}</span>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ── Trend + Topic performance ── */}
          <section className="space-y-6">
            <SectionHeading>Trends &amp; topic breakdown</SectionHeading>

            <div className="grid gap-8 xl:grid-cols-[1.5fr_1fr]">
              <ChartSection title="Accuracy trend" description="First-attempt (solid) vs overall (dashed), by mode.">
                <ChartContainer config={trendChartConfig} className="h-[28rem] w-full">
                  <LineChart data={trendData} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} tick={{ fontSize: 11 }} />
                    <YAxis tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                    <ChartLegend content={<ChartLegendContent payload={undefined} />} className="pt-4" />
                    <Line type="monotone" dataKey="firstAttemptAccuracy" stroke="var(--color-firstAttemptAccuracy)" strokeWidth={2.5} dot={false} connectNulls />
                    <Line type="monotone" dataKey="overallAccuracy" stroke="var(--color-overallAccuracy)" strokeWidth={2} strokeDasharray="6 3" dot={false} />
                    <Line type="monotone" dataKey="writtenAccuracy" stroke="var(--color-writtenAccuracy)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                    <Line type="monotone" dataKey="mcAccuracy" stroke="var(--color-mcAccuracy)" strokeWidth={1.5} strokeDasharray="2 3" dot={false} />
                  </LineChart>
                </ChartContainer>
              </ChartSection>

              <ChartSection title="Topic performance" description="Accuracy by topic. Filter to inspect subtopics.">
                <ChartContainer
                  config={topicChartConfig}
                  className="w-full"
                  style={{ height: `${Math.max(topicPerformance.length * 32, 300)}px` }}
                >
                  <BarChart data={topicPerformance} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }} barCategoryGap={0}>
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" opacity={0.15} />
                    <XAxis type="number" tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                    <YAxis
                      dataKey="topic"
                      type="category"
                      interval={0}
                      tickLine={false}
                      axisLine={false}
                      width={250}
                      tickFormatter={(value: string) => {
                        const words = value.split(" ");
                        const lines: string[] = [];
                        let current = "";
                        for (const w of words) {
                          if ((current + " " + w).length > 14) {
                            lines.push(current);
                            current = w;
                          } else {
                            current = current ? current + " " + w : w;
                          }
                        }
                        if (current) lines.push(current);
                        return lines.join("\n");
                      }}
                      tick={{ fontSize: 10 }}
                    />
                    <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                    <Bar dataKey="accuracy" fill="var(--color-accuracy)" radius={[0, 4, 4, 0]} barSize={18} />
                  </BarChart>
                </ChartContainer>
                <div className="flex flex-wrap gap-1.5 pt-2">
                  <Badge
                    variant={topicFilter === ALL_TOPICS ? "default" : "outline"}
                    className="cursor-pointer text-[10px] font-semibold uppercase tracking-wide"
                    onClick={() => setTopicFilter(ALL_TOPICS)}
                  >
                    {ALL_TOPICS}
                  </Badge>
                  {topicPerformance.map((item: any) => (
                    <Badge
                      key={item.topic}
                      variant={topicFilter === item.topic ? "default" : "outline"}
                      className="cursor-pointer text-[10px] font-semibold uppercase tracking-wide"
                      onClick={() => setTopicFilter(item.topic)}
                    >
                      {item.topic} ({item.attempts})
                    </Badge>
                  ))}
                </div>
              </ChartSection>
            </div>
          </section>

          {/* ── Subtopics + Actionable flags ── */}
          <section className="space-y-6">
            <SectionHeading>Subtopic detail</SectionHeading>

            <div className="grid gap-8 xl:grid-cols-[1.35fr_1fr]">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">
                  {topicFilter === ALL_TOPICS
                    ? "Lowest-performing subtopics"
                    : `Subtopics in ${topicFilter}`}
                </h3>
                {displayedSubtopics.length === 0 ? (
                  <ChartEmpty message="No subtopic data yet." />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {displayedSubtopics.slice(0, 8).map((row: any) => (
                      <div
                        key={row.key}
                        className="flex items-start justify-between gap-3 py-3 border-b border-border/20 last:border-0"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="font-medium text-sm leading-tight wrap-break-word">{row.subtopic}</div>
                          <div className="text-[11px] text-muted-foreground">{row.topic}</div>
                          <div className="flex gap-2 text-[10px] text-muted-foreground/60">
                            <span>{row.writtenAttempts} written</span>
                            <span>{row.mcAttempts} MC</span>
                            {row.attempts < LOW_SAMPLE_THRESHOLD && (
                              <span className="text-amber-500">Low sample</span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className={`text-lg font-bold tabular-nums ${accuracyColor(row.accuracy)}`}>
                            {formatPercent(row.accuracy)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">{row.correct}/{row.attempts}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Actionable flags</h3>
                {displayedSubtopics.slice(0, 5).length === 0 ? (
                  <ChartEmpty message="No flagged areas yet." />
                ) : (
                  <div className="space-y-3">
                    {displayedSubtopics.slice(0, 5).map((row: any) => (
                      <div
                        key={row.key}
                        className="flex items-start gap-3 py-3 border-b border-border/20 last:border-0"
                      >
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div>
                            <div className="font-medium text-sm leading-tight wrap-break-word">
                              {row.subtopic}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="truncate">{row.topic}</span>
                              <span className="font-semibold text-foreground">
                                {formatPercent(row.accuracy)} ({row.correct}/{row.attempts})
                              </span>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs gap-1 px-2 text-muted-foreground hover:text-foreground"
                            onClick={() => navigate(`/?topic=${encodeURIComponent(row.topic)}&subtopic=${encodeURIComponent(row.subtopic)}`)}
                          >
                            <PlusCircle className="h-3 w-3" />
                            Practice
                          </Button>
                        </div>
                        <Badge
                          variant={row.attempts < LOW_SAMPLE_THRESHOLD ? "outline" : "secondary"}
                          className="shrink-0 text-[9px] font-bold uppercase tracking-wider"
                        >
                          {row.attempts < LOW_SAMPLE_THRESHOLD ? "Low" : "Trend"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}

                {displayedSubtopics.length > 0 && (
                  <div className="pt-2">
                    <Button
                      size="sm"
                      className="gap-2"
                      onClick={() => {
                        const weakTopics = new Map<string, string[]>();
                        for (const row of displayedSubtopics.slice(0, 5)) {
                          const existing = weakTopics.get(row.topic) ?? [];
                          existing.push(row.subtopic);
                          weakTopics.set(row.topic, existing);
                        }
                        const params = new URLSearchParams();
                        const topics = Array.from(weakTopics.keys());
                        params.set("topic", topics[0]);
                        const subtopics = weakTopics.get(topics[0]) ?? [];
                        if (subtopics.length > 0) params.set("subtopic", subtopics[0]);
                        params.set("weakAreas", "true");
                        navigate(`/?${params.toString()}`);
                      }}
                    >
                      <Sparkles className="w-4 h-4" />
                      Practice weak areas
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ── Written analytics ── */}
          <section className="space-y-6">
            <SectionHeading>Written analytics</SectionHeading>

            <div className="grid gap-8 xl:grid-cols-2">
              <ChartSection title="Score distribution" description="Score distribution for marked written responses.">
                {writtenAttempts.length === 0 ? (
                  <ChartEmpty message="No written attempts yet." />
                ) : (
                  <ChartContainer config={marksChartConfig} className="w-full h-full min-h-[18rem]">
                    <BarChart data={writtenMarksDistribution} margin={{ left: 0, right: 0, top: 10, bottom: 20 }} height={288 /* 18rem */}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.1} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickMargin={10} />
                      <YAxis hide />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="attempts" fill="var(--color-attempts)" radius={[6, 6, 0, 0]} barSize={50} />
                    </BarChart>
                  </ChartContainer>
                )}
              </ChartSection>

              <ChartSection
                title="Criterion weak points"
                description={`Marks most often dropped across the last ${Math.min(questionHistoryLength, RECENT_WRITTEN_CRITERIA_WINDOW)} written marking passes.`}
              >
                {recentCriterionWeakPoints.length === 0 ? (
                  <ChartEmpty message="Criterion trends will appear after written answers are marked." />
                ) : (
                  <div className="space-y-3">
                    {recentCriterionWeakPoints.map((row: any) => (
                      <div
                        key={row.criterion}
                        className="py-3 border-b border-border/20 last:border-0"
                      >
                        <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wide mb-1">
                          {row.topicSummary || "Mixed topics"}
                        </div>
                        <div className="text-sm leading-relaxed mb-1.5">
                          <MarkdownMath content={row.criterion} />
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-baseline gap-1.5">
                            <span className={`text-base font-bold tabular-nums ${accuracyColor(row.successPercent)}`}>
                              {formatPercent(row.successPercent)}
                            </span>
                            <span className="text-muted-foreground">success</span>
                          </div>
                          <div className="text-muted-foreground">
                            <span className="font-semibold text-foreground">{row.achievedMarks}</span>
                            {" / "}
                            {row.availableMarks} marks kept
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ChartSection>
            </div>

            <div className="grid gap-8 xl:grid-cols-2">
              <ChartSection title="Answer effort vs score" description="Average written score by answer length bucket.">
                {writtenEffortDistribution.every((item: any) => item.attempts === 0) ? (
                  <ChartEmpty message="Tracking will populate as written attempts are marked." />
                ) : (
                  <ChartContainer config={effortChartConfig} className="h-64 w-full">
                    <BarChart data={writtenEffortDistribution} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                      <YAxis tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                      <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                      <Bar dataKey="avgScorePercent" fill="var(--color-avgScorePercent)" radius={[4, 4, 0, 0]} maxBarSize={50} />
                    </BarChart>
                  </ChartContainer>
                )}
              </ChartSection>

              <ChartSection title="Written interventions" description="Initial marks vs appeals and manual overrides.">
                {writtenAttemptTypeData.length === 0 ? (
                  <ChartEmpty message="No written intervention data yet." />
                ) : (
                  <ChartContainer config={attemptTypeChartConfig} className="h-64 w-full">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                      <Pie
                        data={writtenAttemptTypeData}
                        dataKey="value"
                        nameKey="label"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={4}
                        stroke="none"
                      >
                        {writtenAttemptTypeData.map((entry: any) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <ChartLegend content={<ChartLegendContent nameKey="label" payload={undefined} />} className="pt-4" />
                    </PieChart>
                  </ChartContainer>
                )}
              </ChartSection>
            </div>
          </section>

          {/* ── Multiple-choice analytics ── */}
          <section className="space-y-6">
            <SectionHeading>Multiple-choice analytics</SectionHeading>

            <div className="grid gap-8 xl:grid-cols-2">
              <ChartSection title="MC topic accuracy" description="Accuracy by topic for multiple-choice answers.">
                {mcTopicAccuracy.length === 0 ? (
                  <ChartEmpty message="No MC attempts yet." />
                ) : (
                  <ChartContainer
                    config={topicChartConfig}
                    className="w-full"
                    style={{ height: `${Math.max(mcTopicAccuracy.length * 32, 300)}px` }}
                  >
                    <BarChart data={mcTopicAccuracy} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }} barCategoryGap={0}>
                      <CartesianGrid horizontal={false} strokeDasharray="3 3" opacity={0.15} />
                      <XAxis type="number" tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                      <YAxis
                        dataKey="topic"
                        type="category"
                        interval={0}
                        tickLine={false}
                        axisLine={false}
                        width={250}
                        tickFormatter={(value: string) => {
                          const words = value.split(" ");
                          const lines: string[] = [];
                          let current = "";
                          for (const w of words) {
                            if ((current + " " + w).length > 14) {
                              lines.push(current);
                              current = w;
                            } else {
                              current = current ? current + " " + w : w;
                            }
                          }
                          if (current) lines.push(current);
                          return lines.join("\n");
                        }}
                        tick={{ fontSize: 10 }}
                      />
                      <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                      <Bar dataKey="accuracy" fill="var(--color-accuracy)" radius={[0, 4, 4, 0]} maxBarSize={24} />
                    </BarChart>
                  </ChartContainer>
                )}
              </ChartSection>

              <ChartSection title="MC response speed" description="Average time to answer each topic when response timing is available.">
                {mcResponseLatency.length === 0 ? (
                  <ChartEmpty message="Response timing will appear for new MC attempts." />
                ) : (
                  <ChartContainer config={responseLatencyChartConfig} className="h-full w-full">
                    <BarChart data={mcResponseLatency} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="topic" tickLine={false} axisLine={false} minTickGap={18} tick={{ fontSize: 11 }} />
                      <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `${v}s`} tick={{ fontSize: 11 }} />
                      <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                      <Bar dataKey="avgResponseSeconds" fill="var(--color-avgResponseSeconds)" radius={[4, 4, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ChartContainer>
                )}
              </ChartSection>
            </div>
          </section>

          {/* ── Generation diagnostics ── */}
          <section className="space-y-6">
            <div className="flex items-center justify-between border-b border-border/30 pb-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70">
                Generation diagnostics
              </h2>
              <button
                type="button"
                onClick={() => setShowDiagnostics((p) => !p)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showDiagnostics || debugMode ? (
                  <><ChevronUp className="h-3 w-3" /> Hide</>
                ) : (
                  <><ChevronDown className="h-3 w-3" /> Show</>
                )}
              </button>
            </div>

            {(showDiagnostics || debugMode) && (
              <div className="grid gap-8 xl:grid-cols-[1.2fr_1fr]">
                <ChartSection title="Generation diagnostics" description="Average generation time and repair pressure by difficulty.">
                  {qualityRows.length === 0 ? (
                    <ChartEmpty message="No generation telemetry yet." />
                  ) : (
                    <ChartContainer config={generationChartConfig} className="w-full h-64">
                      <BarChart data={qualityRows} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.15} />
                        <XAxis dataKey="difficulty" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                        <ChartLegend content={<ChartLegendContent payload={undefined} />} className="pt-4" />
                        <Bar dataKey="avgDurationSeconds" fill="var(--color-avgDurationSeconds)" radius={[4, 4, 0, 0]} maxBarSize={36} />
                        <Bar dataKey="avgRepairAttempts" fill="var(--color-avgRepairAttempts)" radius={[4, 4, 0, 0]} maxBarSize={36} />
                      </BarChart>
                    </ChartContainer>
                  )}
                </ChartSection>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Difficulty notes</h3>
                  {qualityRows.length === 0 ? (
                    <ChartEmpty message="No diagnostic notes yet." />
                  ) : (
                    <div className="space-y-4">
                      {qualityRows.map((row: any) => (
                        <div
                          key={row.difficulty}
                          className="py-3 border-b border-border/20 last:border-0"
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <div className="text-sm font-semibold capitalize">{row.difficulty}</div>
                              <div className="text-[10px] text-muted-foreground">{row.sampleCount} samples</div>
                            </div>
                            <div className={`text-lg font-bold tabular-nums ${accuracyColor(row.accuracy)}`}>
                              {formatPercent(row.accuracy)}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Gen time</span>
                              <span className="font-semibold tabular-nums">{row.avgDurationSeconds.toFixed(1)}s</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <Tooltip content="How many times the AI had to retry generating a valid question before succeeding.">
                                <span className="text-muted-foreground">Repairs</span>
                              </Tooltip>
                              <span className="font-semibold tabular-nums">{row.avgRepairAttempts.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Attempts</span>
                              <span className="font-semibold tabular-nums">{row.avgGenerationAttempts.toFixed(2)}</span>
                            </div>
                            {row.distinctnessAvg !== undefined && (
                              <div className="flex justify-between items-center">
                                <Tooltip content="How different this question is from others generated in the same session (higher = more unique).">
                                  <span className="text-muted-foreground">Distinct</span>
                                </Tooltip>
                                <span className="font-semibold tabular-nums">{row.distinctnessAvg.toFixed(2)}</span>
                              </div>
                            )}
                            {row.multiStepDepthAvg !== undefined && (
                              <div className="flex justify-between items-center col-span-2 mt-1 pt-1.5 border-t border-border/20">
                                <Tooltip content="Average number of reasoning steps required — higher depth means more complex multi-part questions.">
                                  <span className="text-muted-foreground">Multi-step depth</span>
                                </Tooltip>
                                <span className="font-semibold tabular-nums">{row.multiStepDepthAvg.toFixed(2)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* ── Lowest-scoring written attempts ── */}
          <section className="space-y-6">
            <SectionHeading>Lowest-scoring written attempts</SectionHeading>

            {lowestScoringWritten.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground/60">
                <div className="text-center">
                  <FileText className="h-5 w-5 mx-auto mb-2 text-muted-foreground/40" />
                  <p>No written attempts yet</p>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {lowestScoringWritten.map((attempt: any) => {
                  const scorePct = attempt.scorePercent ?? 0;
                  return (
                    <div
                      key={attempt.id}
                      className="flex flex-col gap-3 py-3 border-b border-border/20"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-0.5 min-w-0">
                          <h3 className="line-clamp-1 text-sm font-semibold leading-tight">
                            {attempt.topic}
                          </h3>
                          <p className="line-clamp-1 text-[11px] text-muted-foreground wrap-break-word">
                            {attempt.subtopic}
                          </p>
                        </div>
                        <span className={`text-xl font-bold tabular-nums shrink-0 ${accuracyColor(scorePct)}`}>
                          {formatPercent(scorePct)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-[11px] text-muted-foreground/60">
                        <div className="flex items-center gap-1">
                          <Type className="h-3 w-3" />
                          <span>{attempt.answerWordCount ?? 0} words</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock3 className="h-3 w-3" />
                          <span>{formatDurationMs(attempt.markingLatencyMs)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

        </div>
      )}
    </div>
  );
}
