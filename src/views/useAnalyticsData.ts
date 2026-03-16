import { useMemo, useState } from "react";
import { useMultipleChoiceSession, useWrittenSession } from "../AppContext";
import { McHistoryEntry, QuestionHistoryEntry } from "../types";

export const UNSPECIFIED_SUBTOPIC = "Unspecified";
export const ALL_TOPICS = "All topics";
export const LOW_SAMPLE_THRESHOLD = 3;
export const RECENT_WRITTEN_CRITERIA_WINDOW = 20;

export type AnalyticsBucket = { total: number; correct: number };

export type AttemptRow = {
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

export type TopicPerformanceRow = {
  topic: string;
  attempts: number;
  correct: number;
  accuracy: number;
  writtenAttempts: number;
  mcAttempts: number;
};

export type SubtopicPerformanceRow = {
  key: string;
  topic: string;
  subtopic: string;
  attempts: number;
  correct: number;
  accuracy: number;
  writtenAttempts: number;
  mcAttempts: number;
};

export type QualityRow = {
  difficulty: string;
  sampleCount: number;
  accuracy: number;
  avgDurationSeconds: number;
  avgRepairAttempts: number;
  avgGenerationAttempts: number;
  distinctnessAvg?: number;
  multiStepDepthAvg?: number;
};

export type CriterionWeakPointRow = {
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

export function normalizeSubtopic(subtopic?: string) {
  const cleaned = subtopic?.trim();
  return cleaned && cleaned.length > 0 ? cleaned : UNSPECIFIED_SUBTOPIC;
}

export function percent(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }
  return (value / total) * 100;
}

export function average(total: number, count: number) {
  if (count <= 0) {
    return 0;
  }
  return total / count;
}

export function scoreBucketLabel(scorePercent: number) {
  if (scorePercent >= 100) return "100";
  if (scorePercent >= 75) return "75-99";
  if (scorePercent >= 50) return "50-74";
  if (scorePercent >= 25) return "25-49";
  return "0-24";
}

export function wordBucketLabel(wordCount: number) {
  if (wordCount >= 150) return "150+";
  if (wordCount >= 75) return "75-149";
  if (wordCount >= 25) return "25-74";
  return "0-24";
}

export function normalizeCriterionLabel(value: string) {
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned.length > 0 ? cleaned : "Unnamed criterion";
}

export function useAnalyticsData() {
  const { questionHistory } = useWrittenSession();
  const { mcHistory } = useMultipleChoiceSession();
  const [topicFilter, setTopicFilter] = useState<string>(ALL_TOPICS);

  const writtenAttempts = useMemo<AttemptRow[]>(() => {
    return questionHistory.map((entry: QuestionHistoryEntry) => ({
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
    }));
  }, [questionHistory]);

  const mcAttempts = useMemo<AttemptRow[]>(() => {
    return mcHistory.map((entry: McHistoryEntry) => {
      const maxMarks = entry.maxMarks ?? 1;
      const achievedMarks = entry.awardedMarks ?? (entry.correct ? maxMarks : 0);

      return {
        id: entry.id,
        mode: "multiple-choice" as const,
        createdAt: entry.createdAt,
        topic: entry.question.topic,
        subtopic: normalizeSubtopic(entry.question.subtopic),
        isCorrect: achievedMarks >= maxMarks,
        scorePercent: percent(achievedMarks, maxMarks),
        responseLatencyMs: entry.analytics?.responseLatencyMs,
        attemptKind: entry.analytics?.attemptKind,
        answerWordCount: entry.analytics?.answerWordCount,
        answerCharacterCount: entry.analytics?.answerCharacterCount,
        generationDurationMs: entry.generationTelemetry?.durationMs,
        difficulty: entry.generationTelemetry?.difficulty,
      };
    });
  }, [mcHistory]);

  const allAttempts = useMemo(() => {
    return [...writtenAttempts, ...mcAttempts].sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    );
  }, [mcAttempts, writtenAttempts]);

  const summary = useMemo(() => {
    const totalAttempts = allAttempts.length;
    let totalCorrect = 0;
    let generationLatencyTotal = 0;
    let generationLatencyCount = 0;

    for (const attempt of allAttempts) {
      if (attempt.isCorrect) {
        totalCorrect += 1;
      }
      if (attempt.generationDurationMs !== undefined) {
        generationLatencyTotal += attempt.generationDurationMs;
        generationLatencyCount += 1;
      }
    }

    let writtenScoreTotal = 0;
    let writtenCorrect = 0;
    let markingLatencyTotal = 0;
    let markingLatencyCount = 0;
    let appealCount = 0;
    let overrideCount = 0;

    for (const attempt of writtenAttempts) {
      writtenScoreTotal += attempt.scorePercent;
      if (attempt.isCorrect) {
        writtenCorrect += 1;
      }
      if (attempt.markingLatencyMs !== undefined) {
        markingLatencyTotal += attempt.markingLatencyMs;
        markingLatencyCount += 1;
      }
      if (attempt.attemptKind === "appeal") {
        appealCount += 1;
      } else if (attempt.attemptKind === "override") {
        overrideCount += 1;
      }
    }

    let mcCorrect = 0;
    for (const attempt of mcAttempts) {
      if (attempt.isCorrect) {
        mcCorrect += 1;
      }
    }

    return {
      totalAttempts,
      totalCorrect,
      overallAccuracy: percent(totalCorrect, totalAttempts),
      writtenAttempts: writtenAttempts.length,
      writtenCorrect,
      writtenAverageScore: average(writtenScoreTotal, writtenAttempts.length),
      mcAttempts: mcAttempts.length,
      mcCorrect,
      averageMarkingLatencyMs: average(markingLatencyTotal, markingLatencyCount),
      averageGenerationLatencyMs: average(generationLatencyTotal, generationLatencyCount),
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

    return Array.from(bucketByTopic.values()).sort(
      (a, b) => b.accuracy - a.accuracy || b.attempts - a.attempts
    );
  }, [allAttempts]);

  const subtopicPerformance = useMemo<SubtopicPerformanceRow[]>(() => {
    const bucketByTopicSubtopic = new Map<
      string,
      AnalyticsBucket & { topic: string; subtopic: string; writtenAttempts: number; mcAttempts: number }
    >();

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

    const evaluateEntry = (
      entry: QuestionHistoryEntry | McHistoryEntry,
      isCorrectFunc: () => boolean
    ) => {
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
      bucket.correct += isCorrectFunc() ? 1 : 0;

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
    };

    for (const entry of questionHistory) {
      evaluateEntry(entry, () => entry.markResponse.verdict.toLowerCase() === "correct");
    }

    for (const entry of mcHistory) {
      evaluateEntry(entry, () => entry.correct ?? false);
    }

    return Array.from(bucketByDifficulty.entries())
      .map(([difficulty, bucket]) => ({
        difficulty,
        sampleCount: bucket.sampleCount,
        accuracy: percent(bucket.correct, bucket.sampleCount),
        avgDurationSeconds: average(bucket.durationTotal, bucket.durationCount) / 1000,
        avgRepairAttempts: average(bucket.repairTotal, bucket.sampleCount),
        avgGenerationAttempts: average(bucket.attemptsTotal, bucket.sampleCount),
        distinctnessAvg:
          bucket.distinctnessCount > 0
            ? average(bucket.distinctnessTotal, bucket.distinctnessCount)
            : undefined,
        multiStepDepthAvg:
          bucket.depthCount > 0 ? average(bucket.depthTotal, bucket.depthCount) : undefined,
      }))
      .sort((a, b) => a.difficulty.localeCompare(b.difficulty));
  }, [mcHistory, questionHistory]);

  const lowestScoringWritten = useMemo(() => {
    return [...writtenAttempts]
      .sort((a, b) => a.scorePercent - b.scorePercent || Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 5);
  }, [writtenAttempts]);

  return {
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
    questionHistoryLength: questionHistory.length,
  };
}