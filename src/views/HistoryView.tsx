import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMultipleChoiceSession, useWrittenSession } from "../AppContext";
import { Button } from "../components/ui/button";
import { Card, CardHeader, CardContent } from "../components/ui/card";
import { MarkdownMath } from "../components/MarkdownMath";
import { formatDate } from "../lib/app-utils";
import { ScrollArea } from "../components/ui/scroll-area";
import { Separator } from "../components/ui/separator";
import { Badge } from "../components/ui/badge";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  XCircle,
  BookOpen,
  Target,
  ImageIcon,
  FileText,
  Trash2,
  PlusCircle,
} from "lucide-react";
import { McHistoryEntry, QuestionHistoryEntry, Topic, TOPICS } from "../types";
import { EmptyState } from "../components/EmptyState";
import { ConfirmModal } from "../components/ui/ConfirmModal";
import { useNavigate } from "react-router-dom";

type AnyEntry =
  | ({ kind: "written" } & QuestionHistoryEntry)
  | ({ kind: "mc" } & McHistoryEntry);

type ModeFilter = "all" | "written" | "mc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number, max: number): string {
  const pct = max > 0 ? score / max : 0;
  if (pct >= 0.9) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300";
  if (pct >= 0.5) return "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300";
  return "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300";
}

// ---------------------------------------------------------------------------
// ExpandableCardSection
// ---------------------------------------------------------------------------

function ExpandableCardSection({
  isExpanded,
  children,
}: {
  isExpanded: boolean;
  children: React.ReactNode;
}) {
  const [everExpanded, setEverExpanded] = useState(false);
  useEffect(() => {
    if (isExpanded) setEverExpanded(true);
  }, [isExpanded]);

  if (!everExpanded) return null;

  return (
    <div
      className={`pt-2 overflow-hidden transition-all duration-200 ${isExpanded ? "opacity-100" : "opacity-0 max-h-0 pointer-events-none"
        }`}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
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
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onToggle}
      className="gap-1 px-2 py-1 h-7 text-xs text-muted-foreground hover:text-foreground"
    >
      {isExpanded ? (
        <>Hide <ChevronUp className="h-3.5 w-3.5" /></>
      ) : (
        <>Details <ChevronDown className="h-3.5 w-3.5" /></>
      )}
    </Button>
  );
});

function ScorePill({
  awarded,
  max,
}: {
  awarded: number;
  max: number;
}) {
  const isCorrect = awarded >= max;
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold px-2.5 py-1 rounded-full text-xs ${isCorrect
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
          : "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
        }`}
    >
      {isCorrect ? (
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
      ) : (
        <XCircle className="w-3.5 h-3.5 shrink-0" />
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
  item: { kind: "mc" } & McHistoryEntry;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const awarded = item.awardedMarks ?? (item.correct ? 1 : 0);
  const max = item.maxMarks ?? 1;

  return (
    <Card className="overflow-hidden border shadow-sm">
      <CardHeader className="px-4 border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-sm truncate">{item.question.topic}</span>
              <Badge
                variant="secondary"
                className="shrink-0 text-xs bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
              >
                <Target className="w-3 h-3 mr-1" />
                Multiple Choice
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{item.question.subtopic}</p>
            <p className="text-xs text-muted-foreground/60">{formatDate(item.createdAt)}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <ScorePill awarded={awarded} max={max} />
            {/* --- #5: Per-entry delete --- */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              title="Remove entry"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Selected <strong className="text-foreground">{item.selectedAnswer}</strong>
            {" · "}Correct <strong className="text-foreground">{item.question.correctAnswer}</strong>
            {" · "}{item.question.options.length} options
          </span>
          <ToggleButton isExpanded={isExpanded} onToggle={onToggle} />
        </div>

        <ExpandableCardSection isExpanded={isExpanded}>
          <div className="space-y-4 pt-1">
            <div className="bg-muted/50 px-4 py-3 rounded-md text-sm">
              <MarkdownMath content={item.question.promptMarkdown} />
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {item.question.options.map((opt) => {
                const isChosen = item.selectedAnswer === opt.label;
                const isCorrect = opt.label === item.question.correctAnswer;
                const base = "px-3 py-2.5 rounded-lg border flex gap-2 items-start text-sm";
                const variant = isCorrect
                  ? " border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
                  : isChosen
                    ? " border-red-500 bg-red-50 dark:bg-red-950/40"
                    : "";
                return (
                  <div key={opt.label} className={base + variant}>
                    <span className="font-bold shrink-0 text-muted-foreground">{opt.label}.</span>
                    <MarkdownMath content={opt.text} />
                  </div>
                );
              })}
            </div>
            <Separator />
            <div>
              <SectionLabel>Explanation</SectionLabel>
              <MarkdownMath content={item.question.explanationMarkdown} />
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
  item: { kind: "written" } & QuestionHistoryEntry;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const score = item.markResponse.scoreOutOf10;
  const colorClass = scoreColor(score, 10);

  return (
    <Card className="overflow-hidden border shadow-sm">
      <CardHeader className="px-4 border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-sm truncate">{item.question.topic}</span>
              <Badge
                variant="secondary"
                className="shrink-0 text-xs bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
              >
                <BookOpen className="w-3 h-3 mr-1" />
                Written
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{item.question.subtopic}</p>
            <p className="text-xs text-muted-foreground/60">{formatDate(item.createdAt)}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`inline-block font-semibold px-2.5 py-1 rounded-full text-xs ${colorClass}`}>
              {score}/10
            </span>
            {/* --- #5: Per-entry delete --- */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              title="Remove entry"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            {item.uploadedAnswerImage ? (
              <><ImageIcon className="h-3 w-3" /> Image answer</>
            ) : (
              <><FileText className="h-3 w-3" /> Text answer</>
            )}
            {" · "}{item.markResponse.vcaaMarkingScheme.length} criteria
          </span>
          <ToggleButton isExpanded={isExpanded} onToggle={onToggle} />
        </div>

        <ExpandableCardSection isExpanded={isExpanded}>
          <div className="space-y-4 pt-1">
            <div className="bg-muted/50 px-4 py-3 rounded-md text-sm">
              <MarkdownMath content={item.question.promptMarkdown} />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <SectionLabel>Your Answer</SectionLabel>
                {item.uploadedAnswerImage ? (
                  <img
                    src={item.uploadedAnswerImage.dataUrl}
                    alt="Uploaded Answer"
                    loading="lazy"
                    decoding="async"
                    className="rounded-md border max-w-full h-auto"
                  />
                ) : (
                  <div className="whitespace-pre-wrap text-sm">
                    {item.uploadedAnswer || (
                      <span className="italic opacity-50">No text answer provided</span>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <SectionLabel>Feedback</SectionLabel>
                <MarkdownMath content={item.markResponse.feedbackMarkdown} />
              </div>
            </div>

            <Separator />

            <div>
              <SectionLabel>Breakdown</SectionLabel>
              <div className="space-y-2">
                {item.markResponse.vcaaMarkingScheme.map((criterion, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col sm:flex-row gap-2 justify-between border-b pb-2 last:border-0 last:pb-0"
                  >
                    <div className="flex-1 space-y-2">
                      <MarkdownMath content={criterion.criterion} />
                      {criterion.rationale.trim().length > 0 && (
                        <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Rationale
                          </p>
                          <MarkdownMath content={criterion.rationale} />
                        </div>
                      )}
                    </div>
                    <span className="font-semibold text-sm whitespace-nowrap tabular-nums">
                      {criterion.achievedMarks}/{criterion.maxMarks}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ExpandableCardSection>
      </CardContent>
    </Card>
  );
});

// ---------------------------------------------------------------------------
// HistoryEntryCard — dispatcher
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
  if (item.kind === "mc") {
    return <McEntryCard item={item} isExpanded={isExpanded} onToggle={onToggle} onDelete={onDelete} />;
  }
  return <WrittenEntryCard item={item} isExpanded={isExpanded} onToggle={onToggle} onDelete={onDelete} />;
});

// ---------------------------------------------------------------------------
// HistoryView
// ---------------------------------------------------------------------------

export function HistoryView() {
  const navigate = useNavigate();
  const { questionHistory, setQuestionHistory } = useWrittenSession();
  const { mcHistory, setMcHistory } = useMultipleChoiceSession();

  const combined = useMemo<AnyEntry[]>(() => {
    const written = questionHistory.map((e) => ({ kind: "written" as const, ...e }));
    const mc = mcHistory.map((e) => ({ kind: "mc" as const, ...e }));
    return [...written, ...mc].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [questionHistory, mcHistory]);

  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  // --- #6: Mode filter for history ---
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");
  const [expandedEntryKeys, setExpandedEntryKeys] = useState<Set<string>>(() => new Set());

  // --- #5: Per-entry delete state ---
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState<AnyEntry | null>(null);

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

  const activeSubject = subjectFilter && subjectCounts.has(subjectFilter) ? subjectFilter : null;

  // --- #6: Apply mode filter in addition to topic filter ---
  const visibleHistory = useMemo(
    () =>
      combined.filter((e) => {
        if (activeSubject && e.question.topic !== activeSubject) return false;
        if (modeFilter === "written" && e.kind !== "written") return false;
        if (modeFilter === "mc" && e.kind !== "mc") return false;
        return true;
      }),
    [combined, activeSubject, modeFilter]
  );

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);

  const viewportRef = useRef<HTMLDivElement | null>(null);

  const listVirtualizer = useVirtualizer({
    count: visibleHistory.length,
    getItemKey: (index) => {
      const entry = visibleHistory[index];
      return entry ? `${entry.kind}-${entry.id}` : index;
    },
    getScrollElement: () => viewportRef.current,
    estimateSize: () => 140,
    overscan: 3,
  });

  const virtualItems = listVirtualizer.getVirtualItems();
  const totalVirtualHeight = listVirtualizer.getTotalSize() + 32;

  useEffect(() => {
    listVirtualizer.measure();
  }, [listVirtualizer, visibleHistory.length, activeSubject, modeFilter]);

  const handleSubjectBadgeClick = useCallback((subject: string | null) => {
    setSubjectFilter((cur) => (cur === subject ? null : subject));
  }, []);

  const toggleEntryExpanded = useCallback((entryKey: string) => {
    setExpandedEntryKeys((cur) => {
      const next = new Set(cur);
      next.has(entryKey) ? next.delete(entryKey) : next.add(entryKey);
      return next;
    });
    // --- #7: Re-measure after expansion so virtualizer height is correct ---
    requestAnimationFrame(() => {
      listVirtualizer.measure();
    });
  }, [listVirtualizer]);

  const toggleCallbacks = useMemo(() => {
    const map = new Map<string, () => void>();
    for (const item of visibleHistory) {
      const key = `${item.kind}-${item.id}`;
      map.set(key, () => toggleEntryExpanded(key));
    }
    return map;
  }, [visibleHistory, toggleEntryExpanded]);

  // --- #5: Per-entry delete callbacks ---
  const deleteCallbacks = useMemo(() => {
    const map = new Map<string, () => void>();
    for (const item of visibleHistory) {
      const key = `${item.kind}-${item.id}`;
      map.set(key, () => {
        setPendingDeleteEntry(item);
        setDeleteConfirmOpen(true);
      });
    }
    return map;
  }, [visibleHistory]);

  function performSingleDeleteConfirmed() {
    if (!pendingDeleteEntry) return;
    if (pendingDeleteEntry.kind === "written") {
      setQuestionHistory((prev: QuestionHistoryEntry[]) =>
        prev.filter((e) => e.id !== pendingDeleteEntry.id)
      );
    } else {
      setMcHistory((prev: McHistoryEntry[]) =>
        prev.filter((e) => e.id !== pendingDeleteEntry.id)
      );
    }
    setExpandedEntryKeys((cur) => {
      const next = new Set(cur);
      next.delete(`${pendingDeleteEntry.kind}-${pendingDeleteEntry.id}`);
      return next;
    });
    setPendingDeleteEntry(null);
    setDeleteConfirmOpen(false);
  }

  function handleClear() {
    const total = questionHistory.length + mcHistory.length;
    setConfirmOpen(true);
    setConfirmMessage(`Clear all ${total} history entries? Saved sets will be kept.`);
  }

  function performClearConfirmed() {
    setQuestionHistory([]);
    setMcHistory([]);
    setSubjectFilter(null);
    setModeFilter("all");
    setExpandedEntryKeys(new Set());
    setConfirmOpen(false);
    setConfirmMessage(null);
  }

  if (combined.length === 0) {
    return (
      <EmptyState
        title="No History Yet"
        description="Complete a question to see it here."
        // --- #13: CTA ---
        actions={
          <Button variant="default" size="sm" className="gap-2 mt-2" onClick={() => navigate("/")}>
            <PlusCircle className="h-4 w-4" />
            Generate your first set
          </Button>
        }
      />
    );
  }

  return (
    <div className="px-4 py-4 min-w-full mx-auto h-full flex flex-col gap-4">
      {/* Page header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">History</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {combined.length} question{combined.length !== 1 ? "s" : ""} answered
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4" />
          Clear All
        </Button>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Clear History"
        description={confirmMessage ?? undefined}
        confirmText="Clear"
        cancelText="Cancel"
        onConfirm={performClearConfirmed}
        onCancel={() => { setConfirmOpen(false); setConfirmMessage(null); }}
      />

      {/* --- #5: Single-entry delete confirm --- */}
      <ConfirmModal
        open={deleteConfirmOpen}
        title="Remove entry"
        description={
          pendingDeleteEntry
            ? `Remove this ${pendingDeleteEntry.kind === "written" ? "written" : "multiple-choice"} entry for "${pendingDeleteEntry.question.topic}"? This cannot be undone.`
            : undefined
        }
        confirmText="Remove"
        cancelText="Cancel"
        onConfirm={performSingleDeleteConfirmed}
        onCancel={() => { setDeleteConfirmOpen(false); setPendingDeleteEntry(null); }}
      />

      {/* --- #6: Mode filter + topic filter chips --- */}
      <div className="flex flex-col gap-2">
        {/* Mode toggle */}
        <div className="flex items-center gap-1 rounded-md border bg-muted/30 p-0.5 self-start">
          {(["all", "written", "mc"] as ModeFilter[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setModeFilter(mode)}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                modeFilter === mode
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {mode === "all" ? "All modes" : mode === "written" ? "Written" : "Multiple Choice"}
            </button>
          ))}
        </div>

        {/* Topic filter chips */}
        <div className="flex flex-wrap gap-1.5">
          <Badge
            asChild
            variant={activeSubject === null ? "secondary" : "outline"}
            className="cursor-pointer select-none text-xs px-2.5 py-0.5"
          >
            <button type="button" aria-pressed={activeSubject === null} onClick={() => handleSubjectBadgeClick(null)}>
              All topics ({combined.length})
            </button>
          </Badge>
          {orderedSubjects.map((subject) => (
            <Badge
              key={subject}
              asChild
              variant={activeSubject === subject ? "secondary" : "outline"}
              className="cursor-pointer select-none text-xs px-2.5 py-0.5"
            >
              <button
                type="button"
                aria-pressed={activeSubject === subject}
                onClick={() => handleSubjectBadgeClick(subject)}
              >
                {subject} ({subjectCounts.get(subject) ?? 0})
              </button>
            </Badge>
          ))}
        </div>
      </div>

      {visibleHistory.length === 0 && (
        <p className="text-sm text-muted-foreground px-1">No entries match the selected filters.</p>
      )}

      {/* Virtualised list */}
      <ScrollArea viewportRef={viewportRef} className="flex-1 pr-1">
        <div className="relative w-full" style={{ height: totalVirtualHeight }}>
          {virtualItems.map((virtualRow) => {
            const item = visibleHistory[virtualRow.index];
            if (!item) return null;
            const entryKey = `${item.kind}-${item.id}`;
            return (
              <div
                key={entryKey}
                data-index={virtualRow.index}
                ref={listVirtualizer.measureElement}
                className="pb-3"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <HistoryEntryCard
                  item={item}
                  isExpanded={expandedEntryKeys.has(entryKey)}
                  onToggle={toggleCallbacks.get(entryKey)!}
                  onDelete={deleteCallbacks.get(entryKey)!}
                />
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
