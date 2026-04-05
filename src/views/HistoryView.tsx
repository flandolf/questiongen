import { useVirtualizer } from '@tanstack/react-virtual';
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Filter,
  History,
  ImageIcon,
  PlusCircle,
  Search,
  SlidersHorizontal,
  Target,
  Trash2,
  TrendingUp,
  X,
  XCircle,
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { PageContainer, PageHeader } from '@/components/layout/primitives';

import { useMultipleChoiceSession, useWrittenSession } from '../AppContext';
import { EmptyState } from '../components/EmptyState';
import { MarkdownMath } from '../components/MarkdownMath';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { formatDate } from '../lib/app-utils';
import { scoreColorBgClass } from '../lib/score-utils';
import type { McHistoryEntry, QuestionHistoryEntry, Topic } from '../types';
import { TOPICS } from '../types';

type AnyEntry =
  | ({ kind: 'written' } & QuestionHistoryEntry)
  | ({ kind: 'mc' } & McHistoryEntry);

type ModeFilter = 'all' | 'written' | 'mc';
type SortOrder =
  | 'newest'
  | 'oldest'
  | 'score-high'
  | 'score-low'
  | 'response-time-fast'
  | 'response-time-slow';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getEntryScore(item: AnyEntry): number {
  if (item.kind === 'written') {
    return (
      item.markResponse.achievedMarks / Math.max(item.markResponse.maxMarks, 1)
    );
  }
  return item.awardedMarks ?? (item.correct ? 1 : 0);
}

function getEntryResponseTimeMs(item: AnyEntry): number | undefined {
  return item.analytics?.responseLatencyMs;
}

function getRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(isoString);
}

// ---------------------------------------------------------------------------
// Stats bar
// ---------------------------------------------------------------------------

const StatsBar = memo(function StatsBar({ entries }: { entries: AnyEntry[] }) {
  const stats = useMemo(() => {
    const written = entries.filter((e) => e.kind === 'written');
    const mc = entries.filter((e) => e.kind === 'mc');
    const writtenCorrect = written.filter(
      (e) =>
        e.kind === 'written' &&
        e.markResponse.verdict.toLowerCase() === 'correct'
    ).length;
    const mcCorrect = mc.filter(
      (e) => e.kind === 'mc' && (e.awardedMarks ?? (e.correct ? 1 : 0)) >= 1
    ).length;
    const totalCorrect = writtenCorrect + mcCorrect;
    const total = entries.length;
    const pct = total > 0 ? Math.round((totalCorrect / total) * 100) : 0;
    return { written: written.length, mc: mc.length, pct, total };
  }, [entries]);

  return (
    <div className="grid grid-cols-4 gap-3">
      {[
        {
          label: 'Total attempts',
          value: stats.total,
          icon: <BarChart3 className="h-3.5 w-3.5" />,
          color: 'text-foreground',
        },
        {
          label: 'Accuracy',
          value: `${stats.pct}%`,
          icon: <TrendingUp className="h-3.5 w-3.5" />,
          color:
            stats.pct >= 75
              ? 'text-emerald-500'
              : stats.pct >= 50
                ? 'text-amber-500'
                : 'text-rose-500',
        },
        {
          label: 'Written',
          value: stats.written,
          icon: <BookOpen className="h-3.5 w-3.5" />,
          color: 'text-sky-500',
        },
        {
          label: 'Multiple choice',
          value: stats.mc,
          icon: <Target className="h-3.5 w-3.5" />,
          color: 'text-violet-500',
        },
      ].map((stat) => (
        <div
          key={stat.label}
          className="rounded-sm border border-border/40 bg-muted/20 px-4 py-3 flex flex-col gap-1"
        >
          <div className={`flex items-center gap-1.5 text-muted-foreground/70`}>
            {stat.icon}
            <span className="text-[10px] uppercase tracking-wider truncate">
              {stat.label}
            </span>
          </div>
          <span className={`text-xl tabular-nums leading-none ${stat.color}`}>
            {stat.value}
          </span>
        </div>
      ))}
    </div>
  );
});

// ---------------------------------------------------------------------------
// ExpandableCardSection — smooth CSS height animation
// ---------------------------------------------------------------------------

function ExpandableCardSection({
  isExpanded,
  children,
}: {
  isExpanded: boolean;
  children: React.ReactNode;
}) {
  const [everExpanded, setEverExpanded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isExpanded) setEverExpanded(true);
  }, [isExpanded]);

  if (!everExpanded) return null;

  return (
    <div
      ref={ref}
      className={`overflow-hidden transition-all duration-300 ease-in-out ${
        isExpanded
          ? 'opacity-100 mt-3'
          : 'opacity-0 max-h-0 mt-0 pointer-events-none'
      }`}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px]  uppercase tracking-widest text-muted-foreground/70 mb-2">
      {children}
    </h3>
  );
}

const ToggleButton = memo(function ToggleButton({
  isExpanded,
  onToggle,
}: {
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex items-center gap-1 px-2.5 py-1 rounded-sm text-[11px]  transition-all duration-150 border ${
        isExpanded
          ? 'bg-primary/10 text-primary border-primary/20'
          : 'text-muted-foreground hover:text-foreground border-border/40 hover:border-border hover:bg-muted/40'
      }`}
    >
      {isExpanded ? (
        <>
          <ChevronUp className="h-3 w-3" /> Hide
        </>
      ) : (
        <>
          <ChevronDown className="h-3 w-3" /> Details
        </>
      )}
    </button>
  );
});

// Accuracy arc mini-indicator
function AccuracyArc({ pct }: { pct: number }) {
  const color = pct >= 75 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#f43f5e';
  const r = 10;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      className="shrink-0"
      aria-hidden
    >
      <circle
        cx="14"
        cy="14"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        className="text-muted/30"
      />
      <circle
        cx="14"
        cy="14"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform="rotate(-90 14 14)"
        style={{ transition: 'stroke-dasharray 0.4s ease' }}
      />
    </svg>
  );
}

function ScorePill({ awarded, max }: { awarded: number; max: number }) {
  const isCorrect = awarded >= max;
  return (
    <span
      className={`inline-flex items-center gap-1.5  px-2.5 py-1 rounded-sm text-[11px] leading-none ${
        isCorrect
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
          : 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300'
      }`}
    >
      {isCorrect ? (
        <CheckCircle2 className="w-3 h-3 shrink-0" />
      ) : (
        <XCircle className="w-3 h-3 shrink-0" />
      )}
      {awarded.toFixed(0)}/{max}
    </span>
  );
}

// ---------------------------------------------------------------------------
// McEntryCard
// ---------------------------------------------------------------------------

const McEntryCard = memo(function McEntryCard({
  item,
  isExpanded,
  onToggle,
  onDelete,
}: {
  item: { kind: 'mc' } & McHistoryEntry;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const awarded = item.awardedMarks ?? (item.correct ? 1 : 0);
  const max = item.maxMarks ?? 1;
  const isCorrect = awarded >= max;

  return (
    <Card
      className={`overflow-hidden border transition-all duration-200 hover:shadow-lg 
        bg-muted/40 dark:bg-muted/20 border-border/80 dark:border-border/70
        ${isExpanded ? 'shadow-lg border-violet-700/40 dark:border-violet-400/30' : 'shadow border-border/80 dark:border-border/70'}
      `}
    >
      <CardHeader className="px-4 py-2 border-b border-border/40">
        <div className="flex items-start justify-between gap-3">
          {/* Left: topic + meta */}
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div
              className={`mt-0.5 shrink-0 w-7 h-7 rounded-sm flex items-center justify-center ${
                isCorrect
                  ? 'bg-emerald-100 dark:bg-emerald-950/50'
                  : 'bg-red-100 dark:bg-red-950/50'
              }`}
            >
              {isCorrect ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
              )}
            </div>
            <div className="space-y-0.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className=" text-sm leading-tight">
                  {item.question.topic}
                </span>
                <Badge
                  variant="secondary"
                  className="shrink-0 text-[10px]  bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 py-0.5 h-auto"
                >
                  MC
                </Badge>
              </div>
              {item.question.subtopic && (
                <p className="text-xs text-muted-foreground truncate">
                  {item.question.subtopic}
                </p>
              )}
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                <Clock className="h-2.5 w-2.5" />
                {getRelativeTime(item.createdAt)}
              </p>
            </div>
          </div>

          {/* Right: score + actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <ScorePill awarded={awarded} max={max} />
            <ToggleButton isExpanded={isExpanded} onToggle={onToggle} />
            <button
              type="button"
              onClick={onDelete}
              className="h-7 w-7 flex items-center justify-center rounded-sm text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Remove entry"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 py-3">
        {/* Quick summary row */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            Selected{' '}
            <strong
              className={` ${
                item.selectedAnswer === item.question.correctAnswer
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {item.selectedAnswer}
            </strong>
          </span>
          <span className="text-border">·</span>
          <span>
            Answer{' '}
            <strong className="text-emerald-600 dark:text-emerald-400 ">
              {item.question.correctAnswer}
            </strong>
          </span>
          <span className="text-border">·</span>
          <span>{item.question.options.length} options</span>
        </div>

        <ExpandableCardSection isExpanded={isExpanded}>
          <div className="space-y-4">
            <div className="bg-muted/40 px-4 py-3 rounded-sm border border-border/30 text-sm">
              <MarkdownMath content={item.question.promptMarkdown} />
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {item.question.options.map((opt) => {
                const isChosen = item.selectedAnswer === opt.label;
                const isCorrOpt = opt.label === item.question.correctAnswer;
                let cls =
                  'px-3 py-2.5 rounded-sm border flex gap-2.5 items-start text-sm transition-colors';
                if (isCorrOpt)
                  cls +=
                    ' border-emerald-500/50 bg-emerald-50/80 dark:bg-emerald-950/30';
                else if (isChosen)
                  cls += ' border-red-400/50 bg-red-50/80 dark:bg-red-950/30';
                else cls += ' border-border/30 bg-muted/20 opacity-60';
                return (
                  <div key={opt.label} className={cls}>
                    <span
                      className={` shrink-0 w-5 h-5 flex items-center justify-center rounded-sm text-[11px] mt-0.5 ${
                        isCorrOpt
                          ? 'bg-emerald-500 text-white'
                          : isChosen
                            ? 'bg-red-500 text-white'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {opt.label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <MarkdownMath content={opt.text} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="rounded-sm border border-border/30 bg-muted/10 px-4 py-3">
              <SectionLabel>Explanation</SectionLabel>
              <div className="text-sm">
                <MarkdownMath content={item.question.explanationMarkdown} />
              </div>
            </div>
          </div>
        </ExpandableCardSection>
      </CardContent>
    </Card>
  );
});

// ---------------------------------------------------------------------------
// WrittenEntryCard
// ---------------------------------------------------------------------------

const WrittenEntryCard = memo(function WrittenEntryCard({
  item,
  isExpanded,
  onToggle,
  onDelete,
}: {
  item: { kind: 'written' } & QuestionHistoryEntry;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const score = item.markResponse.scoreOutOf10;
  const pct =
    item.markResponse.maxMarks > 0
      ? Math.round(
          (item.markResponse.achievedMarks / item.markResponse.maxMarks) * 100
        )
      : 0;
  const colorClass = scoreColorBgClass(score / 10);

  return (
    <Card
      className={`overflow-hidden border transition-all duration-200 hover:shadow-lg 
        bg-muted/30 dark:bg-muted/20 border-border/80 dark:border-border/70
        ${isExpanded ? 'shadow-lg border-sky-700/40 dark:border-sky-400/30' : 'shadow border-border/80 dark:border-border/70'}
      `}
    >
      <CardHeader className="px-4 py-3 border-b border-border/40">
        <div className="flex items-start justify-between gap-3">
          {/* Left: topic + meta */}
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <AccuracyArc pct={pct} />
            <div className="space-y-0.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className=" text-sm leading-tight">
                  {item.question.topic}
                </span>
                <Badge
                  variant="secondary"
                  className="shrink-0 text-[10px] font-bold bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 py-0.5 h-auto"
                >
                  Written
                </Badge>
              </div>
              {item.question.subtopic && (
                <p className="text-xs text-muted-foreground truncate">
                  {item.question.subtopic}
                </p>
              )}
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                <Clock className="h-2.5 w-2.5" />
                {getRelativeTime(item.createdAt)}
              </p>
            </div>
          </div>

          {/* Right: score + actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`font-bold px-2.5 py-1 rounded-sm text-[11px] leading-none ${colorClass}`}
            >
              {score}/10
            </span>
            <ToggleButton isExpanded={isExpanded} onToggle={onToggle} />
            <button
              type="button"
              onClick={onDelete}
              className="h-7 w-7 flex items-center justify-center rounded-sm text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Remove entry"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 py-3">
        {/* Quick summary row */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="gap-1">
            {item.uploadedAnswerImage ? (
              <div className="flex flex-row items-center">
                <ImageIcon className="h-3 w-3" />
                <span className="ml-1">Image answer</span>
              </div>
            ) : (
              <div className="flex flex-row items-center">
                <FileText className="h-3 w-3" />
                <span className="ml-1">Text answer</span>
              </div>
            )}
          </span>
          <span className="text-border">·</span>
          <span>{item.markResponse.vcaaMarkingScheme.length} criteria</span>
          <span className="text-border">·</span>
          <span
            className={`font-semibold ${
              pct >= 75
                ? 'text-emerald-600 dark:text-emerald-400'
                : pct >= 50
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-red-600 dark:text-red-400'
            }`}
          >
            {item.markResponse.achievedMarks}/{item.markResponse.maxMarks} marks
          </span>
        </div>

        <ExpandableCardSection isExpanded={isExpanded}>
          <div className="space-y-4">
            {/* Question prompt */}
            <div className="bg-muted/40 px-4 py-3 rounded-sm border border-border/30 text-sm">
              <MarkdownMath content={item.question.promptMarkdown} />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Answer */}
              <div className="space-y-2">
                <SectionLabel>Your Answer</SectionLabel>
                {item.uploadedAnswerImage ? (
                  <img
                    src={item.uploadedAnswerImage.dataUrl}
                    alt="Uploaded Answer"
                    loading="lazy"
                    decoding="async"
                    className="rounded-sm border max-w-full h-auto"
                  />
                ) : (
                  <div className="whitespace-pre-wrap text-sm bg-muted/20 rounded-sm border border-border/30 px-3 py-2.5 min-h-[4rem]">
                    {item.uploadedAnswer ? (
                      <MarkdownMath content={item.uploadedAnswer} />
                    ) : (
                      <span className="p-2 text-muted-foreground">
                        No answer provided / Image file not available
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Feedback */}
              <div className="space-y-2 mt-2">
                <SectionLabel>AI Feedback</SectionLabel>
                <div className="text-sm bg-muted/20 rounded-sm border border-border/30 px-3 py-2.5">
                  <MarkdownMath content={item.markResponse.feedbackMarkdown} />
                </div>
              </div>
            </div>

            {/* Marking criteria */}
            <div>
              <SectionLabel>Mark Breakdown</SectionLabel>
              <div className="space-y-2">
                {item.markResponse.vcaaMarkingScheme.map((criterion, idx) => {
                  const isFullMarks =
                    criterion.achievedMarks === criterion.maxMarks;
                  return (
                    <div
                      key={idx}
                      className={`flex gap-3 justify-between rounded-sm border px-3 py-2.5 text-sm transition-colors ${
                        isFullMarks
                          ? 'border-emerald-200/60 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20'
                          : 'border-border/30 bg-card'
                      }`}
                    >
                      <div className="flex-1 space-y-1.5 min-w-0">
                        <MarkdownMath content={criterion.criterion} />
                        {criterion.rationale?.trim() && (
                          <div className="rounded-sm border border-border/50 bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">
                            <MarkdownMath content={criterion.rationale} />
                          </div>
                        )}
                      </div>
                      <span
                        className={`shrink-0 font-bold text-sm whitespace-nowrap self-start px-2 py-0.5 rounded-sm ${
                          isFullMarks
                            ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {criterion.achievedMarks}/{criterion.maxMarks}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </ExpandableCardSection>
      </CardContent>
    </Card>
  );
});

// ---------------------------------------------------------------------------
// HistoryEntryCard dispatcher
// ---------------------------------------------------------------------------

const HistoryEntryCard = memo(function HistoryEntryCard({
  item,
  isExpanded,
  onToggle,
  onDelete,
}: {
  item: AnyEntry;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  if (item.kind === 'mc') {
    return (
      <McEntryCard
        item={item}
        isExpanded={isExpanded}
        onToggle={onToggle}
        onDelete={onDelete}
      />
    );
  }
  return (
    <WrittenEntryCard
      item={item}
      isExpanded={isExpanded}
      onToggle={onToggle}
      onDelete={onDelete}
    />
  );
});

// ---------------------------------------------------------------------------
// HistoryView
// ---------------------------------------------------------------------------

function compareEntries(a: AnyEntry, b: AnyEntry, sortOrder: SortOrder) {
  if (sortOrder === 'newest') return b.createdAt.localeCompare(a.createdAt);
  if (sortOrder === 'oldest') return a.createdAt.localeCompare(b.createdAt);
  if (sortOrder === 'score-high') return getEntryScore(b) - getEntryScore(a);
  if (sortOrder === 'score-low') return getEntryScore(a) - getEntryScore(b);
  if (sortOrder === 'response-time-fast') {
    const aTime = getEntryResponseTimeMs(a) ?? Infinity;
    const bTime = getEntryResponseTimeMs(b) ?? Infinity;
    return aTime - bTime;
  }
  if (sortOrder === 'response-time-slow') {
    const aTime = getEntryResponseTimeMs(a) ?? -1;
    const bTime = getEntryResponseTimeMs(b) ?? -1;
    return bTime - aTime;
  }
  return 0;
}

// eslint-disable-next-line complexity
export function HistoryView() {
  const navigate = useNavigate();
  const { questionHistory, deleteQuestionHistoryEntry, clearQuestionHistory } =
    useWrittenSession();
  const { mcHistory, deleteMcHistoryEntry, clearMcHistory } =
    useMultipleChoiceSession();

  const combined = useMemo<AnyEntry[]>(() => {
    const written = questionHistory.map((e) => ({
      kind: 'written' as const,
      ...e,
    }));
    const mc = mcHistory.map((e) => ({ kind: 'mc' as const, ...e }));
    return [...written, ...mc].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }, [questionHistory, mcHistory]);

  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedEntryKeys, setExpandedEntryKeys] = useState<Set<string>>(
    () => new Set()
  );

  // Delete state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState<AnyEntry | null>(
    null
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);

  const subjectCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of combined) {
      const t = entry.question.topic;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return counts;
  }, [combined]);

  const orderedSubjects = useMemo(() => {
    const primary = TOPICS.filter((t) => subjectCounts.has(t));
    const extras = Array.from(subjectCounts.keys())
      .filter((t) => !TOPICS.includes(t as Topic))
      .sort((a, b) => a.localeCompare(b));
    return [...primary, ...extras];
  }, [subjectCounts]);

  const activeSubject =
    subjectFilter && subjectCounts.has(subjectFilter) ? subjectFilter : null;

  const filteredHistory = useMemo(() => {
    let result = combined.filter((e) => {
      if (activeSubject && e.question.topic !== activeSubject) return false;
      if (modeFilter === 'written' && e.kind !== 'written') return false;
      if (modeFilter === 'mc' && e.kind !== 'mc') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const topic = e.question.topic.toLowerCase();
        const sub = (e.question.subtopic ?? '').toLowerCase();
        const prompt = e.question.promptMarkdown.toLowerCase();
        if (!topic.includes(q) && !sub.includes(q) && !prompt.includes(q))
          return false;
      }
      return true;
    });

    result = [...result].sort((a, b) => compareEntries(a, b, sortOrder));

    return result;
  }, [combined, activeSubject, modeFilter, searchQuery, sortOrder]);

  const hasActiveFilters =
    modeFilter !== 'all' ||
    activeSubject !== null ||
    searchQuery.trim().length > 0;

  const handleSubjectBadgeClick = useCallback((subject: string | null) => {
    setSubjectFilter((cur) => (cur === subject ? null : subject));
  }, []);

  // Virtualizer setup
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredHistory.length,
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => {
      const item = filteredHistory[index];
      return item ? `${item.kind}-${item.id}` : index;
    },
    estimateSize: () => 140,
    overscan: 4,
  });

  // Reset scroll to top when filters/sort change
  const activeFilterKey = `${activeSubject}-${modeFilter}-${sortOrder}-${searchQuery}`;
  useEffect(() => {
    rowVirtualizer.scrollToIndex(0);
  }, [activeFilterKey, rowVirtualizer]);

  // Reset virtualizer size cache when the filtered data changes
  // This prevents overlapping items caused by stale height measurements
  useEffect(() => {
    rowVirtualizer.measure();
  }, [activeFilterKey, rowVirtualizer]);

  const toggleEntryExpanded = useCallback((entryKey: string) => {
    setExpandedEntryKeys((cur) => {
      const next = new Set(cur);
      if (next.has(entryKey)) {
        next.delete(entryKey);
      } else {
        next.add(entryKey);
      }
      return next;
    });
  }, []);

  function performSingleDeleteConfirmed() {
    if (!pendingDeleteEntry) return;
    if (pendingDeleteEntry.kind === 'written') {
      deleteQuestionHistoryEntry(pendingDeleteEntry.id);
    } else {
      deleteMcHistoryEntry(pendingDeleteEntry.id);
    }
    setExpandedEntryKeys((cur) => {
      const next = new Set(cur);
      next.delete(`${pendingDeleteEntry.kind}-${pendingDeleteEntry.id}`);
      return next;
    });
    setPendingDeleteEntry(null);
    setDeleteConfirmOpen(false);
    toast.success('Entry removed from history');
  }

  function handleClear() {
    const total = questionHistory.length + mcHistory.length;
    setConfirmOpen(true);
    setConfirmMessage(
      `Clear all ${total} history entries? Saved sets will be kept.`
    );
  }

  function performClearConfirmed() {
    clearQuestionHistory();
    clearMcHistory();
    setSubjectFilter(null);
    setModeFilter('all');
    setSearchQuery('');
    setExpandedEntryKeys(new Set());
    setConfirmOpen(false);
    setConfirmMessage(null);
    toast.success('History cleared');
  }

  function clearAllFilters() {
    setModeFilter('all');
    setSubjectFilter(null);
    setSearchQuery('');
    setSortOrder('newest');
    toast.message('Filters cleared');
  }

  if (combined.length === 0) {
    return (
      <PageContainer>
        <EmptyState
          title="No History Yet."
          description="Complete a question set or exam simulation to see it here."
          icon={History}
          actions={
            <Button onClick={() => void navigate('/')}>
              <PlusCircle className="h-4 w-4" />
              Generate your first set
            </Button>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="History"
        description="Review your past question attempts, see detailed feedback, and track your progress over time."
        actions={
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearAllFilters}
                className="gap-2"
              >
                <XCircle className="h-4 w-4" />
                Clear filters
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={handleClear}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Clear history
            </Button>
          </div>
        }
      />

      {/* ── Stats bar ── */}
      <StatsBar entries={combined} />

      {/* ── Search + filter toolbar ── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search by topic, subtopic, or question…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-8 text-sm rounded-sm border bg-background focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter toggle */}
          <button
            type="button"
            onClick={() => setShowFilters((p) => !p)}
            className={`flex items-center gap-1.5 px-3 h-9 rounded-sm border text-sm font-medium transition-all ${
              showFilters || hasActiveFilters
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {hasActiveFilters && (
              <span className="ml-0.5 w-4 h-4 rounded-sm bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                {
                  [
                    modeFilter !== 'all',
                    activeSubject !== null,
                    searchQuery.trim().length > 0,
                  ].filter(Boolean).length
                }
              </span>
            )}
          </button>

          {/* Sort */}
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            className="h-9 px-2.5 text-sm rounded-sm border bg-background focus:outline-none focus:ring-2 focus:ring-ring/50 text-muted-foreground"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="score-high">Highest score</option>
            <option value="score-low">Lowest score</option>
            <option value="response-time-fast">Fastest response</option>
            <option value="response-time-slow">Slowest response</option>
          </select>
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div className="rounded-sm border border-border/50 bg-muted/20 p-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
            {/* Mode filter */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                Mode
              </p>
              <div className="flex items-center gap-1 rounded-sm border bg-background p-0.5 self-start w-fit">
                {(['all', 'written', 'mc'] as ModeFilter[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setModeFilter(mode)}
                    className={`px-3 py-1.5 text-xs rounded-sm font-medium transition-all duration-150 ${
                      modeFilter === mode
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    {mode === 'all'
                      ? 'All'
                      : mode === 'written'
                        ? 'Written'
                        : 'Multiple Choice'}
                  </button>
                ))}
              </div>
            </div>

            {/* Topic filter */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                Topic
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSubjectBadgeClick(null)}
                  className={`px-2.5 py-1 text-xs rounded-sm border font-medium transition-all ${
                    activeSubject === null
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  }`}
                >
                  All topics
                </button>
                {orderedSubjects.map((subject) => (
                  <button
                    key={subject}
                    type="button"
                    onClick={() => handleSubjectBadgeClick(subject)}
                    className={`px-2.5 py-1 text-xs rounded-sm border font-medium transition-all ${
                      activeSubject === subject
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    }`}
                  >
                    {subject}{' '}
                    <span className="opacity-60">
                      ({subjectCounts.get(subject) ?? 0})
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Clear filters */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" /> Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Results summary ── */}
      {filteredHistory.length !== combined.length && (
        <p className="text-xs text-muted-foreground">
          Showing{' '}
          <span className="font-semibold text-foreground">
            {filteredHistory.length}
          </span>{' '}
          of {combined.length} entries
        </p>
      )}

      {filteredHistory.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <div className="w-10 h-10 rounded-sm bg-muted/40 flex items-center justify-center">
            <Filter className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium text-sm">No entries match your filters</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Try adjusting or clearing your filters
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={clearAllFilters}
            className="gap-1.5"
          >
            <X className="h-3.5 w-3.5" /> Clear filters
          </Button>
        </div>
      )}

      {/* ── Entry list (virtualized) ── */}
      <div
        className="flex-1 pr-1"
        style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        <div
          key={activeFilterKey}
          ref={parentRef}
          style={{
            height: '100%',
            overflow: 'auto',
            flex: 1,
          }}
        >
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = filteredHistory[virtualRow.index];
              const entryKey = `${item.kind}-${item.id}`;
              return (
                <div
                  key={entryKey}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    paddingBottom: 16,
                  }}
                >
                  <HistoryEntryCard
                    item={item}
                    isExpanded={expandedEntryKeys.has(entryKey)}
                    onToggle={() => toggleEntryExpanded(entryKey)}
                    onDelete={() => {
                      setPendingDeleteEntry(item);
                      setDeleteConfirmOpen(true);
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      <ConfirmModal
        open={confirmOpen}
        title="Clear History"
        description={confirmMessage ?? undefined}
        confirmText="Clear"
        cancelText="Cancel"
        onConfirm={performClearConfirmed}
        onCancel={() => {
          setConfirmOpen(false);
          setConfirmMessage(null);
        }}
      />

      <ConfirmModal
        open={deleteConfirmOpen}
        title="Remove entry"
        description={
          pendingDeleteEntry
            ? `Remove this ${pendingDeleteEntry.kind === 'written' ? 'written' : 'multiple-choice'} entry for "${pendingDeleteEntry.question.topic}"? This cannot be undone.`
            : undefined
        }
        confirmText="Remove"
        cancelText="Cancel"
        onConfirm={performSingleDeleteConfirmed}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setPendingDeleteEntry(null);
        }}
      />
    </PageContainer>
  );
}
