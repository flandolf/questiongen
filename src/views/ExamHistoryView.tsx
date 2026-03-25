import { useState, useMemo } from "react";
import {
  Trophy, Clock, Target, BookOpen, ChevronDown, ChevronUp,
  Trash2, BarChart2, CheckCircle2, XCircle, Calendar,
  TrendingUp, Zap, PlusCircle, Award, Hash,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { MarkdownMath } from "../components/MarkdownMath";
import { ConfirmModal } from "../components/ui/ConfirmModal";
import { EmptyState } from "../components/EmptyState";
import { ExamRecord } from "../types";

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function getRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(isoString);
}

function scoreBg(pct: number) {
  if (pct >= 80) return "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400";
  if (pct >= 50) return "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400";
  return "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400";
}

function scoreColor(pct: number) {
  if (pct >= 80) return "text-emerald-500";
  if (pct >= 50) return "text-amber-500";
  return "text-rose-500";
}

function ScoreRing({ pct, size = 64 }: { pct: number; size?: number }) {
  const color = pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#f43f5e";
  const r = size / 2 - 5;
  const circ = 2 * Math.PI * r;
  const dash = circ * (pct / 100);
  return (
    <svg className="-rotate-90 shrink-0" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-muted/25" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }} />
    </svg>
  );
}

function ExamRecordCard({ record, isExpanded, onToggle, onDelete }: {
  record: ExamRecord;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const isWritten = record.questionMode === "written";
  const pct = record.totalMax > 0 ? (record.totalScore / record.totalMax) * 100 : 0;

  return (
    <div className={`rounded-xl border bg-card overflow-hidden transition-all duration-200 hover:shadow-md ${isExpanded ? "border-primary/20 shadow-md" : "border-border/50 shadow-sm"}`}>
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-5 py-4 flex items-center gap-4 group"
      >
        <div className="relative shrink-0">
          <ScoreRing pct={pct} size={56} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-sm font-black tabular-nums ${scoreColor(pct)}`}>{Math.round(pct)}%</span>
          </div>
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-base leading-tight">{record.topic}</span>
            <Badge variant="outline" className={`text-[10px] font-bold px-1.5 py-0 h-4 ${isWritten
              ? "border-sky-400/40 text-sky-600 dark:text-sky-400"
              : "border-violet-400/40 text-violet-600 dark:text-violet-400"
            }`}>
              {isWritten ? <><BookOpen className="w-2.5 h-2.5 mr-0.5" />Written</> : <><Target className="w-2.5 h-2.5 mr-0.5" />MC</>}
            </Badge>
            <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0 h-4 text-muted-foreground">
              {record.difficulty}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />{getRelativeTime(record.createdAt)}
            </span>
            <span className="flex items-center gap-1">
              <Hash className="w-3 h-3" />{record.questionCount} questions
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />{formatTime(record.timeUsedSeconds)}
            </span>
            <span className={`font-semibold ${scoreColor(pct)}`}>
              {record.totalScore}/{record.totalMax} {isWritten ? "marks" : "correct"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className={`text-xs font-bold px-2.5 py-1 rounded-full border ${scoreBg(pct)}`}>
            {pct >= 80 ? "Excellent" : pct >= 60 ? "Good" : pct >= 40 ? "Fair" : "Keep Practicing"}
          </div>
          <div className="text-muted-foreground group-hover:text-foreground transition-colors">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground/40 hover:text-rose-500 hover:bg-rose-500/10 transition-colors ml-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-border/40 px-5 py-4 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <BarChart2 className="w-3 h-3" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Score</span>
              </div>
              <div className={`text-xl font-black tabular-nums ${scoreColor(pct)}`}>{Math.round(pct)}%</div>
              <div className="text-[11px] text-muted-foreground">{record.totalScore}/{record.totalMax}</div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Time</span>
              </div>
              <div className="text-xl font-black tabular-nums">{formatTime(record.timeUsedSeconds)}</div>
              <div className="text-[11px] text-muted-foreground">
                {record.questionCount > 0 ? `~${formatTime(Math.round(record.timeUsedSeconds / record.questionCount))}/q` : ""}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Target className="w-3 h-3" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Accuracy</span>
              </div>
              <div className={`text-xl font-black tabular-nums ${scoreColor(pct)}`}>
                {record.totalScore}/{record.totalMax}
              </div>
              <div className="text-[11px] text-muted-foreground capitalize">{record.difficulty}</div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Zap className="w-3 h-3" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Mode</span>
              </div>
              <div className="text-xl font-black">{record.techMode === "tech-free" ? "No CAS" : record.techMode === "tech-active" ? "CAS" : "Mixed"}</div>
              <div className="text-[11px] text-muted-foreground">{record.questionCount} questions</div>
            </div>
          </div>

          {/* Question breakdown */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-2">Question Results</p>
            <div className="rounded-xl border border-border/40 divide-y divide-border/30 overflow-hidden">
              {record.questionResults.map((qr, i) => {
                const qPct = qr.maxMarks > 0 ? (qr.achievedMarks / qr.maxMarks) * 100 : (qr.correct ? 100 : 0);
                return (
                  <div key={i} className={`flex items-center gap-3 px-3.5 py-2.5 text-sm ${qPct >= 100 ? "bg-emerald-500/5" : qPct === 0 ? "bg-rose-500/5" : ""}`}>
                    <span className="shrink-0 w-5 text-[11px] font-mono text-muted-foreground">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm leading-snug line-clamp-1 prose prose-sm dark:prose-invert max-w-none">
                        <MarkdownMath content={qr.promptMarkdown.replace(/\n/g, " ").slice(0, 120)} />
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{qr.topic}{qr.subtopic ? ` · ${qr.subtopic}` : ""}</div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {isWritten ? (
                        <>
                          <span className={`text-xs font-bold tabular-nums px-1.5 py-0.5 rounded-md ${qPct >= 100 ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : qPct >= 50 ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700" : "bg-rose-100 dark:bg-rose-900/40 text-rose-600"}`}>
                            {qr.achievedMarks}/{qr.maxMarks}
                          </span>
                          {qPct >= 100 ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <XCircle className="w-3.5 h-3.5 text-rose-500" />}
                        </>
                      ) : (
                        <>
                          {qr.selectedAnswer && (
                            <span className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded ${qr.correct ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700" : "bg-rose-100 dark:bg-rose-900/40 text-rose-600"}`}>
                              {qr.correct ? "" : `${qr.selectedAnswer}→`}{qr.correctAnswer}
                            </span>
                          )}
                          {qr.correct ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <XCircle className="w-3.5 h-3.5 text-rose-500" />}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ExamHistoryView() {
  const navigate = useNavigate();
  const examHistory = useAppStore((s) => s.examHistory);
  const deleteExamRecord = useAppStore((s) => s.deleteExamRecord);
  const clearExamHistory = useAppStore((s) => s.clearExamHistory);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [modeFilter, setModeFilter] = useState<"all" | "written" | "mc">("all");

  const filtered = useMemo(() => {
    let list = [...examHistory].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (modeFilter === "written") list = list.filter(r => r.questionMode === "written");
    if (modeFilter === "mc") list = list.filter(r => r.questionMode !== "written");
    return list;
  }, [examHistory, modeFilter]);

  const stats = useMemo(() => {
    if (examHistory.length === 0) return null;
    const totalExams = examHistory.length;
    const avgScore = examHistory.reduce((s, r) => s + (r.totalMax > 0 ? r.totalScore / r.totalMax * 100 : 0), 0) / totalExams;
    const best = examHistory.reduce((b, r) => {
      const pct = r.totalMax > 0 ? r.totalScore / r.totalMax * 100 : 0;
      return pct > (b.totalMax > 0 ? b.totalScore / b.totalMax * 100 : 0) ? r : b;
    }, examHistory[0]);
    const bestPct = best.totalMax > 0 ? (best.totalScore / best.totalMax) * 100 : 0;
    return { totalExams, avgScore, bestPct, best };
  }, [examHistory]);

  if (examHistory.length === 0) {
    return (
      <EmptyState
        title="No Exam History Yet"
        description="Complete an Exam Simulation to see your results recorded here."
        icon={Trophy}
        actions={
          <Button variant="default" size="sm" className="gap-2 mt-2" onClick={() => navigate("/exam")}>
            <PlusCircle className="h-4 w-4" />
            Start your first exam
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/40 px-4 sm:px-6 py-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight leading-none flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Trophy className="w-4 h-4 text-amber-500" />
              </div>
              Exam History
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {examHistory.length} exam{examHistory.length !== 1 ? "s" : ""} completed
            </p>
          </div>
          <Button
            variant="ghost" size="sm"
            onClick={() => setClearConfirmOpen(true)}
            className="gap-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear All
          </Button>
        </div>

        {/* Summary KPIs */}
        {stats && (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2 space-y-0.5">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <BarChart2 className="w-3 h-3" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Exams</span>
              </div>
              <div className="text-lg font-black tabular-nums">{stats.totalExams}</div>
            </div>
            <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2 space-y-0.5">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <TrendingUp className="w-3 h-3" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Avg Score</span>
              </div>
              <div className={`text-lg font-black tabular-nums ${scoreColor(stats.avgScore)}`}>
                {stats.avgScore.toFixed(1)}%
              </div>
            </div>
            <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2 space-y-0.5">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Award className="w-3 h-3" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Best</span>
              </div>
              <div className={`text-lg font-black tabular-nums ${scoreColor(stats.bestPct)}`}>
                {stats.bestPct.toFixed(1)}%
              </div>
            </div>
          </div>
        )}

        {/* Mode filter */}
        <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-0.5 self-start">
          {(["all", "written", "mc"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setModeFilter(m)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${modeFilter === m ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {m === "all" ? `All (${examHistory.length})` : m === "written" ? `Written (${examHistory.filter(r => r.questionMode === "written").length})` : `MC (${examHistory.filter(r => r.questionMode !== "written").length})`}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 px-4 sm:px-6 py-4 space-y-3 pb-8">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No exams match this filter.</p>
        ) : (
          filtered.map((record) => (
            <ExamRecordCard
              key={record.id}
              record={record}
              isExpanded={expandedIds.has(record.id)}
              onToggle={() => setExpandedIds(prev => {
                const next = new Set(prev);
                next.has(record.id) ? next.delete(record.id) : next.add(record.id);
                return next;
              })}
              onDelete={() => setDeleteId(record.id)}
            />
          ))
        )}
      </div>

      <ConfirmModal
        open={!!deleteId}
        title="Delete exam record"
        description="This exam record will be permanently deleted."
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={() => { if (deleteId) deleteExamRecord(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)}
      />
      <ConfirmModal
        open={clearConfirmOpen}
        title="Clear exam history"
        description={`All ${examHistory.length} exam records will be permanently deleted.`}
        confirmText="Clear All"
        cancelText="Cancel"
        onConfirm={() => { clearExamHistory(); setClearConfirmOpen(false); }}
        onCancel={() => setClearConfirmOpen(false)}
      />
    </div>
  );
}