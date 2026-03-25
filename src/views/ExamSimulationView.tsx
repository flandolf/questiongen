import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store";
import { useAppSettings } from "../AppContext";
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
import { normalizeMarkResponse, readBackendError, formatCostUsd, estimateTokensAndCost } from "../lib/app-utils";
import {
  Clock, ChevronRight, ChevronLeft, Flag,
  CheckCircle2, XCircle, Trophy, BookOpen, Target, Loader2, Sparkles,
  RotateCcw, Timer, Gauge, Pause, Play,
  History, CheckCheck,
  DollarSign, Coins,
  FunctionSquare, SigmaSquare, FlaskConical, Dumbbell,
} from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/primitives";
import { CollapsibleStep, SectionDivider } from "@/components/generator/SetupPanel";

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

function getSubtopicsForTopic(topic: Topic): readonly string[] {
  switch (topic) {
    case "Mathematical Methods": return MATH_METHODS_SUBTOPICS;
    case "Specialist Mathematics": return SPECIALIST_MATH_SUBTOPICS;
    case "Chemistry": return CHEMISTRY_SUBTOPICS;
    case "Physical Education": return PHYSICAL_EDUCATION_SUBTOPICS;
    default: return [];
  }
}

const DIFFICULTY_META: Record<Difficulty, { label: string; color: string; desc: string }> = {
  "Essential Skills": { label: "Essential", color: "text-emerald-600 dark:text-emerald-400", desc: "Core concepts" },
  Easy: { label: "Easy", color: "text-sky-600 dark:text-sky-400", desc: "Straightforward" },
  Medium: { label: "Medium", color: "text-amber-600 dark:text-amber-400", desc: "Balanced challenge" },
  Hard: { label: "Hard", color: "text-orange-600 dark:text-orange-400", desc: "Complex problems" },
  Extreme: { label: "Extreme", color: "text-rose-600 dark:text-rose-400", desc: "Exam edge cases" },
};

const TOPIC_ICONS: Partial<Record<Topic, React.ReactNode>> = {
  "Mathematical Methods": <FunctionSquare className="w-3.5 h-3.5" />,
  "Specialist Mathematics": <SigmaSquare className="w-3.5 h-3.5" />,
  Chemistry: <FlaskConical className="w-3.5 h-3.5" />,
  "Physical Education": <Dumbbell className="w-3.5 h-3.5" />,
};

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
                    <span className={`shrink-0 text-xs font-bold tabular-nums px-1.5 py-0.5 rounded ${pct !== null && pct >= 100 ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" :
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
  const { apiKey, model } = useAppSettings();
  const [topic, setTopic] = useState<Topic>("Mathematical Methods");
  const generationHistory = useAppStore((s) => s.generationHistory);
  const [questionCount, setQuestionCount] = useState(5);
  const [timeLimit, setTimeLimit] = useState(30);
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [techMode, setTechMode] = useState<TechMode>("mix");
  const [questionMode, setQuestionMode] = useState<ExamQuestionMode>("written");
  const [selectedSubtopics, setSelectedSubtopics] = useState<string[]>([]);
  const [customFocusArea] = useState("");
  const [promptPricePerToken, setPromptPricePerToken] = useState<number | null>(null);
  const [completionPricePerToken, setCompletionPricePerToken] = useState<number | null>(null);

  const availableSubtopics = getSubtopicsForTopic(topic);

  const hasAnyMathTopic = topic === "Mathematical Methods" || topic === "Specialist Mathematics";

  useEffect(() => {
    let cancelled = false;
    async function fetchStats() {
      if (!apiKey || !model || model === "custom") return;
      try {
        const stats = await invoke<any>("get_model_stats", { apiKey, modelId: model });
        if (cancelled) return;
        setPromptPricePerToken(stats.promptPricePerToken ?? null);
        setCompletionPricePerToken(stats.completionPricePerToken ?? null);
      } catch {
        setPromptPricePerToken(null);
        setCompletionPricePerToken(null);
      }
    }
    void fetchStats();
    return () => { cancelled = true; };
  }, [apiKey, model]);

  const estimated = useMemo(() => {
    // Use stored generation history to refine estimates; fallback to static formula inside estimator
    return estimateTokensAndCost(
      generationHistory,
      topic,
      difficulty,
      questionCount,
      questionMode,
      techMode,
      undefined,
      selectedSubtopics.length > 0 ? selectedSubtopics : undefined,
      customFocusArea.trim() || undefined,
      promptPricePerToken,
      completionPricePerToken
    );
  }, [generationHistory, topic, difficulty, questionCount, questionMode, techMode, selectedSubtopics, customFocusArea, promptPricePerToken, completionPricePerToken]);

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
    <PageContainer>
      <PageHeader
        title="Exam Simulator"
        description="Timed practice with AI marking"
      />

      <div className="space-y-2">
        {/* Subject */}
        <CollapsibleStep
          number={1}
          title="Subject"
          subtitle={topic}
          chips={
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-1">
              {TOPIC_ICONS[topic] && <span className="opacity-70">{TOPIC_ICONS[topic]}</span>}
              {topic.split(" ")[0]}
            </span>
          }
        >
          <div className="grid grid-cols-2 gap-2">
            {TOPICS.map((t) => {
              const isSelected = topic === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTopicChange(t)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium text-left transition-all duration-150 cursor-pointer
                    ${isSelected
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-muted/30"
                    }`}
                >
                  <span className="shrink-0">{TOPIC_ICONS[t] ?? <BookOpen className="w-3.5 h-3.5" />}</span>
                  <span className="leading-tight">{t}</span>
                  {isSelected && <CheckCheck className="w-3.5 h-3.5 ml-auto shrink-0 opacity-80" />}
                </button>
              );
            })}
          </div>

          {availableSubtopics.length > 0 && (
            <>
              <SectionDivider />
              <div className="rounded-lg border border-border/40 bg-muted/20 p-4 space-y-3">
                <p className="text-xs font-medium text-muted-foreground">Focus areas <span className="opacity-60">(optional)</span></p>
                <div className="flex flex-wrap gap-1.5">
                  {availableSubtopics.map((sub) => (
                    <button key={sub} type="button" onClick={() => toggleSubtopic(sub)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-all duration-150 cursor-pointer select-none ${selectedSubtopics.includes(sub) ? "bg-primary text-primary-foreground border-primary shadow-sm" : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"}`}>
                      {sub}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </CollapsibleStep>

        <SectionDivider />

        {/* Format */}
        <CollapsibleStep
          number={2}
          title="Format"
          subtitle={questionMode === "written" ? "Written" : "Multiple Choice"}
        >
          <div className="space-y-3">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Response</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setQuestionMode("written")}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium text-center transition-all duration-150 cursor-pointer ${questionMode === "written" ? "bg-primary text-primary-foreground border-primary shadow-sm" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-muted/30"}`}>
                  <BookOpen className="w-3.5 h-3.5" /> Written
                </button>
                <button type="button" onClick={() => setQuestionMode("multiple-choice")}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium text-center transition-all duration-150 cursor-pointer ${questionMode === "multiple-choice" ? "bg-primary text-primary-foreground border-primary shadow-sm" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-muted/30"}`}>
                  <Target className="w-3.5 h-3.5" /> Multiple Choice
                </button>
              </div>
            </div>

            {hasAnyMathTopic && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Technology</p>
                <div className="flex gap-2">
                  {(["tech-free", "tech-active", "mix"] as TechMode[]).map((m) => (
                    <button key={m} type="button" onClick={() => setTechMode(m)}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium text-center transition-all duration-150 cursor-pointer ${techMode === m ? "bg-primary text-primary-foreground border-primary shadow-sm" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-muted/30"}`}>
                      {m === "tech-free" ? "Tech-Free" : m === "tech-active" ? "Tech-Active" : "Mixed"}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CollapsibleStep>

        <SectionDivider />

        {/* Difficulty */}
        <CollapsibleStep
          number={3}
          title="Difficulty"
          subtitle={difficulty}
        >
          <div className="grid grid-cols-5 gap-1.5">
            {(["Essential Skills", "Easy", "Medium", "Hard", "Extreme"] as Difficulty[]).map((d) => {
              const isSelected = difficulty === d;
              const meta = DIFFICULTY_META[d];
              return (
                <button key={d} type="button" onClick={() => setDifficulty(d)}
                  className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-lg border text-center transition-all duration-150 cursor-pointer
                    ${isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40 hover:bg-muted/30"}`}>
                  <span className={`text-xs font-semibold leading-tight ${isSelected ? meta.color : "text-foreground"}`}>{meta.label}</span>
                  <span className="text-[10px] text-muted-foreground leading-tight hidden sm:block">{meta.desc}</span>
                </button>
              );
            })}
          </div>
        </CollapsibleStep>

        <SectionDivider />

        {/* Length & Duration */}
        <CollapsibleStep
          number={4}
          title="Length & Duration"
          subtitle={`${questionCount} questions · ${timeLimit} min`}
        >
          <div className="flex gap-8 pb-2">
            <div className="space-y-2 flex-1">
              <div className="flex justify-between items-center">
                <p className="text-xs text-muted-foreground">Questions</p>
                <span className="text-lg font-bold text-foreground">{questionCount}</span>
              </div>
              <Slider min={1} max={20} value={[questionCount]} onValueChange={([v]) => setQuestionCount(v)} />
            </div>
            <div className="space-y-2 flex-1">
              <div className="flex justify-between items-center">
                <p className="text-xs text-muted-foreground">Time</p>
                <span className="text-lg font-bold text-foreground">{timeLimit} min</span>
              </div>
              <Slider min={5} max={120} step={5} value={[timeLimit]} onValueChange={([v]) => setTimeLimit(v)} />
            </div>
          </div>
        </CollapsibleStep>

        <SectionDivider />

        {/* Presets */}
        <CollapsibleStep
          number={5}
          title="Presets"
          subtitle="Quick configurations"
          chips={
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-foreground">
              {questionCount}Q / {timeLimit}m
            </span>
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {presets.map((p) => (
              <button key={p.label} type="button"
                onClick={() => { setQuestionCount(p.count); setTimeLimit(p.time); }}
                className={`group p-3 text-left rounded-lg border transition-all duration-150 cursor-pointer ${questionCount === p.count && timeLimit === p.time ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40 hover:bg-muted/30"}`}>
                <div className="flex justify-between items-center">
                  <p className="text-sm font-medium">{p.label}</p>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{p.count}Q / {p.time}m</span>
                </div>
              </button>
            ))}
          </div>
        </CollapsibleStep>
      </div>

      {/* Footer / Start */}
      <div className="pt-6 border-t space-y-4">
        {/* Session Summary */}
        <div className="w-full space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Exam Summary</p>

          <div className="flex items-start gap-2">
            <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wide w-14 shrink-0 pt-0.5">Subject</span>
            <div className="flex flex-wrap gap-1 flex-1">
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-medium text-[11px]">
                {TOPIC_ICONS[topic] && <span className="opacity-70">{TOPIC_ICONS[topic]}</span>}
                {topic}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground/60">Difficulty</span>
              <span className={`font-semibold ${DIFFICULTY_META[difficulty].color}`}>{DIFFICULTY_META[difficulty].label}</span>
            </span>
            <span className="text-border">·</span>
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground/60">Questions</span>
              <span className="font-semibold text-foreground tabular-nums">{questionCount}</span>
            </span>
            <span className="text-border">·</span>
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground/60">Time</span>
              <span className="font-semibold text-foreground tabular-nums">{timeLimit} min</span>
            </span>
            <span className="text-border">·</span>
            <span className={`font-semibold ${questionMode === "written" ? "text-sky-600 dark:text-sky-400" : "text-violet-600 dark:text-violet-400"}`}>
              {questionMode === "written" ? "Written" : "Multiple Choice"}
            </span>
          </div>

          {(selectedSubtopics.length > 0 || techMode !== "mix") && (
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
              {selectedSubtopics.length > 0 && (
                <span className="flex items-center gap-1">
                  <span className="text-muted-foreground/60">Focus</span>
                  <span className="font-semibold text-foreground truncate max-w-[140px]">{selectedSubtopics[0]}{selectedSubtopics.length > 1 && ` +${selectedSubtopics.length - 1}`}</span>
                </span>
              )}
              {selectedSubtopics.length > 0 && techMode !== "mix" && <span className="text-border">·</span>}
              {techMode !== "mix" && (
                <span className="flex items-center gap-1">
                  <span className="text-muted-foreground/60">Calculator</span>
                  <span className="font-semibold text-foreground">
                    {techMode === "tech-free" ? "Tech-Free" : "Tech-Active"}
                  </span>
                </span>
              )}
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] border-t border-border/40 pt-1.5">
            <span className="text-muted-foreground/70 tabular-nums flex items-center gap-1">
              <Coins className="w-3 h-3" /> ~{estimated.totalTokens.toLocaleString()} tokens
              {estimated.confidence != null && (
                <span className={`text-[10px] px-1 rounded ${estimated.confidence > 0.7 ? 'bg-green-100 text-green-700' : estimated.confidence > 0.4 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                  {Math.round(estimated.confidence * 100)}%
                </span>
              )}
            </span>
            {estimated.promptCost != null || estimated.completionCost != null ? (
              <span className="font-semibold text-foreground tabular-nums flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-muted-foreground" />{formatCostUsd(estimated.totalCost)}
              </span>
            ) : (
              <span className="text-muted-foreground/50">cost unavailable</span>
            )}
          </div>
        </div>

        <Button
          size="lg"
          className="w-full h-10 text-sm font-bold gap-2 transition-all duration-200"
          onClick={() => onStart({ topic, questionCount, timeLimitMinutes: timeLimit, difficulty, techMode, questionMode, selectedSubtopics, customFocusArea })}
        >
          <Sparkles className="w-4 h-4" />
          Start Exam
        </Button>
      </div>

    </PageContainer>
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
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showAnswer, setShowAnswer] = useState<Record<string, boolean>>({});

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const pauseTimeRef = useRef<number | null>(null);
  const answersRef = useRef(answers);
  const mcSelectedRef = useRef(mcSelected);
  const onFinishRef = useRef(onFinish);

  // Keep refs in sync to avoid closure staleness in timer
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { mcSelectedRef.current = mcSelected; }, [mcSelected]);
  useEffect(() => { onFinishRef.current = onFinish; }, [onFinish]);

  const question = questions[currentIdx];
  const isWritten = config.questionMode === "written";
  const isMc = !isWritten;
  const isLast = currentIdx === questions.length - 1;
  const answeredCount = isWritten ? Object.keys(answers).length : Object.keys(mcSelected).length;
  const progressPct = ((currentIdx + 1) / questions.length) * 100;
  const timeLimitSeconds = config.timeLimitMinutes * 60;
  const isTimeWarning = elapsedSeconds > timeLimitSeconds - 300;
  const isTimeCritical = elapsedSeconds > timeLimitSeconds - 60;

  const canAdvance = isWritten
    ? (answers[question?.id]?.trim().length ?? 0) > 0 || showAnswer[question?.id]
    : Boolean(question && mcSelected[question.id]);

  const getElapsedSeconds = () => {
    return elapsedSeconds;
  };

  useEffect(() => {
    const tick = () => {
      if (isPaused) return;

      const now = Date.now();
      const elapsed = Math.floor((now - startTimeRef.current) / 1000);

      setElapsedSeconds(elapsed);

      const timeLimitSeconds = config.timeLimitMinutes * 60;
      if (elapsed >= timeLimitSeconds) {
        if (timerRef.current) clearInterval(timerRef.current);
        onFinishRef.current(answersRef.current, mcSelectedRef.current, elapsed);
      }
    };

    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isPaused, config.timeLimitMinutes]);

  const togglePause = () => {
    if (isPaused) {
      // Resuming
      if (pauseTimeRef.current) {
        const pausedDuration = Date.now() - pauseTimeRef.current;
        startTimeRef.current += pausedDuration;
        pauseTimeRef.current = null;
      }
      setIsPaused(false);
    } else {
      // Pausing
      pauseTimeRef.current = Date.now();
      setIsPaused(true);
    }
  };

  const handleNext = () => {
    if (isLast) {
      if (timerRef.current) clearInterval(timerRef.current);
      onFinishRef.current(answers, mcSelected, getElapsedSeconds());
      return;
    }
    setCurrentIdx((i) => i + 1);
  };

  const handleFinish = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    onFinishRef.current(answers, mcSelected, getElapsedSeconds());
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

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={togglePause}
            className={`h-9 w-9 rounded-full ${isPaused ? "text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20" : "text-muted-foreground hover:bg-muted"}`}
          >
            {isPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4 fill-current" />}
          </Button>

          <div className={`flex items-center gap-2 font-mono text-lg font-bold px-4 py-1.5 rounded-full shadow-sm border transition-colors ${isPaused ? "bg-muted text-muted-foreground border-border" :
              isTimeCritical ? "bg-rose-500/10 text-rose-600 border-rose-500/20 animate-pulse" :
                isTimeWarning ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
                  "bg-card text-foreground border-border/50"
            }`}>
            <Clock className={`w-4 h-4 ${isPaused ? "" : "animate-pulse"}`} />
            {formatTime(elapsedSeconds)}
          </div>
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

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 relative">
        {isPaused && (
          <div className="absolute inset-0 z-20 bg-background/80 backdrop-blur-xl flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-300">
            <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6">
              <Pause className="w-10 h-10 text-emerald-500 fill-current" />
            </div>
            <h2 className="text-3xl font-black tracking-tight mb-2">Exam Paused</h2>
            <p className="text-muted-foreground max-w-xs mb-8">
              Take a breath! The timer has stopped. Resume when you're ready to continue.
            </p>
            <Button size="lg" onClick={togglePause} className="gap-2 px-8 rounded-full bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20">
              <Play className="w-4 h-4 fill-current" /> Resume Exam
            </Button>
          </div>
        )}

        <div className={`max-w-4xl mx-auto space-y-6 transition-all duration-300 ${isPaused ? "blur-md opacity-20 scale-[0.98] pointer-events-none" : "blur-0 opacity-100 scale-100"}`}>
          <UnifiedQuestionPromptCard
            promptMarkdown={question.promptMarkdown}
            topic={question.topic}
            subtopic={question.subtopic}
            difficulty={config.difficulty}
            maxMarks={isWritten ? question.maxMarks : undefined}
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
  const addGenerationRecord = useAppStore((s) => s.addGenerationRecord);

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
        const response = await invoke<{ questions: GeneratedQuestion[]; durationMs: number; promptTokens?: number; completionTokens?: number; totalTokens?: number; estimatedCostUsd?: number }>("generate_questions", {
          request: {
            topics: [cfg.topic], difficulty: cfg.difficulty, questionCount: cfg.questionCount,
            maxMarksPerQuestion: isMath ? 10 : undefined, model, apiKey, techMode: cfg.techMode,
            subtopics: cfg.selectedSubtopics, subtopicInstructions: {},
            customFocusArea: cfg.customFocusArea.trim() || undefined,
            avoidSimilarQuestions: false, priorQuestionPrompts: [],
          },
        });
        setQuestions(response.questions.map((q, i) => ({ ...q, id: `exam-${i + 1}` })));

        // Record this generation for cost estimation
        addGenerationRecord({
          id: `exam-gen-${cfg.topic}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toISOString(),
          inputs: {
            topic: cfg.topic,
            difficulty: cfg.difficulty,
            questionCount: cfg.questionCount,
            questionMode: "written",
            techMode: cfg.techMode,
            maxMarksPerQuestion: isMath ? 10 : undefined,
            subtopics: cfg.selectedSubtopics,
            customFocusArea: cfg.customFocusArea.trim() || undefined,
          },
          outputs: {
            durationMs: response.durationMs || 0,
            promptTokens: response.promptTokens,
            completionTokens: response.completionTokens,
            totalTokens: response.totalTokens,
            estimatedCostUsd: response.estimatedCostUsd,
          },
        });
      } else {
        const response = await invoke<{
          questions: Array<GeneratedQuestion & { options: Array<{ label: string; text: string }>; correctAnswer: string; explanationMarkdown: string }>;
          durationMs: number; promptTokens?: number; completionTokens?: number; totalTokens?: number; estimatedCostUsd?: number;
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

        // Record this generation for cost estimation
        addGenerationRecord({
          id: `exam-gen-${cfg.topic}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toISOString(),
          inputs: {
            topic: cfg.topic,
            difficulty: cfg.difficulty,
            questionCount: cfg.questionCount,
            questionMode: "multiple-choice",
            techMode: cfg.techMode,
            subtopics: cfg.selectedSubtopics,
            customFocusArea: cfg.customFocusArea.trim() || undefined,
          },
          outputs: {
            durationMs: response.durationMs || 0,
            promptTokens: response.promptTokens,
            completionTokens: response.completionTokens,
            totalTokens: response.totalTokens,
            estimatedCostUsd: response.estimatedCostUsd,
          },
        });
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
