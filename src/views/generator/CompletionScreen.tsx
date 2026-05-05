import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  Filter,
  RefreshCw,
  Star,
  Target,
  TrendingUp,
  Trophy,
  XCircle,
  Zap,
} from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { MarkdownMath } from '@/components/MarkdownMath';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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

const TIER_CONFIG = {
  excellent: {
    label: 'Excellent',
    color: 'oklch(0.72 0.18 150)',
    colorMuted: 'oklch(0.72 0.18 150 / 0.1)',
    icon: Trophy,
    glow: true,
  },
  good: {
    label: 'Good',
    color: 'oklch(0.68 0.14 240)',
    colorMuted: 'oklch(0.68 0.14 240 / 0.1)',
    icon: Star,
    glow: false,
  },
  fair: {
    label: 'Fair',
    color: 'oklch(0.75 0.15 85)',
    colorMuted: 'oklch(0.75 0.15 85 / 0.1)',
    icon: Target,
    glow: false,
  },
  poor: {
    label: 'Keep Practicing',
    color: 'oklch(0.62 0.18 25)',
    colorMuted: 'oklch(0.62 0.18 25 / 0.1)',
    icon: AlertTriangle,
    glow: false,
  },
} as const;

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

function getScoreMeta(pct: number) {
  if (pct >= 90) return TIER_CONFIG.excellent;
  if (pct >= 70) return TIER_CONFIG.good;
  if (pct >= 50) return TIER_CONFIG.fair;
  return TIER_CONFIG.poor;
}

function getBarColor(pct: number) {
  if (pct >= 90) return TIER_CONFIG.excellent.color;
  if (pct >= 70) return TIER_CONFIG.good.color;
  if (pct >= 50) return TIER_CONFIG.fair.color;
  return TIER_CONFIG.poor.color;
}

// ─── Animated score ring ──────────────────────────────────────────────────────

const ScoreRing = memo(function ScoreRing({
  pct,
  color,
  glow,
}: {
  pct: number;
  color: string;
  glow?: boolean;
}) {
  const size = 160;
  const strokeWidth = 10;
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
      className='relative flex items-center justify-center'
      style={{ width: size, height: size }}
    >
      {/* Animated outer glow for excellent tier */}
      {glow && (
        <motion.div
          className='absolute inset-0 rounded-full'
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{
            opacity: [0.1, 0.25, 0.1],
            scale: [1, 1.15, 1],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{
            backgroundColor: color,
            filter: 'blur(35px)',
          }}
        />
      )}

      <svg
        width={size}
        height={size}
        style={{ transform: 'rotate(-90deg)' }}
        className='relative z-10'
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill='none'
          stroke='currentColor'
          strokeWidth={strokeWidth}
          className='text-muted/10'
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill='none'
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap='round'
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashoffset }}
          transition={{
            duration: 1.8,
            ease: [0.16, 1, 0.3, 1],
            delay: 0.2,
          }}
        />
      </svg>
      <motion.div
        className='absolute inset-0 flex flex-col items-center justify-center z-20'
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5, duration: 0.5, ease: 'easeOut' }}
      >
        <div className='flex items-baseline'>
          <span
            className='text-6xl font-serif font-bold tabular-nums leading-none tracking-[-0.075em]'
            style={{ color }}
          >
            {pct.toFixed(0)}
          </span>
          <span
            className='text-2xl font-serif font-bold ml-1'
            style={{ color: `color-mix(in oklch, ${color}, transparent 40%)` }}
          >
            %
          </span>
        </div>
        <span className='text-xs font-medium text-muted-foreground/40 mt-1'>
          Accuracy
        </span>
      </motion.div>
    </div>
  );
});

// ─── Stat tile ────────────────────────────────────────────────────────────────

const StatTile = memo(function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  color,
  delay = 0,
  tooltip,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color?: string;
  delay?: number;
  tooltip?: string;
}) {
  const content = (
    <motion.div
      className='flex flex-col gap-1 rounded-xl border border-border/10 bg-card/40 px-5 py-4 backdrop-blur-md h-full transition-colors hover:border-border/40 group/stat'
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className='flex items-center gap-2 text-muted-foreground/40 group-hover/stat:text-muted-foreground/60 transition-colors'>
        <Icon className='w-3.5 h-3.5' />
        <span className='text-[10px] font-bold uppercase tracking-wider'>
          {label}
        </span>
      </div>
      <div className='flex items-baseline gap-2 mt-1.5'>
        <span
          className='text-2xl font-serif font-semibold tabular-nums tracking-tight leading-none'
          style={{ color: color ?? 'inherit' }}
        >
          {value}
        </span>
        {sub && (
          <span className='text-[10px] text-muted-foreground/30 font-medium uppercase tracking-wide truncate'>
            {sub}
          </span>
        )}
      </div>
    </motion.div>
  );

  if (!tooltip) return content;

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <div className='cursor-help h-full'>{content}</div>
        </TooltipTrigger>
        <TooltipContent side='top' className='max-w-xs text-xs'>
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

// ─── Topic row ────────────────────────────────────────────────────────────────

const TopicRow = memo(function TopicRow({
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
      className='group space-y-2.5'
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: 0.05 * index,
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <div className='flex items-center justify-between gap-4 px-0.5'>
        <span className='text-xs font-semibold text-foreground/70 tracking-wide truncate'>
          {topic}
        </span>
        <span className='text-xs font-bold tabular-nums text-muted-foreground'>
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className='h-1.5 bg-muted/40 rounded-full overflow-hidden'>
        <motion.div
          className='h-full rounded-full'
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{
            delay: 0.2 + 0.05 * index,
            duration: 1.2,
            ease: [0.16, 1, 0.3, 1],
          }}
        />
      </div>
    </motion.div>
  );
});

// ─── Criterion chip ───────────────────────────────────────────────────────────

const CriterionChip = memo(function CriterionChip({
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
  const { color, colorMuted } =
    successPct >= 75
      ? TIER_CONFIG.excellent
      : successPct >= 50
        ? TIER_CONFIG.fair
        : TIER_CONFIG.poor;

  return (
    <motion.div
      className='flex items-start gap-4 rounded-xl border px-5 py-4 transition-all hover:shadow-md hover:-translate-y-0.5'
      style={{
        backgroundColor: colorMuted,
        borderColor: `color-mix(in oklch, ${color}, transparent 80%)`,
      }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: 0.08 * index,
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <div
        className='w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5'
        style={{
          backgroundColor: `color-mix(in oklch, ${color}, transparent 85%)`,
        }}
      >
        <AlertTriangle className='w-4.5 h-4.5' style={{ color }} />
      </div>
      <div className='flex-1 min-w-0'>
        <div className='text-sm font-semibold text-foreground/90 leading-snug'>
          <MarkdownMath content={criterion} />
        </div>
        <div className='flex items-center gap-2.5 mt-3'>
          <span className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground/30'>
            Marks lost
          </span>
          <div className='flex items-center gap-1.5'>
            <span className='text-xs font-bold tabular-nums' style={{ color }}>
              {achieved}
            </span>
            <span className='text-[10px] text-muted-foreground/20'>/</span>
            <span className='text-xs font-medium text-muted-foreground/40 tabular-nums'>
              {available}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
});

// ─── Question result row ──────────────────────────────────────────────────────

const QuestionRow = memo(function QuestionRow({
  index,
  topic,
  subtopic,
  correct,
  score,
  scoreLabel,
  timeUsed,
  timeLimit,
  delay,
}: {
  index: number;
  topic: string;
  subtopic?: string;
  correct: boolean;
  score?: number;
  scoreLabel?: string;
  timeUsed?: string;
  timeLimit?: string;
  delay: number;
}) {
  const color = correct
    ? TIER_CONFIG.excellent.color
    : score !== undefined
      ? score >= 50
        ? TIER_CONFIG.fair.color
        : TIER_CONFIG.poor.color
      : TIER_CONFIG.poor.color;

  return (
    <motion.div
      className='flex items-center gap-6 px-8 py-5 text-sm border-b border-border/10 last:border-0 hover:bg-muted/10 transition-colors group'
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <span className='shrink-0 w-6 text-xs text-muted-foreground/30 font-mono tracking-tighter'>
        {(index + 1).toString().padStart(2, '0')}
      </span>
      <div className='flex-1 min-w-0'>
        <span className='font-semibold text-foreground/80 truncate block tracking-tight'>
          {topic}
        </span>
        {subtopic && (
          <span className='text-[11px] text-muted-foreground/50 truncate block mt-0.5 font-medium'>
            {subtopic}
          </span>
        )}
      </div>

      {(timeUsed || timeLimit) && (
        <div className='hidden md:flex flex-col items-end gap-1 shrink-0 px-6 border-r border-border/10'>
          <span className='text-[10px] uppercase tracking-wider text-muted-foreground/20 font-bold'>
            Timing
          </span>
          <div className='flex items-center gap-2 font-mono text-xs'>
            <span className='text-foreground/60 font-medium tabular-nums'>
              {timeUsed ?? '--:--'}
            </span>
            <span className='text-muted-foreground/10'>/</span>
            <span className='text-muted-foreground/30 tabular-nums'>
              {timeLimit ?? '--:--'}
            </span>
          </div>
        </div>
      )}

      <div className='flex flex-col items-end gap-1 shrink-0 min-w-25'>
        <span className='text-[10px] uppercase tracking-wider text-muted-foreground/20 font-bold'>
          Result
        </span>
        <div className='flex items-center gap-3'>
          {scoreLabel && (
            <span
              className='text-xs font-semibold tabular-nums tracking-tight'
              style={{ color }}
            >
              {scoreLabel}
            </span>
          )}
          {correct ? (
            <CheckCircle2 className='w-4 h-4 text-[oklch(0.72_0.18_150)] shrink-0' />
          ) : (
            <XCircle className='w-4 h-4 text-[oklch(0.62_0.18_25)] shrink-0' />
          )}
        </div>
      </div>
    </motion.div>
  );
});

const EMPTY_WRITTEN_RESULTS: WrittenResultRow[] = [];
const EMPTY_MC_RESULTS: McResultRow[] = [];

// ─── Main component ───────────────────────────────────────────────────────────

export const CompletionScreen = memo(function CompletionScreen({
  questionMode,
  accuracyPercent,
  formattedElapsedTime,
  completedCount,
  totalCount,
  onReview,
  onStartOver,
  perQuestionTiming,
  sessionWrittenResults = EMPTY_WRITTEN_RESULTS,
  sessionMcResults = EMPTY_MC_RESULTS,
}: CompletionScreenProps) {
  const { summary, trendData } = useAnalyticsData();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'incorrect' | 'slow'>('all');
  const [showBackToTop, setShowBackToTop] = useState(false);

  // Monitor scroll for back-to-top button
  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;

    const handleScroll = () => {
      setShowBackToTop(main.scrollTop > 600);
    };

    main.addEventListener('scroll', handleScroll);
    return () => main.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    const main = document.querySelector('main');
    if (main) {
      main.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const writtenResults = sessionWrittenResults;
  const mcResults = sessionMcResults;

  const meta = getScoreMeta(accuracyPercent);

  // Calculate total marks for written mode
  const totalMarks = useMemo(() => {
    if (questionMode !== 'written' || writtenResults.length === 0) return null;
    let achieved = 0;
    let max = 0;
    for (const r of writtenResults) {
      achieved += r.achieved;
      max += r.max;
    }
    return { achieved, max };
  }, [questionMode, writtenResults]);

  const scoreDisplay = useMemo(() => {
    if (questionMode === 'written' && totalMarks) {
      return `${totalMarks.achieved}/${totalMarks.max}`;
    }
    return `${completedCount}/${totalCount}`;
  }, [questionMode, totalMarks, completedCount, totalCount]);

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

  const timingMap = useMemo(() => {
    const map = new Map<string, PerQuestionTiming>();
    if (perQuestionTiming) {
      perQuestionTiming.forEach((t) => map.set(t.questionId, t));
    }
    return map;
  }, [perQuestionTiming]);

  const weakTopics = sessionTopics.filter((t) => t.pct < 75);

  const filteredQuestions = useMemo(() => {
    const rows = questionMode === 'written' ? writtenResults : mcResults;
    return rows.filter((r) => {
      if (filter === 'all') return true;
      if (filter === 'incorrect') {
        return questionMode === 'written'
          ? (r as WrittenResultRow).scorePercent < 100
          : !(r as McResultRow).correct;
      }
      if (filter === 'slow') {
        const timing = timingMap.get(r.id);
        return timing && timing.timeUsedSeconds > timing.timeLimitSeconds;
      }
      return true;
    });
  }, [filter, questionMode, writtenResults, mcResults, timingMap]);

  return (
    <motion.div
      className='w-full min-h-full flex flex-col bg-background selection:bg-primary/10'
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* ── Hero Stat Section ── */}
      <header className='relative border-b border-border/10 bg-card/5 pb-16 pt-20 px-10 overflow-hidden'>
        {/* Decorative background accent */}
        <div
          className='absolute inset-0 pointer-events-none opacity-[0.03]'
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />

        <div className='max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-16 lg:gap-24 items-center relative z-10'>
          {/* Hero Score */}
          <div className='flex flex-col items-center lg:items-start gap-8'>
            <ScoreRing
              pct={accuracyPercent}
              color={meta.color}
              glow={meta.glow}
            />
            <div className='flex flex-col items-center lg:items-start gap-3'>
              <Badge
                variant='outline'
                className='text-[10px] font-bold uppercase tracking-wider px-4 py-1.5 border-[1.5px] flex items-center gap-2 rounded-full'
                style={{
                  color: meta.color,
                  borderColor: `color-mix(in oklch, ${meta.color}, transparent 70%)`,
                  background: `color-mix(in oklch, ${meta.color}, transparent 94%)`,
                }}
              >
                {meta.icon && <meta.icon className='w-3.5 h-3.5' />}
                {meta.label}
              </Badge>
              <h1 className='text-4xl font-serif font-semibold tracking-tight text-foreground'>
                Session Overview
              </h1>
            </div>
          </div>

          {/* Stat Grid */}
          <div className='grid grid-cols-2 md:grid-cols-3 gap-5'>
            <StatTile
              icon={Target}
              label='Score'
              value={scoreDisplay}
              sub={
                questionMode === 'written'
                  ? 'marks achieved'
                  : 'questions correct'
              }
              color={meta.color}
              delay={0.1}
            />
            <StatTile
              icon={Clock}
              label='Time'
              value={formattedElapsedTime}
              sub='total elapsed'
              delay={0.2}
            />
            <StatTile
              icon={TrendingUp}
              label='Lifetime'
              value={`${summary.overallAccuracy.toFixed(1)}%`}
              sub={`${summary.totalAttempts} attempts`}
              color={
                summary.overallAccuracy >= 75
                  ? TIER_CONFIG.excellent.color
                  : summary.overallAccuracy >= 50
                    ? TIER_CONFIG.fair.color
                    : TIER_CONFIG.poor.color
              }
              delay={0.3}
              tooltip="The cumulative accuracy across all sessions you've ever completed."
            />
            <StatTile
              icon={Zap}
              label='Written Avg'
              value={
                summary.writtenAttempts > 0
                  ? `${summary.writtenAverageScore.toFixed(1)}%`
                  : '—'
              }
              sub={
                summary.writtenAttempts > 0
                  ? `${summary.writtenAttempts} sessions`
                  : undefined
              }
              delay={0.4}
              tooltip='Your average score percentage across all written-response sessions.'
            />
            <StatTile
              icon={CheckCircle2}
              label='MC Accuracy'
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
              delay={0.5}
              tooltip='Total percentage of multiple-choice questions answered correctly.'
            />

            {/* Accuracy trend mini-card */}
            {trendData.length > 2 && (
              <motion.div
                className='flex flex-col gap-2 rounded-xl border border-border/10 bg-card/40 px-5 py-4 backdrop-blur-md transition-colors hover:border-border/40 group/trend'
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.6,
                  duration: 0.5,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-2 text-muted-foreground/50 group-hover/trend:text-muted-foreground/80 transition-colors'>
                    <TrendingUp className='w-3.5 h-3.5' />
                    <span className='text-[10px] font-black uppercase tracking-widest'>
                      Trend
                    </span>
                  </div>
                  <Badge
                    variant='outline'
                    className='text-[8px] font-black uppercase tracking-widest px-1.5 h-4 border-muted-foreground/20 text-muted-foreground/40'
                  >
                    L20
                  </Badge>
                </div>
                <div className='h-10 w-full mt-2' style={{ color: meta.color }}>
                  <AccuracyTrendChart data={trendData.slice(-20)} minimal />
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </header>

      {/* ── Main Content Area ── */}
      <main className='max-w-7xl mx-auto w-full px-10 py-24 space-y-28'>
        {/* Topics & Areas to Improve Grid */}
        <section className='grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-20 items-start'>
          {/* Topic Performance */}
          <div className='space-y-10'>
            <div className='space-y-3'>
              <h2 className='text-[11px] font-bold uppercase tracking-wider text-muted-foreground/40'>
                Topic Performance
              </h2>
              <p className='text-base text-muted-foreground/60 leading-relaxed max-w-[50ch] font-medium'>
                A breakdown of your accuracy across the topics covered in this
                session.
              </p>
            </div>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-10'>
              {sessionTopics.map((t, i) => (
                <TopicRow key={t.topic} topic={t.topic} pct={t.pct} index={i} />
              ))}
            </div>
          </div>

          {/* Areas to Improve */}
          {questionMode === 'written' && sessionCriteria.length > 0 && (
            <div className='space-y-10'>
              <div className='space-y-3'>
                <h2 className='text-[11px] font-bold uppercase tracking-wider text-muted-foreground/40'>
                  Areas to Improve
                </h2>
                <p className='text-base text-muted-foreground/60 leading-relaxed font-medium'>
                  Specific criteria where marks were lost. Focus on these for
                  next time.
                </p>
              </div>
              <div className='space-y-5'>
                {sessionCriteria.map((c, i) => (
                  <CriterionChip key={i} {...c} index={i} />
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Weak Topics CTA */}
        {weakTopics.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <button
              type='button'
              onClick={() => void navigate('/mistakes')}
              className='w-full flex items-center justify-between p-10 rounded-2xl border border-destructive/20 bg-destructive/5 hover:bg-destructive/8 transition-all group relative overflow-hidden'
            >
              <div
                className='absolute top-0 right-0 w-1/3 h-full pointer-events-none opacity-10'
                style={{
                  background: `linear-gradient(to left, ${TIER_CONFIG.poor.color}, transparent)`,
                }}
              />
              <div className='flex items-center gap-8 relative z-10'>
                <div className='w-14 h-14 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive border border-destructive/20'>
                  <AlertTriangle className='w-7 h-7' />
                </div>
                <div className='text-left'>
                  <h3 className='text-xl font-serif font-semibold text-foreground tracking-tight'>
                    {weakTopics.length} topic{weakTopics.length > 1 ? 's' : ''}{' '}
                    need attention
                  </h3>
                  <p className='text-sm text-muted-foreground/70 mt-1 font-medium'>
                    You scored below 75% in some areas. Review your mistakes to
                    improve.
                  </p>
                </div>
              </div>
              <div className='flex items-center gap-3 text-destructive font-bold text-[11px] uppercase tracking-wider relative z-10'>
                Go to mistakes
                <ChevronRight className='w-5 h-5 group-hover:translate-x-1.5 transition-transform' />
              </div>
            </button>
          </motion.div>
        )}

        {/* Detailed Question Review */}
        <section className='space-y-10'>
          <div className='flex flex-wrap items-end justify-between border-b border-border/10 pb-8 gap-6'>
            <div className='space-y-3'>
              <h2 className='text-[11px] font-bold uppercase tracking-wider text-muted-foreground/40'>
                Detailed Breakdown
              </h2>
              <p className='text-base text-muted-foreground/60 font-medium'>
                Review every question, its score, and the time taken.
              </p>
            </div>

            <div className='flex items-center bg-muted/30 p-1.5 rounded-xl border border-border/10 shadow-sm'>
              {(['all', 'incorrect', 'slow'] as const).map((id) => (
                <button
                  key={id}
                  onClick={() => setFilter(id)}
                  className={`px-5 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                    filter === id
                      ? 'bg-background shadow-md text-foreground scale-[1.02]'
                      : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  {id === 'all'
                    ? 'All Questions'
                    : id === 'incorrect'
                      ? 'Incorrect'
                      : 'Overtime'}
                </button>
              ))}
            </div>
          </div>

          <div className='bg-card/20 rounded-2xl border border-border/10 overflow-hidden shadow-xl shadow-foreground/2'>
            <div className='divide-y divide-border/10'>
              <AnimatePresence mode='popLayout'>
                {filteredQuestions.length > 0 ? (
                  filteredQuestions.map((r, i) => {
                    const timing = timingMap.get(r.id);
                    return (
                      <QuestionRow
                        key={r.id}
                        index={i}
                        topic={r.topic}
                        subtopic={r.subtopic}
                        correct={
                          questionMode === 'written'
                            ? (r as WrittenResultRow).scorePercent >= 100
                            : (r as McResultRow).correct
                        }
                        score={
                          questionMode === 'written'
                            ? (r as WrittenResultRow).scorePercent
                            : undefined
                        }
                        scoreLabel={
                          questionMode === 'written'
                            ? `${(r as WrittenResultRow).achieved}/${(r as WrittenResultRow).max} mk`
                            : (r as McResultRow).correct
                              ? undefined
                              : `${(r as McResultRow).selected} → ${(r as McResultRow).correctAnswer}`
                        }
                        timeUsed={
                          timing
                            ? formatTime(timing.timeUsedSeconds)
                            : undefined
                        }
                        timeLimit={
                          timing
                            ? formatTime(timing.timeLimitSeconds)
                            : undefined
                        }
                        delay={0.02 * i}
                      />
                    );
                  })
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className='py-24 text-center'
                  >
                    <Filter className='w-10 h-10 text-muted-foreground/10 mx-auto mb-5' />
                    <p className='text-sm text-muted-foreground/40 font-bold'>
                      No questions match the current filter.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </section>
      </main>

      {/* ── Sticky Action Bar ── */}
      <footer className='sticky bottom-0 z-50 mt-auto border-t border-border/10 bg-background/60 backdrop-blur-2xl px-10 py-8'>
        <div className='max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-8'>
          <div className='flex flex-col gap-1'>
            <p className='text-[11px] font-bold uppercase tracking-wider text-muted-foreground/30'>
              Session Finished
            </p>
            <p className='text-base font-medium text-muted-foreground/60'>
              Review your work or start fresh.
            </p>
          </div>
          <div className='flex items-center gap-5'>
            <Button
              variant='outline'
              onClick={() => void onReview()}
              className='h-14 px-10 gap-4 text-xs font-bold uppercase tracking-wider border-2 border-border/20 hover:bg-muted/20 hover:border-border/40 transition-all rounded-xl active:scale-[0.98]'
            >
              <BookOpen className='w-4.5 h-4.5' />
              Review Answers
            </Button>
            <Button
              onClick={() => void onStartOver()}
              className='h-14 px-10 gap-4 text-xs font-bold uppercase tracking-wider shadow-xl shadow-foreground/5 hover:scale-[1.02] active:scale-[0.98] transition-all rounded-xl'
              style={{ background: meta.color, color: 'white' }}
            >
              <RefreshCw className='w-4.5 h-4.5' />
              New Session
            </Button>
          </div>
        </div>
      </footer>

      {/* Back to Top Button */}
      <AnimatePresence>
        {showBackToTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={scrollToTop}
            className='fixed bottom-36 right-10 z-50 p-3.5 rounded-full bg-background border border-border shadow-2xl hover:bg-muted transition-colors text-foreground'
          >
            <ArrowUp className='w-5 h-5' />
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
});
