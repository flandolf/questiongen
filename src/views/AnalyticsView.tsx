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
import { Clock3, FileText, Gauge, Target, TrendingUp, Type, WandSparkles, AlertTriangle } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
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

type KpiCardProps = {
  title: string;
  value: string;
  detail: string;
  icon: typeof Target;
  accent?: "default" | "success" | "warning" | "danger";
};

const CARD_FIXED_HEIGHT = "min-h-[26rem]";

// Colour helpers — map accuracy to a semantic CSS variable
function accuracyColor(pct: number | undefined): string {
  if (pct === undefined) return "text-muted-foreground";
  if (pct >= 75) return "text-emerald-500";
  if (pct >= 50) return "text-amber-500";
  return "text-rose-500";
}

function accuracyBg(pct: number | undefined): string {
  if (pct === undefined) return "bg-muted/30 border-muted/40";
  if (pct >= 75) return "bg-emerald-500/10 border-emerald-500/20";
  if (pct >= 50) return "bg-amber-500/10 border-amber-500/20";
  return "bg-rose-500/10 border-rose-500/20";
}

const trendChartConfig = {
  overallAccuracy: { label: "Overall", color: "var(--color-chart-1)" },
  writtenAccuracy: { label: "Written", color: "var(--color-chart-2)" },
  mcAccuracy: { label: "Multiple choice", color: "var(--color-chart-4)" },
} satisfies ChartConfig;

const topicChartConfig = {
  accuracy: { label: "Accuracy", color: "var(--color-chart-1)" },
} satisfies ChartConfig;

const marksChartConfig = {
  attempts: { label: "Attempts", color: "var(--color-chart-2)" },
} satisfies ChartConfig;

const effortChartConfig = {
  avgScorePercent: { label: "Average score", color: "var(--color-chart-1)" },
} satisfies ChartConfig;

const attemptTypeChartConfig = {
  value: { label: "Attempts", color: "var(--color-chart-5)" },
  initial: { label: "Initial", color: "var(--color-chart-1)" },
  appeal: { label: "Appeal", color: "var(--color-chart-2)" },
  override: { label: "Override", color: "var(--color-chart-4)" },
} satisfies ChartConfig;

const responseLatencyChartConfig = {
  avgResponseSeconds: { label: "Avg response seconds", color: "var(--color-chart-4)" },
} satisfies ChartConfig;

const generationChartConfig = {
  avgDurationSeconds: { label: "Generation seconds", color: "var(--color-chart-1)" },
  avgRepairAttempts: { label: "Repair attempts", color: "var(--color-chart-2)" },
} satisfies ChartConfig;

// ─── Section divider ────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
        {children}
      </span>
      <div className="flex-1 border-t border-border/40" />
    </div>
  );
}

// ─── Empty chart placeholder ─────────────────────────────────────────────────
function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border/40 bg-muted/20 text-sm text-muted-foreground">
      {message}
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({ title, value, detail, icon: Icon, accent = "default" }: KpiCardProps) {
  const accentStyles: Record<string, string> = {
    default: "bg-primary/10 text-primary border-primary/20",
    success: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    danger:  "bg-rose-500/10 text-rose-500 border-rose-500/20",
  };
  const valueStyles: Record<string, string> = {
    default: "text-foreground",
    success: "text-emerald-500",
    warning: "text-amber-500",
    danger:  "text-rose-500",
  };

  return (
    <Card className="group border border-border/50 bg-card/90 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
      <CardContent className="flex items-start justify-between gap-3 py-4 px-5">
        <div className="space-y-1.5 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">
            {title}
          </div>
          <div className={`text-3xl font-black tabular-nums leading-none ${valueStyles[accent]}`}>
            {value}
          </div>
          <div className="text-xs text-muted-foreground truncate">{detail}</div>
        </div>
        <div className={`shrink-0 rounded-xl border p-2.5 transition-colors ${accentStyles[accent]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Chart card wrapper ───────────────────────────────────────────────────────
function ChartCard({
  title,
  description,
  children,
  fixedHeight = true,
  className = "",
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  fixedHeight?: boolean;
  className?: string;
}) {
  return (
    <Card
      className={`border border-border/50 bg-card/90 shadow-sm flex flex-col transition-all duration-200 hover:shadow-md ${
        fixedHeight ? CARD_FIXED_HEIGHT : ""
      } ${className}`}
    >
      <CardHeader className="pb-2 shrink-0">
        <CardTitle className="text-base font-semibold leading-snug">{title}</CardTitle>
        {description && (
          <CardDescription className="text-xs leading-relaxed">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto px-5 pb-5">{children}</CardContent>
    </Card>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────
export function AnalyticsView() {
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
  } = useAnalyticsData();

  const hasAnyAttempts = allAttempts.length > 0;

  // Derive accent colours from live summary values
  const overallPct = summary.overallAccuracy;
  const writtenPct = summary.writtenAverageScore;
  const mcPct      = summary.mcAttempts ? (summary.mcCorrect / summary.mcAttempts) * 100 : 0;
  const toAccent = (pct: number) =>
    pct >= 75 ? "success" : pct >= 50 ? "warning" : pct > 0 ? "danger" : "default";

  return (
    <div className="min-h-full min-w-full space-y-8 p-6 pb-12">
      {/* ── Page header ── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="secondary"
            className="bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-[10px] font-bold uppercase tracking-wider px-2.5 py-1"
          >
            Analytics
          </Badge>
          {hasAnyAttempts && (
            <Badge
              variant="outline"
              className="bg-background/80 text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1"
            >
              {allAttempts.length} attempts tracked
            </Badge>
          )}
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-tight leading-none mb-2">
            Analytics Workspace
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground leading-relaxed">
            Track accuracy trends, written-score distribution, multiple-choice behaviour, and
            generation quality in one place.
          </p>
        </div>
      </div>

      {/* ── Empty state ── */}
      {!hasAnyAttempts ? (
        <Card className="border border-dashed border-border/60 bg-card/50">
          <EmptyState
            compact
            title="No analytics yet"
            description="Complete some written or multiple-choice questions and this page will build trend lines, topic breakdowns, and generation diagnostics automatically."
            className="h-auto py-16"
          />
        </Card>
      ) : (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-3 duration-500">

          {/* ── KPIs ── */}
          <section className="space-y-4">
            <SectionLabel>Performance at a glance</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <KpiCard
                title="Overall Accuracy"
                value={formatPercent(overallPct)}
                detail={`${summary.totalCorrect} / ${summary.totalAttempts} attempts correct`}
                icon={Target}
                accent={toAccent(overallPct)}
              />
              <KpiCard
                title="Written Average"
                value={formatPercent(writtenPct)}
                detail={`${summary.writtenAttempts} written attempts`}
                icon={TrendingUp}
                accent={toAccent(writtenPct)}
              />
              <KpiCard
                title="MC Accuracy"
                value={formatPercent(mcPct)}
                detail={`${summary.mcCorrect} / ${summary.mcAttempts} multiple-choice`}
                icon={Gauge}
                accent={toAccent(mcPct)}
              />
              <KpiCard
                title="Marking Latency"
                value={formatDurationMs(summary.averageMarkingLatencyMs)}
                detail="Avg AI marking turnaround"
                icon={Clock3}
              />
              <KpiCard
                title="Generation Latency"
                value={formatDurationMs(summary.averageGenerationLatencyMs)}
                detail="Avg generation time"
                icon={WandSparkles}
              />
              <KpiCard
                title="Interventions"
                value={`${summary.appealCount + summary.overrideCount}`}
                detail={`${summary.appealCount} appeals · ${summary.overrideCount} overrides`}
                icon={AlertTriangle}
                accent={
                  summary.appealCount + summary.overrideCount > 0 ? "warning" : "default"
                }
              />
            </div>
          </section>

          {/* ── Trend + Topic performance ── */}
          <section className="space-y-4">
            <SectionLabel>Trends &amp; topic breakdown</SectionLabel>
            <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
              <ChartCard
                title="Accuracy Trend"
                description="Cumulative accuracy across all attempts, separated by mode."
              >
                <ChartContainer config={trendChartConfig} className="h-80 w-full mt-4">
                  <LineChart data={trendData} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} tick={{ fontSize: 11 }} />
                    <YAxis tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                    <ChartLegend content={<ChartLegendContent payload={undefined} />} className="pt-4" />
                    <Line type="monotone" dataKey="overallAccuracy" stroke="var(--color-overallAccuracy)" strokeWidth={3} dot={false} />
                    <Line type="monotone" dataKey="writtenAccuracy" stroke="var(--color-writtenAccuracy)" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                    <Line type="monotone" dataKey="mcAccuracy" stroke="var(--color-mcAccuracy)" strokeWidth={2} strokeDasharray="3 3" dot={false} />
                  </LineChart>
                </ChartContainer>
              </ChartCard>

              <ChartCard
                title="Topic Performance"
                description="Accuracy by topic. Filter below to inspect specific subtopics."
              >
                <ChartContainer config={topicChartConfig} className="h-[240px] w-full mt-4">
                  <BarChart data={topicPerformance} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" opacity={0.2} />
                    <XAxis type="number" tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                    <YAxis dataKey="topic" type="category" tickLine={false} axisLine={false} width={90} tick={{ fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                    <Bar dataKey="accuracy" fill="var(--color-accuracy)" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ChartContainer>
                {/* Topic filter badges */}
                <div className="flex flex-wrap gap-1.5 mt-4 pt-3 border-t border-border/40">
                  <Badge
                    variant={topicFilter === ALL_TOPICS ? "default" : "outline"}
                    className="cursor-pointer text-[10px] font-semibold uppercase tracking-wide hover:bg-primary/90 transition-colors"
                    onClick={() => setTopicFilter(ALL_TOPICS)}
                  >
                    {ALL_TOPICS}
                  </Badge>
                  {topicPerformance.map((item) => (
                    <Badge
                      key={item.topic}
                      variant={topicFilter === item.topic ? "default" : "outline"}
                      className="cursor-pointer text-[10px] font-semibold uppercase tracking-wide hover:bg-primary/90 transition-colors"
                      onClick={() => setTopicFilter(item.topic)}
                    >
                      {item.topic} ({item.attempts})
                    </Badge>
                  ))}
                </div>
              </ChartCard>
            </div>
          </section>

          {/* ── Subtopics + Actionable flags ── */}
          <section className="space-y-4">
            <SectionLabel>Subtopic detail</SectionLabel>
            <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
              {/* Subtopic drilldown */}
              <ChartCard
                title="Subtopic Drilldown"
                description={
                  topicFilter === ALL_TOPICS
                    ? "Lowest-performing subtopics across all topics."
                    : `Lowest-performing subtopics inside ${topicFilter}.`
                }
              >
                {displayedSubtopics.length === 0 ? (
                  <ChartEmpty message="No subtopic data yet." />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 mt-1">
                    {displayedSubtopics.slice(0, 8).map((row) => (
                      <div
                        key={row.key}
                        className="rounded-xl border border-border/40 bg-background/50 p-3.5 transition-colors hover:bg-background/80"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-sm leading-tight break-words">{row.subtopic}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">{row.topic}</div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className={`text-lg font-black tabular-nums ${accuracyColor(row.accuracy)}`}>
                              {formatPercent(row.accuracy)}
                            </div>
                            <div className="text-[10px] text-muted-foreground">{row.correct}/{row.attempts}</div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
                          <span className="bg-secondary/10 px-2 py-0.5 rounded-md">{row.writtenAttempts} written</span>
                          <span className="bg-secondary/10 px-2 py-0.5 rounded-md">{row.mcAttempts} MC</span>
                          {row.attempts < LOW_SAMPLE_THRESHOLD && (
                            <span className="text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md">Low sample</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ChartCard>

              {/* Actionable flags */}
              <ChartCard
                title="Actionable Flags"
                description="Weak areas that deserve attention now."
              >
                {displayedSubtopics.slice(0, 5).length === 0 ? (
                  <ChartEmpty message="No flagged areas yet." />
                ) : (
                  <div className="space-y-2.5 mt-1">
                    {displayedSubtopics.slice(0, 5).map((row) => (
                      <div
                        key={row.key}
                        className="flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3.5"
                      >
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500/70" />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm text-rose-500/90 leading-tight break-words">
                            {row.subtopic}
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span className="truncate">{row.topic}</span>
                            <span className="shrink-0 font-semibold text-foreground">
                              {formatPercent(row.accuracy)} ({row.correct}/{row.attempts})
                            </span>
                          </div>
                        </div>
                        <Badge
                          variant={row.attempts < LOW_SAMPLE_THRESHOLD ? "outline" : "secondary"}
                          className="shrink-0 text-[9px] font-bold uppercase tracking-wider"
                        >
                          {row.attempts < LOW_SAMPLE_THRESHOLD ? "Low sample" : "Trend"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </ChartCard>
            </div>
          </section>

          {/* ── Written analytics ── */}
          <section className="space-y-4">
            <SectionLabel>Written analytics</SectionLabel>
            <div className="grid gap-6 xl:grid-cols-2">
              {/* Score distribution */}
              <ChartCard
                title="Written Score Distribution"
                description="Score distribution for marked written responses."
              >
                {writtenAttempts.length === 0 ? (
                  <ChartEmpty message="No written attempts yet." />
                ) : (
                  <ChartContainer config={marksChartConfig} className="flex-1 w-full min-h-[250px] mt-4">
                    <BarChart data={writtenMarksDistribution} margin={{ left: 0, right: 0, top: 10, bottom: 20 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.1} />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11 }}
                        tickMargin={10}
                      />
                      <YAxis hide />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="attempts" fill="var(--color-attempts)" radius={[6, 6, 0, 0]} barSize={60} />
                    </BarChart>
                  </ChartContainer>
                )}
              </ChartCard>

              {/* Criterion weak points */}
              <ChartCard
                title="Criterion Weak Points"
                description={`Marks most often dropped across the last ${Math.min(questionHistoryLength, RECENT_WRITTEN_CRITERIA_WINDOW)} written marking passes.`}
              >
                {recentCriterionWeakPoints.length === 0 ? (
                  <ChartEmpty message="Criterion trends will appear after written answers are marked." />
                ) : (
                  <div className="space-y-2.5 mt-1">
                    {recentCriterionWeakPoints.map((row) => (
                      <div
                        key={row.criterion}
                        className="rounded-xl border border-border/40 bg-background/50 p-3.5 hover:bg-background/80 transition-colors"
                      >
                        <div className="text-[10px] font-bold text-primary/80 uppercase tracking-wide mb-1">
                          {row.topicSummary || "Mixed topics"}
                        </div>
                        <div className="text-sm font-medium leading-relaxed mb-2">
                          <MarkdownMath content={row.criterion} />
                        </div>
                        <div className="flex items-center justify-between border-t border-border/40 pt-2 text-xs">
                          <div className="flex items-baseline gap-1.5">
                            <span className={`text-base font-black tabular-nums ${accuracyColor(row.successPercent)}`}>
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
              </ChartCard>
            </div>

            {/* Effort vs score + Interventions */}
            <div className="grid gap-6 xl:grid-cols-2">
              <ChartCard
                title="Answer Effort vs Score"
                description="Average written score by answer length bucket."
              >
                {writtenEffortDistribution.every((item) => item.attempts === 0) ? (
                  <ChartEmpty message="Tracking will populate as written attempts are marked." />
                ) : (
                  <ChartContainer config={effortChartConfig} className="h-72 w-full mt-4">
                    <BarChart data={writtenEffortDistribution} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                      <YAxis tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                      <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                      <Bar dataKey="avgScorePercent" fill="var(--color-avgScorePercent)" radius={[4, 4, 0, 0]} maxBarSize={60} />
                    </BarChart>
                  </ChartContainer>
                )}
              </ChartCard>

              <ChartCard
                title="Written Interventions"
                description="Initial marks vs appeals and manual overrides."
              >
                {writtenAttemptTypeData.length === 0 ? (
                  <ChartEmpty message="No written intervention data yet." />
                ) : (
                  <ChartContainer config={attemptTypeChartConfig} className="h-72 w-full mt-4">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                      <Pie
                        data={writtenAttemptTypeData}
                        dataKey="value"
                        nameKey="label"
                        innerRadius={70}
                        outerRadius={100}
                        paddingAngle={4}
                        stroke="none"
                      >
                        {writtenAttemptTypeData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <ChartLegend content={<ChartLegendContent nameKey="label" payload={undefined} />} className="pt-6" />
                    </PieChart>
                  </ChartContainer>
                )}
              </ChartCard>
            </div>
          </section>

          {/* ── Multiple-choice analytics ── */}
          <section className="space-y-4">
            <SectionLabel>Multiple-choice analytics</SectionLabel>
            <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
              <ChartCard
                title="MC Topic Accuracy"
                description="Accuracy by topic for multiple-choice answers."
              >
                {mcTopicAccuracy.length === 0 ? (
                  <ChartEmpty message="No MC attempts yet." />
                ) : (
                  <ChartContainer config={topicChartConfig} className="h-72 w-full mt-4">
                    <BarChart data={mcTopicAccuracy} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
                      <CartesianGrid horizontal={false} strokeDasharray="3 3" opacity={0.2} />
                      <XAxis type="number" tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                      <YAxis dataKey="topic" type="category" tickLine={false} axisLine={false} width={90} tick={{ fontSize: 11 }} />
                      <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                      <Bar dataKey="accuracy" fill="var(--color-accuracy)" radius={[0, 4, 4, 0]} maxBarSize={30} />
                    </BarChart>
                  </ChartContainer>
                )}
              </ChartCard>

              <ChartCard
                title="MC Response Speed"
                description="Average time to answer each topic when response timing is available."
              >
                {mcResponseLatency.length === 0 ? (
                  <ChartEmpty message="Response timing will appear for new MC attempts." />
                ) : (
                  <ChartContainer config={responseLatencyChartConfig} className="h-72 w-full mt-4">
                    <BarChart data={mcResponseLatency} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="topic" tickLine={false} axisLine={false} minTickGap={18} tick={{ fontSize: 11 }} />
                      <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `${v}s`} tick={{ fontSize: 11 }} />
                      <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                      <Bar dataKey="avgResponseSeconds" fill="var(--color-avgResponseSeconds)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ChartContainer>
                )}
              </ChartCard>
            </div>
          </section>

          {/* ── Generation diagnostics ── */}
          <section className="space-y-4">
            <SectionLabel>Generation diagnostics</SectionLabel>
            <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
              <ChartCard
                title="Generation Diagnostics"
                description="Average generation time and repair pressure by difficulty."
              >
                {qualityRows.length === 0 ? (
                  <ChartEmpty message="No generation telemetry yet." />
                ) : (
                  <ChartContainer config={generationChartConfig} className="flex-1 w-full min-h-[250px] mt-4">
                    <BarChart data={qualityRows} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="difficulty" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                      <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                      <ChartLegend content={<ChartLegendContent payload={undefined} />} className="pt-4" />
                      <Bar dataKey="avgDurationSeconds" fill="var(--color-avgDurationSeconds)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                      <Bar dataKey="avgRepairAttempts" fill="var(--color-avgRepairAttempts)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ChartContainer>
                )}
              </ChartCard>

              <ChartCard
                title="Difficulty Notes"
                description="Generation quality, depth, and accuracy rolled up by difficulty."
              >
                {qualityRows.length === 0 ? (
                  <ChartEmpty message="No diagnostic notes yet." />
                ) : (
                  <div className="space-y-3 mt-1">
                    {qualityRows.map((row) => (
                      <div
                        key={row.difficulty}
                        className="rounded-xl border border-border/40 bg-background/50 p-4 hover:bg-background/80 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2 mb-3 pb-3 border-b border-border/40">
                          <div>
                            <div className="text-sm font-bold capitalize">{row.difficulty}</div>
                            <div className="text-[10px] text-muted-foreground">{row.sampleCount} samples</div>
                          </div>
                          <div className={`text-xl font-black tabular-nums ${accuracyColor(row.accuracy)}`}>
                            {formatPercent(row.accuracy)}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Gen time</span>
                            <span className="font-semibold tabular-nums">{row.avgDurationSeconds.toFixed(1)}s</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Repairs</span>
                            <span className="font-semibold tabular-nums">{row.avgRepairAttempts.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Attempts</span>
                            <span className="font-semibold tabular-nums">{row.avgGenerationAttempts.toFixed(2)}</span>
                          </div>
                          {row.distinctnessAvg !== undefined && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Distinct</span>
                              <span className="font-semibold tabular-nums">{row.distinctnessAvg.toFixed(2)}</span>
                            </div>
                          )}
                          {row.multiStepDepthAvg !== undefined && (
                            <div className="flex justify-between col-span-2 mt-1.5 pt-2 border-t border-border/30">
                              <span className="text-muted-foreground">Multi-step depth</span>
                              <span className="font-semibold tabular-nums">{row.multiStepDepthAvg.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ChartCard>
            </div>
          </section>

          {/* ── Lowest-scoring written attempts ── */}
          <section className="space-y-4">
            <SectionLabel>Lowest-scoring written attempts</SectionLabel>
            <Card className="border border-border/50 bg-card/90 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Lowest-Scoring Written Attempts</CardTitle>
                <CardDescription className="text-xs">
                  Useful for spotting recurring failure patterns and intervention-heavy questions.
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-6">
                {lowestScoringWritten.length === 0 ? (
                  <div className="flex h-48 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/50 p-8 text-center">
                    <div className="mb-2 rounded-full bg-muted/40 p-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">No written attempts yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Your lowest scoring work will appear here for review.</p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {lowestScoringWritten.map((attempt) => {
                      const scorePct = attempt.scorePercent ?? 0;
                      return (
                        <div
                          key={attempt.id}
                          className={`group flex flex-col overflow-hidden rounded-xl border bg-card p-4 text-left transition-all hover:shadow-md ${accuracyBg(scorePct)}`}
                        >
                          {/* Top Row */}
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="space-y-1 min-w-0">
                              <span className="inline-flex items-center rounded-full bg-rose-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-500">
                                {attempt.attemptKind || "Written"}
                              </span>
                              <h3 className="line-clamp-2 text-sm font-bold leading-tight">
                                {attempt.topic}
                              </h3>
                              <p className="line-clamp-2 text-[11px] text-muted-foreground wrap-break-word">
                                {attempt.subtopic}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <span className={`text-2xl font-black tabular-nums ${accuracyColor(scorePct)}`}>
                                {formatPercent(scorePct)}
                              </span>
                              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60 mt-0.5">
                                Score
                              </div>
                            </div>
                          </div>

                          {/* Bottom Row */}
                          <div className="mt-auto flex items-center gap-4 border-t border-border/40 pt-2.5 text-[11px] text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Type className="h-3.5 w-3.5 opacity-60" />
                              <span>{attempt.answerWordCount ?? 0} words</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock3 className="h-3.5 w-3.5 opacity-60" />
                              <span>{formatDurationMs(attempt.markingLatencyMs)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}
