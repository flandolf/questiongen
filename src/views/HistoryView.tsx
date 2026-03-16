import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMultipleChoiceSession, useWrittenSession } from "../AppContext";
import { Button } from "../components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { MarkdownMath } from "../components/MarkdownMath";
import { confirmAction, formatDate } from "../lib/app-utils";
import { ScrollArea } from "../components/ui/scroll-area";
import { Separator } from "../components/ui/separator";
import { Badge } from "../components/ui/badge";
import { CheckCircle2, ChevronDown, ChevronUp, XCircle } from "lucide-react";
import { McHistoryEntry, QuestionHistoryEntry, Topic, TOPICS } from "../types";
import { EmptyState } from "../components/EmptyState";
import { Label } from "@/components/ui/label";

type AnyEntry = ({ kind: "written" } & QuestionHistoryEntry) | ({ kind: "mc" } & McHistoryEntry);

function ExpandableCardSection({
  isExpanded,
  children,
}: {
  isExpanded: boolean;
  children: React.ReactNode;
}) {
  const ANIMATION_MS = 300;
  const [isMounted, setIsMounted] = useState(isExpanded);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let frameId = 0;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (isExpanded) {
      setIsMounted(true);
      frameId = requestAnimationFrame(() => {
        setIsVisible(true);
      });
    } else {
      setIsVisible(false);
      timeoutId = setTimeout(() => {
        setIsMounted(false);
      }, ANIMATION_MS);
    }

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isExpanded]);

  if (!isMounted) {
    return null;
  }

  return (
    <div
      className={`grid overflow-hidden transition-[grid-template-rows,opacity,transform] duration-300 ease-out will-change-[transform,opacity] ${isVisible
          ? "grid-rows-[1fr] opacity-100 translate-y-0"
          : "grid-rows-[0fr] opacity-0 -translate-y-2 pointer-events-none"
        }`}
      aria-hidden={!isVisible}
    >
      <div className="min-h-0 overflow-hidden pt-1">{children}</div>
    </div>
  );
}

const HistoryEntryCard = memo(function HistoryEntryCard({
  item,
  isExpanded,
  onToggle,
}: {
  item: AnyEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {

  if (item.kind === "mc") {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0.5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle>{item.question.topic}</CardTitle>
              <Badge variant="secondary">Multiple Choice</Badge>
            </div>
            <Label>{item.question.subtopic}</Label>
            <p className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</p>
          </div>
          <div>
            {(item.awardedMarks ?? (item.correct ? 1 : 0)) >= (item.maxMarks ?? 1)
              ? <span className="inline-flex items-center gap-1.5 bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300 font-medium px-2.5 py-1 rounded-full text-sm"><CheckCircle2 className="w-3.5 h-3.5" /> {(item.awardedMarks ?? (item.correct ? 1 : 0)).toFixed(0)}/{item.maxMarks ?? 1}</span>
              : <span className="inline-flex items-center gap-1.5 bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 font-medium px-2.5 py-1 rounded-full text-sm"><XCircle className="w-3.5 h-3.5" /> {(item.awardedMarks ?? (item.correct ? 1 : 0)).toFixed(0)}/{item.maxMarks ?? 1}</span>}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <p>
              Selected {item.selectedAnswer}. Correct {item.question.correctAnswer}. {item.question.options.length} options.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={onToggle}>
              {isExpanded ? "Hide details" : "Show details"}
              {isExpanded ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
            </Button>
          </div>
          <ExpandableCardSection isExpanded={isExpanded}>
            <div className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-md">
                <MarkdownMath content={item.question.promptMarkdown} />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {item.question.options.map((opt) => {
                  const isChosen = item.selectedAnswer === opt.label;
                  const isCorrect = opt.label === item.question.correctAnswer;
                  let cls = "p-3 rounded-lg border flex gap-2 items-center text-sm";
                  if (isCorrect) cls += " border-green-500 bg-green-50 dark:bg-green-950/40";
                  else if (isChosen) cls += " border-red-500 bg-red-50 dark:bg-red-950/40";
                  return (
                    <div key={opt.label} className={cls}>
                      <span className="font-bold shrink-0">{opt.label}.</span>
                      <MarkdownMath content={opt.text} />
                    </div>
                  );
                })}
              </div>
              <Separator />
              <div>
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-2">Explanation</h3>
                <MarkdownMath content={item.question.explanationMarkdown} />
              </div>
            </div>
          </ExpandableCardSection>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0.5">
        <div className="space-y-1">
          <CardTitle>{item.question.topic}</CardTitle>
          <Label>{item.question.subtopic}</Label>
          <p className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</p>
        </div>
        <div className="text-right">
          <span className="inline-block bg-primary/10 text-primary font-medium px-2.5 py-1 rounded-full text-sm">
            {item.markResponse.scoreOutOf10}/10
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <p>
            {item.markResponse.vcaaMarkingScheme.length} criteria marked.
            {item.uploadedAnswerImage ? " Includes uploaded image answer." : " Text answer recorded."}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onToggle}>
            {isExpanded ? "Hide details" : "Show details"}
            {isExpanded ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
          </Button>
        </div>
        <ExpandableCardSection isExpanded={isExpanded}>
          <div className="space-y-4">
            <div className="bg-muted/50 p-4 rounded-md">
              <MarkdownMath content={item.question.promptMarkdown} />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Your Answer</h3>
                {item.uploadedAnswerImage ? (
                  <img src={item.uploadedAnswerImage.dataUrl} alt="Uploaded Answer" loading="lazy" decoding="async" className="rounded-md border max-w-full h-auto" />
                ) : (
                  <div className="whitespace-pre-wrap">{item.uploadedAnswer || <span className="italic opacity-50">No text answer provided</span>}</div>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Feedback</h3>
                <MarkdownMath content={item.markResponse.feedbackMarkdown} />
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-2">Breakdown</h3>
              <div className="space-y-2">
                {item.markResponse.vcaaMarkingScheme.map((criterion, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row gap-2 justify-between border-b pb-2 last:border-0 last:pb-0">
                    <div className="flex-1 space-y-2">
                      <MarkdownMath content={criterion.criterion} />
                      {criterion.rationale.trim().length > 0 && (
                        <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Rationale</p>
                          <MarkdownMath content={criterion.rationale} />
                        </div>
                      )}
                    </div>
                    <span className="font-medium whitespace-nowrap">
                      {criterion.achievedMarks} / {criterion.maxMarks}
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

export function HistoryView() {
  const { questionHistory, setQuestionHistory } = useWrittenSession();
  const { mcHistory, setMcHistory } = useMultipleChoiceSession();

  const combined = useMemo<AnyEntry[]>(() => {
    const written = questionHistory.map((e) => ({ kind: "written" as const, ...e }));
    const mc = mcHistory.map((e) => ({ kind: "mc" as const, ...e }));
    return [...written, ...mc].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [questionHistory, mcHistory]);

  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [expandedEntryKey, setExpandedEntryKey] = useState<string | null>(null);

  const subjectCounts = useMemo(() => {
    const counts = new Map<string, number>();
    combined.forEach((entry) => {
      const topic = entry.question.topic;
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    });
    return counts;
  }, [combined]);

  const orderedSubjects = useMemo(() => {
    const primary = TOPICS.filter((topic) => subjectCounts.has(topic));
    const extras = Array.from(subjectCounts.keys()).filter((topic) => !TOPICS.includes(topic as Topic));
    extras.sort((a, b) => a.localeCompare(b));
    return [...primary, ...extras];
  }, [subjectCounts]);

  const activeSubject = subjectFilter && subjectCounts.has(subjectFilter) ? subjectFilter : null;
  const visibleHistory = activeSubject ? combined.filter((entry) => entry.question.topic === activeSubject) : combined;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const listVirtualizer = useVirtualizer({
    count: visibleHistory.length,
    getItemKey: (index) => {
      const entry = visibleHistory[index];
      return entry ? `${entry.kind}-${entry.id}` : index;
    },
    getScrollElement: () => viewportRef.current,
    estimateSize: () => 148,
    overscan: 2,
  });
  const virtualItems = listVirtualizer.getVirtualItems();
  const extraBottomPadding = 32;
  const totalVirtualHeight = Math.max(listVirtualizer.getTotalSize(), 0) + extraBottomPadding;

  function handleSubjectBadgeClick(subject: string | null) {
    setSubjectFilter((current) => (current === subject ? null : subject));
  }

  const toggleEntryExpanded = useCallback((entryKey: string) => {
    setExpandedEntryKey((current) => (current === entryKey ? null : entryKey));
    requestAnimationFrame(() => {
      listVirtualizer.measure();
    });
    setTimeout(() => {
      listVirtualizer.measure();
    }, 320);
  }, [listVirtualizer]);

  useEffect(() => {
    listVirtualizer.measure();
  }, [listVirtualizer, visibleHistory.length, activeSubject]);

  function handleClear() {
    const totalCount = questionHistory.length + mcHistory.length;
    if (confirmAction(`Clear ${totalCount} history entries? Saved sets will be kept.`)) {
      setQuestionHistory([]);
      setMcHistory([]);
      setSubjectFilter(null);
      setExpandedEntryKey(null);
    }
  }

  if (combined.length === 0) {
    return (
      <EmptyState
        title="No History Yet"
        description="Complete a question to see it here."
      />
    );
  }

  return (
    <div className="p-4.5 min-w-full mx-auto h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">History</h1>
          <p className="text-muted-foreground mt-2">Past questions and your marks.</p>
        </div>
        <Button variant="destructive" onClick={handleClear}>Clear History</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge
          asChild
          variant={activeSubject === null ? "secondary" : "outline"}
          className="cursor-pointer select-none"
        >
          <button
            type="button"
            aria-pressed={activeSubject === null}
            onClick={() => handleSubjectBadgeClick(null)}
          >
            All ({combined.length})
          </button>
        </Badge>
        {orderedSubjects.map((subject) => (
          <Badge
            key={subject}
            asChild
            variant={activeSubject === subject ? "secondary" : "outline"}
            className="cursor-pointer select-none"
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

      <ScrollArea viewportRef={viewportRef} className="flex-1 pr-1">
        <div className="relative w-full" style={{ height: totalVirtualHeight }}>
          {virtualItems.map((virtualRow) => {
            const item = visibleHistory[virtualRow.index];
            if (!item) {
              return null;
            }
            const entryKey = `${item.kind}-${item.id}`;
            return (
              <div
                key={entryKey}
                data-index={virtualRow.index}
                ref={listVirtualizer.measureElement}
                className="pb-6"
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
                  isExpanded={expandedEntryKey === entryKey}
                  onToggle={() => toggleEntryExpanded(entryKey)}
                />
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
