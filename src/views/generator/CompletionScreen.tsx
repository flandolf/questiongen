import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { MarkdownMath } from '@/components/MarkdownMath';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { Difficulty, QuestionMode } from '@/types';
import { percent, useAnalyticsData } from '@/views/useAnalyticsData';

import { AccuracyTrendChart } from './AccuracyTrendChart';

type PerQuestionTiming = {
  questionId: string;
  timeUsedSeconds: number;
  timeLimitSeconds: number;
  finishedEarly: boolean;
};

type WrittenResultRow = {
  id: string;
  topic: string;
  subtopic?: string;
  scorePercent: number;
  achieved: number;
  max: number;
  wordCount: number;
  criterionBreakdown?: Array<{
    criterion: string;
    achieved: number;
    available: number;
  }>;
};

type McResultRow = {
  id: string;
  topic: string;
  subtopic?: string;
  correct: boolean;
  selected: string;
  correctAnswer: string;
};

type CompletionScreenProps = {
  questionMode: QuestionMode;
  difficulty: Difficulty;
  accuracyPercent: number;
  formattedElapsedTime: string;
  completedCount: number;
  totalCount: number;
  onReview: () => void | Promise<void>;
  onStartOver: () => void | Promise<void>;

  perQuestionTiming?: PerQuestionTiming[];
  // Session-scoped results (passed directly to avoid relying on global history)
  sessionWrittenResults?: WrittenResultRow[];
  sessionMcResults?: McResultRow[];
};

// ─── Small helpers ────────────────────────────────────────────────────────────

function getAccuracyMeta(pct: number): {
  label: string;
  color: string;
  bg: string;
  border: string;
} {
  if (pct >= 90)
    return {
      label: 'Excellent',
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
    };
  if (pct >= 70)
    return {
      label: 'Good',
      color: 'text-sky-500',
      bg: 'bg-sky-500/10',
      border: 'border-sky-500/20',
    };
  if (pct >= 50)
    return {
      label: 'Fair',
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
    };
  return {
    label: 'Keep Practicing',
    color: 'text-rose-500',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
  };
}

function accuracyBarColor(pct: number) {
  if (pct >= 90) return '#10b981';
  if (pct >= 70) return '#3b82f6';
  if (pct >= 50) return '#f59e0b';
  return '#f43f5e';
}

function criterionColor(successPct: number) {
  if (successPct >= 75)
    return {
      text: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-500/10',
    };
  if (successPct >= 50)
    return {
      text: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-500/10',
    };
  return { text: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10' };
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-2.5">
      {children}
    </p>
  );
}

function StatCell({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wide font-semibold">
        {label}
      </span>
      <span
        className={`text-sm font-bold tabular-nums ${highlight ?? 'text-foreground'}`}
      >
        {value}
      </span>
      {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

// Mini horizontal bar for topic accuracy rows
function MiniBar({ pct }: { pct: number }) {
  return (
    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
      <div
        className="h-full rounded-full"
        style={{
          width: `${pct}%`,
          background: accuracyBarColor(pct),
          transition: 'width 0.6s ease-out',
        }}
      />
    </div>
  );
}

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// ─── Main component ───────────────────────────────────────────────────────────

export function CompletionScreen({
  questionMode,
  accuracyPercent,
  formattedElapsedTime,
  completedCount,
  totalCount,
  onReview,
  onStartOver,
  perQuestionTiming,
  sessionWrittenResults = [],
  sessionMcResults = [],
}: CompletionScreenProps) {
  const { summary, trendData } = useAnalyticsData();
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);

  // Use session-scoped results passed as props (reliable for all modes including exam)
  const writtenResults = sessionWrittenResults;
  const mcResults = sessionMcResults;

  // ── Session topic breakdown ───────────────────────────────────────────────
  const sessionTopics = useMemo(() => {
    const map = new Map<string, { correct: number; total: number }>();
    const rows = questionMode === 'written' ? writtenResults : mcResults;
    for (const r of rows) {
      const b = map.get(r.topic) ?? { correct: 0, total: 0 };
      b.total += 1;
      b.correct +=
        questionMode === 'written'
          ? (r as (typeof writtenResults)[0]).scorePercent >= 100
            ? 1
            : 0
          : (r as (typeof mcResults)[0]).correct
            ? 1
            : 0;
      map.set(r.topic, b);
    }
    return Array.from(map.entries())
      .map(([topic, b]) => ({
        topic,
        correct: b.correct,
        total: b.total,
        pct: percent(b.correct, b.total),
      }))
      .sort((a, b) => a.pct - b.pct);
  }, [questionMode, writtenResults, mcResults]);

  // ── Session criterion weak points (written only, from criterionBreakdown) ──
  const sessionCriteria = useMemo(() => {
    if (questionMode !== 'written') return [];
    const map = new Map<string, { achieved: number; available: number }>();
    for (const r of writtenResults) {
      if (!r.criterionBreakdown) continue;
      for (const c of r.criterionBreakdown) {
        if (c.available <= 0) continue;
        const b = map.get(c.criterion) ?? { achieved: 0, available: 0 };
        b.achieved += c.achieved;
        b.available += c.available;
        map.set(c.criterion, b);
      }
    }
    return Array.from(map.entries())
      .map(([criterion, b]) => ({
        criterion,
        achieved: b.achieved,
        available: b.available,
        successPct: percent(b.achieved, b.available),
        lostMarks: b.available - b.achieved,
      }))
      .filter((r) => r.lostMarks > 0)
      .sort((a, b) => b.lostMarks - a.lostMarks || a.successPct - b.successPct)
      .slice(0, 4);
  }, [questionMode, writtenResults]);

  function WhatToReview({
    weakTopics,
    sessionCriteria,
    questionMode,
    sessionTopics,
    navigate,
  }: {
    weakTopics: { topic: string; pct: number }[];
    sessionCriteria: Array<{
      criterion: string;
      achieved: number;
      available: number;
      successPct: number;
    }>;
    questionMode: QuestionMode;
    sessionTopics: { topic: string; pct: number }[];
    navigate: (to: string) => void;
  }) {
    if (weakTopics.length === 0 && sessionCriteria.length === 0) return null;
    return (
      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
          What to review
        </p>

        {weakTopics.length > 0 && (
          <div className="space-y-1.5">
            {sessionTopics
              .filter((t) => t.pct < 75)
              .map(({ topic, pct }) => (
                <div key={topic} className="flex items-center gap-3 text-xs">
                  <span className="w-[130px] shrink-0 truncate font-medium text-foreground">
                    {topic}
                  </span>
                  <MiniBar pct={pct} />
                  <span
                    className={`shrink-0 tabular-nums font-semibold w-10 text-right ${pct >= 50 ? 'text-amber-500' : 'text-rose-500'}`}
                  >
                    {pct.toFixed(0)}%
                  </span>
                </div>
              ))}
          </div>
        )}

        {questionMode === 'written' && sessionCriteria.length > 0 && (
          <div className="space-y-1.5">
            {sessionCriteria.map((c, i) => {
              const { text, bg } = criterionColor(c.successPct);
              return (
                <div
                  key={i}
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${bg} border-transparent`}
                >
                  <AlertTriangle
                    className={`w-3 h-3 shrink-0 mt-0.5 ${text}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-foreground leading-snug line-clamp-2">
                      <MarkdownMath content={c.criterion} />
                    </p>
                    <span
                      className={`text-[10px] font-bold tabular-nums ${text}`}
                    >
                      {c.achieved}/{c.available} mk
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5 text-xs"
          onClick={() => void navigate('/mistakes')}
        >
          <XCircle className="w-3.5 h-3.5" />
          Review Mistakes
        </Button>
      </div>
    );
  }

  function DetailsPanel({
    questionMode,
    writtenResults,
    mcResults,
    summary,
    trendData,
    perQuestionTiming,
  }: {
    questionMode: QuestionMode;
    writtenResults: WrittenResultRow[];
    mcResults: McResultRow[];
    summary: ReturnType<typeof useAnalyticsData>['summary'];
    trendData: ReturnType<typeof useAnalyticsData>['trendData'];
    perQuestionTiming?: PerQuestionTiming[];
  }) {
    return (
      <div className="space-y-5 pt-2">
        {questionMode === 'written' && writtenResults.length > 0 && (
          <div>
            <SectionHeading>Question results</SectionHeading>
            <div className="rounded-xl border divide-y divide-border/40 overflow-hidden">
              {writtenResults.map((r, i) => {
                const pct = r.scorePercent;
                const col =
                  pct >= 100
                    ? 'text-emerald-500'
                    : pct >= 50
                      ? 'text-amber-500'
                      : 'text-rose-500';
                const bg =
                  pct >= 100
                    ? 'bg-emerald-500/5'
                    : pct >= 50
                      ? 'bg-amber-500/5'
                      : 'bg-rose-500/5';
                return (
                  <div
                    key={r.id}
                    className={`flex items-center gap-3 px-3 py-2.5 text-xs ${bg}`}
                  >
                    <span className="shrink-0 w-5 text-muted-foreground font-mono">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-foreground truncate block">
                        {r.topic}
                      </span>
                      {r.subtopic && (
                        <span className="text-muted-foreground truncate block">
                          {r.subtopic}
                        </span>
                      )}
                    </div>
                    <span
                      className={`font-bold tabular-nums ${col} w-14 text-right`}
                    >
                      {r.achieved}/{r.max} mk
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {questionMode === 'multiple-choice' && mcResults.length > 0 && (
          <div>
            <SectionHeading>Question results</SectionHeading>
            <div className="rounded-xl border divide-y divide-border/40 overflow-hidden">
              {mcResults.map((r, i) => (
                <div
                  key={r.id}
                  className={`flex items-center gap-3 px-3 py-2.5 text-xs ${r.correct ? 'bg-emerald-500/5' : 'bg-rose-500/5'}`}
                >
                  <span className="shrink-0 w-5 text-muted-foreground font-mono">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-foreground truncate block">
                      {r.subtopic}
                    </span>
                  </div>
                  <span className="font-mono text-muted-foreground">
                    {r.correct ? '' : `${r.selected}→`}
                    {r.correctAnswer}
                  </span>
                  {r.correct ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border bg-muted/10 p-4">
          <SectionHeading>Lifetime stats</SectionHeading>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
            <StatCell
              label="Total attempts"
              value={summary.totalAttempts.toString()}
            />
            <StatCell
              label="Overall accuracy"
              value={`${summary.overallAccuracy.toFixed(1)}%`}
              highlight={
                summary.overallAccuracy >= 75
                  ? 'text-emerald-500'
                  : summary.overallAccuracy >= 50
                    ? 'text-amber-500'
                    : 'text-rose-500'
              }
            />
            <StatCell
              label="Written avg"
              value={
                summary.writtenAttempts > 0
                  ? `${summary.writtenAverageScore.toFixed(1)}%`
                  : '—'
              }
              sub={
                summary.writtenAttempts > 0
                  ? `${summary.writtenAttempts} attempts`
                  : undefined
              }
            />
            <StatCell
              label="MC accuracy"
              value={
                summary.mcAttempts > 0
                  ? `${((summary.mcCorrect / summary.mcAttempts) * 100).toFixed(1)}%`
                  : '—'
              }
              sub={
                summary.mcAttempts > 0
                  ? `${summary.mcCorrect}/${summary.mcAttempts}`
                  : undefined
              }
            />
          </div>
        </div>

        {trendData.length > 2 && (
          <div>
            <SectionHeading>Accuracy trend</SectionHeading>
            <AccuracyTrendChart data={trendData.slice(-30)} />
          </div>
        )}

        {perQuestionTiming && perQuestionTiming.length > 0 && (
          <div>
            <SectionHeading>Per-Question Timing</SectionHeading>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs border rounded-lg">
                <thead>
                  <tr className="bg-muted/10 text-muted-foreground uppercase">
                    <th className="px-2 py-1 text-left">Q#</th>
                    <th className="px-2 py-1 text-left">Used</th>
                    <th className="px-2 py-1 text-left">Limit</th>
                    <th className="px-2 py-1 text-left">Early?</th>
                  </tr>
                </thead>
                <tbody>
                  {perQuestionTiming.map((q, i) => (
                    <tr key={q.questionId} className="border-t">
                      <td className="px-2 py-1 font-mono">{i + 1}</td>
                      <td className="px-2 py-1 font-mono">
                        {formatTime(q.timeUsedSeconds)}
                      </td>
                      <td className="px-2 py-1 font-mono">
                        {formatTime(q.timeLimitSeconds)}
                      </td>
                      <td className="px-2 py-1">
                        {q.finishedEarly ? (
                          <span className="text-emerald-600 font-semibold">
                            Yes
                          </span>
                        ) : (
                          <span className="text-muted-foreground">No</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Derived display values ────────────────────────────────────────────────
  const {
    label: accuracyLabel,
    color: accuracyColor,
    bg: accuracyBg,
  } = getAccuracyMeta(accuracyPercent);

  // Ring color based on plan thresholds
  const ringColor =
    accuracyPercent >= 80
      ? '#10b981'
      : accuracyPercent >= 60
        ? '#f59e0b'
        : '#f43f5e';
  const ringLabel =
    accuracyPercent >= 80
      ? 'Excellent'
      : accuracyPercent >= 60
        ? 'Good'
        : 'Needs work';

  // Low-scoring topics (for "What to review")
  const weakTopics = sessionTopics.filter((t) => t.pct < 75);

  return (
    <Card className="border shadow-lg overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 m-2 bg-muted/10">
      {/* ── Header ── */}
      <CardHeader className="border-b px-5 py-3">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-lg font-bold flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            Session Complete
          </CardTitle>
          <div className="flex items-center gap-2 shrink-0">
            <Badge
              variant="secondary"
              className={`text-xs font-semibold ${accuracyBg} ${accuracyColor} border-0`}
            >
              {accuracyLabel}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-5 py-6 space-y-6">
        {/* ── Section 1: Big Result ── */}
        <div className="flex flex-col items-center text-center space-y-3">
          <span
            className="text-3xl font-black tabular-nums"
            style={{ color: ringColor }}
          >
            {accuracyPercent.toFixed(0)}%
          </span>
          <span className="text-[10px] font-semibold text-muted-foreground">
            {ringLabel}
          </span>
          <div className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">
              {completedCount}/{totalCount}
            </span>{' '}
            correct
            <span className="mx-2">·</span>
            <span className="font-semibold text-foreground">
              {formattedElapsedTime}
            </span>{' '}
            total
          </div>
        </div>

        <WhatToReview
          weakTopics={weakTopics}
          sessionCriteria={sessionCriteria}
          questionMode={questionMode}
          sessionTopics={sessionTopics}
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          navigate={navigate}
        />

        {/* ── Section 3: Details (Collapsed) ── */}
        <div className="border-t pt-3">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="w-full flex items-center justify-between py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <span>Show details</span>
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${showDetails ? '' : '-rotate-90'}`}
            />
          </button>

          {showDetails && (
            <DetailsPanel
              questionMode={questionMode}
              writtenResults={writtenResults}
              mcResults={mcResults}
              summary={summary}
              trendData={trendData}
              perQuestionTiming={perQuestionTiming}
            />
          )}
        </div>
      </CardContent>

      {/* ── Footer ── */}
      <CardFooter className="border-t bg-muted/10 px-5 py-3.5 flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void onReview();
          }}
          className="gap-1.5 h-8"
        >
          <BookOpen className="w-3.5 h-3.5" />
          Review
        </Button>
        <Button
          size="sm"
          onClick={() => {
            void onStartOver();
          }}
          className="gap-1.5 h-8"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          New Set
        </Button>
      </CardFooter>
    </Card>
  );
}
