import {
  Loader2,
  BookOpen,
  Target,
  Sparkles,
  Calculator,
  Pen,
  Clock3,
  AlertTriangle,
  Shuffle,
  CheckCheck,
  Hash,
  BarChart3,
  Blend,
  FlaskConical,
  Dumbbell,
  FunctionSquare,
  SigmaSquare,
  Crosshair,
  DollarSign,
  Coins,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Pause,
  Play,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSettings } from "@/AppContext";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatCostUsd, estimateTokensAndCost } from "@/lib/app-utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import {
  TOPICS,
  Topic,
  TechMode,
  MATH_METHODS_SUBTOPICS,
  MathMethodsSubtopic,
  SPECIALIST_MATH_SUBTOPICS,
  SpecialistMathSubtopic,
  CHEMISTRY_SUBTOPICS,
  ChemistrySubtopic,
  PHYSICAL_EDUCATION_SUBTOPICS,
  PhysicalEducationSubtopic,
  Difficulty,
  QuestionMode,
  GenerationMode,
  GenerationStatusEvent,
  GenerationTelemetry,
} from "@/types";
import { PageHeader, FilterGroup, FilterButton } from "@/components/layout/primitives";
import { useAppStore } from "@/store";

// ─── Batch progress type (exported for GeneratorView) ────────────────────────

export interface BatchTopicProgress {
  topic: Topic;
  /** How many questions are being generated in this call */
  questionCount: number;
  status: "waiting" | "active" | "done" | "error";
  /** Current backend stage for the active entry, e.g. "generating" */
  stage?: string;
  /** Latest human-readable message from the backend status event */
  message?: string;
  errorMessage?: string;
}

// ─── Topic icon map ──────────────────────────────────────────────────────────

const TOPIC_ICONS: Partial<Record<Topic, React.ReactNode>> = {
  "Mathematical Methods": <FunctionSquare className="w-3.5 h-3.5" />,
  "Specialist Mathematics": <SigmaSquare className="w-3.5 h-3.5" />,
  Chemistry: <FlaskConical className="w-3.5 h-3.5" />,
  "Physical Education": <Dumbbell className="w-3.5 h-3.5" />,
};

// ─── Exam PDF mapping ────────────────────────────────────────────────────────

const TOPIC_EXAM_PDFS: Record<Topic, string[]> = {
  "Mathematical Methods": ["2025-MathMethods1.pdf", "2025-MathMethods2.pdf"],
  "Specialist Mathematics": ["2025-SpecialistMaths1.pdf", "2025-SpecialistMaths2.pdf"],
  "Chemistry": ["2025-Chemistry.pdf"],
  "Physical Education": ["2025-PhysicalEducation.pdf"],
};

function getExamPdfsForTopics(topics: Topic[]): string[] {
  const pdfs = new Set<string>();
  for (const topic of topics) {
    const topicPdfs = TOPIC_EXAM_PDFS[topic];
    if (topicPdfs) {
      for (const pdf of topicPdfs) {
        pdfs.add(pdf);
      }
    }
  }
  return Array.from(pdfs);
}

// ─── Difficulty metadata ─────────────────────────────────────────────────────

const DIFFICULTY_META: Record<Difficulty, { label: string; color: string; desc: string }> = {
  "Essential Skills": { label: "Essential", color: "text-emerald-600 dark:text-emerald-400", desc: "Core concepts" },
  Easy: { label: "Easy", color: "text-sky-600 dark:text-sky-400", desc: "Straightforward" },
  Medium: { label: "Medium", color: "text-amber-600 dark:text-amber-400", desc: "Balanced challenge" },
  Hard: { label: "Hard", color: "text-orange-600 dark:text-orange-400", desc: "Complex problems" },
  Extreme: { label: "Extreme", color: "text-rose-600 dark:text-rose-400", desc: "Exam edge cases" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function CollapsibleStep({
  number, title, subtitle, chips, children, defaultOpen = true,
}: {
  number: number;
  title: string;
  subtitle?: string;
  chips?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<string | number>(defaultOpen ? "auto" : 0);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setHeight((h) => {
        if (h === "auto" || h === 0) return h;
        return el.scrollHeight;
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toggle = () => {
    const el = innerRef.current;
    if (!el) return;
    if (open) {
      setHeight(el.scrollHeight);
      requestAnimationFrame(() => { requestAnimationFrame(() => setHeight(0)); });
    } else {
      setHeight(el.scrollHeight);
    }
    setOpen((v) => !v);
  };

  const handleTransitionEnd = () => { if (open) setHeight("auto"); };

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center py-1 gap-3 mb-2 group cursor-pointer select-none"
      >
        <div className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold mt-0.5">
          {number}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-semibold leading-tight">{title}</p>
          {subtitle && open && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {!open && chips && (
          <div className="flex items-center gap-1 flex-wrap justify-end max-w-[55%]">{chips}</div>
        )}
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-250 ${open ? "" : "-rotate-90"}`} />
      </button>
      <div
        style={{ height: typeof height === "number" ? `${height}px` : height, overflow: "hidden", transition: "height 250ms cubic-bezier(0.4, 0, 0.2, 1)" }}
        onTransitionEnd={handleTransitionEnd}
      >
        <div ref={innerRef}>{children}</div>
      </div>
    </div>
  );
}

export function SectionDivider() {
  return <div className="h-px bg-border/60 my-3" />;
}

function SubtopicGroup({ label, hint, items, selected, onToggle }: {
  label: string;
  hint?: string;
  items: readonly string[];
  selected: string[];
  onToggle: (item: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-semibold">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => {
          const active = selected.includes(item);
          return (
            <button
              key={item}
              type="button"
              onClick={() => onToggle(item)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-all duration-150 cursor-pointer select-none
                ${active
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
            >
              {item}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Last-generation stats strip ─────────────────────────────────────────────

function LastGenerationStats({ telemetry }: { telemetry: GenerationTelemetry }) {
  const items: { icon: React.ReactNode; label: string; value: string }[] = [];

  if (telemetry.estimatedCostUsd != null) {
    items.push({ icon: <DollarSign className="w-3 h-3" />, label: "Cost", value: formatCostUsd(telemetry.estimatedCostUsd) });
  }
  if (telemetry.totalTokens != null) {
    items.push({ icon: <Coins className="w-3 h-3" />, label: "Tokens", value: telemetry.totalTokens.toLocaleString() });
  }
  if (telemetry.durationMs != null) {
    items.push({
      icon: <Clock3 className="w-3 h-3" />, label: "Time",
      value: telemetry.durationMs < 1000 ? `${Math.round(telemetry.durationMs)}ms` : `${(telemetry.durationMs / 1000).toFixed(1)}s`,
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="w-full px-6 py-2">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Last Generation</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {items.map(({ icon, label, value }) => (
          <div key={label} className="flex items-center gap-1 text-xs text-foreground">
            <span className="text-muted-foreground">{icon}</span>
            <span className="text-muted-foreground">{label}:</span>
            <span className="font-semibold tabular-nums">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Single-call generation timeline (1 topic) ───────────────────────────────

type TimelinePhase = "waiting" | "active" | "done" | "error";

const STAGE_ORDER = ["preparing", "generating", "parsing", "completed"] as const;
type KnownStage = typeof STAGE_ORDER[number];

function phaseForStage(stage: KnownStage, currentStage: string, isFailed: boolean): TimelinePhase {
  const currentIdx = STAGE_ORDER.indexOf(currentStage as KnownStage);
  const thisIdx = STAGE_ORDER.indexOf(stage);
  if (isFailed && stage === currentStage) return "error";
  if (thisIdx < currentIdx) return "done";
  if (thisIdx === currentIdx) return isFailed ? "error" : "active";
  return "waiting";
}

function TimelineDot({ phase }: { phase: TimelinePhase }) {
  if (phase === "done") return <CheckCircle2 className="w-3.5 h-3.5 text-green-500 dark:text-green-400 shrink-0 mt-0.5" />;
  if (phase === "error") return <XCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />;
  if (phase === "active") return (
    <span className="w-3.5 h-3.5 shrink-0 mt-0.5 flex items-center justify-center">
      <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
    </span>
  );
  return <span className="w-3.5 h-3.5 shrink-0 mt-0.5 flex items-center justify-center"><span className="w-2 h-2 rounded-full bg-border" /></span>;
}

const STAGE_LABELS: Record<KnownStage, string> = {
  preparing: "Building prompt",
  generating: "Generating",
  parsing: "Parsing & validating",
  completed: "Complete",
};

function GenerationTimeline({
  generationStatus, formattedElapsedTime, streamText, isGenerating, isPaused, onTogglePause,
}: {
  generationStatus: GenerationStatusEvent | null;
  formattedElapsedTime: string;
  streamText: string;
  isGenerating: boolean;
  isPaused: boolean;
  onTogglePause: () => void;
}) {
  const streamRef = useRef<HTMLDivElement>(null);
  const currentStage = generationStatus?.stage ?? "preparing";
  const isFailed = currentStage === "failed";
  const isDone = currentStage === "completed";

  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [streamText]);

  const completedEvent = isDone ? generationStatus : null;

  return (
    <div className="w-full px-6 py-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {isGenerating
            ? <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />
            : isDone
              ? <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
              : <XCircle className="w-3 h-3 text-destructive shrink-0" />
          }
          <span className="text-xs font-medium text-foreground">{generationStatus?.message ?? "Generating…"}</span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground tabular-nums flex items-center gap-1">
          <Clock3 className="w-2.5 h-2.5" />{formattedElapsedTime}
          {isGenerating && (
            <button
              type="button"
              onClick={onTogglePause}
              className="ml-1 p-0.5 rounded hover:bg-muted transition-colors"
              title={isPaused ? "Resume" : "Pause"}
            >
              {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            </button>
          )}
        </span>
      </div>

      <div className="relative flex flex-col gap-1.5 pl-0.5">
        {STAGE_ORDER.map((stage) => {
          const phase = phaseForStage(stage, currentStage, isFailed);
          if (phase === "waiting" && !isGenerating && !isDone && !isFailed) return null;
          return (
            <div key={stage} className="flex items-start gap-2 pl-0.5">
              <TimelineDot phase={phase} />
              <span className={`text-[11px] font-mono leading-tight pt-0.5 ${phase === "active" ? "text-foreground font-semibold" :
                phase === "done" ? "text-muted-foreground" :
                  phase === "error" ? "text-destructive" :
                    "text-muted-foreground/40"
                }`}>
                {STAGE_LABELS[stage]}
              </span>
            </div>
          );
        })}
      </div>

      {(currentStage === "generating" || (isDone && streamText)) && (
        <div
          ref={streamRef}
          className="max-h-28 overflow-y-auto rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-[10px] font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap break-all"
        >
          {streamText
            ? streamText
            : <span className="opacity-40">Waiting for tokens…</span>
          }
          {isGenerating && currentStage === "generating" && (
            <span className="inline-block w-1 h-3 bg-muted-foreground/50 ml-0.5 align-middle animate-pulse" />
          )}
        </div>
      )}

      {isDone && completedEvent && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 border-t border-border/40">
          {completedEvent.totalTokens != null && completedEvent.totalTokens > 0 && (
            <span className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
              <Coins className="w-3 h-3" />
              <span className="tabular-nums font-semibold text-foreground">{completedEvent.totalTokens.toLocaleString()}</span>
              {" tok"}
              {completedEvent.promptTokens != null && completedEvent.completionTokens != null && (
                <span className="text-muted-foreground/60">
                  {" "}({completedEvent.promptTokens.toLocaleString()} in / {completedEvent.completionTokens.toLocaleString()} out)
                </span>
              )}
            </span>
          )}
          {completedEvent.estimatedCostUsd != null && (
            <span className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
              <DollarSign className="w-3 h-3" />
              <span className="tabular-nums font-semibold text-foreground">
                {completedEvent.estimatedCostUsd < 0.0001 ? "<$0.0001" : `$${completedEvent.estimatedCostUsd.toFixed(4)}`}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Multi-topic batch timeline ───────────────────────────────────────────────

function BatchTimeline({
  entries, formattedElapsedTime, streamText, isGenerating, isPaused, onTogglePause,
}: {
  entries: BatchTopicProgress[];
  formattedElapsedTime: string;
  streamText: string;
  isGenerating: boolean;
  isPaused: boolean;
  onTogglePause: () => void;
}) {
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [streamText]);

  const doneCount = entries.filter((e) => e.status === "done").length;
  const errorCount = entries.filter((e) => e.status === "error").length;
  const activeEntry = entries.find((e) => e.status === "active");
  const allDone = doneCount + errorCount === entries.length;

  return (
    <div className="w-full px-6 py-2.5 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {isGenerating
            ? <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />
            : allDone && errorCount === 0
              ? <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
              : <XCircle className="w-3 h-3 text-destructive shrink-0" />
          }
          <span className="text-xs font-medium text-foreground">
            {isGenerating
              ? activeEntry
                ? `Generating ${activeEntry.topic} (${activeEntry.questionCount}q)…`
                : "Starting…"
              : allDone && errorCount === 0
                ? `Done — ${entries.length} subjects complete`
                : `${errorCount} subject${errorCount !== 1 ? "s" : ""} failed`
            }
          </span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground tabular-nums flex items-center gap-1">
          <Clock3 className="w-2.5 h-2.5" />{formattedElapsedTime}
          {isGenerating && (
            <button
              type="button"
              onClick={onTogglePause}
              className="ml-1 p-0.5 rounded hover:bg-muted transition-colors"
              title={isPaused ? "Resume" : "Pause"}
            >
              {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            </button>
          )}
        </span>
      </div>

      {/* Per-topic rows */}
      <div className="relative flex flex-col gap-1">

        {entries.map((entry, idx) => {
          const isActive = entry.status === "active";
          const isDone = entry.status === "done";
          const isError = entry.status === "error";
          const isWaiting = entry.status === "waiting";

          // Current stage label for the active entry
          const stageSuffix = isActive && entry.stage && entry.stage !== "completed"
            ? ` — ${STAGE_LABELS[entry.stage as KnownStage] ?? entry.stage}`
            : "";

          return (
            <div key={idx} className="flex items-start gap-2 pl-0.5">
              {/* Status dot */}
              {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 dark:text-green-400 shrink-0 mt-0.5" />}
              {isError && <XCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />}
              {isActive && (
                <span className="w-3.5 h-3.5 shrink-0 mt-0.5 flex items-center justify-center">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                </span>
              )}
              {isWaiting && (
                <span className="w-3.5 h-3.5 shrink-0 mt-0.5 flex items-center justify-center">
                  <span className="w-2 h-2 rounded-full bg-border" />
                </span>
              )}

              {/* Label */}
              <div className="flex-1 min-w-0">
                <span className={`text-[11px] font-mono leading-tight ${isActive ? "text-foreground font-semibold" :
                  isDone ? "text-muted-foreground" :
                    isError ? "text-destructive" :
                      "text-muted-foreground/40"
                  }`}>
                  {entry.topic}
                  <span className="font-normal opacity-70"> ·{entry.questionCount}q</span>
                  {stageSuffix && <span className="opacity-60">{stageSuffix}</span>}
                </span>
                {isError && entry.errorMessage && (
                  <p className="text-[10px] text-destructive/80 mt-0.5 leading-tight truncate">{entry.errorMessage}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Stream box — only for the active entry's generating stage */}
      {activeEntry?.stage === "generating" && (
        <div
          ref={streamRef}
          className="max-h-20 overflow-y-auto rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-[10px] font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap break-all"
        >
          {streamText
            ? streamText
            : <span className="opacity-40">Waiting for tokens…</span>
          }
          <span className="inline-block w-1 h-3 bg-muted-foreground/50 ml-0.5 align-middle animate-pulse" />
        </div>
      )}

      {/* Progress fraction */}
      <div className="flex items-center gap-2 pt-0.5 border-t border-border/40">
        <div className="flex-1 h-1 rounded-full bg-border overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: entries.length > 0 ? `${((doneCount + errorCount) / entries.length) * 100}%` : "0%" }}
          />
        </div>
        <span className="text-[10px] font-mono text-muted-foreground tabular-nums shrink-0">
          {doneCount + errorCount}/{entries.length}
        </span>
      </div>
    </div>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

type SetupPanelProps = {
  questionMode: QuestionMode;
  onSetQuestionMode: (mode: QuestionMode) => void;
  generationMode: GenerationMode;
  onSetGenerationMode: (mode: GenerationMode) => void;
  examTimeLimitMinutes: number;
  onSetExamTimeLimitMinutes: (minutes: number) => void;
  selectedTopics: Topic[];
  onToggleTopic: (topic: Topic) => void;
  mathMethodsSubtopics: MathMethodsSubtopic[];
  onToggleMathMethodsSubtopic: (sub: MathMethodsSubtopic) => void;
  specialistMathSubtopics: SpecialistMathSubtopic[];
  onToggleSpecialistMathSubtopic: (sub: SpecialistMathSubtopic) => void;
  chemistrySubtopics: ChemistrySubtopic[];
  onToggleChemistrySubtopic: (sub: ChemistrySubtopic) => void;
  physicalEducationSubtopics: PhysicalEducationSubtopic[];
  onTogglePhysicalEducationSubtopic: (sub: PhysicalEducationSubtopic) => void;
  techMode: TechMode;
  onSetTechMode: (mode: TechMode) => void;
  customFocusArea: string;
  onSetCustomFocusArea: (value: string) => void;
  difficulty: Difficulty;
  onSetDifficulty: (level: Difficulty) => void;
  questionCount: number;
  onSetQuestionCount: (count: number) => void;
  averageMarksPerQuestion: number;
  onSetAverageMarksPerQuestion: (marks: number) => void;
  avoidSimilarQuestions: boolean;
  onSetAvoidSimilarQuestions: (enabled: boolean) => void;
  shuffleQuestions: boolean;
  onSetShuffleQuestions: (enabled: boolean) => void;
  aiDifficultyScalingEnabled: boolean;
  onSetAiDifficultyScalingEnabled: (enabled: boolean) => void;
  difficultyThresholds: { increase: number; decrease: number };
  onSetDifficultyThresholds: (thresholds: { increase: number; decrease: number }) => void;
  hasApiKey: boolean;
  canGenerate: boolean;
  isGenerating: boolean;
  isPaused: boolean;
  onTogglePause: () => void;
  generationStatus: GenerationStatusEvent | null;
  generationStartedAt: number | null;
  formattedElapsedTime: string;
  onGenerate: () => void;
  lastGenerationTelemetry?: GenerationTelemetry | null;
  streamText?: string;
  /** Non-empty only during/after a multi-topic sequential run */
  batchProgress?: BatchTopicProgress[];
  /** Whether exam PDF files will be included in generation prompts */
  includeExamContext?: boolean;
};

// ─── Component ───────────────────────────────────────────────────────────────

export function SetupPanel({
  questionMode, onSetQuestionMode,
  generationMode, onSetGenerationMode,
  examTimeLimitMinutes, onSetExamTimeLimitMinutes,
  selectedTopics, onToggleTopic,
  mathMethodsSubtopics, onToggleMathMethodsSubtopic,
  specialistMathSubtopics, onToggleSpecialistMathSubtopic,
  chemistrySubtopics, onToggleChemistrySubtopic,
  physicalEducationSubtopics, onTogglePhysicalEducationSubtopic,
  techMode, onSetTechMode,
  customFocusArea, onSetCustomFocusArea,
  difficulty, onSetDifficulty,
  questionCount, onSetQuestionCount,
  averageMarksPerQuestion, onSetAverageMarksPerQuestion,
  avoidSimilarQuestions, onSetAvoidSimilarQuestions,
  shuffleQuestions, onSetShuffleQuestions,
  aiDifficultyScalingEnabled = true, onSetAiDifficultyScalingEnabled,
  difficultyThresholds, onSetDifficultyThresholds,
  hasApiKey, canGenerate, isGenerating, isPaused, onTogglePause,
  generationStatus, formattedElapsedTime,
  onGenerate,
  lastGenerationTelemetry,
  streamText = "",
  batchProgress = [],
  includeExamContext = false,
}: SetupPanelProps) {
  const navigate = useNavigate();
  const { apiKey, model } = useAppSettings();
  const generationHistory = useAppStore((s) => s.generationHistory);
  const [promptPricePerToken, setPromptPricePerToken] = useState<number | null>(null);
  const [completionPricePerToken, setCompletionPricePerToken] = useState<number | null>(null);
  const hasAnyMathTopic = selectedTopics.some(
    (t) => t === "Mathematical Methods" || t === "Specialist Mathematics"
  );
  const hasSubtopicSection =
    selectedTopics.includes("Mathematical Methods") ||
    selectedTopics.includes("Specialist Mathematics") ||
    selectedTopics.includes("Chemistry") ||
    selectedTopics.includes("Physical Education");

  // Whether to show the multi-topic batch timeline vs the single-topic timeline
  const showBatchTimeline = batchProgress.length > 1;
  const examPresets = [
    { label: "Quick Sprint", count: 5, time: 15 },
    { label: "Standard Practice", count: 10, time: 30 },
    { label: "Deep Dive", count: 15, time: 60 },
    { label: "Marathon", count: 20, time: 90 },
  ];

  let stepNum = 0;
  const step = () => ++stepNum;

  const getSelectedSubtopics = () => Array.from(new Set([
    ...(selectedTopics.includes("Mathematical Methods") ? mathMethodsSubtopics : []),
    ...(selectedTopics.includes("Specialist Mathematics") ? specialistMathSubtopics : []),
    ...(selectedTopics.includes("Chemistry") ? chemistrySubtopics : []),
    ...(selectedTopics.includes("Physical Education") ? physicalEducationSubtopics : []),
  ]));

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
    const primaryTopic = selectedTopics[0] || "Mathematical Methods";
    const selectedSubtopics = getSelectedSubtopics();
    return estimateTokensAndCost(
      generationHistory,
      primaryTopic,
      difficulty,
      questionCount,
      questionMode,
      techMode,
      averageMarksPerQuestion,
      selectedSubtopics.length > 0 ? selectedSubtopics : undefined,
      customFocusArea.trim() || undefined,
      promptPricePerToken ?? undefined,
      completionPricePerToken ?? undefined,
    );
  }, [generationHistory, selectedTopics, difficulty, questionCount, questionMode, techMode, averageMarksPerQuestion, customFocusArea, promptPricePerToken, completionPricePerToken]);

  const handleGenerate = () => {
    onGenerate();
  };

  return (
    <div className="pb-12">
      {/* ── Header ── */}
      <div className="p-6 pb-4">
        <PageHeader
          title="Practice Generator"
          description="Configure your VCE revision session"
          actions={
            <FilterGroup>
              <FilterButton
                active={questionMode === "written"}
                onClick={() => onSetQuestionMode("written")}
              >
                <BookOpen className="w-3.5 h-3.5 mr-1.5" /> Written
              </FilterButton>
              <FilterButton
                active={questionMode === "multiple-choice"}
                onClick={() => onSetQuestionMode("multiple-choice")}
              >
                <Target className="w-3.5 h-3.5 mr-1.5" /> Multiple Choice
              </FilterButton>
            </FilterGroup>
          }
        />
      </div>

      <div className="px-6 pt-0 pb-2">

        {/* ── Step 1: Subjects ── */}
        <div>
          <CollapsibleStep
            number={step()}
            title="Generation Mode"
            subtitle={generationMode === "exam" ? "Timed exam simulation" : "Untimed practice session"}
            chips={
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${generationMode === "exam" ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" : "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"}`}>
                {generationMode === "exam" ? "Exam" : "Practice"}
              </span>
            }
          >
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onSetGenerationMode("practice")}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium text-center transition-all duration-150 cursor-pointer ${generationMode === "practice" ? "bg-primary text-primary-foreground border-primary shadow-sm" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-muted/30"}`}
                >
                  <BookOpen className="w-3.5 h-3.5" /> Practice
                </button>
                <button
                  type="button"
                  onClick={() => onSetGenerationMode("exam")}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium text-center transition-all duration-150 cursor-pointer ${generationMode === "exam" ? "bg-primary text-primary-foreground border-primary shadow-sm" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-muted/30"}`}
                >
                  <Clock3 className="w-3.5 h-3.5" /> Exam
                </button>
              </div>

              {generationMode === "exam" && (
                <div className="mb-2">
                  <SectionDivider />
                  <div className="space-y-4 rounded-lg border bg-muted/20 px-3 py-3 mt-2">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className="text-xs font-medium flex items-center gap-1.5">
                          <Clock3 className="w-3.5 h-3.5" /> Time allocation
                        </Label>
                        <Badge variant="secondary" className="text-xs px-2 py-0 tabular-nums">{examTimeLimitMinutes} min</Badge>
                      </div>
                      <Slider min={5} max={180} step={5} value={[examTimeLimitMinutes]} onValueChange={(val) => onSetExamTimeLimitMinutes(val[0])} className="px-1 py-1" />
                      <div className="flex justify-between text-[10px] text-muted-foreground"><span>5m</span><span>180m</span></div>
                    </div>

                    {/* Per-question time preview and bank info */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                      <span>
                        {questionCount} questions × {(examTimeLimitMinutes / questionCount).toFixed(2)} min each = {examTimeLimitMinutes} min total
                      </span>
                      <span className="ml-2">
                        <span className="inline-block align-middle">
                          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="9" stroke="#6366F1" strokeWidth="2" fill="#EEF2FF"/><text x="50%" y="55%" textAnchor="middle" fill="#6366F1" fontSize="10" fontFamily="Arial" dy=".3em">i</text></svg>
                        </span>
                        <span className="ml-1 align-middle" title="Unused time from early completions is banked and redistributed to remaining questions. The time bank helps you stay ahead or catch up.">
                          Time bank: unused time carries over
                        </span>
                      </span>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Presets</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {examPresets.map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => { onSetQuestionCount(preset.count); onSetExamTimeLimitMinutes(preset.time); }}
                            className={`group p-2.5 text-left rounded-lg border transition-all duration-150 cursor-pointer ${questionCount === preset.count && examTimeLimitMinutes === preset.time ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40 hover:bg-muted/30"}`}
                          >
                            <p className="text-xs font-semibold leading-tight">{preset.label}</p>
                            <span className="text-[10px] text-muted-foreground">{preset.count}Q / {preset.time}m</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CollapsibleStep>
        </div>

        <SectionDivider />

        {/* ── Step 2: Subjects ── */}
        <div>
          <CollapsibleStep
            number={step()}
            title="Select Subjects"
            subtitle={selectedTopics.length > 0 ? `${selectedTopics.length} selected` : "Choose at least one to continue"}
            chips={
              selectedTopics.length === 0 ? (
                <span className="text-[10px] font-medium text-amber-500 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> None selected
                </span>
              ) : (
                selectedTopics.map((t) => (
                  <span key={t} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                    {t.split(" ")[0]}
                  </span>
                ))
              )
            }
          >
            <div className="grid grid-cols-2 gap-2">
              {TOPICS.map((topic) => {
                const isSelected = selectedTopics.includes(topic);
                return (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => onToggleTopic(topic)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium text-left transition-all duration-150 cursor-pointer
                    ${isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-muted/30"
                      }`}
                  >
                    <span className="shrink-0">{TOPIC_ICONS[topic] ?? <BookOpen className="w-3.5 h-3.5" />}</span>
                    <span className="leading-tight">{topic}</span>
                    {isSelected && <CheckCheck className="w-3.5 h-3.5 ml-auto shrink-0 opacity-80" />}
                  </button>
                );
              })}
            </div>
            {includeExamContext && selectedTopics.length > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 mb-2">
                <FileText className="w-3.5 h-3.5 text-violet-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-violet-700 dark:text-violet-300">
                    Using exam PDFs for context
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {getExamPdfsForTopics(selectedTopics).map((pdf) => (
                      <span key={pdf} className="inline-flex items-center px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-[10px] font-mono">
                        {pdf}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {hasSubtopicSection && (
              <>
                <SectionDivider />
                <div className="rounded-lg border bg-muted/20 px-4 py-3 space-y-4 mt-2 mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Focus Areas
                    <span className="ml-2 font-normal normal-case">— leave blank to cover all</span>
                  </p>
                  {selectedTopics.includes("Mathematical Methods") && (
                    <SubtopicGroup label="Mathematical Methods" hint="Unit 3/4" items={MATH_METHODS_SUBTOPICS} selected={mathMethodsSubtopics} onToggle={onToggleMathMethodsSubtopic as (s: string) => void} />
                  )}
                  {selectedTopics.includes("Specialist Mathematics") && (
                    <SubtopicGroup label="Specialist Mathematics" hint="Unit 1/2" items={SPECIALIST_MATH_SUBTOPICS} selected={specialistMathSubtopics} onToggle={onToggleSpecialistMathSubtopic as (s: string) => void} />
                  )}
                  {selectedTopics.includes("Chemistry") && (
                    <SubtopicGroup label="Chemistry" hint="Unit 1/2" items={CHEMISTRY_SUBTOPICS} selected={chemistrySubtopics} onToggle={onToggleChemistrySubtopic as (s: string) => void} />
                  )}
                  {selectedTopics.includes("Physical Education") && (
                    <SubtopicGroup label="Physical Education" hint="Unit 3/4" items={PHYSICAL_EDUCATION_SUBTOPICS} selected={physicalEducationSubtopics} onToggle={onTogglePhysicalEducationSubtopic as (s: string) => void} />
                  )}
                </div>
              </>
            )}
          </CollapsibleStep>
        </div>

        <SectionDivider />

        {/* ── Step 3: Difficulty ── */}
        <div>
          <CollapsibleStep
            number={step()}
            title="Difficulty"
            chips={
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted ${DIFFICULTY_META[difficulty].color}`}>
                {DIFFICULTY_META[difficulty].label}
              </span>
            }
          >
            <div className="grid grid-cols-5 gap-1.5">
              {(["Essential Skills", "Easy", "Medium", "Hard", "Extreme"] as Difficulty[]).map((level) => {
                const isSelected = difficulty === level;
                const meta = DIFFICULTY_META[level];
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => onSetDifficulty(level)}
                    className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-lg border text-center transition-all duration-150 cursor-pointer
                    ${isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40 hover:bg-muted/30"}`}
                  >
                    <span className={`text-xs font-semibold leading-tight ${isSelected ? meta.color : "text-foreground"}`}>{meta.label}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight hidden sm:block">{meta.desc}</span>
                  </button>
                );
              })}
            </div>
          </CollapsibleStep>
        </div>

        <SectionDivider />

        {/* ── Step 4: AI Difficulty Scaling ── */}
        <div>
          <CollapsibleStep
            number={step()}
            title="AI Difficulty Scaling"
            chips={
              aiDifficultyScalingEnabled ? (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  Enabled
                </span>
              ) : (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                  Disabled
                </span>
              )
            }
          >
            <div className="space-y-2 mb-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="ai-scaling"
                  checked={aiDifficultyScalingEnabled}
                  onCheckedChange={(checked) => onSetAiDifficultyScalingEnabled(!!checked)}
                />
                <Label htmlFor="ai-scaling" className="text-sm font-medium">
                  Enable AI-driven difficulty adjustment
                </Label>
              </div>
              {aiDifficultyScalingEnabled && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Increase threshold (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={difficultyThresholds.increase}
                      onChange={(e) => onSetDifficultyThresholds({
                        ...difficultyThresholds,
                        increase: parseInt(e.target.value) || 85
                      })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Decrease threshold (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={difficultyThresholds.decrease}
                      onChange={(e) => onSetDifficultyThresholds({
                        ...difficultyThresholds,
                        decrease: parseInt(e.target.value) || 70
                      })}
                      className="mt-1"
                    />
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                When enabled, the AI will adjust question difficulty based on your recent performance.
                If your average score exceeds the increase threshold, difficulty will rise.
                If below the decrease threshold, difficulty will lower.
              </p>
            </div>
          </CollapsibleStep>
        </div>

        <SectionDivider />

        {/* ── Step 5: Questions + Marks ── */}
        <div>
          <CollapsibleStep
            number={step()}
            title="Session Size"
            chips={
              <>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-foreground">
                  {questionCount} questions
                </span>
                {questionMode === "written" && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                    ≤{averageMarksPerQuestion}mk
                  </span>
                )}
              </>
            }
          >
            <div className="space-y-4 mb-2">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5" /> Questions
                  </Label>
                  <Badge variant="secondary" className="text-xs px-2 py-0 tabular-nums">{questionCount}</Badge>
                </div>
                <Slider min={1} max={20} step={1} value={[questionCount]} onValueChange={(val) => onSetQuestionCount(val[0])} className="px-1 py-1" />
                <div className="flex justify-between text-[10px] text-muted-foreground"><span>1</span><span>20</span></div>
              </div>

              {/* Per-topic preview — shown when >1 topic selected */}
              {selectedTopics.length > 1 && (
                <div className="rounded-lg border bg-muted/20 px-3 py-2 space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Questions per subject</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {selectedTopics.map((topic, i) => {
                      const base = Math.floor(questionCount / selectedTopics.length);
                      const remainder = questionCount % selectedTopics.length;
                      const count = base + (i < remainder ? 1 : 0);
                      return (
                        <span key={topic} className="text-[11px] text-foreground flex items-center gap-1">
                          <span className="text-muted-foreground">{TOPIC_ICONS[topic]}</span>
                          <span className="truncate max-w-[100px]">{topic.split(" ")[0]}</span>
                          <span className="font-semibold tabular-nums text-primary">{count}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {questionMode === "written" ? (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <BarChart3 className="w-3.5 h-3.5" /> Avg marks per question
                    </Label>
                    <Badge variant="secondary" className="text-xs px-2 py-0 tabular-nums">{averageMarksPerQuestion}</Badge>
                  </div>
                  <Slider min={1} max={15} step={1} value={[averageMarksPerQuestion]} onValueChange={(val) => onSetAverageMarksPerQuestion(val[0])} className="py-1" />
                  <div className="flex justify-between text-[10px] text-muted-foreground"><span>1</span><span>15</span></div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                      <BarChart3 className="w-3.5 h-3.5" /> Avg marks per question
                    </Label>
                    <Badge variant="secondary" className="text-xs px-2 py-0 tabular-nums bg-muted text-muted-foreground">1 mark (fixed)</Badge>
                  </div>
                  <div className="h-6 bg-muted/30 rounded-md border border-border flex items-center px-3">
                    <span className="text-xs text-muted-foreground">Multiple choice questions are always worth 1 mark each</span>
                  </div>
                </div>
              )}
            </div>
          </CollapsibleStep>
        </div>

        <SectionDivider />

        {/* ── Step 6: Options ── */}
        <div>
          <CollapsibleStep
            number={step()}
            title="Options"
            chips={
              (() => {
                const parts: string[] = [];
                if (hasAnyMathTopic) {
                  const techLabels: Record<string, string> = { "tech-free": "Tech-Free", mix: "Mixed", "tech-active": "Tech-Active" };
                  parts.push(techLabels[techMode] ?? techMode);
                }
                if (avoidSimilarQuestions) parts.push("No repeats");
                if (customFocusArea.trim()) parts.push("Custom focus");
                return parts.length > 0 ? (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {parts.join(" · ")}
                  </span>
                ) : null;
              })()
            }
          >
            <div className="space-y-3">
              {hasAnyMathTopic && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Calculator Mode</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([
                      { value: "tech-free", label: "Tech-Free", icon: <Pen className="w-3.5 h-3.5" /> },
                      { value: "mix", label: "Mixed", icon: <Blend className="w-3.5 h-3.5" /> },
                      { value: "tech-active", label: "Tech-Active", icon: <Calculator className="w-3.5 h-3.5" /> },
                    ] as { value: TechMode; label: string; icon: React.ReactNode }[]).map(({ value, label, icon }) => {
                      const isActive = techMode === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => onSetTechMode(value)}
                          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg border text-xs font-medium transition-all duration-150 cursor-pointer
                          ${isActive ? "bg-primary text-primary-foreground border-primary shadow-sm" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
                        >
                          {icon} {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => onSetAvoidSimilarQuestions(!avoidSimilarQuestions)}
                className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg border text-left transition-all duration-150 cursor-pointer
                ${avoidSimilarQuestions ? "bg-primary/5 border-primary/40" : "border-border hover:border-primary/30 hover:bg-muted/20"}`}
              >
                <Shuffle className={`w-4 h-4 mt-0.5 shrink-0 ${avoidSimilarQuestions ? "text-primary" : "text-muted-foreground"}`} />
                <div className="min-w-0">
                  <p className={`text-xs font-semibold ${avoidSimilarQuestions ? "text-foreground" : "text-muted-foreground"}`}>
                    Avoid Similar Questions
                    <span className={`ml-2 text-[10px] font-normal px-1.5 py-0.5 rounded-full ${avoidSimilarQuestions ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {avoidSimilarQuestions ? "On" : "Off"}
                    </span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                    Uses recent same-topic prompts to steer the model away from repeats.
                  </p>
                </div>
              </button>

              {selectedTopics.length > 1 && (
                <button
                  type="button"
                  onClick={() => onSetShuffleQuestions(!shuffleQuestions)}
                  className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg border text-left transition-all duration-150 cursor-pointer
                ${shuffleQuestions ? "bg-primary/5 border-primary/40" : "border-border hover:border-primary/30 hover:bg-muted/20"}`}
                >
                  <Shuffle className={`w-4 h-4 mt-0.5 shrink-0 ${shuffleQuestions ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold ${shuffleQuestions ? "text-foreground" : "text-muted-foreground"}`}>
                      Shuffle Questions
                      <span className={`ml-2 text-[10px] font-normal px-1.5 py-0.5 rounded-full ${shuffleQuestions ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                        {shuffleQuestions ? "On" : "Off"}
                      </span>
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                      Randomly shuffles the combined set after generating questions for each subject.
                    </p>
                  </div>
                </button>
              )}

              <div className="space-y-1.5 mb-2">
                <Label className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                  <Crosshair className="w-3.5 h-3.5" />
                  Custom Focus Area
                  <span className="font-normal opacity-70">— optional</span>
                </Label>
                <Input
                  value={customFocusArea}
                  onChange={(e) => onSetCustomFocusArea(e.target.value)}
                  maxLength={160}
                  placeholder="e.g. projectile motion with optimisation constraints"
                  className="text-xs h-8"
                />
              </div>
            </div>
          </CollapsibleStep>
        </div>

        {/* ── API key warning ── */}
        {!hasApiKey && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-400/40 bg-amber-500/5 px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-amber-700 dark:text-amber-400 leading-snug">
                <strong>API key missing.</strong> Configure your OpenRouter key in Settings before generating.
              </p>
              <div className="mt-2">
                <Button size="sm" variant="outline" onClick={() => navigate("/settings")}>Open Settings</Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer / Generate ── */}
      <div className="pt-6 border-t space-y-4">

        {/* ── Full config summary strip (idle only) ── */}
        {!isGenerating && (
          <div className="w-full px-6 space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Session Summary</p>

            <div className="flex items-start gap-2">
              <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wide w-14 shrink-0 pt-0.5">Subjects</span>
              <div className="flex flex-wrap gap-1 flex-1">
                {selectedTopics.length === 0 ? (
                  <span className="text-[11px] font-medium text-amber-500 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> None selected
                  </span>
                ) : (
                  selectedTopics.map(t => (
                    <span key={t} className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-medium text-[11px]">
                      {TOPIC_ICONS[t as Topic] && <span className="opacity-70">{TOPIC_ICONS[t as Topic]}</span>}
                      {t}
                    </span>
                  ))
                )}
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
              {questionMode === "written" && (
                <>
                  <span className="text-border">·</span>
                  <span className="flex items-center gap-1">
                    <span className="text-muted-foreground/60">Avg marks</span>
                    <span className="font-semibold text-foreground tabular-nums">{averageMarksPerQuestion}</span>
                  </span>
                </>
              )}
              <span className="text-border">·</span>
              <span className={`font-semibold ${generationMode === "exam" ? "text-violet-600 dark:text-violet-400" : "text-sky-600 dark:text-sky-400"}`}>
                {generationMode === "exam" ? `Exam (${examTimeLimitMinutes}m)` : "Practice"}
              </span>
              <span className="text-border">·</span>
              <span className={`font-semibold ${questionMode === "written" ? "text-sky-600 dark:text-sky-400" : "text-violet-600 dark:text-violet-400"}`}>
                {questionMode === "written" ? "Written" : "Multiple Choice"}
              </span>
            </div>

            {(hasAnyMathTopic || avoidSimilarQuestions || customFocusArea.trim()) && (
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
                {hasAnyMathTopic && (
                  <span className="flex items-center gap-1">
                    <span className="text-muted-foreground/60">Calculator</span>
                    <span className="font-semibold text-foreground">
                      {{ "tech-free": "Tech-Free", mix: "Mixed", "tech-active": "Tech-Active" }[techMode]}
                    </span>
                  </span>
                )}
                {avoidSimilarQuestions && (
                  <>
                    {hasAnyMathTopic && <span className="text-border">·</span>}
                    <span className="flex items-center gap-1 text-primary font-semibold">
                      <Shuffle className="w-3 h-3" /> No repeats
                    </span>
                  </>
                )}
                {customFocusArea.trim() && (
                  <>
                    {(hasAnyMathTopic || avoidSimilarQuestions) && <span className="text-border">·</span>}
                    <span className="flex items-center gap-1">
                      <Crosshair className="w-3 h-3 text-muted-foreground" />
                      <span className="text-foreground font-medium truncate max-w-[140px]">{customFocusArea.trim()}</span>
                    </span>
                  </>
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
        )}

        <div className="px-6">
          <Button
            size="lg"
            className="w-full h-10 text-sm font-bold gap-2 transition-all duration-200 disabled:opacity-50"
            onClick={handleGenerate}
            disabled={!canGenerate}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {showBatchTimeline
                  ? `Generating… (${batchProgress.filter(e => e.status === "done").length + batchProgress.filter(e => e.status === "error").length}/${batchProgress.length})`
                  : "Crafting questions…"
                }
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {generationMode === "exam" ? "Generate Exam Set" : "Generate Revision Set"}
              </>
            )}
          </Button>
        </div>

        {/* Generation timeline — batch or single depending on run type */}
        {isGenerating && (
          showBatchTimeline ? (
            <BatchTimeline
              entries={batchProgress}
              formattedElapsedTime={formattedElapsedTime}
              streamText={streamText}
              isGenerating={isGenerating}
              isPaused={isPaused}
              onTogglePause={onTogglePause}
            />
          ) : (
            <GenerationTimeline
              generationStatus={generationStatus}
              formattedElapsedTime={formattedElapsedTime}
              streamText={streamText}
              isGenerating={isGenerating}
              isPaused={isPaused}
              onTogglePause={onTogglePause}
            />
          )
        )}

        {/* Last generation stats — shown when idle and timeline isn't showing a completed run */}
        {!isGenerating && generationStatus?.stage !== "completed" && lastGenerationTelemetry && (
          <LastGenerationStats telemetry={lastGenerationTelemetry} />
        )}
      </div>
    </div>
  );
}
