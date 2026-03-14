import { useMemo } from "react";
import { useAppContext } from "../AppContext";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";

type AnalyticsBucket = { total: number; correct: number };

type AnalyticsRow = {
  key: string;
  topic: string;
  subtopic: string;
  total: number;
  correct: number;
  percentCorrect: number;
};

type QualityRow = {
  difficulty: string;
  sampleCount: number;
  distinctnessAvg: number;
  multiStepDepthAvg: number;
};

const UNSPECIFIED_SUBTOPIC = "Unspecified";

function normalizeSubtopic(subtopic?: string) {
  const cleaned = subtopic?.trim();
  return cleaned && cleaned.length > 0 ? cleaned : UNSPECIFIED_SUBTOPIC;
}

export function AnalyticsView() {
  const { questionHistory, mcHistory } = useAppContext();

  const analyticsRows = useMemo<AnalyticsRow[]>(() => {
    const bucketByTopicSubtopic = new Map<string, AnalyticsBucket>();

    const addOutcome = (topic: string, subtopic: string | undefined, isCorrect: boolean) => {
      const normalizedSubtopic = normalizeSubtopic(subtopic);
      const key = `${topic}::${normalizedSubtopic}`;
      const bucket = bucketByTopicSubtopic.get(key) ?? { total: 0, correct: 0 };
      bucket.total += 1;
      if (isCorrect) {
        bucket.correct += 1;
      }
      bucketByTopicSubtopic.set(key, bucket);
    };

    for (const entry of questionHistory) {
      addOutcome(
        entry.question.topic,
        entry.question.subtopic,
        entry.markResponse.verdict.toLowerCase() === "correct",
      );
    }

    for (const entry of mcHistory) {
      addOutcome(entry.question.topic, entry.question.subtopic, entry.correct);
    }

    return Array.from(bucketByTopicSubtopic.entries())
      .map(([key, bucket]) => {
        const [topic, subtopic] = key.split("::");
        const percentCorrect = bucket.total > 0 ? (bucket.correct / bucket.total) * 100 : 0;
        return {
          key,
          topic,
          subtopic,
          total: bucket.total,
          correct: bucket.correct,
          percentCorrect,
        };
      })
      .sort((a, b) => {
        if (a.topic === b.topic) {
          return a.subtopic.localeCompare(b.subtopic);
        }
        return a.topic.localeCompare(b.topic);
      });
  }, [mcHistory, questionHistory]);

  const overall = useMemo(() => {
    const totals = analyticsRows.reduce(
      (acc, row) => {
        acc.total += row.total;
        acc.correct += row.correct;
        return acc;
      },
      { total: 0, correct: 0 },
    );

    return {
      total: totals.total,
      correct: totals.correct,
      percent: totals.total > 0 ? (totals.correct / totals.total) * 100 : 0,
    };
  }, [analyticsRows]);

  const qualityRows = useMemo<QualityRow[]>(() => {
    const byDifficulty = new Map<string, { count: number; distinctnessTotal: number; depthTotal: number }>();

    for (const entry of questionHistory) {
      const distinctness = entry.question.distinctnessScore;
      const depth = entry.question.multiStepDepth;
      if (distinctness === undefined || depth === undefined) {
        continue;
      }

      const difficulty = entry.generationTelemetry?.difficulty ?? "Unknown";
      const bucket = byDifficulty.get(difficulty) ?? { count: 0, distinctnessTotal: 0, depthTotal: 0 };
      bucket.count += 1;
      bucket.distinctnessTotal += distinctness;
      bucket.depthTotal += depth;
      byDifficulty.set(difficulty, bucket);
    }

    return Array.from(byDifficulty.entries())
      .map(([difficulty, bucket]) => ({
        difficulty,
        sampleCount: bucket.count,
        distinctnessAvg: bucket.distinctnessTotal / bucket.count,
        multiStepDepthAvg: bucket.depthTotal / bucket.count,
      }))
      .sort((a, b) => a.difficulty.localeCompare(b.difficulty));
  }, [questionHistory]);

  const qualityOverall = useMemo(() => {
    if (qualityRows.length === 0) {
      return null;
    }

    const totals = qualityRows.reduce(
      (acc, row) => {
        acc.count += row.sampleCount;
        acc.distinctness += row.distinctnessAvg * row.sampleCount;
        acc.depth += row.multiStepDepthAvg * row.sampleCount;
        return acc;
      },
      { count: 0, distinctness: 0, depth: 0 },
    );

    return {
      sampleCount: totals.count,
      distinctnessAvg: totals.distinctness / totals.count,
      multiStepDepthAvg: totals.depth / totals.count,
    };
  }, [qualityRows]);

  return (
    <div className="p-3 sm:p-4 lg:p-5 max-w-4xl mx-auto h-full flex flex-col gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground mt-2">Accuracy by topic and subtopic.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Overall Accuracy</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-4xl font-bold">{overall.percent.toFixed(1)}%</div>
              <div className="text-sm text-muted-foreground mt-1">
                {overall.correct}/{overall.total} correct
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Generation Quality</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {qualityOverall ? (
            <>
              <div className="rounded-md border p-3">
                <div className="text-sm font-medium">Overall</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Distinctness {qualityOverall.distinctnessAvg.toFixed(2)} • Multi-step depth {qualityOverall.multiStepDepthAvg.toFixed(2)} • {qualityOverall.sampleCount} samples
                </div>
              </div>
              <div className="space-y-2">
                {qualityRows.map((row) => (
                  <div key={row.difficulty} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium">{row.difficulty}</div>
                      <div className="text-xs text-muted-foreground">{row.sampleCount} samples</div>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Distinctness {row.distinctnessAvg.toFixed(2)} • Multi-step depth {row.multiStepDepthAvg.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No quality telemetry yet. Generate and complete written questions first.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By Topic and Subtopic</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {analyticsRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No analytics yet. Complete some questions first.</p>
          ) : (
            <div className="space-y-2">
              {analyticsRows.map((row) => (
                <div key={row.key} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium">{row.topic}</div>
                    <div className="text-sm font-semibold">{row.percentCorrect.toFixed(1)}%</div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {row.subtopic} • {row.correct}/{row.total} correct
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}