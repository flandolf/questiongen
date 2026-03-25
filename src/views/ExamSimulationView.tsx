import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store";
import {
  Topic, Difficulty, TechMode, GeneratedQuestion, MarkAnswerResponse, TOPICS,
  MATH_METHODS_SUBTOPICS, SPECIALIST_MATH_SUBTOPICS, CHEMISTRY_SUBTOPICS,
  PHYSICAL_EDUCATION_SUBTOPICS, QuestionHistoryEntry, McHistoryEntry, McQuestion,
  ExamRecord, ExamQuestionResult,
} from "../types";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Slider } from "../components/ui/slider";
import { MarkdownMath } from "../components/MarkdownMath";
import {
  UnifiedMcqOptionsGrid,
  UnifiedQuestionPromptCard,
  UnifiedWrittenResponseCard,
} from "../components/question/UnifiedQuestionBlocks";
import { normalizeMarkResponse, readBackendError } from "../lib/app-utils";
import {
  Clock, Play, ChevronRight, ChevronLeft, Flag,
  CheckCircle2, XCircle, Trophy, BookOpen, Target, Loader2, Sparkles,
  RotateCcw, Timer, Gauge, Zap, LayoutDashboard,
  History, CheckCheck,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ExamPhase = "setup" | "active" | "marking" | "results";
type ExamQuestionMode = "written" | "multiple-choice";

interface ExamConfig {
  topic: Topic;
  questionCount: number;
  timeLimitMinutes: number;
  difficulty: Difficulty;
  techMode: TechMode;
  questionMode: ExamQuestionMode;
  selectedSubtopics: string[];
  customFocusArea: string;
}

interface ExamQuestion extends GeneratedQuestion {
  options?: Array<{ label: string; text: string }>;
  correctAnswer?: string;
  explanationMarkdown?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getDifficultyBadgeClasses(level: Difficulty) {
  switch (level) {
    case "Essential Skills": return "border-green-300/50 bg-green-50 text-green-700 dark:border-green-900/40 dark:bg-green-950/20 dark:text-green-300";
    case "Easy": return "border-emerald-300/50 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300";
    case "Medium": return "border-amber-300/50 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300";
    case "Hard": return "border-orange-300/50 bg-orange-50 text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300";
    case "Extreme": return "border-rose-300/50 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300";
    default: return "";
  }
}

function getSubtopicsForTopic(topic: Topic): readonly string[] {
  switch (topic) {
    case "Mathematical Methods": return MATH_METHODS_SUBTOPICS;
    case "Specialist Mathematics": return SPECIALIST_MATH_SUBTOPICS;
    case "Chemistry": return CHEMISTRY_SUBTOPICS;
    case "Physical Education": return PHYSICAL_EDUCATION_SUBTOPICS;
    default: return [];
  }
}

// ─── Generating Screen ────────────────────────────────────────────────────────

function ExamGenerating({ config }: { config: ExamConfig | null }) {
  const [step, setStep] = useState(0);
  const steps = [
    "Analyzing syllabus requirements...",
    "Crafting unique questions...",
    "Formatting mathematical expressions...",
    "Preparing marking rubrics...",
    "Finalizing exam paper..."
  ];

  useEffect(() => {
    const interval = setInterval(() => setStep((s) => (s + 1) % steps.length), 2500);
    return () => clearInterval(interval);
  }, [steps.length]);

  return (
    <div className="min-h-full flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
      <div className="max-w-md w-full space-y-10 flex flex-col items-center text-center">
        <div className="relative">
          <div className="absolute inset-0 bg-violet-500/20 blur-3xl rounded-full animate-pulse" />
          <div className="relative w-28 h-28 bg-card border border-violet-500/20 rounded-[2rem] shadow-2xl shadow-violet-500/10 flex flex-col items-center justify-center gap-3 overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-transparent via-violet-500/50 to-transparent animate-pulse" />
            <Sparkles className="w-10 h-10 text-violet-500 animate-pulse" />
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
          </div>
        </div>
        <div className="space-y-4">
          <h2 className="text-3xl font-black tracking-tight">Generating Exam</h2>
          {config && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Badge variant="secondary" className="text-xs font-medium">{config.topic}</Badge>
              <Badge variant="secondary" className="text-xs font-medium">{config.difficulty}</Badge>
              <Badge variant="secondary" className="text-xs font-medium">{config.questionCount} Questions</Badge>
            </div>
          )}
        </div>
        <div className="w-full bg-card/50 border border-border/40 rounded-2xl p-4 relative text-left shadow-sm">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-violet-500/80 rounded-l-2xl" />
          <div className="flex items-center gap-4 pl-2">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5 text-violet-500" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-1">Status</p>
              <p className="text-sm font-medium text-foreground/90 animate-pulse">{steps[step]}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Marking Screen ───────────────────────────────────────────────────────────

function ExamMarkingScreen({
  questions,
  answers,
  apiKey,
  markModel,
  onComplete,
}: {
  questions: ExamQuestion[];
  answers: Record<string, string>;
  apiKey: string;
  markModel: string;
  onComplete: (feedback: Record<string, MarkAnswerResponse>) => void;
}) {
  const [feedback, setFeedback] = useState<Record<string, MarkAnswerResponse>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const writtenQuestions = questions.filter(q => !q.options);
  const total = writtenQuestions.length;

  useEffect(() => {
    if (total === 0) {
      onComplete({});
      return;
    }

    let cancelled = false;
    const feedbackMap: Record<string, MarkAnswerResponse> = {};

    async function markAll() {
      for (let i = 0; i < writtenQuestions.length; i++) {
        if (cancelled) return;
        const q = writtenQuestions[i];
        setCurrentIndex(i);
        const answer = answers[q.id] ?? "";
        if (!answer.trim()) {
          feedbackMap[q.id] = {
            verdict: "Not attempted",
            achievedMarks: 0,
            maxMarks: q.maxMarks,
            scoreOutOf10: 0,
            vcaaMarkingScheme: [],
            comparisonToSolutionMarkdown: "",
            feedbackMarkdown: "No answer was submitted for this question.",
            workedSolutionMarkdown: "",
          };
          setFeedback({ ...feedbackMap });
          continue;
        }
        try {
          const raw = await invoke<unknown>("mark_answer", {
            request: { question: q, studentAnswer: answer, model: markModel, apiKey },
          });
          if (cancelled) return;
          const response = normalizeMarkResponse(raw, q.maxMarks);
          feedbackMap[q.id] = response;
          setFeedback({ ...feedbackMap });
        } catch (err) {
          if (cancelled) return;
          setErrors(prev => ({ ...prev, [q.id]: readBackendError(err) }));
          feedbackMap[q.id] = {
            verdict: "Marking failed",
            achievedMarks: 0,
            maxMarks: q.maxMarks,
            scoreOutOf10: 0,
            vcaaMarkingScheme: [],
            comparisonToSolutionMarkdown: "",
            feedbackMarkdown: "Marking failed for this question. Please review manually.",
            workedSolutionMarkdown: "",
          };
          setFeedback({ ...feedbackMap });
        }
      }
      if (!cancelled) {
        setDone(true);
        // Brief pause so user sees 100%
        setTimeout(() => onComplete(feedbackMap), 600);
      }
    }

    void markAll();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const markedCount = Object.keys(feedback).length;
  const progressPct = total > 0 ? (markedCount / total) * 100 : 100;

  return (
    <div className="min-h-full flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
      <div className="max-w-lg w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="relative mx-auto w-24 h-24">
            <div className="absolute inset-0 bg-sky-500/15 blur-2xl rounded-full" />
            <div className="relative w-full h-full rounded-[2rem] bg-card border border-sky-500/20 flex items-center justify-center shadow-lg">
              {done
                ? <CheckCheck className="w-10 h-10 text-emerald-500" />
                : <Loader2 className="w-10 h-10 text-sky-500 animate-spin" />
              }
            </div>
          </div>
          <h2 className="text-2xl font-black tracking-tight">
            {done ? "Marking Complete" : "Marking Your Answers"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {done
              ? "All answers have been evaluated. Loading your results…"
              : `Evaluating question ${Math.min(currentIndex + 1, total)} of ${total}`
            }
          </p>
        </div>

        {/* Progress bar */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground font-medium">Progress</span>
            <span className="font-bold tabular-nums">
              {markedCount}/{total}
              {Object.keys(errors).length > 0 && (
                <span className="ml-2 text-rose-500 text-xs">({Object.keys(errors).length} error{Object.keys(errors).length > 1 ? "s" : ""})</span>
              )}
            </span>
          </div>
          <div className="h-3 w-full bg-muted/40 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${done ? "bg-emerald-500" : "bg-sky-500"}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Question status list */}
        <div className="rounded-xl border border-border/40 overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/30 border-b border-border/30 flex items-center gap-2">
            <FileTextIcon className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Questions</span>
          </div>
          <div className="divide-y divide-border/30 max-h-72 overflow-y-auto">
            {writtenQuestions.map((q, i) => {
              const isMarked = q.id in feedback;
              const hasError = q.id in errors;
              const isCurrent = i === currentIndex && !done;
              const fb = feedback[q.id];
              const pct = fb ? (fb.maxMarks > 0 ? fb.achievedMarks / fb.maxMarks * 100 : 0) : null;

              return (
                <div key={q.id} className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${isCurrent ? "bg-sky-500/5" : ""}`}>
                  <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                    {hasError ? (
                      <XCircle className="w-4 h-4 text-rose-500" />
                    ) : isMarked ? (
                      <CheckCircle2 className={`w-4 h-4 ${pct !== null && pct >= 100 ? "text-emerald-500" : "text-amber-500"}`} />
                    ) : isCurrent ? (
                      <Loader2 className="w-4 h-4 text-sky-500 animate-spin" />
                    ) : (
                      <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground font-mono shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0 text-sm line-clamp-1 text-foreground/80">{q.topic}</div>
                  {isMarked && fb && (
                    <span className={`shrink-0 text-xs font-bold tabular-nums px-1.5 py-0.5 rounded ${
                      pct !== null && pct >= 100 ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" :
                      pct !== null && pct >= 50 ? "bg-amber-100 dark:bg-amber-900/40 text-amber-600" :
                      "bg-rose-100 dark:bg-rose-900/40 text-rose-600"
                    }`}>
                      {fb.achievedMarks}/{fb.maxMarks}
                    </span>
                  )}
                  {isCurrent && !isMarked && (
                    <span className="shrink-0 text-[10px] text-sky-600 font-semibold animate-pulse">Marking…</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Tiny icon helper to avoid import conflict
function FileTextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────

function ExamSetup({ onStart }: { onStart: (config: ExamConfig) => void }) {
  const [topic, setTopic] = useState<Topic>("Mathematical Methods");
  const [questionCount, setQuestionCount] = useState(5);
  const [timeLimit, setTimeLimit] = useState(30);
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [techMode, setTechMode] = useState<TechMode>("mix");
  const [questionMode, setQuestionMode] = useState<ExamQuestionMode>("written");
  const [selectedSubtopics, setSelectedSubtopics] = useState<string[]>([]);
  const [customFocusArea, setCustomFocusArea] = useState("");

  const availableSubtopics = getSubtopicsForTopic(topic);

  const toggleSubtopic = (sub: string) =>
    setSelectedSubtopics(prev => prev.includes(sub) ? prev.filter(s => s !== sub) : [...prev, sub]);

  const handleTopicChange = (t: Topic) => { setTopic(t); setSelectedSubtopics([]); };

  const presets = [
    { label: "Quick Sprint", count: 5, time: 15, desc: "Perfect for a warm-up" },
    { label: "Standard Practice", count: 10, time: 30, desc: "Daily revision" },
    { label: "Deep Dive", count: 15, time: 60, desc: "Thorough assessment" },
    { label: "Marathon", count: 20, time: 90, desc: "Full endurance test" },
  ];

  return (
    <div className="min-h-full px-4 sm:px-6 py-10 space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-border/40">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center border border-violet-500/20 shadow-inner">
            <LayoutDashboard className="w-7 h-7 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight">Exam Simulator</h1>
            <p className="text-muted-foreground mt-1">Configure your environment for timed, realistic VCAA practice.</p>
          </div>
        </div>
        <Button
          size="lg"
          className="gap-2 h-12 px-8 text-base font-bold shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 transition-all"
          onClick={() => onStart({ topic, questionCount, timeLimitMinutes: timeLimit, difficulty, techMode, questionMode, selectedSubtopics, customFocusArea })}
        >
          <Play className="w-4 h-4 fill-current" />
          Initialize Exam
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-8">
        <div className="space-y-8">
          {/* Subject */}
          <section className="space-y-4">
            <h3 className="text-sm font-bold flex items-center gap-2 text-foreground/80">
              <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs">1</span>
              Select Subject
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TOPICS.map((t) => (
                <button key={t} type="button" onClick={() => handleTopicChange(t)}
                  className={`relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200 ${topic === t ? "border-violet-500 bg-violet-500/5 shadow-md" : "border-border/40 bg-card hover:border-violet-500/30 hover:bg-muted/20"}`}>
                  <span className={`block text-sm font-semibold ${topic === t ? "text-violet-700 dark:text-violet-300" : "text-foreground"}`}>{t}</span>
                </button>
              ))}
            </div>

            {availableSubtopics.length > 0 && (
              <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-3 shadow-sm">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Focus Areas</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Select specific subtopics or leave blank to cover all</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {availableSubtopics.map((sub) => (
                    <button key={sub} type="button" onClick={() => toggleSubtopic(sub)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-all cursor-pointer select-none ${selectedSubtopics.includes(sub) ? "bg-violet-500 text-white border-violet-500 shadow-sm" : "border-border/50 text-muted-foreground hover:border-violet-500/50 hover:text-foreground"}`}>
                      {sub}
                    </button>
                  ))}
                </div>
                <div className="space-y-1.5 pt-1 border-t border-border/30">
                  <p className="text-xs font-medium text-muted-foreground">Custom Focus Area <span className="font-normal opacity-70">— optional</span></p>
                  <input type="text" value={customFocusArea} onChange={(e) => setCustomFocusArea(e.target.value)} maxLength={160}
                    placeholder="e.g. projectile motion with optimisation constraints"
                    className="w-full text-xs h-8 rounded-lg border border-border/50 bg-background px-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-500" />
                </div>
              </div>
            )}
          </section>

          {/* Format */}
          <section className="space-y-4">
            <h3 className="text-sm font-bold flex items-center gap-2 text-foreground/80">
              <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs">2</span>
              Question Format & Parameters
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-card border border-border/40 rounded-3xl p-6 shadow-sm">
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground">Response Type</p>
                <div className="flex flex-col gap-2">
                  <button type="button" onClick={() => setQuestionMode("written")}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-sm font-medium transition-all ${questionMode === "written" ? "border-sky-500 bg-sky-500/5 text-sky-700 dark:text-sky-300" : "border-border/40 hover:bg-muted/30 text-muted-foreground"}`}>
                    <BookOpen className="w-4 h-4" /> Written Solutions
                  </button>
                  <button type="button" onClick={() => setQuestionMode("multiple-choice")}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-sm font-medium transition-all ${questionMode === "multiple-choice" ? "border-fuchsia-500 bg-fuchsia-500/5 text-fuchsia-700 dark:text-fuchsia-300" : "border-border/40 hover:bg-muted/30 text-muted-foreground"}`}>
                    <Target className="w-4 h-4" /> Multiple Choice
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground">Technology Mode</p>
                <div className="flex flex-col gap-2">
                  {(["tech-free", "tech-active", "mix"] as TechMode[]).map((m) => (
                    <button key={m} type="button" onClick={() => setTechMode(m)}
                      className={`rounded-xl border p-3 text-sm font-medium transition-all text-left ${techMode === m ? "border-foreground bg-foreground/5 text-foreground" : "border-border/40 hover:bg-muted/30 text-muted-foreground"}`}>
                      {m === "tech-free" ? "Tech-Free (No Calculator)" : m === "tech-active" ? "Tech-Active (Calculator)" : "Mixed Allocation"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Difficulty */}
          <section className="space-y-4">
            <h3 className="text-sm font-bold flex items-center gap-2 text-foreground/80">
              <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs">3</span>
              Difficulty Level
            </h3>
            <div className="flex flex-wrap gap-3">
              {(["Essential Skills", "Easy", "Medium", "Hard", "Extreme"] as Difficulty[]).map((d) => (
                <button key={d} type="button" onClick={() => setDifficulty(d)}
                  className={`rounded-xl border px-5 py-2.5 text-sm font-semibold transition-all shadow-sm ${getDifficultyBadgeClasses(d)} ${difficulty === d ? "ring-2 ring-offset-2 ring-offset-background ring-foreground/20 scale-[1.02]" : "opacity-70 hover:opacity-100 hover:scale-[1.02]"}`}>
                  {d}
                </button>
              ))}
            </div>
          </section>

          {/* Length */}
          <section className="space-y-4">
            <h3 className="text-sm font-bold flex items-center gap-2 text-foreground/80">
              <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs">4</span>
              Length & Duration
            </h3>
            <div className="flex flex-row items-center justify-between gap-20">
              <div className="space-y-4 w-1/2">
                <div className="flex justify-between items-center">
                  <p className="text-xs font-semibold text-muted-foreground">Total Questions</p>
                  <span className="text-lg font-black text-foreground">{questionCount}</span>
                </div>
                <Slider min={1} max={20} value={[questionCount]} onValueChange={([v]) => setQuestionCount(v)} />
              </div>
              <div className="space-y-4 w-1/2">
                <div className="flex justify-between items-center">
                  <p className="text-xs font-semibold text-muted-foreground">Time Limit</p>
                  <span className="text-lg font-black text-foreground">{timeLimit} min</span>
                </div>
                <Slider min={5} max={120} step={5} value={[timeLimit]} onValueChange={([v]) => setTimeLimit(v)} />
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <div className="bg-card border border-border/40 rounded-3xl p-6 space-y-5 shadow-sm">
            <div className="flex items-center gap-2 text-violet-500 mb-2">
              <Zap className="w-5 h-5 fill-current" />
              <h3 className="font-bold">Quick Configurations</h3>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {presets.map((p) => (
                <button key={p.label} type="button"
                  onClick={() => { setQuestionCount(p.count); setTimeLimit(p.time); }}
                  className={`group rounded-2xl border p-4 text-left transition-all duration-200 ${questionCount === p.count && timeLimit === p.time ? "border-violet-500 bg-violet-500/10 shadow-md" : "border-border/40 bg-background hover:border-violet-500/40"}`}>
                  <div className="flex justify-between items-center mb-1">
                    <p className={`font-bold ${questionCount === p.count && timeLimit === p.time ? "text-violet-700 dark:text-violet-300" : ""}`}>{p.label}</p>
                    <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-md">{p.count}Q / {p.time}m</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{p.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-muted/30 border border-border/40 rounded-3xl p-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Simulation Rules</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed"><strong className="text-foreground">Strict Timing:</strong> The exam auto-submits when the timer reaches zero.</p>
              </div>
              <div className="flex items-start gap-3">
                <LayoutDashboard className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed"><strong className="text-foreground">Sequential Flow:</strong> Answer questions in order. You can skip, but completion is tracked.</p>
              </div>
              <div className="flex items-start gap-3">
                <Flag className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed"><strong className="text-foreground">Written Questions:</strong> Submitted individually for AI marking after time ends.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Active Exam Screen ───────────────────────────────────────────────────────

function ExamActive({
  config, questions, onFinish,
}: {
  config: ExamConfig;
  questions: ExamQuestion[];
  onFinish: (answers: Record<string, string>, mcSelected: Record<string, string>, timeUsedSeconds: number) => void;
}) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [mcSelected, setMcSelected] = useState<Record<string, string>>({});
  const [timeRemaining, setTimeRemaining] = useState(config.timeLimitMinutes * 60);
  const [showAnswer, setShowAnswer] = useState<Record<string, boolean>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(Date.now());

  const question = questions[currentIdx];
  const isWritten = config.questionMode === "written";
  const isMc = !isWritten;
  const isLast = currentIdx === questions.length - 1;
  const answeredCount = isWritten ? Object.keys(answers).length : Object.keys(mcSelected).length;
  const progressPct = ((currentIdx + 1) / questions.length) * 100;
  const isTimeWarning = timeRemaining < 300;
  const isTimeCritical = timeRemaining < 60;

  const canAdvance = isWritten
    ? (answers[question?.id]?.trim().length ?? 0) > 0 || showAnswer[question?.id]
    : Boolean(question && mcSelected[question.id]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
          onFinish(answers, mcSelected, elapsed);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNext = () => {
    if (isLast) {
      if (timerRef.current) clearInterval(timerRef.current);
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
      onFinish(answers, mcSelected, elapsed);
      return;
    }
    setCurrentIdx((i) => i + 1);
  };

  const handleFinish = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
    onFinish(answers, mcSelected, elapsed);
  };

  if (!question) return null;

  return (
    <div className="flex flex-col h-full bg-background animate-in fade-in duration-300">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/40 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={handleFinish} className="gap-2 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10">
            <Flag className="w-4 h-4" /> End Exam
          </Button>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <div className="hidden sm:flex items-center gap-2 text-sm font-medium">
            <span className="text-foreground">Q {currentIdx + 1}</span>
            <span className="text-muted-foreground">of {questions.length}</span>
          </div>
        </div>

        <div className={`flex items-center gap-2 font-mono text-lg font-bold px-4 py-1.5 rounded-full shadow-sm border transition-colors ${
          isTimeCritical ? "bg-rose-500/10 text-rose-600 border-rose-500/20 animate-pulse" :
          isTimeWarning ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
          "bg-card text-foreground border-border/50"
        }`}>
          <Clock className="w-4 h-4" />
          {formatTime(timeRemaining)}
        </div>

        <div className="flex items-center gap-2">
          {answeredCount > 0 && (
            <div className="hidden md:flex items-center gap-2 text-xs mr-2 bg-muted/50 px-3 py-1.5 rounded-full">
              <span className="font-semibold text-foreground">{answeredCount} answered</span>
            </div>
          )}
          <Button variant="outline" size="icon" disabled={currentIdx === 0} onClick={() => setCurrentIdx(i => i - 1)} className="h-9 w-9 rounded-full">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant={canAdvance ? "default" : "secondary"} onClick={handleNext} className="h-9 rounded-full px-5 gap-1.5 shadow-sm">
            {isLast ? "Complete" : "Next"} <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Progress */}
      <div className="h-1 w-full bg-muted/30 shrink-0">
        <div className="h-full bg-violet-500 transition-all duration-500 ease-out" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <UnifiedQuestionPromptCard
            promptMarkdown={question.promptMarkdown}
            topic={question.topic}
            subtopic={question.subtopic}
            difficulty={config.difficulty}
            maxMarks={isWritten ? question.maxMarks : undefined}
            modeLabel={isWritten ? "Written" : "Multiple Choice"}
            modeTone={isWritten ? "written" : "mc"}
          />

          {/* MC options */}
          {isMc && question.options && (
            <UnifiedMcqOptionsGrid
              options={question.options}
              selectedAnswer={mcSelected[question.id]}
              answered={Boolean(mcSelected[question.id])}
              revealCorrectness={false}
              onSelect={(label) => setMcSelected(prev => ({ ...prev, [question.id]: label }))}
            />
          )}

          {/* Written answer */}
          {isWritten && (
            <UnifiedWrittenResponseCard
              value={answers[question.id] ?? ""}
              onChange={(value) => setAnswers(prev => ({ ...prev, [question.id]: value }))}
              disabled={showAnswer[question.id]}
              maxMarks={question.maxMarks}
              showReveal={!showAnswer[question.id]}
              onReveal={() => setShowAnswer(prev => ({ ...prev, [question.id]: true }))}
              revealLabel="Skip / Reveal"
              footerNote="Your answer will be marked by AI after the exam ends."
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Results Screen ───────────────────────────────────────────────────────────

function ExamResults({
  config, questions, feedback, mcSelected, timeUsed, onRetry, onExit,
}: {
  config: ExamConfig;
  questions: ExamQuestion[];
  feedback: Record<string, MarkAnswerResponse>;
  mcSelected: Record<string, string>;
  timeUsed: number;
  onRetry: () => void;
  onExit: () => void;
}) {
  const navigate = useNavigate();
  const isWritten = config.questionMode === "written";

  const writtenScore = questions.reduce((sum, q) => sum + (feedback[q.id]?.achievedMarks ?? 0), 0);
  const writtenMax = questions.reduce((sum, q) => sum + (feedback[q.id]?.maxMarks ?? q.maxMarks), 0);
  const mcCorrect = questions.filter((q) => mcSelected[q.id] === q.correctAnswer).length;
  const mcTotal = questions.length;

  const totalScore = isWritten ? writtenScore : mcCorrect;
  const totalMax = isWritten ? writtenMax : mcTotal;
  const pct = totalMax > 0 ? (totalScore / totalMax) * 100 : 0;

  const ringColor = pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#f43f5e";
  const ringColorTailwind = pct >= 80 ? "text-emerald-500" : pct >= 50 ? "text-amber-500" : "text-rose-500";
  const r = 64; const circ = 2 * Math.PI * r; const dash = circ * (pct / 100);

  return (
    <div className="min-h-full px-4 sm:px-6 py-12 max-w-4xl mx-auto space-y-12 animate-in fade-in zoom-in-95 duration-500">
      {/* Score */}
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="relative w-40 h-40 group">
          <div className="absolute inset-0 bg-background rounded-full shadow-inner border border-border/40" />
          <svg className="-rotate-90 absolute inset-0 drop-shadow-md" width="160" height="160" viewBox="0 0 160 160">
            <circle cx="80" cy="80" r={r} fill="none" stroke="currentColor" strokeWidth="10" className="text-muted/30" />
            <circle cx="80" cy="80" r={r} fill="none" stroke={ringColor} strokeWidth="10"
              strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
              style={{ transition: "stroke-dasharray 1.2s cubic-bezier(0.4,0,0.2,1)" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
            <span className={`text-4xl font-black tabular-nums tracking-tighter ${ringColorTailwind}`}>
              {Math.round(pct)}%
            </span>
            <span className="text-xs text-muted-foreground font-semibold mt-1 uppercase tracking-wider">
              {totalScore}/{totalMax} {isWritten ? "Marks" : "Correct"}
            </span>
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-black tracking-tight">Simulation Complete</h2>
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground font-medium">
            <span>{config.topic}</span><span>&bull;</span>
            <span>{config.difficulty}</span><span>&bull;</span>
            <span>{questions.length} Questions</span>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: <Gauge className="w-6 h-6 text-violet-500" />, bg: "bg-violet-500/10", label: "Time Used", value: formatTime(timeUsed) },
          { icon: <Target className="w-6 h-6 text-sky-500" />, bg: "bg-sky-500/10", label: "Accuracy", value: `${Math.round(pct)}%`, color: ringColorTailwind },
          { icon: <Trophy className="w-6 h-6 text-amber-500" />, bg: "bg-amber-500/10", label: isWritten ? "Marks Earned" : "Correct", value: isWritten ? `${writtenScore}/${writtenMax}` : `${mcCorrect}/${mcTotal}` },
        ].map((stat) => (
          <div key={stat.label} className="rounded-3xl border border-border/40 bg-card p-6 flex items-center gap-5 shadow-sm">
            <div className={`w-12 h-12 rounded-2xl ${stat.bg} flex items-center justify-center shrink-0`}>{stat.icon}</div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{stat.label}</p>
              <div className={`text-2xl font-black tabular-nums text-foreground mt-0.5 ${stat.color ?? ""}`}>{stat.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Question breakdown */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold flex items-center gap-2 text-foreground/80">
          <span className="w-2 h-6 bg-violet-500 rounded-full inline-block" />
          Detailed Breakdown
        </h3>
        <div className="grid gap-4">
          {questions.map((q, i) => {
            const qFeedback = feedback[q.id];
            const isCorrect = isWritten
              ? qFeedback && qFeedback.achievedMarks >= qFeedback.maxMarks
              : mcSelected[q.id] === q.correctAnswer;

            return (
              <div key={q.id} className="rounded-2xl border border-border/40 bg-card overflow-hidden shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center gap-4 px-5 py-4 bg-muted/10">
                  <span className="w-8 h-8 rounded-xl bg-background border border-border/50 flex items-center justify-center text-xs font-black shrink-0 shadow-sm">
                    {i + 1}
                  </span>
                  <div className="flex-1 text-sm font-medium line-clamp-1 text-foreground/90">
                    <MarkdownMath content={q.promptMarkdown.replace(/\n/g, " ")} />
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {isWritten && qFeedback && (
                      <span className="text-sm font-bold tabular-nums text-foreground bg-background border border-border/50 px-2 py-1 rounded-md">
                        {qFeedback.achievedMarks}<span className="text-muted-foreground/60">/{qFeedback.maxMarks}</span>
                      </span>
                    )}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isCorrect ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}>
                      {isCorrect ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                    </div>
                  </div>
                </div>

                {isWritten && qFeedback?.feedbackMarkdown && (
                  <div className="px-5 py-4 text-sm prose prose-sm dark:prose-invert max-w-none border-t border-border/30 bg-background/50">
                    <MarkdownMath content={qFeedback.feedbackMarkdown} />
                  </div>
                )}

                {!isWritten && mcSelected[q.id] !== q.correctAnswer && (
                  <div className="px-5 py-4 space-y-3 border-t border-border/30 bg-background/50">
                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                      <p className="text-muted-foreground">Your selection: <strong className="text-rose-600 dark:text-rose-400 font-semibold px-2 py-0.5 bg-rose-500/10 rounded">{mcSelected[q.id] ?? "None"}</strong></p>
                      <p className="text-muted-foreground">Correct answer: <strong className="text-emerald-600 dark:text-emerald-400 font-semibold px-2 py-0.5 bg-emerald-500/10 rounded">{q.correctAnswer}</strong></p>
                    </div>
                    {q.explanationMarkdown && (
                      <div className="text-sm prose prose-sm dark:prose-invert max-w-none mt-2 pt-3 border-t border-border/30">
                        <MarkdownMath content={q.explanationMarkdown} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-center gap-4 pt-8">
        <Button variant="outline" size="lg" onClick={() => navigate("/exam-history")} className="gap-2 w-full sm:w-auto h-12 px-8">
          <History className="w-4 h-4" /> View History
        </Button>
        <Button variant="outline" size="lg" onClick={onExit} className="gap-2 w-full sm:w-auto h-12 px-8">
          <ChevronLeft className="w-4 h-4" /> Setup
        </Button>
        <Button size="lg" onClick={onRetry} className="gap-2 w-full sm:w-auto h-12 px-8 bg-foreground text-background hover:bg-foreground/90 shadow-lg">
          <RotateCcw className="w-4 h-4" /> New Simulation
        </Button>
      </div>
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

export default function ExamSimulationView() {
  const navigate = useNavigate();
  const apiKey = useAppStore((s) => s.apiKey);
  const model = useAppStore((s) => s.model);
  const markingModel = useAppStore((s) => s.markingModel);
  const useSeparateMarkingModel = useAppStore((s) => s.useSeparateMarkingModel);
  const isGenerating = useAppStore((s) => s.isGenerating);
  const setIsGenerating = useAppStore((s) => s.setIsGenerating);
  const setErrorMessage = useAppStore((s) => s.setErrorMessage);
  const recordCompletion = useAppStore((s) => s.recordCompletion);
  const setQuestionHistory = useAppStore((s) => s.setQuestionHistory);
  const setMcHistory = useAppStore((s) => s.setMcHistory);
  const addExamRecord = useAppStore((s) => s.addExamRecord);

  const [phase, setPhase] = useState<ExamPhase>("setup");
  const [config, setConfig] = useState<ExamConfig | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [finalAnswers, setFinalAnswers] = useState<Record<string, string>>({});
  const [finalFeedback, setFinalFeedback] = useState<Record<string, MarkAnswerResponse>>({});
  const [finalMcSelected, setFinalMcSelected] = useState<Record<string, string>>({});
  const [timeUsed, setTimeUsed] = useState(0);

  const markModel = useSeparateMarkingModel && markingModel?.trim() ? markingModel : model;

  const handleStart = useCallback(async (cfg: ExamConfig) => {
    setConfig(cfg);
    setPhase("active");
    setIsGenerating(true);
    setErrorMessage(null);

    const isMath = cfg.topic === "Mathematical Methods" || cfg.topic === "Specialist Mathematics";

    try {
      if (cfg.questionMode === "written") {
        const response = await invoke<{ questions: GeneratedQuestion[]; durationMs: number }>("generate_questions", {
          request: {
            topics: [cfg.topic], difficulty: cfg.difficulty, questionCount: cfg.questionCount,
            maxMarksPerQuestion: isMath ? 10 : undefined, model, apiKey, techMode: cfg.techMode,
            subtopics: cfg.selectedSubtopics, subtopicInstructions: {},
            customFocusArea: cfg.customFocusArea.trim() || undefined,
            avoidSimilarQuestions: false, priorQuestionPrompts: [],
          },
        });
        setQuestions(response.questions.map((q, i) => ({ ...q, id: `exam-${i + 1}` })));
      } else {
        const response = await invoke<{
          questions: Array<GeneratedQuestion & { options: Array<{ label: string; text: string }>; correctAnswer: string; explanationMarkdown: string }>;
        }>("generate_mc_questions", {
          request: {
            topics: [cfg.topic], difficulty: cfg.difficulty, questionCount: cfg.questionCount,
            model, apiKey, techMode: cfg.techMode,
            subtopics: cfg.selectedSubtopics, subtopicInstructions: {},
            customFocusArea: cfg.customFocusArea.trim() || undefined,
            avoidSimilarQuestions: false, priorQuestionPrompts: [],
          },
        });
        setQuestions(response.questions.map((q, i) => ({ ...q, id: `exam-mc-${i + 1}` })));
      }
    } catch (error) {
      setErrorMessage(readBackendError(error));
      setPhase("setup");
    } finally {
      setIsGenerating(false);
    }
  }, [apiKey, model, setIsGenerating, setErrorMessage]);

  const handleExamFinish = useCallback((answers: Record<string, string>, mcSelected: Record<string, string>, elapsed: number) => {
    setFinalAnswers(answers);
    setFinalMcSelected(mcSelected);
    setTimeUsed(elapsed);

    if (config?.questionMode === "written") {
      // Go to marking screen
      setPhase("marking");
    } else {
      // MC: no marking needed, go straight to results and record history
      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      const mcEntries: McHistoryEntry[] = questions.map((q, i) => ({
        type: "multiple-choice" as const,
        id: `exam-mc-${now}-${i}`,
        createdAt: nowIso,
        lastModified: now,
        question: q as unknown as McQuestion,
        selectedAnswer: mcSelected[q.id] ?? "",
        correct: mcSelected[q.id] === q.correctAnswer,
        awardedMarks: mcSelected[q.id] === q.correctAnswer ? 1 : 0,
        maxMarks: 1,
        analytics: {
          attemptKind: "initial" as const, attemptSequence: 1,
          answerCharacterCount: 0, answerWordCount: 0, usedImageUpload: false,
        },
      }));
      setMcHistory((prev: McHistoryEntry[]) => [...mcEntries, ...prev].slice(0, 200));
      questions.forEach(() => recordCompletion("multiple-choice"));

      // Save to exam record
      if (config) {
        const mcCorrect = questions.filter(q => mcSelected[q.id] === q.correctAnswer).length;
        const record: ExamRecord = {
          id: `exam-record-${now}`,
          createdAt: nowIso,
          topic: config.topic,
          difficulty: config.difficulty,
          questionMode: "multiple-choice",
          techMode: config.techMode,
          questionCount: questions.length,
          timeUsedSeconds: elapsed,
          totalScore: mcCorrect,
          totalMax: questions.length,
          questionResults: questions.map(q => ({
            questionId: q.id,
            topic: q.topic,
            subtopic: q.subtopic,
            promptMarkdown: q.promptMarkdown,
            achievedMarks: mcSelected[q.id] === q.correctAnswer ? 1 : 0,
            maxMarks: 1,
            correct: mcSelected[q.id] === q.correctAnswer,
            selectedAnswer: mcSelected[q.id],
            correctAnswer: q.correctAnswer,
          } as ExamQuestionResult)),
        };
        addExamRecord(record);
      }

      setPhase("results");
    }
  }, [config, questions, setMcHistory, recordCompletion, addExamRecord]);

  const handleMarkingComplete = useCallback((feedback: Record<string, MarkAnswerResponse>) => {
    setFinalFeedback(feedback);
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    // Record question history
    const historyEntries: QuestionHistoryEntry[] = questions
      .filter(q => feedback[q.id])
      .map((q, i) => ({
        id: `exam-w-${now}-${i}`,
        createdAt: nowIso,
        lastModified: now,
        question: q,
        uploadedAnswer: finalAnswers[q.id] ?? "",
        workedSolutionMarkdown: feedback[q.id]?.workedSolutionMarkdown ?? "",
        markResponse: feedback[q.id],
        analytics: {
          attemptKind: "initial" as const, attemptSequence: 1,
          answerCharacterCount: (finalAnswers[q.id] ?? "").length,
          answerWordCount: (finalAnswers[q.id] ?? "").split(/\s+/).filter(Boolean).length,
          usedImageUpload: false,
        },
      }));
    if (historyEntries.length > 0) {
      setQuestionHistory((prev: QuestionHistoryEntry[]) => [...historyEntries, ...prev].slice(0, 200));
    }
    questions.forEach(() => recordCompletion("written"));

    // Save exam record
    if (config) {
      const writtenScore = questions.reduce((s, q) => s + (feedback[q.id]?.achievedMarks ?? 0), 0);
      const writtenMax = questions.reduce((s, q) => s + (feedback[q.id]?.maxMarks ?? q.maxMarks), 0);
      const record: ExamRecord = {
        id: `exam-record-${now}`,
        createdAt: nowIso,
        topic: config.topic,
        difficulty: config.difficulty,
        questionMode: "written",
        techMode: config.techMode,
        questionCount: questions.length,
        timeUsedSeconds: timeUsed,
        totalScore: writtenScore,
        totalMax: writtenMax,
        questionResults: questions.map(q => {
          const fb = feedback[q.id];
          return {
            questionId: q.id,
            topic: q.topic,
            subtopic: q.subtopic,
            promptMarkdown: q.promptMarkdown,
            achievedMarks: fb?.achievedMarks ?? 0,
            maxMarks: fb?.maxMarks ?? q.maxMarks,
            correct: fb ? fb.achievedMarks >= fb.maxMarks : false,
          } as ExamQuestionResult;
        }),
      };
      addExamRecord(record);
    }

    setPhase("results");
  }, [questions, finalAnswers, config, timeUsed, setQuestionHistory, recordCompletion, addExamRecord]);

  const handleRetry = useCallback(() => {
    if (config) {
      setPhase("setup");
      setQuestions([]);
      setFinalAnswers({});
      setFinalFeedback({});
      setFinalMcSelected({});
    }
  }, [config]);

  const handleExit = useCallback(() => {
    setPhase("setup");
    setQuestions([]);
    setConfig(null);
    setFinalAnswers({});
    setFinalFeedback({});
    setFinalMcSelected({});
  }, []);

  if (!apiKey) {
    return (
      <div className="min-h-full flex items-center justify-center p-8 bg-background">
        <div className="text-center space-y-6 max-w-sm bg-card border border-border/40 p-8 rounded-3xl shadow-sm">
          <div className="w-20 h-20 rounded-[2rem] bg-violet-500/10 flex items-center justify-center mx-auto shadow-inner">
            <Timer className="w-10 h-10 text-violet-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">API Key Required</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">Configure your OpenRouter API key in Settings to initialize the Exam Simulator.</p>
          </div>
          <Button size="lg" className="w-full bg-foreground text-background hover:bg-foreground/90 shadow-md" onClick={() => navigate("/settings")}>
            Configure Settings
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "setup") return <ExamSetup onStart={handleStart} />;

  if (phase === "active") {
    if (isGenerating || questions.length === 0) return <ExamGenerating config={config} />;
    if (config && questions.length > 0) {
      return <ExamActive config={config} questions={questions} onFinish={handleExamFinish} />;
    }
  }

  if (phase === "marking" && config) {
    return (
      <ExamMarkingScreen
        questions={questions}
        answers={finalAnswers}
        apiKey={apiKey}
        markModel={markModel}
        onComplete={handleMarkingComplete}
      />
    );
  }

  if (phase === "results" && config) {
    return (
      <ExamResults
        config={config} questions={questions}
        feedback={finalFeedback} mcSelected={finalMcSelected}
        timeUsed={timeUsed} onRetry={handleRetry} onExit={handleExit}
      />
    );
  }

  return null;
}
