import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  RefreshCw,
  Target,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { MarkdownMath } from '@/components/MarkdownMath';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Difficulty, QuestionMode } from '@/types';
import { percent, useAnalyticsData } from '@/views/useAnalyticsData';

import { AccuracyTrendChart } from './AccuracyTrendChart';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  sessionWrittenResults?: WrittenResultRow[];
  sessionMcResults?: McResultRow[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

function getScoreMeta(pct: number) {
  if (pct >= 90)
    return {
      label: 'Excellent',
      tier: 'excellent',
      accent: '#10b981',
      accentMuted: 'rgba(16,185,129,0.12)',
      ring: '#10b981',
    };
  if (pct >= 70)
    return {
      label: 'Good',
      tier: 'good',
      accent: '#3b82f6',
      accentMuted: 'rgba(59,130,246,0.12)',
      ring: '#3b82f6',
    };
  if (pct >= 50)
    return {
      label: 'Fair',
      tier: 'fair',
      accent: '#f59e0b',
      accentMuted: 'rgba(245,158,11,0.12)',
      ring: '#f59e0b',
    };
  return {
    label: 'Keep Practicing',
    tier: 'poor',
    accent: '#f43f5e',
    accentMuted: 'rgba(244,63,94,0.12)',
    ring: '#f43f5e',
  };
}

function getBarColor(pct: number) {
  if (pct >= 90) return '#10b981';
  if (pct >= 70) return '#3b82f6';
  if (pct >= 50) return '#f59e0b';
  return '#f43f5e';
}

// ─── Animated score ring ──────────────────────────────────────────────────────

function ScoreRing({ pct, color }: { pct: number; color: string }) {
  const size = 140;
  const strokeWidth = 9;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timeout = setTimeout(() => setProgress(pct), 200);
    return () => clearTimeout(timeout);
  }, [pct]);

  const dashoffset = circumference - (progress / 100) * circumference;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/30"
        />
        {/* Animated fill */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          style={{
            transition:
              'stroke-dashoffset 1.1s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        />
      </svg>
      {/* Center label */}
      <motion.div
        className="absolute inset-0 flex flex-col items-center justify-center"
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4, type: 'spring', stiffness: 260, damping: 18 }}
      >
        <span
          className="text-3xl font-black tabular-nums leading-none"
          style={{ color }}
        >
          {pct.toFixed(0)}
          <span className="text-lg">%</span>
        </span>
      </motion.div>
    </div>
  );
}

// ─── Topic bar row ────────────────────────────────────────────────────────────

function TopicRow({
  topic,
  pct,
  index,
}: {
  topic: string;
  pct: number;
  index: number;
}) {
  const color = getBarColor(pct);
  return (
    <motion.div
      className="group flex items-center gap-3"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.05 * index, duration: 0.35, ease: 'easeOut' }}
    >
      <span className="w-40 shrink-0 truncate text-sm font-medium text-foreground/80 group-hover:text-foreground transition-colors">
        {topic}
      </span>
      <div className="flex-1 h-1.5 bg-muted/60 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{
            delay: 0.1 + 0.05 * index,
            duration: 0.7,
            ease: 'easeOut',
          }}
        />
      </div>
      <span
        className="shrink-0 w-10 text-right text-sm font-bold tabular-nums"
        style={{ color }}
      >
        {pct.toFixed(0)}%
      </span>
    </motion.div>
  );
}

// ─── Stat tile ────────────────────────────────────────────────────────────────

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  color,
  delay = 0,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className="flex flex-col gap-1.5 rounded-xl border border-border/50 bg-card/50 px-4 py-3.5 backdrop-blur-sm"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: 'easeOut' }}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10px] font-bold uppercase tracking-widest">
          {label}
        </span>
      </div>
      <span
        className="text-xl font-black tabular-nums leading-none"
        style={{ color: color ?? 'inherit' }}
      >
        {value}
      </span>
      {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
    </motion.div>
  );
}

// ─── Criterion chip ───────────────────────────────────────────────────────────

function CriterionChip({
  criterion,
  achieved,
  available,
  successPct,
  index,
}: {
  criterion: string;
  achieved: number;
  available: number;
  successPct: number;
  index: number;
}) {
  const color =
    successPct >= 75
      ? 'text-emerald-500'
      : successPct >= 50
        ? 'text-amber-500'
        : 'text-rose-500';
  const bg =
    successPct >= 75
      ? 'bg-emerald-500/8 border-emerald-500/20'
      : successPct >= 50
        ? 'bg-amber-500/8 border-amber-500/20'
        : 'bg-rose-500/8 border-rose-500/20';

  return (
    <motion.div
      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${bg}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.06 * index, duration: 0.3 }}
    >
      <AlertTriangle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">
          <MarkdownMath content={criterion} />
        </p>
        <span
          className={`text-[10px] font-bold tabular-nums ${color} mt-0.5 block`}
        >
          {achieved}/{available} marks
        </span>
      </div>
    </motion.div>
  );
}

// ─── Question result row ──────────────────────────────────────────────────────

function QuestionRow({
  index,
  topic,
  subtopic,
  correct,
  score,
  scoreLabel,
  delay,
}: {
  index: number;
  topic: string;
  subtopic?: string;
  correct: boolean;
  score?: number;
  scoreLabel?: string;
  delay: number;
}) {
  const color = correct
    ? '#10b981'
    : score !== undefined
      ? score >= 50
        ? '#f59e0b'
        : '#f43f5e'
      : '#f43f5e';

  return (
    <motion.div
      className="flex items-center gap-3 px-4 py-2.5 text-sm border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors group"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay, duration: 0.25 }}
    >
      <span className="shrink-0 w-5 text-xs text-muted-foreground font-mono">
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <span className="font-medium text-foreground truncate block text-xs">
          {topic}
        </span>
        {subtopic && (
          <span className="text-[11px] text-muted-foreground truncate block">
            {subtopic}
          </span>
        )}
      </div>
      {scoreLabel && (
        <span
          className="text-xs font-bold tabular-nums shrink-0"
          style={{ color }}
        >
          {scoreLabel}
        </span>
      )}
      {correct ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
      )}
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

// eslint-disable-next-line complexity
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
  const [activeTab, setActiveTab] = useState<
    'overview' | 'questions' | 'timing'
  >('overview');

  const writtenResults = sessionWrittenResults;
  const mcResults = sessionMcResults;

  const meta = getScoreMeta(accuracyPercent);

  // Session topic breakdown
  const sessionTopics = useMemo(() => {
    const map = new Map<string, { correct: number; total: number }>();
    const rows = questionMode === 'written' ? writtenResults : mcResults;
    for (const r of rows) {
      const b = map.get(r.topic) ?? { correct: 0, total: 0 };
      b.total += 1;
      b.correct +=
        questionMode === 'written'
          ? (r as WrittenResultRow).scorePercent >= 100
            ? 1
            : 0
          : (r as McResultRow).correct
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

  // Session criteria weak points
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

  const weakTopics = sessionTopics.filter((t) => t.pct < 75);
  const hasTiming = perQuestionTiming && perQuestionTiming.length > 0;
  const hasQuestions =
    questionMode === 'written'
      ? writtenResults.length > 0
      : mcResults.length > 0;

  const tabs = [
    { id: 'overview' as const, label: 'Overview' },
    ...(hasQuestions ? [{ id: 'questions' as const, label: 'Questions' }] : []),
    ...(hasTiming ? [{ id: 'timing' as const, label: 'Timing' }] : []),
  ];

  return (
    <motion.div
      className="w-full px-12 py-12"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* ── Main card ── */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-xl overflow-hidden">
        {/* ── Hero: two-column split ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr]">
          {/* Left panel — score */}
          <motion.div
            className="flex flex-col items-center justify-center gap-5 px-8 py-10 relative overflow-hidden border-b lg:border-b-0 lg:border-r border-border/40"
            style={{ background: meta.accentMuted }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          >
            {/* Ambient glow */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `radial-gradient(ellipse at center, ${meta.accent}18 0%, transparent 70%)`,
              }}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                delay: 0.15,
                type: 'spring',
                stiffness: 220,
                damping: 20,
              }}
            >
              <ScoreRing pct={accuracyPercent} color={meta.accent} />
            </motion.div>

            <motion.div
              className="flex flex-col items-center gap-2 text-center"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.4 }}
            >
              <Badge
                variant="outline"
                className="text-xs font-bold px-3 py-1 border"
                style={{
                  color: meta.accent,
                  borderColor: `${meta.accent}40`,
                  background: `${meta.accent}12`,
                }}
              >
                {meta.label}
              </Badge>
              <p className="text-sm text-muted-foreground font-medium">
                Session Complete
              </p>
            </motion.div>
          </motion.div>

          {/* Right panel — key stats */}
          <div className="flex flex-col">
            {/* Stat grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-6 pb-4">
              <StatTile
                icon={Target}
                label="Score"
                value={`${completedCount}/${totalCount}`}
                sub="questions correct"
                color={meta.accent}
                delay={0.2}
              />
              <StatTile
                icon={Clock}
                label="Time"
                value={formattedElapsedTime}
                sub="total session"
                delay={0.28}
              />
              <StatTile
                icon={TrendingUp}
                label="Lifetime"
                value={`${summary.overallAccuracy.toFixed(1)}%`}
                sub={`${summary.totalAttempts} attempts`}
                color={
                  summary.overallAccuracy >= 75
                    ? '#10b981'
                    : summary.overallAccuracy >= 50
                      ? '#f59e0b'
                      : '#f43f5e'
                }
                delay={0.36}
              />
              <StatTile
                icon={Zap}
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
                delay={0.44}
              />
              <StatTile
                icon={CheckCircle2}
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
                delay={0.52}
              />
            </div>

            {/* Accuracy trend (if available) */}
            {trendData.length > 2 && (
              <motion.div
                className="px-6 pb-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.4 }}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">
                  Accuracy trend
                </p>
                <AccuracyTrendChart data={trendData.slice(-30)} />
              </motion.div>
            )}
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div className="border-t border-border/50 px-6 flex items-end gap-1 bg-muted/20">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-3 py-3 text-xs font-semibold transition-colors ${activeTab === tab.id
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{ background: meta.accent }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div className="px-6 py-5 space-y-5">
                {/* Topic breakdown */}
                {sessionTopics.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                      Topics this session
                    </p>
                    <div className="space-y-2">
                      {sessionTopics.map((t, i) => (
                        <TopicRow
                          key={t.topic}
                          topic={t.topic}
                          pct={t.pct}
                          index={i}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Criteria weak spots */}
                {questionMode === 'written' && sessionCriteria.length > 0 && (
                  <div className="space-y-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                      Areas to improve
                    </p>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {sessionCriteria.map((c, i) => (
                        <CriterionChip key={i} {...c} index={i} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Weak topics CTA */}
                {weakTopics.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                  >
                    <button
                      type="button"
                      onClick={() => void navigate('/mistakes')}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-rose-500/20 bg-rose-500/6 hover:bg-rose-500/10 transition-colors group text-sm"
                    >
                      <div className="flex items-center gap-2.5">
                        <XCircle className="w-4 h-4 text-rose-500" />
                        <span className="font-semibold text-foreground">
                          {weakTopics.length} topic
                          {weakTopics.length > 1 ? 's' : ''} need
                          {weakTopics.length === 1 ? 's' : ''} attention
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </motion.div>
                )}
              </div>
            )}

            {/* QUESTIONS TAB */}
            {activeTab === 'questions' && (
              <div className="divide-y divide-border/30">
                {questionMode === 'written' &&
                  writtenResults.map((r, i) => (
                    <QuestionRow
                      key={r.id}
                      index={i}
                      topic={r.topic}
                      subtopic={r.subtopic}
                      correct={r.scorePercent >= 100}
                      score={r.scorePercent}
                      scoreLabel={`${r.achieved}/${r.max} mk`}
                      delay={0.03 * i}
                    />
                  ))}
                {questionMode === 'multiple-choice' &&
                  mcResults.map((r, i) => (
                    <QuestionRow
                      key={r.id}
                      index={i}
                      topic={r.topic}
                      subtopic={r.subtopic}
                      correct={r.correct}
                      scoreLabel={
                        r.correct
                          ? undefined
                          : `${r.selected}→${r.correctAnswer}`
                      }
                      delay={0.03 * i}
                    />
                  ))}
              </div>
            )}

            {/* TIMING TAB */}
            {activeTab === 'timing' && hasTiming && (
              <div className="px-6 py-5">
                <div className="rounded-xl border border-border/50 overflow-hidden">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="bg-muted/30 text-muted-foreground">
                        {['Q#', 'Time used', 'Limit', 'Finished early'].map(
                          (h) => (
                            <th
                              key={h}
                              className="px-4 py-2.5 text-left font-bold uppercase tracking-wide text-[10px]"
                            >
                              {h}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {perQuestionTiming.map((q, i) => (
                        <motion.tr
                          key={q.questionId}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.03 * i }}
                          className="hover:bg-muted/20 transition-colors"
                        >
                          <td className="px-4 py-2.5 font-mono text-muted-foreground">
                            {i + 1}
                          </td>
                          <td className="px-4 py-2.5 font-mono font-semibold">
                            {formatTime(q.timeUsedSeconds)}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-muted-foreground">
                            {formatTime(q.timeLimitSeconds)}
                          </td>
                          <td className="px-4 py-2.5">
                            {q.finishedEarly ? (
                              <span className="text-emerald-500 font-bold">
                                ✓ Early
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* ── Footer ── */}
        <motion.div
          className="border-t border-border/50 bg-muted/10 px-6 py-4 flex flex-wrap items-center justify-between gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
        >
          <p className="text-xs text-muted-foreground">What's next?</p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onReview()}
              className="gap-2 h-9 text-sm font-semibold"
            >
              <BookOpen className="w-3.5 h-3.5" />
              Review Answers
            </Button>
            <Button
              size="sm"
              onClick={() => void onStartOver()}
              className="gap-2 h-9 text-sm font-semibold"
              style={{ background: meta.accent, borderColor: meta.accent }}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              New Session
            </Button>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
