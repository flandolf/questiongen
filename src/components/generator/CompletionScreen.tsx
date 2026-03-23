import {
  CheckCircle2, Clock, Target, BarChart2, BookOpen, Save, RefreshCw,
  TrendingUp, TrendingDown, Minus, AlertTriangle, Trophy, Zap, FileText,
  XCircle,
} from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "../ui/card";
import { Difficulty, QuestionMode } from "@/types";
import { useAnalyticsData, percent } from "@/views/useAnalyticsData";
import { useWrittenSession, useMultipleChoiceSession } from "@/AppContext";
import { AccuracyTrendChart } from "./AccuracyTrendChart";
import { formatDurationMs } from "@/lib/app-utils";

type CompletionScreenProps = {
  questionMode: QuestionMode;
  difficulty: Difficulty;
  accuracyPercent: number;
  formattedElapsedTime: string;
  completedCount: number;
  totalCount: number;
  hasSavedSet: boolean;
  onReview: () => void;
  onSave: () => void;
  onStartOver: () => void;
};

// ─── Small helpers ────────────────────────────────────────────────────────────

function getAccuracyMeta(pct: number): { label: string; color: string; bg: string; border: string } {
  if (pct >= 90) return { label: "Excellent", color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" };
  if (pct >= 70) return { label: "Good", color: "text-sky-500", bg: "bg-sky-500/10", border: "border-sky-500/20" };
  if (pct >= 50) return { label: "Fair", color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20" };
  return { label: "Keep Practicing", color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/20" };
}

function accuracyBarColor(pct: number) {
  if (pct >= 90) return "#10b981";
  if (pct >= 70) return "#3b82f6";
  if (pct >= 50) return "#f59e0b";
  return "#f43f5e";
}

function criterionColor(successPct: number) {
  if (successPct >= 75) return { text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" };
  if (successPct >= 50) return { text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" };
  return { text: "text-rose-600 dark:text-rose-400", bg: "bg-rose-500/10" };
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-2.5">
      {children}
    </p>
  );
}

function StatCell({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wide font-semibold">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${highlight ?? "text-foreground"}`}>{value}</span>
      {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

function DeltaBadge({ delta, label }: { delta: number | null; label?: string }) {
  if (delta === null || delta === undefined) return null;
  const isPos = delta > 0;
  const isNeut = Math.abs(delta) < 0.5;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isNeut ? "bg-muted text-muted-foreground"
      : isPos ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
      }`}>
      {isNeut ? <Minus className="w-2.5 h-2.5" /> : isPos ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {isPos ? "+" : ""}{delta.toFixed(1)}%{label ? ` ${label}` : ""}
    </span>
  );
}

// Mini horizontal bar for topic accuracy rows
function MiniBar({ pct }: { pct: number }) {
  return (
    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, background: accuracyBarColor(pct), transition: "width 0.6s ease-out" }}
      />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CompletionScreen({
  questionMode,
  difficulty,
  accuracyPercent,
  formattedElapsedTime,
  completedCount,
  totalCount,
  hasSavedSet,
  onReview,
  onSave,
  onStartOver,
}: CompletionScreenProps) {
  const {
    summary, trendData, topicPerformance, recentCriterionWeakPoints,
  } = useAnalyticsData();

  const { questionHistory } = useWrittenSession();
  const { mcHistory } = useMultipleChoiceSession();

  // ── Session-scoped slices ──────────────────────────────────────────────────
  // The N most recent history entries correspond to this session.
  const sessionWrittenEntries = useMemo(() => {
    if (questionMode !== "written") return [];
    return [...questionHistory]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, completedCount);
  }, [questionHistory, questionMode, completedCount]);

  const sessionMcEntries = useMemo(() => {
    if (questionMode !== "multiple-choice") return [];
    return [...mcHistory]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, completedCount);
  }, [mcHistory, questionMode, completedCount]);

  // ── Per-question result rows for written ──────────────────────────────────
  const writtenResults = useMemo(() => {
    return sessionWrittenEntries.map((e) => ({
      id: e.id,
      topic: e.question.topic,
      subtopic: e.question.subtopic,
      scorePercent: percent(e.markResponse.achievedMarks, e.markResponse.maxMarks),
      achieved: e.markResponse.achievedMarks,
      max: e.markResponse.maxMarks,
      wordCount: e.analytics?.answerWordCount ?? 0,
      markingLatencyMs: e.analytics?.markingLatencyMs,
      attemptKind: e.analytics?.attemptKind ?? "initial",
    }));
  }, [sessionWrittenEntries]);

  // ── Per-question result rows for MC ───────────────────────────────────────
  const mcResults = useMemo(() => {
    return sessionMcEntries.map((e) => ({
      id: e.id,
      topic: e.question.topic,
      subtopic: e.question.subtopic,
      correct: e.correct,
      selected: e.selectedAnswer,
      correctAnswer: e.question.correctAnswer,
      responseLatencyMs: e.analytics?.responseLatencyMs,
    }));
  }, [sessionMcEntries]);

  // ── Session topic breakdown ───────────────────────────────────────────────
  const sessionTopics = useMemo(() => {
    const map = new Map<string, { correct: number; total: number }>();
    const rows = questionMode === "written" ? writtenResults : mcResults;
    for (const r of rows) {
      const b = map.get(r.topic) ?? { correct: 0, total: 0 };
      b.total += 1;
      b.correct += questionMode === "written"
        ? (r as typeof writtenResults[0]).scorePercent >= 100 ? 1 : 0
        : (r as typeof mcResults[0]).correct ? 1 : 0;
      map.set(r.topic, b);
    }
    return Array.from(map.entries())
      .map(([topic, b]) => ({ topic, correct: b.correct, total: b.total, pct: percent(b.correct, b.total) }))
      .sort((a, b) => a.pct - b.pct);
  }, [questionMode, writtenResults, mcResults]);

  // ── Session criterion weak points (written only, this session) ────────────
  const sessionCriteria = useMemo(() => {
    if (questionMode !== "written") return [];
    const map = new Map<string, { achieved: number; available: number }>();
    for (const e of sessionWrittenEntries) {
      for (const c of e.markResponse.vcaaMarkingScheme) {
        if (c.maxMarks <= 0) continue;
        const b = map.get(c.criterion) ?? { achieved: 0, available: 0 };
        b.achieved += c.achievedMarks;
        b.available += c.maxMarks;
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
  }, [questionMode, sessionWrittenEntries]);

  // ── Timing stats ──────────────────────────────────────────────────────────
  const avgMarkingMs = useMemo(() => {
    const times = writtenResults.map((r) => r.markingLatencyMs).filter((t): t is number => t !== undefined);
    if (times.length === 0) return null;
    return times.reduce((a, b) => a + b, 0) / times.length;
  }, [writtenResults]);

  const avgResponseMs = useMemo(() => {
    const times = mcResults.map((r) => r.responseLatencyMs).filter((t): t is number => t !== undefined);
    if (times.length === 0) return null;
    return times.reduce((a, b) => a + b, 0) / times.length;
  }, [mcResults]);

  // ── Trend delta (this session vs before) ──────────────────────────────────
  const prevAccuracy = trendData.length > completedCount
    ? trendData[trendData.length - completedCount - 1]?.overallAccuracy ?? null
    : null;
  const accuracyChange = prevAccuracy !== null ? accuracyPercent - prevAccuracy : null;

  // ── Fastest / slowest MC ─────────────────────────────────────────────────
  const fastestMc = useMemo(() => {
    const timed = mcResults.filter((r) => r.responseLatencyMs !== undefined);
    if (!timed.length) return null;
    return timed.reduce((best, r) => (r.responseLatencyMs! < best.responseLatencyMs! ? r : best));
  }, [mcResults]);

  const slowestMc = useMemo(() => {
    const timed = mcResults.filter((r) => r.responseLatencyMs !== undefined);
    if (!timed.length) return null;
    return timed.reduce((worst, r) => (r.responseLatencyMs! > worst.responseLatencyMs! ? r : worst));
  }, [mcResults]);

  // ── Written highest / lowest ──────────────────────────────────────────────
  const bestWritten = useMemo(() => writtenResults.length ? writtenResults.reduce((b, r) => r.scorePercent > b.scorePercent ? r : b) : null, [writtenResults]);
  const worstWritten = useMemo(() => writtenResults.length ? writtenResults.reduce((b, r) => r.scorePercent < b.scorePercent ? r : b) : null, [writtenResults]);

  // ── Derived display values ────────────────────────────────────────────────
  const modeLabel = questionMode === "written" ? "Written" : "Multiple Choice";
  const modeColor = questionMode === "written" ? "text-sky-500" : "text-violet-500";
  const { label: accuracyLabel, color: accuracyColor, bg: accuracyBg, border: accuracyBorder } = getAccuracyMeta(accuracyPercent);
  const barColor = accuracyBarColor(accuracyPercent);

  // Streak: how many of the last N were correct?
  const streak = useMemo(() => {
    const rows = questionMode === "written"
      ? writtenResults.map((r) => r.scorePercent >= 100)
      : mcResults.map((r) => r.correct);
    let count = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i]) count++; else break;
    }
    return count;
  }, [questionMode, writtenResults, mcResults]);

  return (
    <Card className="border shadow-lg overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Header ── */}
      <CardHeader className="border-b px-5 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle className="text-xl font-bold flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              Session Complete
            </CardTitle>
            <CardDescription className="text-sm">
              <span className={`font-semibold ${modeColor}`}>{modeLabel}</span>
              {" · "}
              <span className="font-medium text-foreground capitalize">{difficulty}</span>
              {" · "}
              {completedCount}/{totalCount} answered
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {streak >= 3 && (
              <Badge variant="secondary" className="gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-0 text-xs font-semibold">
                <Zap className="w-3 h-3" /> {streak} streak
              </Badge>
            )}
            <Badge variant="secondary" className={`text-xs font-semibold ${accuracyBg} ${accuracyColor} border-0`}>
              {accuracyLabel}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-5 py-5 space-y-6">

        {/* ── Hero KPIs ── */}
        <div className="grid grid-cols-3 gap-3">
          <div className={`rounded-xl border p-4 space-y-2 ${accuracyBg} ${accuracyBorder}`}>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Target className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Score</span>
            </div>
            <div className={`text-3xl font-black tabular-nums leading-none ${accuracyColor}`}>
              {accuracyPercent.toFixed(0)}%
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-muted-foreground">{accuracyLabel}</span>
              <DeltaBadge delta={accuracyChange} />
            </div>
          </div>

          <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Time</span>
            </div>
            <div className="text-3xl font-black tabular-nums leading-none">{formattedElapsedTime}</div>
            {completedCount > 0 && (
              <div className="text-xs text-muted-foreground">
                ~{formatDurationMs(
                  (() => {
                    const parts = formattedElapsedTime.split(":").map(Number);
                    const totalMs = parts.length === 3
                      ? (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000
                      : (parts[0] * 60 + parts[1]) * 1000;
                    return Math.round(totalMs / completedCount);
                  })()
                )} / question
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <BarChart2 className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Level</span>
            </div>
            <div className="text-xl font-black capitalize leading-tight">{difficulty}</div>
            <div className={`text-xs font-semibold ${modeColor}`}>{modeLabel}</div>
          </div>
        </div>

        {/* ── Score bar ── */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <span>Session accuracy</span>
            <span className={`font-bold tabular-nums ${accuracyColor}`}>{accuracyPercent.toFixed(1)}%</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${accuracyPercent}%`, background: barColor }} />
          </div>
        </div>

        {/* ── Session topic breakdown ── */}
        {sessionTopics.length > 0 && (
          <div>
            <SectionHeading>Topics this session</SectionHeading>
            <div className="space-y-2">
              {sessionTopics.map(({ topic, correct, total, pct }) => (
                <div key={topic} className="flex items-center gap-3 text-xs">
                  <span className="w-[130px] shrink-0 truncate font-medium text-foreground">{topic}</span>
                  <MiniBar pct={pct} />
                  <span className={`shrink-0 tabular-nums font-semibold w-10 text-right ${pct >= 75 ? "text-emerald-500" : pct >= 50 ? "text-amber-500" : "text-rose-500"
                    }`}>{pct.toFixed(0)}%</span>
                  <span className="shrink-0 text-muted-foreground w-10 text-right">{correct}/{total}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Written question-by-question breakdown ── */}
        {questionMode === "written" && writtenResults.length > 0 && (
          <div>
            <SectionHeading>Question results</SectionHeading>
            <div className="rounded-xl border divide-y divide-border/40 overflow-hidden">
              {writtenResults.map((r, i) => {
                const pct = r.scorePercent;
                const col = pct >= 100 ? "text-emerald-500" : pct >= 50 ? "text-amber-500" : "text-rose-500";
                const bg = pct >= 100 ? "bg-emerald-500/5" : pct < 50 ? "bg-rose-500/5" : "";
                return (
                  <div key={r.id} className={`flex items-center gap-3 px-3 py-2.5 text-xs ${bg}`}>
                    <span className="shrink-0 w-5 text-muted-foreground font-mono">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-foreground truncate block">{r.topic}</span>
                      {r.subtopic && <span className="text-muted-foreground truncate block">{r.subtopic}</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.attemptKind !== "initial" && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-semibold capitalize">
                          {r.attemptKind}
                        </Badge>
                      )}
                      {r.wordCount > 0 && (
                        <span className="text-muted-foreground tabular-nums">{r.wordCount}w</span>
                      )}
                      <span className={`font-bold tabular-nums ${col} w-14 text-right`}>
                        {r.achieved}/{r.max} mk
                      </span>
                      {pct >= 100
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        : pct === 0
                          ? <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          : <span className="w-3.5 h-3.5 shrink-0 flex items-center justify-center"><span className="w-2 h-2 rounded-full bg-amber-400" /></span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── MC question-by-question breakdown ── */}
        {questionMode === "multiple-choice" && mcResults.length > 0 && (
          <div>
            <SectionHeading>Question results</SectionHeading>
            <div className="rounded-xl border divide-y divide-border/40 overflow-hidden">
              {mcResults.map((r, i) => (
                <div key={r.id} className={`flex items-center gap-3 px-3 py-2.5 text-xs ${r.correct ? "bg-emerald-500/5" : "bg-rose-500/5"}`}>
                  <span className="shrink-0 w-5 text-muted-foreground font-mono">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-foreground truncate block">{r.topic}</span>
                    {r.subtopic && <span className="text-muted-foreground truncate block">{r.subtopic}</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.responseLatencyMs !== undefined && (
                      <span className="text-muted-foreground tabular-nums">{(r.responseLatencyMs / 1000).toFixed(1)}s</span>
                    )}
                    <span className="font-mono text-muted-foreground">
                      {r.correct ? "" : `${r.selected}→`}{r.correctAnswer}
                    </span>
                    {r.correct
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      : <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Criterion weak points (written) ── */}
        {questionMode === "written" && sessionCriteria.length > 0 && (
          <div>
            <SectionHeading>Marks lost on</SectionHeading>
            <div className="space-y-2">
              {sessionCriteria.map((c, i) => {
                const { text, bg } = criterionColor(c.successPct);
                return (
                  <div key={i} className={`flex items-start gap-3 rounded-xl border px-3.5 py-2.5 ${bg} border-transparent`}>
                    <AlertTriangle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${text}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">{c.criterion}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <MiniBar pct={c.successPct} />
                        <span className={`text-[11px] font-bold tabular-nums shrink-0 ${text}`}>
                          {c.achieved}/{c.available} mk
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Highlights row ── */}
        {(bestWritten || worstWritten || fastestMc || slowestMc || avgMarkingMs || avgResponseMs) && (
          <div>
            <SectionHeading>Session highlights</SectionHeading>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {questionMode === "written" && bestWritten && (
                <div className="rounded-xl border bg-emerald-500/5 border-emerald-500/15 p-3 space-y-1">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Trophy className="w-3 h-3 text-emerald-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Best</span>
                  </div>
                  <p className="text-xs font-semibold text-foreground truncate">{bestWritten.topic}</p>
                  <p className="text-base font-black text-emerald-500 tabular-nums">{bestWritten.achieved}/{bestWritten.max}mk</p>
                </div>
              )}
              {questionMode === "written" && worstWritten && worstWritten.id !== bestWritten?.id && (
                <div className="rounded-xl border bg-rose-500/5 border-rose-500/15 p-3 space-y-1">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <AlertTriangle className="w-3 h-3 text-rose-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Hardest</span>
                  </div>
                  <p className="text-xs font-semibold text-foreground truncate">{worstWritten.topic}</p>
                  <p className="text-base font-black text-rose-500 tabular-nums">{worstWritten.achieved}/{worstWritten.max}mk</p>
                </div>
              )}
              {questionMode === "multiple-choice" && fastestMc && (
                <div className="rounded-xl border bg-sky-500/5 border-sky-500/15 p-3 space-y-1">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Zap className="w-3 h-3 text-sky-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Fastest</span>
                  </div>
                  <p className="text-xs font-semibold text-foreground truncate">{fastestMc.topic}</p>
                  <p className="text-base font-black text-sky-500 tabular-nums">{(fastestMc.responseLatencyMs! / 1000).toFixed(1)}s</p>
                </div>
              )}
              {questionMode === "multiple-choice" && slowestMc && slowestMc.id !== fastestMc?.id && (
                <div className="rounded-xl border bg-amber-500/5 border-amber-500/15 p-3 space-y-1">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="w-3 h-3 text-amber-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Slowest</span>
                  </div>
                  <p className="text-xs font-semibold text-foreground truncate">{slowestMc.topic}</p>
                  <p className="text-base font-black text-amber-500 tabular-nums">{(slowestMc.responseLatencyMs! / 1000).toFixed(1)}s</p>
                </div>
              )}
              {avgMarkingMs && (
                <div className="rounded-xl border bg-muted/20 p-3 space-y-1">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <FileText className="w-3 h-3" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Avg mark time</span>
                  </div>
                  <p className="text-base font-black tabular-nums">{formatDurationMs(avgMarkingMs)}</p>
                </div>
              )}
              {avgResponseMs && (
                <div className="rounded-xl border bg-muted/20 p-3 space-y-1">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Avg response</span>
                  </div>
                  <p className="text-base font-black tabular-nums">{formatDurationMs(avgResponseMs)}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Lifetime stats ── */}
        <div className="rounded-xl border bg-muted/10 p-4">
          <SectionHeading>Lifetime stats</SectionHeading>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
            <StatCell label="Total attempts" value={summary.totalAttempts.toString()} />
            <StatCell
              label="Overall accuracy"
              value={`${summary.overallAccuracy.toFixed(1)}%`}
              highlight={summary.overallAccuracy >= 75 ? "text-emerald-500" : summary.overallAccuracy >= 50 ? "text-amber-500" : "text-rose-500"}
            />
            <StatCell
              label="Written avg"
              value={summary.writtenAttempts > 0 ? `${summary.writtenAverageScore.toFixed(1)}%` : "—"}
              sub={summary.writtenAttempts > 0 ? `${summary.writtenAttempts} attempts` : undefined}
            />
            <StatCell
              label="MC accuracy"
              value={summary.mcAttempts > 0 ? `${((summary.mcCorrect / summary.mcAttempts) * 100).toFixed(1)}%` : "—"}
              sub={summary.mcAttempts > 0 ? `${summary.mcCorrect}/${summary.mcAttempts}` : undefined}
            />
          </div>
        </div>

        {/* ── Accuracy trend ── */}
        {trendData.length > 2 && (
          <div>
            <SectionHeading>Accuracy trend</SectionHeading>
            <AccuracyTrendChart data={trendData.slice(-30)} />
          </div>
        )}

        {/* ── Top topic from lifetime analytics ── */}
        {topicPerformance.length > 0 && (
          <div>
            <SectionHeading>Topic leaderboard (lifetime)</SectionHeading>
            <div className="space-y-1.5">
              {topicPerformance.slice(0, 4).map(({ topic, accuracy, attempts, correct }: { topic: string; accuracy: number; attempts: number; correct: number }, i: number) => (
                <div key={topic} className="flex items-center gap-3 text-xs">
                  <span className="shrink-0 w-4 text-muted-foreground/50 font-mono text-center">
                    {i + 1}.
                  </span>
                  <span className="w-[130px] shrink-0 truncate font-medium text-foreground">{topic}</span>
                  <MiniBar pct={accuracy} />
                  <span className={`shrink-0 font-bold tabular-nums w-10 text-right ${accuracy >= 75 ? "text-emerald-500" : accuracy >= 50 ? "text-amber-500" : "text-rose-500"
                    }`}>{accuracy.toFixed(0)}%</span>
                  <span className="shrink-0 text-muted-foreground w-10 text-right">{correct}/{attempts}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </CardContent>

      {/* ── Footer ── */}
      <CardFooter className="border-t bg-muted/10 px-5 py-3.5 flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onReview} className="gap-1.5 h-8">
          <BookOpen className="w-3.5 h-3.5" />
          Review
        </Button>
        <Button variant="outline" size="sm" onClick={onSave} className="gap-1.5 h-8">
          <Save className="w-3.5 h-3.5" />
          {hasSavedSet ? "Update Saved" : "Save Set"}
        </Button>
        <Button size="sm" onClick={onStartOver} className="gap-1.5 h-8">
          <RefreshCw className="w-3.5 h-3.5" />
          New Set
        </Button>
      </CardFooter>
    </Card>
  );
}