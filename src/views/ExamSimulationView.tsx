import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store";
import {
  Topic, Difficulty, TechMode, GeneratedQuestion, MarkAnswerResponse, TOPICS,
  MATH_METHODS_SUBTOPICS, SPECIALIST_MATH_SUBTOPICS, CHEMISTRY_SUBTOPICS,
  PHYSICAL_EDUCATION_SUBTOPICS, QuestionHistoryEntry, McHistoryEntry, McQuestion,
} from "../types";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Slider } from "../components/ui/slider";
import { Textarea } from "../components/ui/textarea";
import { MarkdownMath } from "../components/MarkdownMath";
import { normalizeMarkResponse, readBackendError } from "../lib/app-utils";
import {
  Clock, Play, ChevronRight, ChevronLeft, Flag, Eye,
  CheckCircle2, XCircle, Trophy, BookOpen, Target, Loader2, Sparkles,
  RotateCcw, Timer, Gauge, Zap, Lightbulb, PenLine, LayoutDashboard,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

const OPTION_COLORS: Record<string, string> = {
  A: "#3b82f6", B: "#8b5cf6", C: "#f59e0b", D: "#ec4899",
};

type ExamPhase = "setup" | "active" | "review" | "results";
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
    const interval = setInterval(() => {
      setStep((s) => (s + 1) % steps.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [steps.length]);

  return (
    <div className="min-h-full flex flex-col items-center justify-center p-8 animate-in fade-in duration-500 bg-background/50 backdrop-blur-sm">
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
          <h2 className="text-3xl font-black tracking-tight bg-linear-to-br from-foreground to-muted-foreground bg-clip-text text-transparent">
            Generating Exam
          </h2>
          {config && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Badge variant="secondary" className="bg-muted/50 text-xs font-medium">{config.topic}</Badge>
              <Badge variant="secondary" className="bg-muted/50 text-xs font-medium">{config.difficulty}</Badge>
              <Badge variant="secondary" className="bg-muted/50 text-xs font-medium">{config.questionCount} Questions</Badge>
              {config.selectedSubtopics.length > 0 && (
                <Badge variant="secondary" className="bg-violet-500/10 text-violet-700 dark:text-violet-300 text-xs font-medium">
                  {config.selectedSubtopics.length} focus area{config.selectedSubtopics.length > 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          )}
        </div>

        <div className="w-full bg-card/50 border border-border/40 rounded-2xl p-4 overflow-hidden relative text-left shadow-sm">
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
  const hasSubtopics = availableSubtopics.length > 0;

  const toggleSubtopic = (sub: string) => {
    setSelectedSubtopics((prev) =>
      prev.includes(sub) ? prev.filter((s) => s !== sub) : [...prev, sub]
    );
  };

  // Reset subtopics when topic changes
  const handleTopicChange = (t: Topic) => {
    setTopic(t);
    setSelectedSubtopics([]);
  };

  const presets = [
    { label: "Quick Sprint", count: 5, time: 15, desc: "Perfect for a warm-up" },
    { label: "Standard Practice", count: 10, time: 30, desc: "Daily revision" },
    { label: "Deep Dive", count: 15, time: 60, desc: "Thorough assessment" },
    { label: "Marathon", count: 20, time: 90, desc: "Full endurance test" },
  ];

  return (
    <div className="min-h-full px-4 sm:px-6 py-10 max-w-6xl mx-auto space-y-10 animate-in fade-in duration-500">
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
          <section className="space-y-4">
            <h3 className="text-sm font-bold flex items-center gap-2 text-foreground/80">
              <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs">1</span>
              Select Subject
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TOPICS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTopicChange(t)}
                  className={`relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200 ${
                    topic === t
                      ? "border-violet-500 bg-violet-500/5 shadow-md shadow-violet-500/5"
                      : "border-border/40 bg-card hover:border-violet-500/30 hover:bg-muted/20"
                  }`}
                >
                  <span className={`block text-sm font-semibold ${topic === t ? "text-violet-700 dark:text-violet-300" : "text-foreground"}`}>
                    {t}
                  </span>
                </button>
              ))}
            </div>

            {hasSubtopics && (
              <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-3 shadow-sm">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Focus Areas</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Select specific subtopics or leave blank to cover all</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {availableSubtopics.map((sub) => {
                    const active = selectedSubtopics.includes(sub);
                    return (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => toggleSubtopic(sub)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-all duration-150 cursor-pointer select-none ${
                          active
                            ? "bg-violet-500 text-white border-violet-500 shadow-sm"
                            : "border-border/50 text-muted-foreground hover:border-violet-500/50 hover:text-foreground"
                        }`}
                      >
                        {sub}
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-1.5 pt-1 border-t border-border/30">
                  <p className="text-xs font-medium text-muted-foreground">Custom Focus Area <span className="font-normal opacity-70">— optional</span></p>
                  <input
                    type="text"
                    value={customFocusArea}
                    onChange={(e) => setCustomFocusArea(e.target.value)}
                    maxLength={160}
                    placeholder="e.g. projectile motion with optimisation constraints"
                    className="w-full text-xs h-8 rounded-lg border border-border/50 bg-background px-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-500"
                  />
                </div>
              </div>
            )}

            {!hasSubtopics && (
              <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-3 shadow-sm">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Custom Focus Area</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Optional topic emphasis for question generation</p>
                </div>
                <input
                  type="text"
                  value={customFocusArea}
                  onChange={(e) => setCustomFocusArea(e.target.value)}
                  maxLength={160}
                  placeholder="e.g. projectile motion with optimisation constraints"
                  className="w-full text-xs h-8 rounded-lg border border-border/50 bg-background px-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-500"
                />
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-bold flex items-center gap-2 text-foreground/80">
              <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs">2</span>
              Question Format & Parameters
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-card border border-border/40 rounded-3xl p-6 shadow-sm">
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground">Response Type</p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setQuestionMode("written")}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-sm font-medium transition-all ${
                      questionMode === "written"
                        ? "border-sky-500 bg-sky-500/5 text-sky-700 dark:text-sky-300"
                        : "border-border/40 hover:bg-muted/30 text-muted-foreground"
                    }`}
                  >
                    <BookOpen className="w-4 h-4" /> Written Solutions
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuestionMode("multiple-choice")}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-sm font-medium transition-all ${
                      questionMode === "multiple-choice"
                        ? "border-fuchsia-500 bg-fuchsia-500/5 text-fuchsia-700 dark:text-fuchsia-300"
                        : "border-border/40 hover:bg-muted/30 text-muted-foreground"
                    }`}
                  >
                    <Target className="w-4 h-4" /> Multiple Choice
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground">Technology Mode</p>
                <div className="flex flex-col gap-2">
                  {(["tech-free", "tech-active", "mix"] as TechMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTechMode(m)}
                      className={`rounded-xl border p-3 text-sm font-medium transition-all text-left ${
                        techMode === m
                          ? "border-foreground bg-foreground/5 text-foreground"
                          : "border-border/40 hover:bg-muted/30 text-muted-foreground"
                      }`}
                    >
                      {m === "tech-free" ? "Tech-Free (No Calculator)" : m === "tech-active" ? "Tech-Active (Calculator)" : "Mixed Allocation"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-bold flex items-center gap-2 text-foreground/80">
              <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs">3</span>
              Difficulty Level
            </h3>
            <div className="flex flex-wrap gap-3">
              {(["Essential Skills", "Easy", "Medium", "Hard", "Extreme"] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={`rounded-xl border px-5 py-2.5 text-sm font-semibold transition-all shadow-sm ${getDifficultyBadgeClasses(d)} ${
                    difficulty === d ? "ring-2 ring-offset-2 ring-offset-background ring-foreground/20 scale-[1.02]" : "opacity-70 hover:opacity-100 hover:scale-[1.02]"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-bold flex items-center gap-2 text-foreground/80">
              <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs">4</span>
              Length & Duration
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-card border border-border/40 rounded-3xl p-6 shadow-sm">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <p className="text-xs font-semibold text-muted-foreground">Total Questions</p>
                  <span className="text-lg font-black text-foreground">{questionCount}</span>
                </div>
                <Slider
                  min={1} max={20} value={[questionCount]}
                  onValueChange={([v]) => setQuestionCount(v)}
                />
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <p className="text-xs font-semibold text-muted-foreground">Time Limit</p>
                  <span className="text-lg font-black text-foreground">{timeLimit} min</span>
                </div>
                <Slider
                  min={5} max={120} step={5} value={[timeLimit]}
                  onValueChange={([v]) => setTimeLimit(v)}
                />
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
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { setQuestionCount(p.count); setTimeLimit(p.time); }}
                  className={`group rounded-2xl border p-4 text-left transition-all duration-200 ${
                    questionCount === p.count && timeLimit === p.time
                      ? "border-violet-500 bg-violet-500/10 shadow-md"
                      : "border-border/40 bg-background hover:border-violet-500/40"
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <p className={`font-bold ${questionCount === p.count && timeLimit === p.time ? "text-violet-700 dark:text-violet-300" : ""}`}>{p.label}</p>
                    <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                      {p.count}Q / {p.time}m
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground group-hover:text-foreground/70 transition-colors">{p.desc}</p>
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
                <p className="text-xs text-muted-foreground leading-relaxed"><strong className="text-foreground">Comprehensive Review:</strong> Detailed AI feedback and analytics are generated upon completion.</p>
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
  config, questions, apiKey, model, markingModel, useSeparateMarkingModel,
  onFinish,
}: {
  config: ExamConfig;
  questions: ExamQuestion[];
  apiKey: string;
  model: string;
  markingModel: string;
  useSeparateMarkingModel: boolean;
  onFinish: (answers: Record<string, string>, feedback: Record<string, MarkAnswerResponse>, mcSelected: Record<string, string>) => void;
}) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, MarkAnswerResponse>>({});
  const [mcSelected, setMcSelected] = useState<Record<string, string>>({});
  const [timeRemaining, setTimeRemaining] = useState(config.timeLimitMinutes * 60);
  const [isMarking, setIsMarking] = useState(false);
  const [showAnswer, setShowAnswer] = useState<Record<string, boolean>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const markModel = useSeparateMarkingModel && markingModel?.trim() ? markingModel : model;
  const question = questions[currentIdx];
  const isWritten = config.questionMode === "written";
  const isMc = !isWritten;
  const isLast = currentIdx === questions.length - 1;
  const answeredCount = isWritten
    ? Object.keys(feedback).length
    : Object.keys(mcSelected).length;
  const progressPct = ((currentIdx + 1) / questions.length) * 100;
  const mcCorrect = isMc && question ? mcSelected[question.id] === question.correctAnswer : false;
  const correctSoFar = isMc
    ? questions.filter((q) => mcSelected[q.id] === q.correctAnswer).length
    : Object.values(feedback).filter((f) => f.achievedMarks >= f.maxMarks).length;

  const hasCurrentAnswer = isWritten
    ? (answers[question?.id]?.trim().length ?? 0) > 0
    : Boolean(question && mcSelected[question.id]);
  const canAdvance = isWritten
    ? Boolean(feedback[question?.id]) || showAnswer[question?.id]
    : Boolean(question && mcSelected[question.id]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          onFinish(answers, feedback, mcSelected);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const handleSubmitAnswer = async () => {
    if (!question || !isWritten) return;
    const answer = answers[question.id] ?? "";
    if (!answer.trim()) return;
    setIsMarking(true);
    try {
      const raw = await invoke<unknown>("mark_answer", {
        request: { question, studentAnswer: answer, model: markModel, apiKey },
      });
      const response = normalizeMarkResponse(raw, question.maxMarks);
      setFeedback((prev) => ({ ...prev, [question.id]: response }));
    } catch {
      setFeedback((prev) => ({
        ...prev,
        [question.id]: {
          verdict: "Marking failed",
          achievedMarks: 0,
          maxMarks: question.maxMarks,
          scoreOutOf10: 0,
          vcaaMarkingScheme: [],
          comparisonToSolutionMarkdown: "",
          feedbackMarkdown: "Could not mark this answer.",
          workedSolutionMarkdown: "",
        },
      }));
    } finally {
      setIsMarking(false);
    }
  };

  const handleMcAnswer = (label: string) => {
    if (!question) return;
    setMcSelected((prev) => ({ ...prev, [question.id]: label }));
  };

  const handleNext = () => {
    if (isLast) {
      if (timerRef.current) clearInterval(timerRef.current);
      onFinish(answers, feedback, mcSelected);
      return;
    }
    setCurrentIdx((i) => i + 1);
  };

  const handlePrev = () => {
    if (currentIdx === 0) return;
    setCurrentIdx((i) => i - 1);
  };

  const handleFinish = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    onFinish(answers, feedback, mcSelected);
  };

  const isTimeWarning = timeRemaining < 300;
  const isTimeCritical = timeRemaining < 60;

  if (!question) return null;

  return (
    <div className="flex flex-col h-full bg-background animate-in fade-in duration-300">
      {/* Top Navigation Bar */}
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

        {/* Central Timer */}
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
               <span className="font-semibold text-foreground">{answeredCount} completed</span>
               {isMc && (
                 <>
                   <span className="text-muted-foreground">·</span>
                   <span className="text-emerald-500 font-bold">{correctSoFar} correct</span>
                 </>
               )}
             </div>
          )}
          <Button variant="outline" size="icon" disabled={currentIdx === 0} onClick={handlePrev} className="h-9 w-9 rounded-full">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant={canAdvance ? "default" : "secondary"} onClick={handleNext} className="h-9 rounded-full px-5 gap-1.5 shadow-sm">
            {isLast ? "Complete" : "Next"} <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Thin Progress Bar */}
      <div className="h-1 w-full bg-muted/30 shrink-0">
        <div className="h-full bg-violet-500 transition-all duration-500 ease-out" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Question Card */}
          <div className="bg-card border border-border/40 rounded-3xl shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 px-6 py-3 bg-muted/20 border-b border-border/30">
              <Badge variant="outline" className="bg-background text-xs py-0.5 border-border/50">{question.topic}</Badge>
              {question.subtopic && <span className="text-xs font-medium text-muted-foreground/80 truncate max-w-[200px]">{question.subtopic}</span>}
              <div className="ml-auto flex items-center gap-2">
                <Badge className={`text-xs py-0.5 ${getDifficultyBadgeClasses(config.difficulty)}`}>{config.difficulty}</Badge>
                {isWritten && question.maxMarks > 0 && (
                  <Badge variant="secondary" className="text-xs py-0.5 bg-sky-500/10 text-sky-700 hover:bg-sky-500/20">
                    {question.maxMarks} marks
                  </Badge>
                )}
              </div>
            </div>
            <div className="p-6 sm:p-8">
              <div className="prose prose-base dark:prose-invert max-w-none text-foreground leading-loose">
                <MarkdownMath content={question.promptMarkdown} />
              </div>
            </div>
          </div>

          {/* Multiple Choice Section */}
          {isMc && question.options && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {question.options.map((opt) => {
                const isChosen = mcSelected[question.id] === opt.label;
                const isCorrectAnswer = opt.label === question.correctAnswer;
                const color = OPTION_COLORS[opt.label] ?? "#6b7280";
                const answered = Boolean(mcSelected[question.id]);
                
                let btnClasses = "border-border/40 bg-card hover:border-violet-500/40 hover:bg-violet-500/5 hover:shadow-md cursor-pointer hover:-translate-y-1";
                let iconClasses = "bg-muted text-muted-foreground";
                
                if (answered) {
                  if (isCorrectAnswer) {
                    btnClasses = "border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-sm cursor-default";
                    iconClasses = "bg-emerald-500 text-white shadow-sm";
                  } else if (isChosen) {
                    btnClasses = "border-rose-400/50 bg-rose-50/50 dark:bg-rose-950/20 opacity-80 cursor-default";
                    iconClasses = "bg-rose-500 text-white shadow-sm";
                  } else {
                    btnClasses = "border-border/30 opacity-50 cursor-default grayscale";
                    iconClasses = "bg-muted text-muted-foreground/50";
                  }
                }

                return (
                  <button key={opt.label} disabled={answered} onClick={() => handleMcAnswer(opt.label)}
                    className={`w-full text-left p-4 rounded-2xl border-2 flex items-start gap-4 transition-all duration-300 ${btnClasses}`}>
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm transition-colors ${iconClasses}`}
                      style={!isCorrectAnswer && !isChosen && !answered ? { backgroundColor: `${color}15`, color } : undefined}>
                      {opt.label}
                    </div>
                    <div className="flex-1 text-sm pt-1 prose prose-sm dark:prose-invert max-w-none">
                      <MarkdownMath content={opt.text} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* MC Review Feedback */}
          {isMc && mcSelected[question.id] && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className={`flex items-center gap-3 p-4 rounded-2xl border ${mcCorrect ? "bg-emerald-500/10 border-emerald-500/30" : "bg-rose-500/10 border-rose-500/30"}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm ${mcCorrect ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"}`}>
                  {mcCorrect ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                </div>
                <div>
                  <p className={`font-bold text-lg ${mcCorrect ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                    {mcCorrect ? "Excellent!" : "Incorrect"}
                  </p>
                  {!mcCorrect && <p className="text-sm text-muted-foreground mt-0.5">The correct answer was <strong className="text-foreground">{question.correctAnswer}</strong>.</p>}
                </div>
              </div>
              
              {question.explanationMarkdown && (
                <div className="bg-card border border-border/40 rounded-2xl overflow-hidden shadow-sm">
                  <div className="flex items-center gap-2 px-5 py-3 bg-muted/30 border-b border-border/30">
                    <Lightbulb className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Detailed Explanation</span>
                  </div>
                  <div className="p-5 prose prose-sm dark:prose-invert max-w-none">
                    <MarkdownMath content={question.explanationMarkdown} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Written Answer Section */}
          {isWritten && (
            <div className="bg-card border border-border/40 rounded-3xl overflow-hidden shadow-sm flex flex-col">
              <div className="px-6 py-4 bg-muted/20 border-b border-border/30 flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Your Response</span>
                {question.maxMarks > 0 && <span className="text-xs font-medium text-muted-foreground">Worth {question.maxMarks} Marks</span>}
              </div>
              <div className="p-6 space-y-4">
                <Textarea
                  value={answers[question.id] ?? ""}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))}
                  disabled={Boolean(feedback[question.id]) || showAnswer[question.id]}
                  placeholder="Draft your solution here. Focus on clear working out..."
                  className="min-h-[200px] resize-y text-base leading-relaxed p-4 rounded-xl focus-visible:ring-violet-500 border-border/50 disabled:bg-muted/30 disabled:opacity-80"
                />

                {!feedback[question.id] && !showAnswer[question.id] && (
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <Button size="lg" onClick={handleSubmitAnswer} disabled={!hasCurrentAnswer || !apiKey || isMarking} className="gap-2 bg-violet-600 hover:bg-violet-700 text-white shadow-md">
                      {isMarking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {isMarking ? "Analyzing Solution..." : "Submit for AI Evaluation"}
                    </Button>
                    <Button variant="outline" size="lg" onClick={() => setShowAnswer((prev) => ({ ...prev, [question.id]: true }))} className="gap-2">
                      <Eye className="w-4 h-4 text-muted-foreground" /> Reveal Solution
                    </Button>
                  </div>
                )}

                {/* AI Evaluation Results */}
                {feedback[question.id] && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pt-4 border-t border-border/30">
                    <div className="flex items-center gap-5 p-5 rounded-2xl bg-linear-to-r from-muted/50 to-transparent border border-border/40">
                      <div className={`text-4xl font-black tabular-nums tracking-tighter ${
                        feedback[question.id].achievedMarks >= feedback[question.id].maxMarks ? "text-emerald-500" :
                        feedback[question.id].achievedMarks > 0 ? "text-amber-500" : "text-rose-500"
                      }`}>
                        {feedback[question.id].achievedMarks}<span className="text-xl font-medium text-muted-foreground/60">/{feedback[question.id].maxMarks}</span>
                      </div>
                      <div className="h-10 w-px bg-border/60" />
                      <span className="text-sm font-semibold text-foreground">{feedback[question.id].verdict}</span>
                    </div>

                    {feedback[question.id].vcaaMarkingScheme.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Marking Rubric Breakdown</h4>
                        <div className="grid gap-2">
                          {feedback[question.id].vcaaMarkingScheme.map((c, i) => (
                            <div key={i} className="flex items-start gap-4 p-4 rounded-xl border border-border/40 bg-card shadow-sm">
                              <div className={`flex items-center gap-1.5 shrink-0 px-2 py-1 rounded-md text-xs font-bold ${
                                c.achievedMarks >= c.maxMarks ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"
                              }`}>
                                {c.achievedMarks >= c.maxMarks ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                                {c.achievedMarks}/{c.maxMarks}
                              </div>
                              <div className="flex-1 min-w-0 pt-0.5">
                                <p className="text-sm font-semibold text-foreground">{c.criterion}</p>
                                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{c.rationale}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {feedback[question.id].feedbackMarkdown && (
                      <div className="rounded-2xl border border-border/40 overflow-hidden bg-card shadow-sm">
                        <div className="flex items-center gap-2 px-5 py-3 bg-muted/30 border-b border-border/30">
                          <PenLine className="w-4 h-4 text-violet-500" />
                          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Actionable Feedback</span>
                        </div>
                        <div className="p-5 prose prose-sm dark:prose-invert max-w-none">
                          <MarkdownMath content={feedback[question.id].feedbackMarkdown} />
                        </div>
                      </div>
                    )}

                    {feedback[question.id].workedSolutionMarkdown && (
                      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 overflow-hidden shadow-sm">
                        <div className="flex items-center gap-2 px-5 py-3 border-b border-emerald-500/20 bg-emerald-500/10">
                          <Lightbulb className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">Model Solution</span>
                        </div>
                        <div className="p-5 prose prose-sm dark:prose-invert max-w-none">
                          <MarkdownMath content={feedback[question.id].workedSolutionMarkdown} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Just Revealed Solution */}
                {showAnswer[question.id] && !feedback[question.id] && (
                  <div className="rounded-2xl border border-border/40 overflow-hidden bg-card shadow-sm animate-in fade-in duration-500 mt-6">
                    <div className="flex items-center gap-2 px-5 py-3 bg-muted/30 border-b border-border/30">
                      <Lightbulb className="w-4 h-4 text-amber-500" />
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Model Solution</span>
                    </div>
                    <div className="p-5 prose prose-sm dark:prose-invert max-w-none">
                      <MarkdownMath content={"No worked solution available for this question."} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Results Screen ───────────────────────────────────────────────────────────

function ExamResults({
  config, questions, answers: _answers, feedback, mcSelected, timeUsed, onRetry, onExit,
}: {
  config: ExamConfig;
  questions: ExamQuestion[];
  answers: Record<string, string>;
  feedback: Record<string, MarkAnswerResponse>;
  mcSelected: Record<string, string>;
  timeUsed: number;
  onRetry: () => void;
  onExit: () => void;
}) {
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
      
      {/* Header & Score Circle */}
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
            <span>{config.topic}</span>
            <span>&bull;</span>
            <span>{config.difficulty}</span>
            <span>&bull;</span>
            <span>{questions.length} Questions</span>
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-3xl border border-border/40 bg-card p-6 flex items-center gap-5 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center shrink-0">
            <Gauge className="w-6 h-6 text-violet-500" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Time Used</p>
            <div className="text-2xl font-black tabular-nums text-foreground mt-0.5">{formatTime(timeUsed)}</div>
          </div>
        </div>
        
        <div className="rounded-3xl border border-border/40 bg-card p-6 flex items-center gap-5 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 flex items-center justify-center shrink-0">
            <Target className="w-6 h-6 text-sky-500" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Accuracy</p>
            <div className="text-2xl font-black tabular-nums text-foreground mt-0.5">{Math.round(pct)}%</div>
          </div>
        </div>

        <div className="rounded-3xl border border-border/40 bg-card p-6 flex items-center gap-5 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0">
            <Trophy className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{isWritten ? "Marks Earned" : "Questions Correct"}</p>
            <div className="text-2xl font-black tabular-nums text-foreground mt-0.5">
              {isWritten ? `${writtenScore}/${writtenMax}` : `${mcCorrect}/${mcTotal}`}
            </div>
          </div>
        </div>
      </div>

      {/* Question Breakdown */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold flex items-center gap-2 text-foreground/80 mb-6">
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
              <div key={q.id} className="rounded-2xl border border-border/40 bg-card overflow-hidden shadow-sm transition-all hover:shadow-md hover:border-border/60">
                <div className="flex items-center gap-4 px-5 py-4 bg-muted/10">
                  <span className="w-8 h-8 rounded-xl bg-background border border-border/50 flex items-center justify-center text-xs font-black text-foreground shrink-0 shadow-sm">
                    {i + 1}
                  </span>
                  <div className="flex-1 text-sm font-medium line-clamp-1 text-foreground/90">
                    <MarkdownMath content={q.promptMarkdown.replace(/\n/g, ' ')} />
                  </div>
                  
                  <div className="flex items-center gap-3 shrink-0 ml-4">
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
                
                {isWritten && qFeedback && qFeedback.feedbackMarkdown && (
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

      {/* Action Footer */}
      <div className="flex flex-wrap items-center justify-center gap-4 pt-8">
        <Button variant="outline" size="lg" onClick={onExit} className="gap-2 w-full sm:w-auto h-12 px-8">
          <ChevronLeft className="w-4 h-4" /> Return to Setup
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

  const [phase, setPhase] = useState<ExamPhase>("setup");
  const [config, setConfig] = useState<ExamConfig | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [finalAnswers, setFinalAnswers] = useState<Record<string, string>>({});
  const [finalFeedback, setFinalFeedback] = useState<Record<string, MarkAnswerResponse>>({});
  const [finalMcSelected, setFinalMcSelected] = useState<Record<string, string>>({});
  const [timeUsed, setTimeUsed] = useState(0);

  const handleStart = useCallback(async (cfg: ExamConfig) => {
    setConfig(cfg);
    setPhase("active");
    setIsGenerating(true);
    setErrorMessage(null);

    const isMath = cfg.topic === "Mathematical Methods" || cfg.topic === "Specialist Mathematics";

    try {
      if (cfg.questionMode === "written") {
        const response = await invoke<{
          questions: GeneratedQuestion[];
          durationMs: number;
        }>("generate_questions", {
          request: {
            topics: [cfg.topic],
            difficulty: cfg.difficulty,
            questionCount: cfg.questionCount,
            maxMarksPerQuestion: isMath ? 10 : undefined,
            model, apiKey, techMode: cfg.techMode,
            subtopics: cfg.selectedSubtopics,
            subtopicInstructions: {},
            customFocusArea: cfg.customFocusArea.trim() || undefined,
            avoidSimilarQuestions: false,
            priorQuestionPrompts: [],
          },
        });
        setQuestions(response.questions.map((q, i) => ({ ...q, id: `exam-${i + 1}` })));
      } else {
        const response = await invoke<{
          questions: Array<GeneratedQuestion & {
            options: Array<{ label: string; text: string }>;
            correctAnswer: string;
            explanationMarkdown: string;
          }>;
          durationMs: number;
        }>("generate_mc_questions", {
          request: {
            topics: [cfg.topic],
            difficulty: cfg.difficulty,
            questionCount: cfg.questionCount,
            model, apiKey, techMode: cfg.techMode,
            subtopics: cfg.selectedSubtopics,
            subtopicInstructions: {},
            customFocusArea: cfg.customFocusArea.trim() || undefined,
            avoidSimilarQuestions: false,
            priorQuestionPrompts: [],
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

  const handleFinish = useCallback((answers: Record<string, string>, feedback: Record<string, MarkAnswerResponse>, mcSelected: Record<string, string>) => {
    const elapsed = config ? config.timeLimitMinutes * 60 : 0;
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    setTimeUsed(elapsed);
    setFinalAnswers(answers);
    setFinalFeedback(feedback);
    setFinalMcSelected(mcSelected);

    if (config?.questionMode === "written") {
      const historyEntries: QuestionHistoryEntry[] = questions
        .filter((q) => feedback[q.id])
        .map((q, i) => ({
          id: `exam-w-${now}-${i}`,
          createdAt: nowIso,
          lastModified: now,
          question: q,
          uploadedAnswer: answers[q.id] ?? "",
          workedSolutionMarkdown: feedback[q.id]?.workedSolutionMarkdown ?? "",
          markResponse: feedback[q.id],
          analytics: {
            attemptKind: "initial" as const,
            attemptSequence: 1,
            answerCharacterCount: (answers[q.id] ?? "").length,
            answerWordCount: (answers[q.id] ?? "").split(/\s+/).filter(Boolean).length,
            usedImageUpload: false,
            responseLatencyMs: undefined,
          },
        }));
      if (historyEntries.length > 0) {
        setQuestionHistory((prev: QuestionHistoryEntry[]) => [...historyEntries, ...prev].slice(0, 200));
      }
    } else {
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
          attemptKind: "initial" as const,
          attemptSequence: 1,
          answerCharacterCount: 0,
          answerWordCount: 0,
          usedImageUpload: false,
          responseLatencyMs: undefined,
        },
      }));
      setMcHistory((prev: McHistoryEntry[]) => [...mcEntries, ...prev].slice(0, 200));
    }

    questions.forEach(() => recordCompletion(config?.questionMode ?? "written"));
    setPhase("results");
  }, [config, questions, recordCompletion, setQuestionHistory, setMcHistory]);

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

  useEffect(() => {
    if (phase === "active" && config && questions.length > 0) {
      const interval = setInterval(() => {
        setTimeUsed(config.timeLimitMinutes * 60 - (config.timeLimitMinutes * 60 - timeUsed));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [phase, config, timeUsed, questions.length]);

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

  if (phase === "setup") {
    return <ExamSetup onStart={handleStart} />;
  }

  if (phase === "active") {
    if (isGenerating || questions.length === 0) {
      return <ExamGenerating config={config} />;
    }
    
    if (config && questions.length > 0) {
      return (
        <ExamActive
          config={config}
          questions={questions}
          apiKey={apiKey}
          model={model}
          markingModel={markingModel}
          useSeparateMarkingModel={useSeparateMarkingModel}
          onFinish={handleFinish}
        />
      );
    }
  }

  if (phase === "results" && config) {
    return (
      <ExamResults
        config={config}
        questions={questions}
        answers={finalAnswers}
        feedback={finalFeedback}
        mcSelected={finalMcSelected}
        timeUsed={timeUsed}
        onRetry={handleRetry}
        onExit={handleExit}
      />
    );
  }

  return null;
}