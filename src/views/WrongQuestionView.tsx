import { useState, useMemo, useCallback, useEffect, useRef, memo } from "react";
import { useVirtualizer } from '@tanstack/react-virtual';
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store";
import { McHistoryEntry, QuestionHistoryEntry, SpacedRepetitionCard, Difficulty } from "../types";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { MarkdownMath } from "../components/MarkdownMath";
import {
    UnifiedMcqOptionsGrid,
} from "../components/question/UnifiedQuestionBlocks";
import { normalizeMarkResponse } from "../lib/app-utils";
import { isDue, daysUntilReview } from "../lib/spaced-repetition";
import {
    ChevronDown, ChevronUp, Shuffle, BookOpen, Target,
    RotateCcw, Trophy, Trash2, Brain,
} from "lucide-react";
import { PageContainer, PageHeader, Toolbar, FilterGroup, FilterButton } from "@/components/layout/primitives";
import { WrittenSessionHeader } from "@/components/generator/WrittenSessionHeader";
import { McSessionHeader } from "@/components/generator/McSessionHeader";
import { WrittenQuestionCard } from "@/components/generator/WrittenQuestionCard";
import { WrittenAnswerCard } from "@/components/generator/WrittenAnswerCard";
import { WrittenFeedbackPanel } from "@/components/generator/WrittenFeedbackPanel";
import { McQuestionCard } from "@/components/generator/McQuestionCard";
import { McAnswerPanel } from "@/components/generator/McAnswerPanel";

// --- Generator parity reattempt view (restored full UI) ---
import type { MarkAnswerResponse } from "../types";
// ─── Types ────────────────────────────────────────────────────────────────────

type WrittenWrongEntry = QuestionHistoryEntry & { kind: "written" };
type McWrongEntry = McHistoryEntry & { kind: "multiple-choice" };
type WrongEntry = WrittenWrongEntry | McWrongEntry;
type ViewMode = "list" | "reattempt" | "summary";
type ReattemptResult = { id: string; correct: boolean };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffleArray<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function scoreBg(pct: number) {
    if (pct >= 0.75) return "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400";
    if (pct >= 0.5) return "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400";
    return "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400";
}

function criterionScoreClass(pct: number) {
    if (pct >= 1) return "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300";
    if (pct >= 0.5) return "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300";
    return "bg-rose-100/70 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400";
}

// ─── Convert file to base64 data URL ─────────────────────────────────────────

function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                <Trophy className="w-8 h-8 text-emerald-500" />
            </div>
            <div>
                <h3 className="text-lg font-bold mb-1">No wrong answers yet</h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                    Complete some questions and any incorrect answers will appear here for review.
                </p>
            </div>
        </div>
    );
}

// ─── List entry card ──────────────────────────────────────────────────────────

const ListEntryCard = memo(function ListEntryCard({
    entry, index, isExpanded, onToggle, onDelete, onReattempt, srCard,
}: {
    entry: WrongEntry; index: number; isExpanded: boolean; onToggle: () => void; onDelete: () => void; onReattempt: () => void;
    srCard?: SpacedRepetitionCard;
}) {
    const isWritten = entry.kind === "written";
    let scoreLabel = "";
    let pct = 0;
    if (isWritten) {
        const w = entry as WrittenWrongEntry;
        pct = w.markResponse.maxMarks > 0 ? w.markResponse.achievedMarks / w.markResponse.maxMarks : 0;
        scoreLabel = `${w.markResponse.achievedMarks}/${w.markResponse.maxMarks}`;
    }

    return (
        <div className="rounded-lg border border-border/50 overflow-hidden transition-shadow hover:shadow-md bg-muted/30">
            <div className="flex items-stretch">
                <button
                    type="button"
                    className="flex-1 text-left px-3.5 py-3 flex items-start gap-3 group min-w-0"
                    onClick={onToggle}
                >
                    <span className="shrink-0 w-5 h-5 mt-0.5 rounded-md bg-muted/60 flex items-center justify-center text-[10px] font-bold text-muted-foreground tabular-nums">
                        {index + 1}
                    </span>
                    <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1">
                            <Badge variant="outline" className={`text-[10px] font-semibold px-1.5 py-0 gap-0.5 ${isWritten ? "border-sky-400/40 text-sky-600 dark:text-sky-400" : "border-violet-400/40 text-violet-600 dark:text-violet-400"}`}>
                                {isWritten ? <BookOpen className="w-2.5 h-2.5" /> : <Target className="w-2.5 h-2.5" />}
                                {isWritten ? "Written" : "MC"}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-medium text-muted-foreground">
                                {entry.question.topic}
                            </Badge>
                            {entry.question.subtopic && (
                                <span className="text-[10px] text-muted-foreground/50 truncate max-w-[8rem]">{entry.question.subtopic}</span>
                            )}
                        </div>
                        <div className="py-3 overflow-hidden relative">
                            <div className="text-sm leading-relaxed text-foreground prose prose-sm dark:prose-invert max-w-none">
                                <MarkdownMath content={entry.question.promptMarkdown} />
                            </div>
                            <div className="absolute bottom-0 inset-x-0 h-5 bg-linear-to-t pointer-events-none" />
                        </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5 ml-1 pt-0.5">
                        {srCard && (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${daysUntilReview(srCard) < 0 ? "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400" :
                                daysUntilReview(srCard) === 0 ? "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400" :
                                    "bg-sky-500/10 border-sky-500/20 text-sky-600 dark:text-sky-400"
                                }`}>
                                {daysUntilReview(srCard) < 0 ? `${Math.abs(daysUntilReview(srCard))}d overdue` :
                                    daysUntilReview(srCard) === 0 ? "Due" :
                                        `${daysUntilReview(srCard)}d`}
                            </span>
                        )}
                        {isWritten && scoreLabel && (
                            <span className={`text-xs font-bold tabular-nums px-2 py-0.5 rounded-full border ${scoreBg(pct)}`}>{scoreLabel}</span>
                        )}
                        {!isWritten && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400">✗</span>
                        )}
                        <div className="text-muted-foreground group-hover:text-foreground transition-colors">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                    </div>
                </button>
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="shrink-0 flex items-center justify-center w-8 border-l border-border/30 text-muted-foreground/40 hover:text-rose-500 hover:bg-rose-500/5 transition-colors"
                    aria-label="Delete entry"
                    title="Remove from wrong answers"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>
            {isExpanded && (
                <div className="border-t border-border/40 px-4 py-4 animate-in fade-in slide-in-from-top-1 duration-200">
                    {isWritten ? <WrittenExpandedBody entry={entry as WrittenWrongEntry} /> : <McExpandedBody entry={entry as McWrongEntry} />}
                    <div className="flex justify-end mt-3">
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={onReattempt}>
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reattempt this question
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
});
export function VirtualizedWrongList({
    entries,
    expandedIds,
    onToggle,
    onDelete,
    onReattempt,
    spacedRepetitionCards,
}: {
    entries: any[];
    expandedIds: Set<string>;
    onToggle: (id: string) => void;
    onDelete: (entry: any) => void;
    onReattempt: (entry: any) => void;
    spacedRepetitionCards: Record<string, any>;
}) {
    const parentRef = useRef<HTMLDivElement>(null);
    const rowVirtualizer = useVirtualizer({
        count: entries.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 120,
        measureElement: (el) => el.getBoundingClientRect().height,
    });

    return (
        <div ref={parentRef} style={{ height: "100vh", overflow: "auto" }}>
            <div
                style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    width: "100%",
                    position: "relative",
                }}
            >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const entry = entries[virtualRow.index];
                    return (
                        <div
                            key={entry.id}
                            data-index={virtualRow.index}
                            ref={rowVirtualizer.measureElement}
                            style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",
                                transform: `translateY(${virtualRow.start}px)`,
                                paddingBottom: 16,
                            }}
                        >
                            <ListEntryCard
                                entry={entry}
                                index={virtualRow.index}
                                isExpanded={expandedIds.has(entry.id)}
                                onToggle={() => onToggle(entry.id)}
                                onDelete={() => onDelete(entry)}
                                onReattempt={() => onReattempt(entry)}
                                srCard={spacedRepetitionCards[entry.id]}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── List view: expanded bodies ───────────────────────────────────────────────

function WrittenExpandedBody({ entry }: { entry: WrittenWrongEntry }) {
    return (
        <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">Your answer</p>
                    <div className="rounded-lg border border-border/40 bg-muted/20 px-3.5 py-3 text-sm whitespace-pre-line leading-relaxed h-full min-h-[5rem]">
                        {entry.uploadedAnswer?.trim() || <span className="italic text-muted-foreground/50">No text answer</span>}
                    </div>
                </div>
                <div className="space-y-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">Worked solution</p>
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-3 text-sm prose prose-sm dark:prose-invert max-w-none h-full min-h-[5rem]">
                        <MarkdownMath content={entry.workedSolutionMarkdown || "No worked solution available."} />
                    </div>
                </div>
            </div>
            <div className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">Feedback</p>
                <div className="rounded-lg border border-border/40 bg-muted/10 px-3.5 py-3 text-sm prose prose-sm dark:prose-invert max-w-none">
                    <MarkdownMath content={entry.markResponse.feedbackMarkdown || "No feedback available."} />
                </div>
            </div>
            {entry.markResponse.vcaaMarkingScheme?.length > 0 && (
                <div className="space-y-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">Marking scheme</p>
                    <div className="divide-y divide-border/30 rounded-lg border border-border/40 overflow-hidden">
                        {entry.markResponse.vcaaMarkingScheme.map((c, i) => {
                            const p = c.maxMarks > 0 ? c.achievedMarks / c.maxMarks : 0;
                            return (
                                <div key={i} className={`flex items-start gap-3 px-3.5 py-2.5 text-sm ${p >= 1 ? "bg-emerald-500/5" : "bg-rose-500/5"}`}>
                                    <span className={`shrink-0 font-bold text-xs mt-0.5 px-1.5 py-0.5 rounded-md ${criterionScoreClass(p)}`}>
                                        {c.achievedMarks}/{c.maxMarks}
                                    </span>
                                    <span className="text-foreground/80 leading-snug"><MarkdownMath content={c.criterion} /></span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

function McExpandedBody({ entry }: { entry: McWrongEntry }) {
    return (
        <div className="space-y-4">
            <UnifiedMcqOptionsGrid
                options={entry.question.options}
                selectedAnswer={entry.selectedAnswer}
                correctAnswer={entry.question.correctAnswer}
                answered
                revealCorrectness
                onSelect={undefined}
            />
            <div className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">Explanation</p>
                <div className="rounded-lg border border-border/40 bg-muted/10 px-3.5 py-3 text-sm prose prose-sm dark:prose-invert max-w-none">
                    <MarkdownMath content={entry.question.explanationMarkdown} />
                </div>
            </div>
        </div>
    );
}


// ─── Reattempt view ───────────────────────────────────────────────────────────

interface ReattemptViewProps {
    questions: WrongEntry[];
    apiKey: string;
    model: string;
    onExit: (results: ReattemptResult[]) => void;
    onDelete: (entry: WrongEntry) => void;
    onMarkCorrect: (entry: WrongEntry) => void;
}
function ReattemptView({ questions, apiKey, model, onExit, onDelete, onMarkCorrect }: ReattemptViewProps) {
    const [idx, setIdx] = useState<number>(0);
    const [results, setResults] = useState<ReattemptResult[]>([]);
    const entry = questions[idx];
    const isWritten = entry.kind === "written";
    const writtenEntry = isWritten ? entry : null;
    const isLast = idx === questions.length - 1;
    const completedCount = results.filter((r) => r.correct).length;
    // Timer: mimic generator (no persistence, just elapsed in-session)
    const [startedAt] = useState(() => Date.now());
    const [now, setNow] = useState(Date.now());
    // Tick timer
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);
    const elapsedSeconds = Math.floor((now - startedAt) / 1000);
    const formattedElapsedTime = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`;

    // --- Written state ---
    const [writtenAnswer, setWrittenAnswer] = useState<string>("");
    const [image, setImage] = useState<{ name: string; dataUrl: string } | undefined>(undefined);
    const [isMarking, setIsMarking] = useState<boolean>(false);
    const [feedback, setFeedback] = useState<MarkAnswerResponse | null>(null);
    // Local state for interactive rubric (marking scheme)
    const [markingScheme, setMarkingScheme] = useState<MarkAnswerResponse["vcaaMarkingScheme"] | null>(null);
    const [appealText, setAppealText] = useState<string>("");
    const [overrideInput, setOverrideInput] = useState<string>("");

    // --- MC state ---
    const [selectedAnswer, setSelectedAnswer] = useState<string>("");
    const [awardedMarks, setAwardedMarks] = useState<number | undefined>(undefined);
    const [mcAppealText, setMcAppealText] = useState<string>("");
    const [mcOverrideInput, setMcOverrideInput] = useState<string>("");

    // --- Navigation logic ---
    const handlePrev = () => setIdx((i) => Math.max(0, i - 1));
    const handleExit = () => onExit(results);
    const handleDeleteCurrent = () => { onDelete(entry); handleNext(null); };

    // --- Determine correctness for current question ---
    const getCurrentResult = (): ReattemptResult => {
        if (isWritten) {
            // For written, use feedback (after marking or override)
            if (!feedback) return { id: entry.id, correct: false };
            const max = feedback.maxMarks ?? writtenEntry?.question.maxMarks ?? 0;
            return {
                id: entry.id,
                correct: max > 0 ? feedback.achievedMarks >= max : false,
            };
        } else {
            // For MC, use awardedMarks or selectedAnswer
            const correctAnswer = (entry as McWrongEntry).question.correctAnswer;
            return {
                id: entry.id,
                correct: selectedAnswer === correctAnswer,
            };
        }
    };

    // --- Marking logic (written) ---
    const doMark = async () => {
        if (!writtenEntry) return;
        setIsMarking(true);
        try {
            const raw = await invoke("mark_answer", {
                request: {
                    question: writtenEntry.question,
                    studentAnswer: writtenAnswer,
                    studentAnswerImageDataUrl: image?.dataUrl,
                    model,
                    apiKey,
                },
            });
            const resp = normalizeMarkResponse(raw, writtenEntry.question.maxMarks);
            setFeedback(resp);
            setOverrideInput(String(resp.achievedMarks));
            setMarkingScheme(resp.vcaaMarkingScheme ? [...resp.vcaaMarkingScheme] : null);
        } catch (err) {
            // Optionally show error
        } finally {
            setIsMarking(false);
        }
    };
    const handleApplyOverride = () => {
        if (!feedback) return;
        const marks = Number(overrideInput);
        setFeedback({ ...feedback, achievedMarks: marks });
    };

    // --- Interactive rubric logic ---
    const handleCriterionChange = (idx: number, achievedMarks: number, rationale: string) => {
        if (!feedback || !markingScheme) return;
        const updated = markingScheme.map((c, i) => i === idx ? { ...c, achievedMarks, rationale } : c);
        setMarkingScheme(updated);
        // Optionally update achievedMarks in feedback as sum of all achievedMarks
        const totalAchieved = updated.reduce((sum, c) => sum + (c.achievedMarks || 0), 0);
        setFeedback({ ...feedback, achievedMarks: totalAchieved, vcaaMarkingScheme: updated });
        setOverrideInput(String(totalAchieved));
    };

    // --- MC logic ---
    const handleSelectAnswer = (label: string) => {
        setSelectedAnswer(label);
        const correct = label === (entry as McWrongEntry).question.correctAnswer;
        setAwardedMarks(correct ? 1 : 0);
    };
    const handleApplyMcOverride = () => {
        const marks = Number(mcOverrideInput);
        setAwardedMarks(marks);
    };

    // --- Advance logic ---
    const handleNext = (result: ReattemptResult | null) => {
        // If result is null, try to get from current state (for delete/skip, pass null)
        const actualResult = result ?? getCurrentResult();
        // Only add if not already present for this id
        const merged = actualResult ? [...results.filter((r) => r.id !== entry.id), actualResult] : results;
        if (actualResult?.correct) onMarkCorrect(entry);
        if (isLast) { onExit(merged); return; }
        setResults(merged); setIdx((i) => i + 1);
        // Reset per-question state
        setWrittenAnswer(""); setImage(undefined); setIsMarking(false); setFeedback(null); setAppealText(""); setOverrideInput("");
        setMarkingScheme(null);
        setSelectedAnswer(""); setAwardedMarks(undefined); setMcAppealText(""); setMcOverrideInput("");
    };

    // --- Session header parity ---
    const headerProps = {
        questionIndex: idx,
        totalQuestions: questions.length,
        completedCount,
        topic: entry.question.topic,
        difficulty: "Unknown" as Difficulty,
        maxMarks: isWritten ? entry.question.maxMarks : undefined,
        techAllowed: entry.question.techAllowed,
        isMathTopic: false,
        isAtLast: isLast,
        canAdvance: true,
        hasSavedSet: false,
        generationStartedAt: startedAt,
        formattedElapsedTime,
        telemetry: null,
        getDifficultyBadgeClasses: () => "",
        onPrev: handlePrev,
        onNext: () => handleNext(null),
        onSave: () => { },
        lastSavedAt: null,
        onDelete: handleDeleteCurrent,
        onExit: handleExit,
    };

    // --- Per-question UI ---
    return (
        <div className="flex flex-col h-full">
            {isWritten
                ? <WrittenSessionHeader {...headerProps} />
                : <McSessionHeader {...headerProps} />}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
                {isWritten ? (
                    <div className="max-w-4xl mx-auto flex flex-col space-y-4 pb-10">
                        <WrittenQuestionCard
                            promptMarkdown={entry.question.promptMarkdown}
                            canShowRawOutput={false}
                            showRawOutput={false}
                            rawModelOutput={""}
                            onToggleRawOutput={() => { }}
                        />
                        {!feedback ? (
                            <WrittenAnswerCard
                                questionId={entry.id}
                                answer={writtenAnswer}
                                image={image}
                                isMarking={isMarking}
                                canSubmit={writtenAnswer.trim().length > 0 || !!image}
                                onAnswerChange={setWrittenAnswer}
                                onImageDrop={(files) => {
                                    const file = files[0];
                                    fileToDataUrl(file).then((dataUrl) => setImage({ name: file.name, dataUrl }));
                                }}
                                onImageRemove={() => setImage(undefined)}
                                onSubmit={doMark}
                            />
                        ) : (
                            <>
                                <WrittenFeedbackPanel
                                    questionId={entry.id}
                                    answer={writtenAnswer}
                                    image={image}
                                    feedback={feedback && markingScheme ? { ...feedback, vcaaMarkingScheme: markingScheme } : feedback}
                                    appealText={appealText}
                                    overrideInput={overrideInput}
                                    isMarking={isMarking}
                                    onAppealChange={setAppealText}
                                    onOverrideInputChange={setOverrideInput}
                                    onArgueForMark={() => { }}
                                    onApplyOverride={handleApplyOverride}
                                    onCriterionChange={handleCriterionChange}
                                />
                            </>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="max-w-4xl mx-auto flex flex-col space-y-4 pb-10">
                            <McQuestionCard
                                promptMarkdown={entry.question.promptMarkdown}
                                canShowRawOutput={false}
                                showRawOutput={false}
                                rawModelOutput={""}
                                onToggleRawOutput={() => { }}
                            />
                            <McAnswerPanel
                                questionId={entry.id}
                                options={entry.question.options}
                                correctAnswer={entry.question.correctAnswer}
                                explanationMarkdown={entry.question.explanationMarkdown}
                                selectedAnswer={selectedAnswer}
                                awardedMarks={awardedMarks}
                                appealText={mcAppealText}
                                overrideInput={mcOverrideInput}
                                isMarking={false}
                                onSelectAnswer={handleSelectAnswer}
                                onAppealChange={setMcAppealText}
                                onOverrideInputChange={setMcOverrideInput}
                                onArgueForMark={() => { }}
                                onApplyOverride={handleApplyMcOverride}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ─── Summary screen ───────────────────────────────────────────────────────────

interface ReattemptSummaryProps {
    results: ReattemptResult[];
    total: number;
    onRetry: () => void;
    onBack: () => void;
}
function ReattemptSummary({ results, total, onRetry, onBack }: ReattemptSummaryProps) {
    const correct = results.filter((r) => r.correct).length;
    const accuracyPercent = total > 0 ? (correct / total) * 100 : 0;
    return (
        <div className="flex flex-col w-full h-full">
            <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto">
                    <Trophy className="w-8 h-8 text-emerald-500" />
                </div>
                <h2 className="text-2xl font-bold">Reattempt Complete</h2>
                <p className="text-sm text-muted-foreground">
                    You got <span className="font-medium text-emerald-600 dark:text-emerald-400">{correct}</span> out of <span className="font-medium">{total}</span> correct ({accuracyPercent.toFixed(1)}%).
                </p>
            </div>
            <div className="flex flex-row items-center justif">

                <Button className="mt-6 mx-auto" onClick={onRetry}>
                    Retry
                </Button>
                <Button variant="link" className="mt-2 mx-auto" onClick={onBack}>   Back to list
                </Button>
            </div>

        </div>
    );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export default function WrongQuestionView() {
    const questionHistory = useAppStore((s) => s.questionHistory);
    const mcHistory = useAppStore((s) => s.mcHistory);
    const setQuestionHistory = useAppStore((s) => s.setQuestionHistory);
    const setMcHistory = useAppStore((s) => s.setMcHistory);
    const apiKey = useAppStore((s) => s.apiKey);
    const model = useAppStore((s) => s.model);
    const markingModel = useAppStore((s) => s.markingModel);
    const useSeparateMarkingModel = useAppStore((s) => s.useSeparateMarkingModel);
    const effectiveModel = useSeparateMarkingModel && markingModel?.trim() ? markingModel : model;
    const spacedRepetitionCards = useAppStore((s) => s.spacedRepetitionCards);
    const reviewSpacedCard = useAppStore((s) => s.reviewSpacedCard);

    const allWrong = useMemo<WrongEntry[]>(() => {
        const written: WrittenWrongEntry[] = questionHistory
            .filter((e) => {
                const isCorrectVerdict = e.markResponse.verdict?.toLowerCase() === "correct";
                const isFullMarks = e.markResponse.maxMarks > 0 && e.markResponse.achievedMarks >= e.markResponse.maxMarks;
                return !isCorrectVerdict && !isFullMarks;
            })
            .map((e) => ({ ...e, kind: "written" as const }));
        const mc: McWrongEntry[] = mcHistory
            .filter((e) => !e.correct)
            .map((e) => ({ ...e, kind: "multiple-choice" as const }));
        return [...written, ...mc].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }, [questionHistory, mcHistory]);

    // Due for review cards
    const dueCards = useMemo(() => {
        return allWrong.filter((entry) => {
            const card = spacedRepetitionCards[entry.id];
            return card && isDue(card);
        }).sort((a, b) => {
            const cardA = spacedRepetitionCards[a.id];
            const cardB = spacedRepetitionCards[b.id];
            if (!cardA || !cardB) return 0;
            return new Date(cardA.nextReviewDate).getTime() - new Date(cardB.nextReviewDate).getTime();
        });
    }, [allWrong, spacedRepetitionCards]);

    // Overdue cards (subset of due)
    const overdueCards = useMemo(() => {
        return dueCards.filter((entry) => {
            const card = spacedRepetitionCards[entry.id];
            return card && daysUntilReview(card) < 0;
        });
    }, [dueCards, spacedRepetitionCards]);

    const [isShuffled, setIsShuffled] = useState(false);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [filterMode, setFilterMode] = useState<"all" | "written" | "mc">("all");
    const [viewMode, setViewMode] = useState<ViewMode>("list");
    const [reattemptQueue, setReattemptQueue] = useState<WrongEntry[]>([]);
    const [reattemptResults, setReattemptResults] = useState<ReattemptResult[] | null>(null);

    const filteredQuestions = useMemo(() => {
        let list = allWrong;
        if (filterMode === "written") list = list.filter((e) => e.kind === "written");
        if (filterMode === "mc") list = list.filter((e) => e.kind === "multiple-choice");
        return isShuffled ? shuffleArray(list) : list;
    }, [allWrong, isShuffled, filterMode]);

    const toggleExpand = useCallback((id: string) => {
        setExpandedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    }, []);

    const handleDelete = useCallback((entry: WrongEntry) => {
        if (entry.kind === "written") {
            setQuestionHistory((prev: QuestionHistoryEntry[]) => prev.filter((e) => e.id !== entry.id));
        } else {
            setMcHistory((prev: McHistoryEntry[]) => prev.filter((e) => e.id !== entry.id));
        }
        setExpandedIds((prev) => { const n = new Set(prev); n.delete(entry.id); return n; });
    }, [setQuestionHistory, setMcHistory]);

    const handleMarkCorrect = useCallback((entry: WrongEntry) => {
        if (entry.kind === "written") {
            setQuestionHistory((prev: QuestionHistoryEntry[]) =>
                prev.map((e) => e.id !== entry.id ? e : {
                    ...e,
                    markResponse: { ...e.markResponse, verdict: "correct" },
                })
            );
            // Record SR with quality 4 (correct)
            reviewSpacedCard(entry.id, 4);
        } else {
            setMcHistory((prev: McHistoryEntry[]) =>
                prev.map((e) => e.id !== entry.id ? e : { ...e, correct: true })
            );
            // Record SR with quality 4 (correct)
            reviewSpacedCard(entry.id, 4);
        }
    }, [setQuestionHistory, setMcHistory, reviewSpacedCard]);

    const startReattempt = (shuffle: boolean) => {
        setReattemptQueue(shuffle ? shuffleArray(filteredQuestions) : [...filteredQuestions]);
        setReattemptResults(null);
        setViewMode("reattempt");
    };

    const startSingleReattempt = useCallback((entry: WrongEntry) => {
        setReattemptQueue([entry]);
        setReattemptResults(null);
        setViewMode("reattempt");
    }, []);

    if (viewMode === "reattempt") {
        return (
            <div className="h-full flex flex-col px-3 sm:px-5 py-4">
                <ReattemptView questions={reattemptQueue} apiKey={apiKey} model={effectiveModel}
                    onDelete={handleDelete}
                    onMarkCorrect={handleMarkCorrect}
                    onExit={(res) => { setReattemptResults(res); setViewMode("summary"); }} />
            </div>
        );
    }

    if (viewMode === "summary" && reattemptResults) {
        return (
            <div className="min-h-full px-3 sm:px-5 py-4">
                <ReattemptSummary
                    results={reattemptResults} total={reattemptQueue.length}
                    onRetry={() => { setReattemptQueue(shuffleArray(filteredQuestions)); setReattemptResults(null); setViewMode("reattempt"); }}
                    onBack={() => { setViewMode("list"); setReattemptResults(null); }}
                />
            </div>
        );
    }

    const writtenCount = allWrong.filter((e) => e.kind === "written").length;
    const mcCount = allWrong.filter((e) => e.kind === "multiple-choice").length;

    return (
        <PageContainer>
            <PageHeader
                title="Wrong Answers"
                description="Review and reattempt questions you got wrong."
                actions={
                    <div className="flex items-center gap-2">
                        {allWrong.length > 0 && (
                            <Badge variant="secondary" className="text-[11px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                {allWrong.length}
                            </Badge>
                        )}
                        {dueCards.length > 0 && (
                            <Badge className="text-[11px] font-bold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 gap-1">
                                <Brain className="w-3 h-3" />
                                {dueCards.length} due
                            </Badge>
                        )}
                    </div>
                }
            />

            {allWrong.length > 0 && (
                <Toolbar>
                    <FilterGroup>
                        {(["all", "written", "mc"] as const).map((m) => (
                            <FilterButton
                                key={m}
                                active={filterMode === m}
                                onClick={() => setFilterMode(m)}
                            >
                                {m === "all" ? `All (${allWrong.length})` : m === "written" ? `Written (${writtenCount})` : `MC (${mcCount})`}
                            </FilterButton>
                        ))}
                    </FilterGroup>
                    <button type="button" onClick={() => setIsShuffled((s) => !s)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${isShuffled ? "bg-primary/10 border-primary/30 text-primary" : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"}`}>
                        <Shuffle className="w-3.5 h-3.5" />
                        {isShuffled ? "Shuffled" : "Shuffle"}
                    </button>
                    {filteredQuestions.length > 0 && (
                        <Button size="sm" className="ml-auto gap-2 h-8 px-4 shadow-sm" onClick={() => startReattempt(isShuffled)}>
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reattempt {filteredQuestions.length > 1 ? `all ${filteredQuestions.length}` : ""}
                        </Button>
                    )}
                </Toolbar>
            )}

            {/* Content */}
            <div className="flex-1 py-3">
                {allWrong.length === 0 ? (
                    <EmptyState />
                ) : (
                    <div className="space-y-6">
                        {/* Due for Review section */}
                        {dueCards.length > 0 && (
                            <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 overflow-hidden">
                                <div className="flex items-center gap-2 px-4 py-3 border-b border-sky-500/15 bg-sky-500/5">
                                    <Brain className="w-4 h-4 text-sky-500" />
                                    <span className="text-sm font-bold text-sky-700 dark:text-sky-300">Due for Review</span>
                                    <Badge className="ml-auto text-[10px] font-bold bg-sky-500/15 text-sky-600 dark:text-sky-400">
                                        {dueCards.length} item{dueCards.length !== 1 ? "s" : ""}
                                    </Badge>
                                    {overdueCards.length > 0 && (
                                        <Badge className="text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400">
                                            {overdueCards.length} overdue
                                        </Badge>
                                    )}
                                </div>
                                <div className="divide-y divide-sky-500/10">
                                    {dueCards.slice(0, 5).map((entry) => {
                                        const card = spacedRepetitionCards[entry.id];
                                        const days = card ? daysUntilReview(card) : 0;
                                        const isOverdue = days < 0;
                                        const isWritten = entry.kind === "written";
                                        return (
                                            <div key={entry.id} className="flex items-center gap-3 px-4 py-3 hover:bg-sky-500/5 transition-colors">
                                                <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${isWritten ? "bg-sky-500/10" : "bg-violet-500/10"}`}>
                                                    {isWritten ? <BookOpen className="w-3 h-3 text-sky-500" /> : <Target className="w-3 h-3 text-violet-500" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium truncate">
                                                        <MarkdownMath content={entry.question.promptMarkdown.slice(0, 120)} />
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[10px] text-muted-foreground">{entry.question.topic}</span>
                                                        {entry.question.subtopic && (
                                                            <span className="text-[10px] text-muted-foreground/50">· {entry.question.subtopic.slice(0, 30)}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${isOverdue ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" :
                                                    days === 0 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
                                                        "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                                                    }`}>
                                                    {isOverdue ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today" : `Due in ${days}d`}
                                                </div>
                                                {card && (
                                                    <div className="shrink-0 text-[10px] text-muted-foreground">
                                                        EF: {card.easinessFactor.toFixed(1)}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                {dueCards.length > 5 && (
                                    <div className="px-4 py-2 border-t border-sky-500/15 text-center">
                                        <span className="text-xs text-sky-600 dark:text-sky-400 font-medium">
                                            +{dueCards.length - 5} more items due
                                        </span>
                                    </div>
                                )}
                                <div className="px-4 py-2 border-t border-sky-500/15">
                                    <Button size="sm" className="w-full gap-2 h-8 bg-sky-500/90 hover:bg-sky-600 text-white"
                                        onClick={() => startReattempt(true)}>
                                        <RotateCcw className="w-3.5 h-3.5" />
                                        Review due items
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* All wrong answers list */}
                        {filteredQuestions.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">No questions match this filter.</p>
                        ) : (
                            <VirtualizedWrongList
                                entries={filteredQuestions}
                                expandedIds={expandedIds}
                                onToggle={toggleExpand}
                                onDelete={handleDelete}
                                onReattempt={startSingleReattempt}
                                spacedRepetitionCards={spacedRepetitionCards}
                            />
                        )}
                    </div>
                )}
            </div>
        </PageContainer>
    );
}
