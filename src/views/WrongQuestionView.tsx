import { useState, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store";
import { McHistoryEntry, QuestionHistoryEntry } from "../types";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Textarea } from "../components/ui/textarea";
import { Input } from "../components/ui/input";
import { MarkdownMath } from "../components/MarkdownMath";
import { normalizeMarkResponse, readBackendError } from "../lib/app-utils";
import {
    ChevronDown, ChevronUp, Shuffle, List, BookOpen, Target,
    CheckCircle2, XCircle, RotateCcw, Eye, ChevronLeft, ChevronRight,
    Lightbulb, Trophy, Frown, Trash2, Loader2, Sparkles, Check, AlertCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type WrittenWrongEntry = QuestionHistoryEntry & { kind: "written" };
type McWrongEntry = McHistoryEntry & { kind: "multiple-choice" };
type WrongEntry = WrittenWrongEntry | McWrongEntry;
type ViewMode = "list" | "reattempt" | "summary";
type ReattemptResult = { id: string; correct: boolean };
type MarkingState =
    | { phase: "idle" }
    | { phase: "marking" }
    | { phase: "done"; response: ReturnType<typeof normalizeMarkResponse> }
    | { phase: "error"; message: string };

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

const OPTION_COLORS: Record<string, string> = {
    A: "#3b82f6", B: "#8b5cf6", C: "#f59e0b", D: "#ec4899",
};

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

// ─── List view: expanded bodies ───────────────────────────────────────────────

function WrittenExpandedBody({ entry }: { entry: WrittenWrongEntry }) {
    return (
        <div className="space-y-4">
            {/* Two-column: your answer | worked solution */}
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
            <div className="grid grid-cols-2 gap-2">
                {entry.question.options.map((opt) => {
                    const isChosen = entry.selectedAnswer === opt.label;
                    const isCorrect = opt.label === entry.question.correctAnswer;
                    const color = OPTION_COLORS[opt.label] ?? "#6b7280";
                    let border = "border-border/40 opacity-50";
                    let labelBg = "";
                    if (isCorrect) { border = "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/25"; labelBg = "bg-emerald-500 text-white"; }
                    else if (isChosen) { border = "border-rose-400 bg-rose-50/50 dark:bg-rose-950/20"; labelBg = "bg-rose-500 text-white"; }
                    return (
                        <div key={opt.label} className={`flex gap-3 items-start p-3 rounded-xl border-2 ${border}`}>
                            <div
                                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm ${labelBg || "bg-muted text-foreground"}`}
                                style={!isCorrect && !isChosen ? { backgroundColor: `${color}20`, color } : undefined}
                            >
                                {opt.label}
                            </div>
                            <div className="text-sm leading-relaxed pt-0.5 prose prose-sm dark:prose-invert max-w-none flex-1">
                                <MarkdownMath content={opt.text} />
                            </div>
                            {isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5 ml-auto" />}
                            {isChosen && !isCorrect && <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5 ml-auto" />}
                        </div>
                    );
                })}
            </div>
            <div className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">Explanation</p>
                <div className="rounded-lg border border-border/40 bg-muted/10 px-3.5 py-3 text-sm prose prose-sm dark:prose-invert max-w-none">
                    <MarkdownMath content={entry.question.explanationMarkdown} />
                </div>
            </div>
        </div>
    );
}

// ─── List entry card ──────────────────────────────────────────────────────────

function ListEntryCard({
    entry, index, isExpanded, onToggle, onDelete,
}: {
    entry: WrongEntry; index: number; isExpanded: boolean; onToggle: () => void; onDelete: () => void;
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
        <div className="rounded-lg border border-border/50 bg-card overflow-hidden transition-shadow hover:shadow-md">
            <div className="flex items-stretch">
                <button
                    type="button"
                    className="flex-1 text-left px-3.5 py-3 flex items-start gap-3 group min-w-0"
                    onClick={onToggle}
                >
                    {/* Index number */}
                    <span className="shrink-0 w-5 h-5 mt-0.5 rounded-md bg-muted/60 flex items-center justify-center text-[10px] font-bold text-muted-foreground tabular-nums">
                        {index + 1}
                    </span>
                    <div className="flex-1 min-w-0 space-y-1">
                        {/* Inline meta row */}
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
                        {/* Question text */}
                        <div className="py-3 overflow-hidden relative">
                            <div className="text-sm leading-relaxed text-foreground prose prose-sm dark:prose-invert max-w-none">
                                <MarkdownMath content={entry.question.promptMarkdown} />
                            </div>
                            <div className="absolute bottom-0 inset-x-0 h-5 bg-linear-to-t from-card to-transparent pointer-events-none" />
                        </div>
                    </div>
                    {/* Score + chevron */}
                    <div className="shrink-0 flex items-center gap-1.5 ml-1 pt-0.5">
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
                </div>
            )}
        </div>
    );
}

// ─── AI marking result panel ──────────────────────────────────────────────────

function AiMarkingResult({
    markingState, onMark, onOverride, onAppeal,
}: {
    markingState: MarkingState; maxMarks: number;
    onMark: () => void; onOverride: (m: number) => void; onAppeal: (t: string) => void;
}) {
    const [overrideInput, setOverrideInput] = useState("");
    const [appealText, setAppealText] = useState("");

    if (markingState.phase === "marking") {
        return (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-primary" /> Marking your answer…
            </div>
        );
    }
    if (markingState.phase === "error") {
        return (
            <div className="space-y-3">
                <div className="flex items-center gap-2.5 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{markingState.message}</span>
                </div>
                <Button variant="outline" size="sm" className="gap-2 h-8" onClick={onMark}>
                    <RotateCcw className="w-3.5 h-3.5" /> Retry
                </Button>
            </div>
        );
    }
    if (markingState.phase !== "done") return null;

    const resp = markingState.response;
    const pct = resp.maxMarks > 0 ? resp.achievedMarks / resp.maxMarks : 0;
    const ringColor = pct >= 0.75 ? "#10b981" : pct >= 0.5 ? "#f59e0b" : "#f43f5e";
    const r = 28; const circ = 2 * Math.PI * r; const dash = circ * pct;

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Score header + feedback side by side */}
            <div className="grid sm:grid-cols-[auto_1fr] gap-3 items-start">
                <div className={`flex items-center gap-3 p-3.5 rounded-xl border sm:flex-col sm:items-center sm:gap-2 sm:px-4 sm:py-3 ${scoreBg(pct)}`}>
                    <div className="relative w-14 h-14 shrink-0">
                        <svg className="absolute inset-0 -rotate-90" width="56" height="56" viewBox="0 0 64 64">
                            <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-muted/25" />
                            <circle cx="32" cy="32" r={r} fill="none" stroke={ringColor} strokeWidth="5"
                                strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.6s ease" }} />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-sm font-black tabular-nums" style={{ color: ringColor }}>{resp.achievedMarks}</span>
                            <span className="text-[9px] text-muted-foreground font-medium">/{resp.maxMarks}</span>
                        </div>
                    </div>
                    <div className="sm:text-center">
                        <div className="text-xl font-black tabular-nums" style={{ color: ringColor }}>
                            {resp.scoreOutOf10}<span className="text-sm font-semibold text-muted-foreground ml-1">/ 10</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{resp.achievedMarks} of {resp.maxMarks} marks</div>
                        <div className={`mt-1.5 inline-flex text-[11px] font-bold px-2 py-0.5 rounded-full border ${scoreBg(pct)}`}>{resp.verdict}</div>
                    </div>
                </div>
                <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">AI Feedback</p>
                    </div>
                    <div className="rounded-lg border border-border/40 bg-muted/10 px-3.5 py-3 text-sm prose prose-sm dark:prose-invert max-w-none">
                        <MarkdownMath content={resp.feedbackMarkdown} />
                    </div>
                </div>
            </div>

            {resp.vcaaMarkingScheme?.length > 0 && (
                <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">Marking Scheme</p>
                    </div>
                    <div className="divide-y divide-border/30 rounded-lg border border-border/40 overflow-hidden">
                        {resp.vcaaMarkingScheme.map((c, i) => {
                            const p = c.maxMarks > 0 ? c.achievedMarks / c.maxMarks : 0;
                            return (
                                <div key={i} className={`flex items-start gap-3 px-3.5 py-2.5 text-sm ${p >= 1 ? "bg-emerald-500/5" : "bg-rose-500/5"}`}>
                                    <span className={`shrink-0 font-bold text-xs mt-0.5 px-1.5 py-0.5 rounded-md ${criterionScoreClass(p)}`}>
                                        {c.achievedMarks}/{c.maxMarks}
                                    </span>
                                    <div className="flex-1 min-w-0 space-y-1">
                                        <div className="leading-snug text-foreground/80"><MarkdownMath content={c.criterion} /></div>
                                        {c.rationale?.trim() && (
                                            <div className="text-xs text-muted-foreground rounded-md border border-border/40 bg-muted/20 px-2.5 py-1.5">
                                                <MarkdownMath content={c.rationale} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">Worked Solution</p>
                </div>
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-3 text-sm prose prose-sm dark:prose-invert max-w-none">
                    <MarkdownMath content={resp.workedSolutionMarkdown} />
                </div>
            </div>

            <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">Dispute this mark</p>
                <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold">Argue for more marks</p>
                        <Textarea placeholder="Explain why your response deserves additional marks…" className="min-h-[72px] text-sm resize-none"
                            value={appealText} onChange={(e) => setAppealText(e.target.value)} />
                        <Button type="button" variant="outline" size="sm" disabled={appealText.trim().length === 0}
                            onClick={() => { onAppeal(appealText); setAppealText(""); }} className="gap-2 h-8 text-xs">
                            Request Re-mark
                        </Button>
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs font-semibold">Override mark</p>
                        <div className="flex items-center gap-2">
                            <Input type="number" min={0} max={resp.maxMarks} step={1} className="max-w-[70px] text-sm h-8"
                                value={overrideInput} onChange={(e) => setOverrideInput(e.target.value)} />
                            <span className="text-xs text-muted-foreground">out of {resp.maxMarks}</span>
                            <Button type="button" size="sm" className="h-8 text-xs"
                                onClick={() => { const v = Number(overrideInput); if (Number.isFinite(v)) onOverride(Math.max(0, Math.min(resp.maxMarks, Math.round(v)))); }}>
                                Apply
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Reattempt view ───────────────────────────────────────────────────────────

function ReattemptView({
    questions, apiKey, model, onExit, onDelete, onMarkCorrect,
}: {
    questions: WrongEntry[]; apiKey: string; model: string;
    onExit: (results: ReattemptResult[]) => void;
    onDelete: (entry: WrongEntry) => void;
    onMarkCorrect: (entry: WrongEntry) => void;
}) {
    const [idx, setIdx] = useState(0);
    const [results, setResults] = useState<ReattemptResult[]>([]);
    const [mcSelected, setMcSelected] = useState<string | null>(null);
    const [writtenAnswer, setWrittenAnswer] = useState("");
    const [showAnswer, setShowAnswer] = useState(false);
    const [selfRated, setSelfRated] = useState<boolean | null>(null);
    const [markingState, setMarkingState] = useState<MarkingState>({ phase: "idle" });

    const entry = questions[idx];
    const isWritten = entry.kind === "written";
    const isMc = !isWritten;
    const mcEntry = isMc ? (entry as McWrongEntry) : null;
    const writtenEntry = isWritten ? (entry as WrittenWrongEntry) : null;
    const isLast = idx === questions.length - 1;
    const mcCorrect = isMc && mcSelected === mcEntry?.question.correctAnswer;
    const correctSoFar = results.filter((r) => r.correct).length;
    const attemptedSoFar = results.length;
    const progressPct = (idx / questions.length) * 100;

    const doMark = async (appealText?: string) => {
        if (!writtenEntry) return;
        setMarkingState({ phase: "marking" });
        const studentAnswer = appealText
            ? `${writtenAnswer}\n\nAdditional argument from student:\n${appealText}`
            : writtenAnswer;
        try {
            const raw = await invoke<unknown>("mark_answer", {
                request: { question: writtenEntry.question, studentAnswer, model, apiKey },
            });
            setMarkingState({ phase: "done", response: normalizeMarkResponse(raw, writtenEntry.question.maxMarks) });
        } catch (err) {
            setMarkingState({ phase: "error", message: readBackendError(err) });
        }
    };

    const handleOverride = (marks: number) => {
        if (markingState.phase !== "done") return;
        const r = markingState.response;
        setMarkingState({
            phase: "done",
            response: { ...r, achievedMarks: marks, scoreOutOf10: Math.round((marks / r.maxMarks) * 10), verdict: marks === r.maxMarks ? "Correct" : marks === 0 ? "Incorrect" : "Overridden" },
        });
    };

    const resolveResult = (): ReattemptResult | null => {
        if (isMc && mcSelected) return { id: entry.id, correct: mcCorrect };
        if (isWritten && markingState.phase === "done") {
            const p = markingState.response.maxMarks > 0 ? markingState.response.achievedMarks / markingState.response.maxMarks : 0;
            return { id: entry.id, correct: p >= 1 };
        }
        if (isWritten && selfRated !== null) return { id: entry.id, correct: selfRated };
        return null;
    };

    const canAdvance = (isMc && Boolean(mcSelected)) ||
        (isWritten && (markingState.phase === "done" || selfRated !== null || showAnswer));

    const resetQuestion = () => {
        setMcSelected(null); setWrittenAnswer(""); setShowAnswer(false);
        setSelfRated(null); setMarkingState({ phase: "idle" });
    };

    const handleNext = () => {
        const res = resolveResult();
        const merged = res ? [...results.filter((r) => r.id !== entry.id), res] : results;
        if (res?.correct) onMarkCorrect(entry);
        if (isLast) { onExit(merged); return; }
        setResults(merged); setIdx((i) => i + 1); resetQuestion();
    };

    const handleDeleteCurrent = () => {
        onDelete(entry);
        // Remove any pending result for this question
        const remainingResults = results.filter((r) => r.id !== entry.id);
        if (isLast) { onExit(remainingResults); return; }
        setResults(remainingResults);
        setIdx((i) => i + 1);
        resetQuestion();
    };

    const handlePrev = () => {
        if (idx === 0) return;
        setResults((prev) => prev.filter((r) => r.id !== questions[idx - 1]?.id));
        setIdx((i) => i - 1); resetQuestion();
    };

    return (
        <div className="flex flex-col gap-3 h-full">
            {/* Nav bar */}
            <div className="flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2.5">
                    <Button variant="ghost" size="sm" onClick={() => onExit(results)} className="h-7 px-2 gap-1 text-xs text-muted-foreground hover:text-foreground">
                        <ChevronLeft className="w-3.5 h-3.5" /> Exit
                    </Button>
                    <span className="text-sm font-bold">{idx + 1}</span>
                    <span className="text-xs text-muted-foreground">/ {questions.length}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {attemptedSoFar > 0 ? (
                        <>
                            <span className="text-emerald-500 font-semibold">{correctSoFar}/{attemptedSoFar}</span>
                            <span>·</span>
                            <span className="font-semibold">{Math.round((correctSoFar / attemptedSoFar) * 100)}%</span>
                        </>
                    ) : (
                        <span className="opacity-40">No answers yet</span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" disabled={idx === 0} onClick={handlePrev} className="h-7 w-7 p-0">
                        <ChevronLeft className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant={canAdvance ? "default" : "outline"} size="sm" onClick={handleNext} disabled={!canAdvance} className="h-7 gap-1 px-3 text-xs">
                        {isLast ? "Finish" : "Next"} <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden shrink-0">
                <div className="h-full bg-primary/70 rounded-full transition-all duration-400" style={{ width: `${progressPct}%` }} />
            </div>

            {/* Question card */}
            <div className="rounded-xl border border-border/50 bg-card overflow-hidden shrink-0">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-border/30 bg-muted/20">
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center ${isWritten ? "bg-sky-500/10" : "bg-violet-500/10"}`}>
                        {isWritten ? <BookOpen className="w-3 h-3 text-sky-500" /> : <Target className="w-3 h-3 text-violet-500" />}
                    </div>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{entry.question.topic}</Badge>
                    {entry.question.subtopic && <span className="text-[10px] text-muted-foreground/60 truncate">{entry.question.subtopic}</span>}
                    <Badge variant="outline" className={`ml-auto text-[10px] px-1.5 py-0 ${isWritten ? "border-sky-400/30 text-sky-500" : "border-violet-400/30 text-violet-500"}`}>
                        {isWritten ? "Written" : "Multiple Choice"}
                    </Badge>
                    <button
                        type="button"
                        onClick={handleDeleteCurrent}
                        className="ml-1 flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground/40 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                        title="Remove from wrong answers"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
                <div className="px-4 py-4">
                    <div className="prose prose-sm dark:prose-invert max-w-none text-base leading-relaxed">
                        <MarkdownMath content={entry.question.promptMarkdown} />
                    </div>
                </div>
            </div>

            {/* MC options — 2×2 grid, centered */}
            {isMc && mcEntry && (
                <div className="grid grid-cols-2 gap-2 shrink-0">
                    {mcEntry.question.options.map((opt) => {
                        const isChosen = mcSelected === opt.label;
                        const isCorrect = opt.label === mcEntry.question.correctAnswer;
                        const color = OPTION_COLORS[opt.label] ?? "#6b7280";
                        const answered = Boolean(mcSelected);
                        let cls = "border-border/60 hover:border-primary/40 hover:bg-muted/20 cursor-pointer hover:-translate-y-0.5";
                        let lblBg = "";
                        if (answered) {
                            if (isCorrect) { cls = "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/25 cursor-default"; lblBg = "bg-emerald-500 text-white"; }
                            else if (isChosen) { cls = "border-rose-400 bg-rose-50/50 dark:bg-rose-950/20 cursor-default opacity-80"; lblBg = "bg-rose-500 text-white"; }
                            else { cls = "border-border/30 opacity-40 cursor-default grayscale"; }
                        }
                        return (
                            <button key={opt.label} disabled={answered} onClick={() => setMcSelected(opt.label)}
                                className={`w-full text-left p-3 rounded-xl border-2 flex gap-3 items-start transition-all duration-200 ${cls}`}>
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm ${lblBg || "bg-muted text-foreground"}`}
                                    style={!isCorrect && !isChosen ? { backgroundColor: `${color}20`, color } : undefined}>
                                    {opt.label}
                                </div>
                                <div className="flex-1 text-sm leading-relaxed pt-0.5 prose prose-sm dark:prose-invert max-w-none">
                                    <MarkdownMath content={opt.text} />
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* MC result + explanation */}
            {isMc && mcSelected && mcEntry && (
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-250">
                    <div className={`flex items-center gap-3 p-3.5 rounded-xl border ${mcCorrect ? "bg-emerald-500/10 border-emerald-500/25" : "bg-rose-500/10 border-rose-400/25"}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${mcCorrect ? "bg-emerald-500/15" : "bg-rose-500/15"}`}>
                            {mcCorrect ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-rose-500" />}
                        </div>
                        <p className={`text-sm font-bold ${mcCorrect ? "text-emerald-800 dark:text-emerald-200" : "text-rose-800 dark:text-rose-200"}`}>
                            {mcCorrect ? "Correct this time!" : `Incorrect — the answer is ${mcEntry.question.correctAnswer}.`}
                        </p>
                    </div>
                    <div className="rounded-xl border border-border/40 overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b border-border/30">
                            <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Explanation</span>
                        </div>
                        <div className="px-4 py-3.5 text-sm prose prose-sm dark:prose-invert max-w-none">
                            <MarkdownMath content={mcEntry.question.explanationMarkdown} />
                        </div>
                    </div>
                </div>
            )}

            {/* Written answer area */}
            {isWritten && writtenEntry && (
                <div className="space-y-3 flex-1 flex flex-col">
                    <Textarea
                        value={writtenAnswer}
                        onChange={(e) => setWrittenAnswer(e.target.value)}
                        disabled={showAnswer || markingState.phase === "marking" || markingState.phase === "done"}
                        placeholder="Write your answer here…"
                        className="flex-1 min-h-[200px] resize-y text-sm leading-relaxed disabled:opacity-60 disabled:cursor-not-allowed"
                    />

                    {markingState.phase === "idle" && !showAnswer && (
                        <div className="flex items-center gap-2 flex-wrap shrink-0">
                            <Button variant="outline" size="sm" onClick={() => setShowAnswer(true)} className="gap-2 h-8 text-xs">
                                <Eye className="w-3.5 h-3.5" /> Reveal answer
                            </Button>
                            <Button size="sm" onClick={() => doMark()}
                                disabled={writtenAnswer.trim().length === 0 || !apiKey || !model}
                                className="gap-2 h-8 text-xs">
                                <Sparkles className="w-3.5 h-3.5" />
                                {(!apiKey || !model) ? "Configure API key in Settings" : "Mark with AI"}
                            </Button>
                        </div>
                    )}

                    {markingState.phase !== "idle" && (
                        <AiMarkingResult
                            markingState={markingState}
                            maxMarks={writtenEntry.question.maxMarks}
                            onMark={() => doMark()}
                            onOverride={handleOverride}
                            onAppeal={(t) => doMark(t)}
                        />
                    )}

                    {showAnswer && markingState.phase === "idle" && (
                        <div className="space-y-4 animate-in fade-in duration-250">
                            <div className="rounded-xl border border-border/40 overflow-hidden">
                                <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b border-border/30">
                                    <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Worked solution</span>
                                </div>
                                <div className="px-4 py-3.5 text-sm prose prose-sm dark:prose-invert max-w-none">
                                    <MarkdownMath content={writtenEntry.workedSolutionMarkdown || "No worked solution available."} />
                                </div>
                            </div>
                            {selfRated === null ? (
                                <div className="rounded-xl border border-border/40 bg-muted/10 p-4">
                                    <p className="text-sm font-semibold mb-3 text-center">How did you go this time?</p>
                                    <div className="flex items-center gap-3 justify-center">
                                        <Button variant="outline" size="sm" onClick={() => setSelfRated(false)}
                                            className="gap-2 border-rose-400/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 h-9 px-4">
                                            <Frown className="w-4 h-4" /> Still wrong
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={() => setSelfRated(true)}
                                            className="gap-2 border-emerald-400/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 h-9 px-4">
                                            <CheckCircle2 className="w-4 h-4" /> Got it!
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${selfRated ? "bg-emerald-500/10 border-emerald-500/25" : "bg-rose-500/10 border-rose-400/25"}`}>
                                    {selfRated ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <XCircle className="w-4 h-4 text-rose-500 shrink-0" />}
                                    <p className="text-sm font-medium">{selfRated ? "Marked as correct — great work!" : "Marked as still incorrect."}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {markingState.phase === "idle" && !showAnswer && writtenAnswer.length === 0 && (
                        <p className="text-[11px] text-muted-foreground/50 text-center shrink-0">
                            Write your answer, then mark with AI or reveal the solution to compare.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Summary screen ───────────────────────────────────────────────────────────

function ReattemptSummary({ results, total, onRetry, onBack }: {
    results: ReattemptResult[]; total: number; onRetry: () => void; onBack: () => void;
}) {
    const correct = results.filter((r) => r.correct).length;
    const attempted = results.length;
    const pct = attempted > 0 ? (correct / attempted) * 100 : 0;
    const color = pct >= 75 ? "text-emerald-500" : pct >= 50 ? "text-amber-500" : "text-rose-500";
    const ring = pct >= 75 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#f43f5e";
    const r = 48; const circ = 2 * Math.PI * r; const dash = circ * (pct / 100);

    return (
        <div className="flex flex-col items-center gap-6 py-10 text-center animate-in fade-in slide-in-from-bottom-3 duration-400 max-w-sm mx-auto">
            <div className="relative w-32 h-32">
                <svg className="-rotate-90 absolute inset-0" width="128" height="128" viewBox="0 0 128 128">
                    <circle cx="64" cy="64" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/25" />
                    <circle cx="64" cy="64" r={r} fill="none" stroke={ring} strokeWidth="8"
                        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                        style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)" }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-3xl font-black tabular-nums ${color}`}>{Math.round(pct)}%</span>
                    <span className="text-[11px] text-muted-foreground font-medium">accuracy</span>
                </div>
            </div>
            <div>
                <h2 className="text-xl font-black mb-1">Session complete</h2>
                <p className="text-sm text-muted-foreground">
                    You got <span className="font-bold text-foreground">{correct}</span> of{" "}
                    <span className="font-bold text-foreground">{attempted}</span> attempted correct
                    {attempted < total && (
                        <span className="text-muted-foreground/60"> ({total - attempted} skipped)</span>
                    )}.
                </p>
            </div>
            <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={onBack} className="gap-2 h-9">
                    <List className="w-3.5 h-3.5" /> Back to list
                </Button>
                <Button size="sm" onClick={onRetry} className="gap-2 h-9">
                    <RotateCcw className="w-3.5 h-3.5" /> Try again
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
        } else {
            setMcHistory((prev: McHistoryEntry[]) =>
                prev.map((e) => e.id !== entry.id ? e : { ...e, correct: true })
            );
        }
    }, [setQuestionHistory, setMcHistory]);

    const startReattempt = (shuffle: boolean) => {
        setReattemptQueue(shuffle ? shuffleArray(filteredQuestions) : [...filteredQuestions]);
        setReattemptResults(null);
        setViewMode("reattempt");
    };

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
        <div className="flex flex-col min-h-full">
            {/* Sticky header + toolbar */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/40 px-3 sm:px-5 py-3 space-y-2.5">
                <div className="flex items-center gap-2.5">
                    <h1 className="text-xl font-black tracking-tight">Wrong Answers</h1>
                    {allWrong.length > 0 && (
                        <Badge variant="secondary" className="text-[11px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                            {allWrong.length}
                        </Badge>
                    )}
                    <p className="hidden sm:block text-xs text-muted-foreground ml-1">
                        Review and reattempt questions you got wrong.
                    </p>
                </div>

                {allWrong.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-0.5 rounded-lg border bg-muted/30 p-0.5">
                            {(["all", "written", "mc"] as const).map((m) => (
                                <button key={m} type="button" onClick={() => setFilterMode(m)}
                                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${filterMode === m ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                                    {m === "all" ? `All (${allWrong.length})` : m === "written" ? `Written (${writtenCount})` : `MC (${mcCount})`}
                                </button>
                            ))}
                        </div>
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
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 px-3 sm:px-5 py-3">
                {allWrong.length === 0 ? (
                    <EmptyState />
                ) : filteredQuestions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No questions match this filter.</p>
                ) : (
                    <div className="space-y-1.5">
                        {filteredQuestions.map((entry, i) => (
                            <ListEntryCard key={entry.id} entry={entry} index={i}
                                isExpanded={expandedIds.has(entry.id)}
                                onToggle={() => toggleExpand(entry.id)}
                                onDelete={() => handleDelete(entry)} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}