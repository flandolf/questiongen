import { useMemo, useState } from "react";
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
import { Clock3, Gauge, Target, TrendingUp, WandSparkles } from "lucide-react";
import { useAppContext } from "../AppContext";
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
import { McHistoryEntry, QuestionHistoryEntry } from "../types";

type AnalyticsBucket = { total: number; correct: number };

type AttemptRow = {
  id: string;
  mode: "written" | "multiple-choice";
  createdAt: string;
  topic: string;
  subtopic: string;
  isCorrect: boolean;
  scorePercent: number;
  responseLatencyMs?: number;
  markingLatencyMs?: number;
  attemptKind?: string;
  answerWordCount?: number;
  answerCharacterCount?: number;
  generationDurationMs?: number;
  difficulty?: string;
};

type TopicPerformanceRow = {
  topic: string;
  attempts: number;
  correct: number;
  accuracy: number;
  writtenAttempts: number;
  mcAttempts: number;
};

type SubtopicPerformanceRow = {
  key: string;
  topic: string;
  subtopic: string;
  attempts: number;
  correct: number;
  accuracy: number;
  writtenAttempts: number;
  mcAttempts: number;
};

type QualityRow = {
  difficulty: string;
  sampleCount: number;
  accuracy: number;
  avgDurationSeconds: number;
  avgRepairAttempts: number;
  avgGenerationAttempts: number;
  distinctnessAvg?: number;
  multiStepDepthAvg?: number;
};

type CriterionWeakPointRow = {
  criterion: string;
  attempts: number;
  achievedMarks: number;
  lostMarks: number;
  availableMarks: number;
  successPercent: number;
  lostPercent: number;
  topicSummary: string;
  lastSeenAt: string;
};

type KpiCardProps = {
  title: string;
  value: string;
  detail: string;
  icon: typeof Target;
};

const UNSPECIFIED_SUBTOPIC = "Unspecified";
const ALL_TOPICS = "All topics";
const LOW_SAMPLE_THRESHOLD = 3;
const RECENT_WRITTEN_CRITERIA_WINDOW = 20;

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

function normalizeSubtopic(subtopic?: string) {
  const cleaned = subtopic?.trim();
  return cleaned && cleaned.length > 0 ? cleaned : UNSPECIFIED_SUBTOPIC;
}

function percent(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return (value / total) * 100;
}

function average(total: number, count: number) {
  if (count <= 0) {
    return 0;
  }

  return total / count;
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDuration(value?: number) {
  if (value === undefined || value <= 0) {
    return "n/a";
  }

  if (value < 1000) {
    return `${Math.round(value)}ms`;
  }

  const seconds = value / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function scoreBucketLabel(scorePercent: number) {
  if (scorePercent >= 100) return "100";
  if (scorePercent >= 75) return "75-99";
  if (scorePercent >= 50) return "50-74";
  if (scorePercent >= 25) return "25-49";
  return "0-24";
}

function wordBucketLabel(wordCount: number) {
  if (wordCount >= 150) return "150+";
  if (wordCount >= 75) return "75-149";
  if (wordCount >= 25) return "25-74";
  return "0-24";
}

function normalizeCriterionLabel(value: string) {
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned.length > 0 ? cleaned : "Unnamed criterion";
}

function KpiCard({ title, value, detail, icon: Icon }: KpiCardProps) {
  return (
    <Card size="sm" className="border border-border/70 bg-card/90 shadow-sm">
      <CardContent className="flex items-start justify-between gap-3 pt-3">
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{title}</div>
          <div className="text-2xl font-semibold tracking-tight">{value}</div>
          <div className="text-xs text-muted-foreground">{detail}</div>
        </div>
        <div className="rounded-full border border-border/70 bg-muted/50 p-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

export function AnalyticsView() {
  const { questionHistory, mcHistory } = useAppContext();
  const [topicFilter, setTopicFilter] = useState<string>(ALL_TOPICS);

  const writtenAttempts = useMemo<AttemptRow[]>(() => {
    return [...questionHistory]
      .reverse()
      .map((entry: QuestionHistoryEntry) => ({
        id: entry.id,
        mode: "written" as const,
        createdAt: entry.createdAt,
        topic: entry.question.topic,
        subtopic: normalizeSubtopic(entry.question.subtopic),
        isCorrect: entry.markResponse.verdict.toLowerCase() === "correct",
        scorePercent: percent(entry.markResponse.achievedMarks, entry.markResponse.maxMarks),
        responseLatencyMs: entry.analytics?.responseLatencyMs,
        markingLatencyMs: entry.analytics?.markingLatencyMs,
        attemptKind: entry.analytics?.attemptKind,
        answerWordCount: entry.analytics?.answerWordCount,
        answerCharacterCount: entry.analytics?.answerCharacterCount,
        generationDurationMs: entry.generationTelemetry?.durationMs,
        difficulty: entry.generationTelemetry?.difficulty,
      }))
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }, [questionHistory]);

  const mcAttempts = useMemo<AttemptRow[]>(() => {
    return [...mcHistory]
      .reverse()
      .map((entry: McHistoryEntry) => ({
        id: entry.id,
        mode: "multiple-choice" as const,
        createdAt: entry.createdAt,
        topic: entry.question.topic,
        subtopic: normalizeSubtopic(entry.question.subtopic),
        isCorrect: entry.correct,
        scorePercent: entry.correct ? 100 : 0,
        responseLatencyMs: entry.analytics?.responseLatencyMs,
        answerWordCount: entry.analytics?.answerWordCount,
        answerCharacterCount: entry.analytics?.answerCharacterCount,
        generationDurationMs: entry.generationTelemetry?.durationMs,
        difficulty: entry.generationTelemetry?.difficulty,
      }))
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }, [mcHistory]);

  const allAttempts = useMemo(() => {
    return [...writtenAttempts, ...mcAttempts].sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    );
  }, [mcAttempts, writtenAttempts]);

  const summary = useMemo(() => {
    const totalAttempts = allAttempts.length;
    const totalCorrect = allAttempts.filter((attempt) => attempt.isCorrect).length;
    const writtenAverageScore = average(
      writtenAttempts.reduce((sum, attempt) => sum + attempt.scorePercent, 0),
      writtenAttempts.length,
    );
    const averageMarkingLatencyMs = average(
      writtenAttempts.reduce((sum, attempt) => sum + (attempt.markingLatencyMs ?? 0), 0),
      writtenAttempts.filter((attempt) => attempt.markingLatencyMs !== undefined).length,
    );
    const averageGenerationLatencyMs = average(
      allAttempts.reduce((sum, attempt) => sum + (attempt.generationDurationMs ?? 0), 0),
      allAttempts.filter((attempt) => attempt.generationDurationMs !== undefined).length,
    );
    const appealCount = writtenAttempts.filter((attempt) => attempt.attemptKind === "appeal").length;
    const overrideCount = writtenAttempts.filter((attempt) => attempt.attemptKind === "override").length;

    return {
      totalAttempts,
      totalCorrect,
      overallAccuracy: percent(totalCorrect, totalAttempts),
      writtenAttempts: writtenAttempts.length,
      writtenCorrect: writtenAttempts.filter((attempt) => attempt.isCorrect).length,
      writtenAverageScore,
      mcAttempts: mcAttempts.length,
      mcCorrect: mcAttempts.filter((attempt) => attempt.isCorrect).length,
      averageMarkingLatencyMs,
      averageGenerationLatencyMs,
      appealCount,
      overrideCount,
    };
  }, [allAttempts, mcAttempts, writtenAttempts]);

  const trendData = useMemo(() => {
    let overallCorrect = 0;
    let overallTotal = 0;
    let writtenCorrect = 0;
    let writtenTotal = 0;
    let mcCorrect = 0;
    let mcTotal = 0;

    return allAttempts.map((attempt, index) => {
      overallTotal += 1;
      if (attempt.isCorrect) {
        overallCorrect += 1;
      }

      if (attempt.mode === "written") {
        writtenTotal += 1;
        if (attempt.isCorrect) {
          writtenCorrect += 1;
        }
      } else {
        mcTotal += 1;
        if (attempt.isCorrect) {
          mcCorrect += 1;
        }
      }

      return {
        label: `#${index + 1}`,
        overallAccuracy: percent(overallCorrect, overallTotal),
        writtenAccuracy: writtenTotal > 0 ? percent(writtenCorrect, writtenTotal) : null,
        mcAccuracy: mcTotal > 0 ? percent(mcCorrect, mcTotal) : null,
      };
    });
  }, [allAttempts]);

  const topicPerformance = useMemo<TopicPerformanceRow[]>(() => {
    const bucketByTopic = new Map<string, TopicPerformanceRow>();

    for (const attempt of allAttempts) {
      const existing = bucketByTopic.get(attempt.topic) ?? {
        topic: attempt.topic,
        attempts: 0,
        correct: 0,
        accuracy: 0,
        writtenAttempts: 0,
        mcAttempts: 0,
      };

      existing.attempts += 1;
      existing.correct += attempt.isCorrect ? 1 : 0;
      existing.writtenAttempts += attempt.mode === "written" ? 1 : 0;
      existing.mcAttempts += attempt.mode === "multiple-choice" ? 1 : 0;
      existing.accuracy = percent(existing.correct, existing.attempts);
      bucketByTopic.set(attempt.topic, existing);
    }

    return Array.from(bucketByTopic.values()).sort((a, b) => b.accuracy - a.accuracy || b.attempts - a.attempts);
  }, [allAttempts]);

  const subtopicPerformance = useMemo<SubtopicPerformanceRow[]>(() => {
    const bucketByTopicSubtopic = new Map<string, AnalyticsBucket & { topic: string; subtopic: string; writtenAttempts: number; mcAttempts: number }>();

    for (const attempt of allAttempts) {
      const key = `${attempt.topic}::${attempt.subtopic}`;
      const bucket = bucketByTopicSubtopic.get(key) ?? {
        topic: attempt.topic,
        subtopic: attempt.subtopic,
        total: 0,
        correct: 0,
        writtenAttempts: 0,
        mcAttempts: 0,
      };

      bucket.total += 1;
      bucket.correct += attempt.isCorrect ? 1 : 0;
      bucket.writtenAttempts += attempt.mode === "written" ? 1 : 0;
      bucket.mcAttempts += attempt.mode === "multiple-choice" ? 1 : 0;
      bucketByTopicSubtopic.set(key, bucket);
    }

    return Array.from(bucketByTopicSubtopic.entries())
      .map(([key, bucket]) => ({
        key,
        topic: bucket.topic,
        subtopic: bucket.subtopic,
        attempts: bucket.total,
        correct: bucket.correct,
        accuracy: percent(bucket.correct, bucket.total),
        writtenAttempts: bucket.writtenAttempts,
        mcAttempts: bucket.mcAttempts,
      }))
      .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts);
  }, [allAttempts]);

  const displayedSubtopics = useMemo(() => {
    if (topicFilter === ALL_TOPICS) {
      return subtopicPerformance;
    }

    return subtopicPerformance.filter((row) => row.topic === topicFilter);
  }, [subtopicPerformance, topicFilter]);

  const writtenMarksDistribution = useMemo(() => {
    const labels = ["0-24", "25-49", "50-74", "75-99", "100"];
    const buckets = new Map(labels.map((label) => [label, 0]));

    for (const attempt of writtenAttempts) {
      const bucket = scoreBucketLabel(attempt.scorePercent);
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }

    return labels.map((label) => ({ label, attempts: buckets.get(label) ?? 0 }));
  }, [writtenAttempts]);

  const writtenEffortDistribution = useMemo(() => {
    const labels = ["0-24", "25-74", "75-149", "150+"];
    const buckets = new Map(labels.map((label) => [label, { attempts: 0, totalScorePercent: 0 }]));

    for (const attempt of writtenAttempts) {
      if ((attempt.answerWordCount ?? 0) <= 0) {
        continue;
      }

      const label = wordBucketLabel(attempt.answerWordCount ?? 0);
      const bucket = buckets.get(label);
      if (!bucket) {
        continue;
      }

      bucket.attempts += 1;
      bucket.totalScorePercent += attempt.scorePercent;
    }

    return labels.map((label) => {
      const bucket = buckets.get(label) ?? { attempts: 0, totalScorePercent: 0 };
      return {
        label,
        attempts: bucket.attempts,
        avgScorePercent: average(bucket.totalScorePercent, bucket.attempts),
      };
    });
  }, [writtenAttempts]);

  const writtenAttemptTypeData = useMemo(() => {
    const counts = new Map<string, number>([
      ["initial", 0],
      ["appeal", 0],
      ["override", 0],
    ]);

    for (const attempt of writtenAttempts) {
      const key = attempt.attemptKind ?? "initial";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return [
      { name: "initial", label: "Initial", value: counts.get("initial") ?? 0, fill: "var(--color-initial)" },
      { name: "appeal", label: "Appeal", value: counts.get("appeal") ?? 0, fill: "var(--color-appeal)" },
      { name: "override", label: "Override", value: counts.get("override") ?? 0, fill: "var(--color-override)" },
    ].filter((item) => item.value > 0);
  }, [writtenAttempts]);

  const recentCriterionWeakPoints = useMemo<CriterionWeakPointRow[]>(() => {
    const recentEntries = [...questionHistory]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, RECENT_WRITTEN_CRITERIA_WINDOW);

    const bucketByCriterion = new Map<
      string,
      {
        attempts: number;
        achievedMarks: number;
        lostMarks: number;
        availableMarks: number;
        topics: Map<string, number>;
        lastSeenAt: string;
      }
    >();

    for (const entry of recentEntries) {
      for (const criterion of entry.markResponse.vcaaMarkingScheme) {
        if (criterion.maxMarks <= 0) {
          continue;
        }

        const key = normalizeCriterionLabel(criterion.criterion);
        const bucket = bucketByCriterion.get(key) ?? {
          attempts: 0,
          achievedMarks: 0,
          lostMarks: 0,
          availableMarks: 0,
          topics: new Map<string, number>(),
          lastSeenAt: entry.createdAt,
        };

        bucket.attempts += 1;
        bucket.achievedMarks += criterion.achievedMarks;
        bucket.availableMarks += criterion.maxMarks;
        bucket.lostMarks += Math.max(0, criterion.maxMarks - criterion.achievedMarks);
        bucket.topics.set(entry.question.topic, (bucket.topics.get(entry.question.topic) ?? 0) + 1);

        if (Date.parse(entry.createdAt) > Date.parse(bucket.lastSeenAt)) {
          bucket.lastSeenAt = entry.createdAt;
        }

        bucketByCriterion.set(key, bucket);
      }
    }

    return Array.from(bucketByCriterion.entries())
      .map(([criterion, bucket]) => {
        const topicSummary = Array.from(bucket.topics.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 2)
          .map(([topic, count]) => `${topic} x${count}`)
          .join(" • ");

        return {
          criterion,
          attempts: bucket.attempts,
          achievedMarks: bucket.achievedMarks,
          lostMarks: bucket.lostMarks,
          availableMarks: bucket.availableMarks,
          successPercent: percent(bucket.achievedMarks, bucket.availableMarks),
          lostPercent: percent(bucket.lostMarks, bucket.availableMarks),
          topicSummary,
          lastSeenAt: bucket.lastSeenAt,
        };
      })
      .sort((a, b) => b.lostPercent - a.lostPercent || b.lostMarks - a.lostMarks || b.attempts - a.attempts)
      .slice(0, 6);
  }, [questionHistory]);

  const mcTopicAccuracy = useMemo(() => {
    const bucketByTopic = new Map<string, AnalyticsBucket>();

    for (const attempt of mcAttempts) {
      const bucket = bucketByTopic.get(attempt.topic) ?? { total: 0, correct: 0 };
      bucket.total += 1;
      bucket.correct += attempt.isCorrect ? 1 : 0;
      bucketByTopic.set(attempt.topic, bucket);
    }

    return Array.from(bucketByTopic.entries())
      .map(([topic, bucket]) => ({
        topic,
        attempts: bucket.total,
        accuracy: percent(bucket.correct, bucket.total),
      }))
      .sort((a, b) => b.accuracy - a.accuracy || b.attempts - a.attempts);
  }, [mcAttempts]);

  const mcResponseLatency = useMemo(() => {
    const bucketByTopic = new Map<string, { attempts: number; totalMs: number }>();

    for (const attempt of mcAttempts) {
      if (attempt.responseLatencyMs === undefined) {
        continue;
      }

      const bucket = bucketByTopic.get(attempt.topic) ?? { attempts: 0, totalMs: 0 };
      bucket.attempts += 1;
      bucket.totalMs += attempt.responseLatencyMs;
      bucketByTopic.set(attempt.topic, bucket);
    }

    return Array.from(bucketByTopic.entries())
      .map(([topic, bucket]) => ({
        topic,
        avgResponseSeconds: average(bucket.totalMs, bucket.attempts) / 1000,
      }))
      .sort((a, b) => b.avgResponseSeconds - a.avgResponseSeconds);
  }, [mcAttempts]);

  const qualityRows = useMemo<QualityRow[]>(() => {
    const bucketByDifficulty = new Map<
      string,
      {
        sampleCount: number;
        correct: number;
        durationTotal: number;
        durationCount: number;
        repairTotal: number;
        attemptsTotal: number;
        distinctnessTotal: number;
        distinctnessCount: number;
        depthTotal: number;
        depthCount: number;
      }
    >();

    for (const entry of questionHistory) {
      const difficulty = entry.generationTelemetry?.difficulty ?? "Unknown";
      const bucket = bucketByDifficulty.get(difficulty) ?? {
        sampleCount: 0,
        correct: 0,
        durationTotal: 0,
        durationCount: 0,
        repairTotal: 0,
        attemptsTotal: 0,
        distinctnessTotal: 0,
        distinctnessCount: 0,
        depthTotal: 0,
        depthCount: 0,
      };

      bucket.sampleCount += 1;
      bucket.correct += entry.markResponse.verdict.toLowerCase() === "correct" ? 1 : 0;

      if (entry.generationTelemetry?.durationMs !== undefined) {
        bucket.durationTotal += entry.generationTelemetry.durationMs;
        bucket.durationCount += 1;
      }

      bucket.repairTotal += entry.generationTelemetry?.repairAttempts ?? 0;
      bucket.attemptsTotal += entry.generationTelemetry?.totalAttempts ?? 0;

      if (entry.question.distinctnessScore !== undefined) {
        bucket.distinctnessTotal += entry.question.distinctnessScore;
        bucket.distinctnessCount += 1;
      }

      if (entry.question.multiStepDepth !== undefined) {
        bucket.depthTotal += entry.question.multiStepDepth;
        bucket.depthCount += 1;
      }

      bucketByDifficulty.set(difficulty, bucket);
    }

    for (const entry of mcHistory) {
      const difficulty = entry.generationTelemetry?.difficulty ?? "Unknown";
      const bucket = bucketByDifficulty.get(difficulty) ?? {
        sampleCount: 0,
        correct: 0,
        durationTotal: 0,
        durationCount: 0,
        repairTotal: 0,
        attemptsTotal: 0,
        distinctnessTotal: 0,
        distinctnessCount: 0,
        depthTotal: 0,
        depthCount: 0,
      };

      bucket.sampleCount += 1;
      bucket.correct += entry.correct ? 1 : 0;

      if (entry.generationTelemetry?.durationMs !== undefined) {
        bucket.durationTotal += entry.generationTelemetry.durationMs;
        bucket.durationCount += 1;
      }

      bucket.repairTotal += entry.generationTelemetry?.repairAttempts ?? 0;
      bucket.attemptsTotal += entry.generationTelemetry?.totalAttempts ?? 0;

      if (entry.question.distinctnessScore !== undefined) {
        bucket.distinctnessTotal += entry.question.distinctnessScore;
        bucket.distinctnessCount += 1;
      }

      if (entry.question.multiStepDepth !== undefined) {
        bucket.depthTotal += entry.question.multiStepDepth;
        bucket.depthCount += 1;
      }

      bucketByDifficulty.set(difficulty, bucket);
    }

    return Array.from(bucketByDifficulty.entries())
      .map(([difficulty, bucket]) => ({
        difficulty,
        sampleCount: bucket.sampleCount,
        accuracy: percent(bucket.correct, bucket.sampleCount),
        avgDurationSeconds: average(bucket.durationTotal, bucket.durationCount) / 1000,
        avgRepairAttempts: average(bucket.repairTotal, bucket.sampleCount),
        avgGenerationAttempts: average(bucket.attemptsTotal, bucket.sampleCount),
        distinctnessAvg: bucket.distinctnessCount > 0 ? average(bucket.distinctnessTotal, bucket.distinctnessCount) : undefined,
        multiStepDepthAvg: bucket.depthCount > 0 ? average(bucket.depthTotal, bucket.depthCount) : undefined,
      }))
      .sort((a, b) => a.difficulty.localeCompare(b.difficulty));
  }, [mcHistory, questionHistory]);

  const lowestScoringWritten = useMemo(() => {
    return [...writtenAttempts]
      .sort((a, b) => a.scorePercent - b.scorePercent || Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 5);
  }, [writtenAttempts]);

  const hasAnyAttempts = allAttempts.length > 0;

  return (
    <div className="mx-auto min-h-full max-w-7xl space-y-5 px-3 pb-8 pt-3 sm:px-4 lg:px-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="bg-background/70">Detailed analytics</Badge>
          {allAttempts.length > 0 ? (
            <Badge variant="outline" className="bg-background/70">
              {allAttempts.length} tracked attempts
            </Badge>
          ) : null}
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
          Track accuracy trends, written-score distribution, multiple-choice behaviour, and generation quality in one place.
        </p>
      </div>

      {!hasAnyAttempts ? (
        <Card className="border border-dashed border-border/70 bg-card/80">
          <CardHeader>
            <CardTitle>No analytics yet</CardTitle>
            <CardDescription>
              Complete some written or multiple-choice questions and this page will build trend lines, topic breakdowns, and generation diagnostics automatically.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <KpiCard
              title="Overall Accuracy"
              value={formatPercent(summary.overallAccuracy)}
              detail={`${summary.totalCorrect}/${summary.totalAttempts} attempts correct`}
              icon={Target}
            />
            <KpiCard
              title="Written Average"
              value={formatPercent(summary.writtenAverageScore)}
              detail={`${summary.writtenAttempts} written attempts tracked`}
              icon={TrendingUp}
            />
            <KpiCard
              title="MC Accuracy"
              value={formatPercent(percent(summary.mcCorrect, summary.mcAttempts))}
              detail={`${summary.mcCorrect}/${summary.mcAttempts} multiple-choice correct`}
              icon={Gauge}
            />
            <KpiCard
              title="Marking Latency"
              value={formatDuration(summary.averageMarkingLatencyMs)}
              detail="Average AI marking turnaround"
              icon={Clock3}
            />
            <KpiCard
              title="Generation Latency"
              value={formatDuration(summary.averageGenerationLatencyMs)}
              detail="Average question generation time"
              icon={WandSparkles}
            />
            <KpiCard
              title="Interventions"
              value={`${summary.appealCount + summary.overrideCount}`}
              detail={`${summary.appealCount} appeals, ${summary.overrideCount} overrides`}
              icon={Target}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <Card className="border border-border/70 bg-card/90 shadow-sm">
              <CardHeader>
                <CardTitle>Accuracy Trend</CardTitle>
                <CardDescription>
                  Cumulative accuracy across all attempts, with written and multiple-choice separated.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={trendChartConfig} className="h-80 w-full">
                  <LineChart data={trendData} margin={{ left: 8, right: 12, top: 12, bottom: 0 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                    <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Line type="monotone" dataKey="overallAccuracy" stroke="var(--color-overallAccuracy)" strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="writtenAccuracy" stroke="var(--color-writtenAccuracy)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="mcAccuracy" stroke="var(--color-mcAccuracy)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card className="border border-border/70 bg-card/90 shadow-sm">
              <CardHeader>
                <CardTitle>Topic Performance</CardTitle>
                <CardDescription>
                  Accuracy by topic. Filter below to inspect the weakest subtopics.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ChartContainer config={topicChartConfig} className="h-80 w-full">
                  <BarChart data={topicPerformance} layout="vertical" margin={{ left: 16, right: 8, top: 8, bottom: 8 }}>
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                    <YAxis dataKey="topic" type="category" tickLine={false} axisLine={false} width={118} />
                    <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                    <Bar dataKey="accuracy" fill="var(--color-accuracy)" radius={8} />
                  </BarChart>
                </ChartContainer>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant={topicFilter === ALL_TOPICS ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setTopicFilter(ALL_TOPICS)}
                  >
                    {ALL_TOPICS}
                  </Badge>
                  {topicPerformance.map((item) => (
                    <Badge
                      key={item.topic}
                      variant={topicFilter === item.topic ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => setTopicFilter(item.topic)}
                    >
                      {item.topic} ({item.attempts})
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
            <Card className="border border-border/70 bg-card/90 shadow-sm">
              <CardHeader>
                <CardTitle>Subtopic Drilldown</CardTitle>
                <CardDescription>
                  {topicFilter === ALL_TOPICS
                    ? "Lowest-performing subtopics across all topics."
                    : `Lowest-performing subtopics inside ${topicFilter}.`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {displayedSubtopics.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No subtopic data yet.</p>
                ) : (
                  displayedSubtopics.slice(0, 8).map((row) => (
                    <div key={row.key} className="rounded-xl border border-border/70 bg-background/60 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold">{row.subtopic}</div>
                          <div className="text-xs text-muted-foreground">{row.topic}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold">{formatPercent(row.accuracy)}</div>
                          <div className="text-xs text-muted-foreground">{row.correct}/{row.attempts} correct</div>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>{row.writtenAttempts} written</span>
                        <span>{row.mcAttempts} MC</span>
                        {row.attempts < LOW_SAMPLE_THRESHOLD ? <span>Low sample</span> : null}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border border-border/70 bg-card/90 shadow-sm">
              <CardHeader>
                <CardTitle>Actionable Flags</CardTitle>
                <CardDescription>
                  Weak areas that deserve attention now.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {displayedSubtopics.slice(0, 5).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No flagged areas yet.</p>
                ) : (
                  displayedSubtopics.slice(0, 5).map((row) => (
                    <div key={row.key} className="rounded-xl border border-border/70 bg-background/60 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">{row.subtopic}</div>
                        <Badge variant={row.attempts < LOW_SAMPLE_THRESHOLD ? "outline" : "secondary"}>
                          {row.attempts < LOW_SAMPLE_THRESHOLD ? "Low sample" : "Established"}
                        </Badge>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {row.topic} • {row.correct}/{row.attempts} correct • {formatPercent(row.accuracy)}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="border border-border/70 bg-card/90 shadow-sm">
              <CardHeader>
                <CardTitle>Written Analytics</CardTitle>
                <CardDescription>Score distribution for marked written responses.</CardDescription>
              </CardHeader>
              <CardContent>
                {writtenAttempts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No written attempts yet.</p>
                ) : (
                  <ChartContainer config={marksChartConfig} className="h-72 w-full">
                    <BarChart data={writtenMarksDistribution} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="attempts" fill="var(--color-attempts)" radius={8} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card className="border border-border/70 bg-card/90 shadow-sm">
              <CardHeader>
                <CardTitle>Criterion Weak Points</CardTitle>
                <CardDescription>
                  Marks most often dropped across the last {Math.min(questionHistory.length, RECENT_WRITTEN_CRITERIA_WINDOW)} written marking passes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {recentCriterionWeakPoints.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Criterion-level trends will appear after written answers are marked.</p>
                ) : (
                  recentCriterionWeakPoints.map((row) => (
                    <div key={row.criterion} className="rounded-xl border border-border/70 bg-background/60 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold">{row.criterion}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.topicSummary || "Mixed topics"}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold">{formatPercent(row.successPercent)}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.achievedMarks}/{row.availableMarks} marks kept
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>{row.attempts} recent criteria</span>
                        <span>{formatPercent(row.lostPercent)} marks lost</span>
                        <span>{new Date(row.lastSeenAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
            <Card className="border border-border/70 bg-card/90 shadow-sm">
              <CardHeader>
                <CardTitle>Answer Effort vs Score</CardTitle>
                <CardDescription>Average written score by answer length bucket.</CardDescription>
              </CardHeader>
              <CardContent>
                {writtenEffortDistribution.every((item) => item.attempts === 0) ? (
                  <p className="text-sm text-muted-foreground">Answer-length tracking will populate as new written attempts are marked.</p>
                ) : (
                  <ChartContainer config={effortChartConfig} className="h-72 w-full">
                    <BarChart data={writtenEffortDistribution} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                      <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                      <Bar dataKey="avgScorePercent" fill="var(--color-avgScorePercent)" radius={8} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card className="border border-border/70 bg-card/90 shadow-sm">
              <CardHeader>
                <CardTitle>Written Interventions</CardTitle>
                <CardDescription>Initial marks vs appeals and manual overrides.</CardDescription>
              </CardHeader>
              <CardContent>
                {writtenAttemptTypeData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No written intervention data yet.</p>
                ) : (
                  <ChartContainer config={attemptTypeChartConfig} className="h-72 w-full">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                      <Pie data={writtenAttemptTypeData} dataKey="value" nameKey="label" innerRadius={60} outerRadius={92} paddingAngle={3}>
                        {writtenAttemptTypeData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <ChartLegend content={<ChartLegendContent nameKey="label" />} />
                    </PieChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
            <Card className="border border-border/70 bg-card/90 shadow-sm">
              <CardHeader>
                <CardTitle>Multiple-Choice Analytics</CardTitle>
                <CardDescription>Accuracy by topic for multiple-choice answers.</CardDescription>
              </CardHeader>
              <CardContent>
                {mcTopicAccuracy.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No MC attempts yet.</p>
                ) : (
                  <ChartContainer config={topicChartConfig} className="h-72 w-full">
                    <BarChart data={mcTopicAccuracy} layout="vertical" margin={{ left: 16, right: 8, top: 8, bottom: 8 }}>
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                      <YAxis dataKey="topic" type="category" tickLine={false} axisLine={false} width={118} />
                      <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                      <Bar dataKey="accuracy" fill="var(--color-accuracy)" radius={8} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card className="border border-border/70 bg-card/90 shadow-sm">
              <CardHeader>
                <CardTitle>MC Response Speed</CardTitle>
                <CardDescription>Average time to answer each topic when response timing is available.</CardDescription>
              </CardHeader>
              <CardContent>
                {mcResponseLatency.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Response timing will appear for new MC attempts.</p>
                ) : (
                  <ChartContainer config={responseLatencyChartConfig} className="h-72 w-full">
                    <BarChart data={mcResponseLatency} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="topic" tickLine={false} axisLine={false} minTickGap={18} />
                      <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `${value}s`} />
                      <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                      <Bar dataKey="avgResponseSeconds" fill="var(--color-avgResponseSeconds)" radius={8} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <Card className="border border-border/70 bg-card/90 shadow-sm">
              <CardHeader>
                <CardTitle>Generation Diagnostics</CardTitle>
                <CardDescription>Average generation time and repair pressure by difficulty.</CardDescription>
              </CardHeader>
              <CardContent>
                {qualityRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No generation telemetry yet.</p>
                ) : (
                  <ChartContainer config={generationChartConfig} className="h-80 w-full">
                    <BarChart data={qualityRows} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="difficulty" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Bar dataKey="avgDurationSeconds" fill="var(--color-avgDurationSeconds)" radius={8} />
                      <Bar dataKey="avgRepairAttempts" fill="var(--color-avgRepairAttempts)" radius={8} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card className="border border-border/70 bg-card/90 shadow-sm">
              <CardHeader>
                <CardTitle>Difficulty Notes</CardTitle>
                <CardDescription>Generation quality, depth, and accuracy rolled up by difficulty.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {qualityRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No diagnostic notes yet.</p>
                ) : (
                  qualityRows.map((row) => (
                    <div key={row.difficulty} className="rounded-xl border border-border/70 bg-background/60 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold">{row.difficulty}</div>
                          <div className="text-xs text-muted-foreground">{row.sampleCount} samples</div>
                        </div>
                        <div className="text-right text-sm font-semibold">{formatPercent(row.accuracy)}</div>
                      </div>
                      <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                        <div>Generation: {row.avgDurationSeconds.toFixed(1)}s average</div>
                        <div>Repair attempts: {row.avgRepairAttempts.toFixed(2)} average</div>
                        <div>Total generation attempts: {row.avgGenerationAttempts.toFixed(2)} average</div>
                        {row.distinctnessAvg !== undefined ? <div>Distinctness: {row.distinctnessAvg.toFixed(2)}</div> : null}
                        {row.multiStepDepthAvg !== undefined ? <div>Multi-step depth: {row.multiStepDepthAvg.toFixed(2)}</div> : null}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border border-border/70 bg-card/90 shadow-sm">
            <CardHeader>
              <CardTitle>Lowest-Scoring Written Attempts</CardTitle>
              <CardDescription>Useful for spotting recurring failure patterns and intervention-heavy questions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {lowestScoringWritten.length === 0 ? (
                <p className="text-sm text-muted-foreground">No written attempts yet.</p>
              ) : (
                lowestScoringWritten.map((attempt) => (
                  <div key={attempt.id} className="rounded-xl border border-border/70 bg-background/60 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">{attempt.topic}</div>
                        <div className="text-xs text-muted-foreground">{attempt.subtopic}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{formatPercent(attempt.scorePercent)}</div>
                        <div className="text-xs text-muted-foreground">
                          {attempt.attemptKind ? `${attempt.attemptKind} attempt` : "written attempt"}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>{attempt.answerWordCount ?? 0} words</span>
                      <span>{attempt.answerCharacterCount ?? 0} chars</span>
                      <span>Marked in {formatDuration(attempt.markingLatencyMs)}</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}