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
import { ChevronRight, Clock3, FileText, Gauge, Target, TrendingUp, Type, WandSparkles } from "lucide-react";
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
};

const CARD_FIXED_HEIGHT = "min-h-[26rem]";

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

function KpiCard({ title, value, detail, icon: Icon }: KpiCardProps) {
  return (
    <Card size="sm" className="border border-border/50 bg-card/90 shadow-sm transition-all hover:shadow-md">
      <CardContent className="flex items-start justify-between gap-3 pt-4">
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">{title}</div>
          <div className="text-3xl font-bold tracking-tight">{value}</div>
          <div className="text-sm text-muted-foreground">{detail}</div>
        </div>
        <div className="rounded-full border-2 border-primary/20 bg-primary/10 p-3 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

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
    questionHistoryLength
  } = useAnalyticsData();

  const hasAnyAttempts = allAttempts.length > 0;

  return (
    <div className="min-h-full min-w-full space-y-6 p-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 transition-colors">Detailed Analytics</Badge>
          {hasAnyAttempts ? (
            <Badge variant="outline" className="bg-background/80">
              {allAttempts.length} Tracked Attempts
            </Badge>
          ) : null}
        </div>
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight mb-2">Analytics Workspace</h1>
          <p className="max-w-3xl text-base text-muted-foreground">
            Track accuracy trends, written-score distribution, multiple-choice behaviour, and generation quality in one place.
          </p>
        </div>
      </div>

      {!hasAnyAttempts ? (
        <Card className="border border-dashed border-border/70 bg-card/50">
          <EmptyState
            compact
            title="No analytics yet"
            description="Complete some written or multiple-choice questions and this page will build trend lines, topic breakdowns, and generation diagnostics automatically."
            className="h-auto py-12"
          />
        </Card>
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              title="Overall Accuracy"
              value={formatPercent(summary.overallAccuracy)}
              detail={`${summary.totalCorrect}/${summary.totalAttempts} attempts correct`}
              icon={Target}
            />
            <KpiCard
              title="Written Average"
              value={formatPercent(summary.writtenAverageScore)}
              detail={`${summary.writtenAttempts} written attempts`}
              icon={TrendingUp}
            />
            <KpiCard
              title="MC Accuracy"
              value={formatPercent(summary.mcAttempts ? (summary.mcCorrect / summary.mcAttempts * 100) : 0)}
              detail={`${summary.mcCorrect}/${summary.mcAttempts} multiple-choice`}
              icon={Gauge}
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
              detail={`${summary.appealCount} appeals, ${summary.overrideCount} overrides`}
              icon={Target}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <Card className={`border border-border/50 bg-card/90 shadow-sm ${CARD_FIXED_HEIGHT} flex flex-col transition-all hover:shadow-md`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xl">Accuracy Trend</CardTitle>
                <CardDescription>
                  Cumulative accuracy across all attempts, separated by mode.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto">
                <ChartContainer config={trendChartConfig} className="h-80 w-full mt-4">
                  <LineChart data={trendData} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                    <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                    <ChartLegend content={<ChartLegendContent />} className="pt-4" />
                    <Line type="monotone" dataKey="overallAccuracy" stroke="var(--color-overallAccuracy)" strokeWidth={3} dot={false} />
                    <Line type="monotone" dataKey="writtenAccuracy" stroke="var(--color-writtenAccuracy)" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                    <Line type="monotone" dataKey="mcAccuracy" stroke="var(--color-mcAccuracy)" strokeWidth={2} strokeDasharray="3 3" dot={false} />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card className={`border border-border/50 bg-card/90 shadow-sm ${CARD_FIXED_HEIGHT} flex flex-col transition-all hover:shadow-md`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xl">Topic Performance</CardTitle>
                <CardDescription>
                  Accuracy by topic. Filter below to inspect specific subtopics.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto flex flex-col mt-4">
                <ChartContainer config={topicChartConfig} className="h-[280px] w-full mb-4">
                  <BarChart data={topicPerformance} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                    <YAxis dataKey="topic" type="category" tickLine={false} axisLine={false} width={100} />
                    <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                    <Bar dataKey="accuracy" fill="var(--color-accuracy)" radius={[0, 4, 4, 0]} barSize={24} />
                  </BarChart>
                </ChartContainer>
                <div className="flex flex-wrap gap-2 mt-auto">
                  <Badge
                    variant={topicFilter === ALL_TOPICS ? "default" : "outline"}
                    className="cursor-pointer hover:bg-primary/90 transition-colors"
                    onClick={() => setTopicFilter(ALL_TOPICS)}
                  >
                    {ALL_TOPICS}
                  </Badge>
                  {topicPerformance.map((item) => (
                    <Badge
                      key={item.topic}
                      variant={topicFilter === item.topic ? "default" : "outline"}
                      className="cursor-pointer hover:bg-primary/90 transition-colors"
                      onClick={() => setTopicFilter(item.topic)}
                    >
                      {item.topic} ({item.attempts})
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
            <Card className={`border border-border/50 bg-card/90 shadow-sm ${CARD_FIXED_HEIGHT} flex flex-col transition-all hover:shadow-md`}>
              <CardHeader>
                <CardTitle className="text-xl">Subtopic Drilldown</CardTitle>
                <CardDescription>
                  {topicFilter === ALL_TOPICS
                    ? "Lowest-performing subtopics across all topics."
                    : `Lowest-performing subtopics inside ${topicFilter}.`}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto space-y-3">
                {displayedSubtopics.length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">No subtopic data yet.</div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {displayedSubtopics.slice(0, 8).map((row) => (
                      <div key={row.key} className="rounded-xl border border-border/50 bg-background/50 p-4 transition-colors hover:bg-background/80">
                        <div className="flex flex-col items-start">
                          <div>
                            <div className="font-semibold truncate">{row.subtopic}</div>
                            <div className="text-xs text-muted-foreground">{row.topic}</div>
                          </div>
                          <div>
                            <div className="font-bold text-primary">{formatPercent(row.accuracy)}</div>
                            <div className="text-xs text-muted-foreground">{row.correct}/{row.attempts} right</div>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                          <span className="bg-secondary/10 px-2 py-1 rounded-md">{row.writtenAttempts} written</span>
                          <span className="bg-secondary/10 px-2 py-1 rounded-md">{row.mcAttempts} MC</span>
                          {row.attempts < LOW_SAMPLE_THRESHOLD && (
                            <span className="text-amber-500 bg-amber-500/10 px-2 py-1 rounded-md">Low sample</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className={`border border-border/50 bg-card/90 shadow-sm ${CARD_FIXED_HEIGHT} flex flex-col transition-all hover:shadow-md`}>
              <CardHeader>
                <CardTitle className="text-xl">Actionable Flags</CardTitle>
                <CardDescription>
                  Weak areas that deserve attention now.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto space-y-3">
                {displayedSubtopics.slice(0, 5).length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">No flagged areas yet.</div>
                ) : (
                  displayedSubtopics.slice(0, 5).map((row) => (
                    <div key={row.key} className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 relative overflow-hidden">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-destructive/90">{row.subtopic}</div>
                        <Badge variant={row.attempts < LOW_SAMPLE_THRESHOLD ? "outline" : "secondary"} className="bg-background/80">
                          {row.attempts < LOW_SAMPLE_THRESHOLD ? "Caution: Low sample" : "Established Trend"}
                        </Badge>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground flex items-center justify-between">
                        <span>{row.topic}</span>
                        <span className="font-medium text-foreground">{formatPercent(row.accuracy)} ({row.correct}/{row.attempts})</span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className={`border border-border/50 bg-card/90 shadow-sm flex flex-col ${CARD_FIXED_HEIGHT} transition-all hover:shadow-md`}>
              <CardHeader>
                <CardTitle className="text-xl">Written Analytics</CardTitle>
                <CardDescription>Score distribution for marked written responses.</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto pb-0 flex flex-col">
                {writtenAttempts.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">No written attempts yet.</div>
                ) : (
                  <ChartContainer
                    config={marksChartConfig}
                    className="flex-1 w-full min-h-[250px] mt-4"
                  >
                    <BarChart
                      data={writtenMarksDistribution}
                      margin={{ left: 0, right: 0, top: 10, bottom: 20 }}
                    >
                      <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.1} />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={10}
                      />
                      <YAxis hide />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar
                        dataKey="attempts"
                        fill="var(--color-attempts)"
                        radius={[6, 6, 0, 0]}
                        barSize={60}
                      />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card className={`border border-border/50 bg-card/90 shadow-sm ${CARD_FIXED_HEIGHT} flex flex-col transition-all hover:shadow-md`}>
              <CardHeader>
                <CardTitle className="text-xl">Criterion Weak Points</CardTitle>
                <CardDescription>
                  Marks most often dropped across the last {Math.min(questionHistoryLength, RECENT_WRITTEN_CRITERIA_WINDOW)} written marking passes.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto space-y-3">
                {recentCriterionWeakPoints.length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-sm text-muted-foreground text-center px-4">
                    Criterion-level trends will appear after written answers are marked.
                  </div>
                ) : (
                  recentCriterionWeakPoints.map((row) => (
                    <div key={row.criterion} className="rounded-xl border border-border/50 bg-background/50 p-4 hover:bg-background/80 transition-colors">
                      <div className="flex flex-col items-start justify-between gap-3">
                        <div className="w-full">
                          <div className="text-xs font-semibold text-primary/80 uppercase tracking-wide">
                            {row.topicSummary || "Mixed topics"}
                          </div>
                          <div className="text-sm font-medium leading-relaxed rounded-md my-1">
                            <MarkdownMath content={row.criterion} />
                          </div>
                        </div>
                        <div className="flex w-full items-center justify-between border-t border-border/50 pt-2 mt-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-xl font-bold">{formatPercent(row.successPercent)}</span>
                            <span className="text-xs text-muted-foreground">success</span>
                          </div>
                          <div className="text-sm font-medium">
                            {row.achievedMarks} <span className="text-muted-foreground font-normal">/ {row.availableMarks} marks kept</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <Card className={`border border-border/50 bg-card/90 shadow-sm ${CARD_FIXED_HEIGHT} flex flex-col transition-all hover:shadow-md`}>
              <CardHeader>
                <CardTitle className="text-xl">Answer Effort vs Score</CardTitle>
                <CardDescription>Average written score by answer length bucket.</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto">
                {writtenEffortDistribution.every((item) => item.attempts === 0) ? (
                  <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">Tracking will populate as new written attempts are marked.</div>
                ) : (
                  <ChartContainer config={effortChartConfig} className="h-72 w-full mt-4">
                    <BarChart data={writtenEffortDistribution} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                      <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                      <Bar dataKey="avgScorePercent" fill="var(--color-avgScorePercent)" radius={[4, 4, 0, 0]} maxBarSize={60} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card className={`border border-border/50 bg-card/90 shadow-sm ${CARD_FIXED_HEIGHT} flex flex-col transition-all hover:shadow-md`}>
              <CardHeader>
                <CardTitle className="text-xl">Written Interventions</CardTitle>
                <CardDescription>Initial marks vs appeals and manual overrides.</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto">
                {writtenAttemptTypeData.length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">No written intervention data yet.</div>
                ) : (
                  <ChartContainer config={attemptTypeChartConfig} className="h-72 w-full mt-4">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                      <Pie data={writtenAttemptTypeData} dataKey="value" nameKey="label" innerRadius={70} outerRadius={100} paddingAngle={4} stroke="none">
                        {writtenAttemptTypeData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <ChartLegend content={<ChartLegendContent nameKey="label" />} className="pt-6" />
                    </PieChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
            <Card className={`border border-border/50 bg-card/90 shadow-sm ${CARD_FIXED_HEIGHT} flex flex-col transition-all hover:shadow-md`}>
              <CardHeader>
                <CardTitle className="text-xl">Multiple-Choice Analytics</CardTitle>
                <CardDescription>Accuracy by topic for multiple-choice answers.</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto">
                {mcTopicAccuracy.length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">No MC attempts yet.</div>
                ) : (
                  <ChartContainer config={topicChartConfig} className="h-72 w-full mt-4">
                    <BarChart data={mcTopicAccuracy} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
                      <CartesianGrid horizontal={false} strokeDasharray="3 3" opacity={0.2} />
                      <XAxis type="number" tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                      <YAxis dataKey="topic" type="category" tickLine={false} axisLine={false} width={100} />
                      <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                      <Bar dataKey="accuracy" fill="var(--color-accuracy)" radius={[0, 4, 4, 0]} maxBarSize={30} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card className={`border border-border/50 bg-card/90 shadow-sm ${CARD_FIXED_HEIGHT} flex flex-col transition-all hover:shadow-md`}>
              <CardHeader>
                <CardTitle className="text-xl">MC Response Speed</CardTitle>
                <CardDescription>Average time to answer each topic when response timing is available.</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto">
                {mcResponseLatency.length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">Response timing will appear for new MC attempts.</div>
                ) : (
                  <ChartContainer config={responseLatencyChartConfig} className="h-72 w-full mt-4">
                    <BarChart data={mcResponseLatency} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="topic" tickLine={false} axisLine={false} minTickGap={18} />
                      <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `${value}s`} />
                      <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                      <Bar dataKey="avgResponseSeconds" fill="var(--color-avgResponseSeconds)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
            <Card className={`border border-border/50 bg-card/90 shadow-sm ${CARD_FIXED_HEIGHT} flex flex-col transition-all hover:shadow-md`}>
              <CardHeader>
                <CardTitle className="text-xl">Generation Diagnostics</CardTitle>
                <CardDescription>Average generation time and repair pressure by difficulty.</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto">
                {qualityRows.length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">No generation telemetry yet.</div>
                ) : (
                  <ChartContainer config={generationChartConfig} className="h-80 w-full mt-4">
                    <BarChart data={qualityRows} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="difficulty" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                      <ChartLegend content={<ChartLegendContent />} className="pt-4" />
                      <Bar dataKey="avgDurationSeconds" fill="var(--color-avgDurationSeconds)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                      <Bar dataKey="avgRepairAttempts" fill="var(--color-avgRepairAttempts)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card className={`border border-border/50 bg-card/90 shadow-sm ${CARD_FIXED_HEIGHT} flex flex-col transition-all hover:shadow-md`}>
              <CardHeader>
                <CardTitle className="text-xl">Difficulty Notes</CardTitle>
                <CardDescription>Generation quality, depth, and accuracy rolled up by difficulty.</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto space-y-4">
                {qualityRows.length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">No diagnostic notes yet.</div>
                ) : (
                  qualityRows.map((row) => (
                    <div key={row.difficulty} className="rounded-xl border border-border/50 bg-background/50 p-4 hover:bg-background/80 transition-colors">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3 mb-3">
                        <div>
                          <div className="text-lg font-bold capitalize">{row.difficulty}</div>
                          <div className="text-xs text-muted-foreground">{row.sampleCount} samples evaluated</div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-black text-primary">{formatPercent(row.accuracy)}</div>
                          <div className="text-xs text-muted-foreground uppercase tracking-wider">Accuracy</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Gen Time:</span>
                          <span className="font-medium">{row.avgDurationSeconds.toFixed(1)}s</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Repairs:</span>
                          <span className="font-medium">{row.avgRepairAttempts.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Attempts:</span>
                          <span className="font-medium">{row.avgGenerationAttempts.toFixed(2)}</span>
                        </div>
                        {row.distinctnessAvg !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Distinct:</span>
                            <span className="font-medium">{row.distinctnessAvg.toFixed(2)}</span>
                          </div>
                        )}
                        {row.multiStepDepthAvg !== undefined && (
                          <div className="flex justify-between col-span-2 mt-1 pt-2 border-t border-border/30">
                            <span className="text-muted-foreground">Multi-step depth:</span>
                            <span className="font-medium">{row.multiStepDepthAvg.toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card className={`border border-border/50 bg-card/90 shadow-sm flex flex-col transition-all hover:shadow-md`}>
            <CardHeader>
              <CardTitle className="text-xl">Lowest-Scoring Written Attempts</CardTitle>
              <CardDescription>Useful for spotting recurring failure patterns and intervention-heavy questions.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto space-y-3 pb-6">
              {lowestScoringWritten.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted p-8 text-center">
                  <div className="mb-2 rounded-full bg-muted/50 p-3">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No written attempts yet</p>
                  <p className="text-xs text-muted-foreground">Your lowest scoring work will appear here for review.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {lowestScoringWritten.map((attempt) => (
                    <div
                      key={attempt.id}
                      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-destructive/50 hover:shadow-md"
                    >
                      {/* Top Row: Context & Score */}
                      <div className="mb-3 flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-destructive">
                            {attempt.attemptKind || "Written"}
                          </span>
                          <h3 className="line-clamp-2 font-bold leading-tight text-foreground group-hover:text-destructive transition-colors">
                            {attempt.topic}
                          </h3>
                          <p className="truncate text-xs text-muted-foreground">{attempt.subtopic}</p>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-2xl font-black tracking-tight text-destructive">
                            {formatPercent(attempt.scorePercent)}
                          </span>
                          <span className="text-[10px] font-medium text-muted-foreground/60">SCORE</span>
                        </div>
                      </div>

                      {/* Bottom Row: Stats */}
                      <div className="mt-auto flex items-center gap-3 border-t border-border/50 pt-3 text-[11px] text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Type className="h-3.5 w-3.5 opacity-70" />
                          <span>{attempt.answerWordCount ?? 0} words</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock3 className="h-3.5 w-3.5 opacity-70" />
                          <span>{formatDurationMs(attempt.markingLatencyMs)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}