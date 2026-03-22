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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSettings } from "@/AppContext";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatCostUsd } from "@/lib/app-utils";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
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
  GenerationStatusEvent,
  GenerationTelemetry,
} from "@/types";

// ─── Topic icon map ──────────────────────────────────────────────────────────

const TOPIC_ICONS: Partial<Record<Topic, React.ReactNode>> = {
  "Mathematical Methods": <FunctionSquare className="w-3.5 h-3.5" />,
  "Specialist Mathematics": <SigmaSquare className="w-3.5 h-3.5" />,
  Chemistry: <FlaskConical className="w-3.5 h-3.5" />,
  "Physical Education": <Dumbbell className="w-3.5 h-3.5" />,
};

// ─── Difficulty metadata ─────────────────────────────────────────────────────

const DIFFICULTY_META: Record<Difficulty, { label: string; color: string; desc: string }> = {
  "Essential Skills": { label: "Essential", color: "text-emerald-600 dark:text-emerald-400", desc: "Core concepts" },
  Easy: { label: "Easy", color: "text-sky-600 dark:text-sky-400", desc: "Straightforward" },
  Medium: { label: "Medium", color: "text-amber-600 dark:text-amber-400", desc: "Balanced challenge" },
  Hard: { label: "Hard", color: "text-orange-600 dark:text-orange-400", desc: "Complex problems" },
  Extreme: { label: "Extreme", color: "text-rose-600 dark:text-rose-400", desc: "Exam edge cases" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function CollapsibleStep({
  number,
  title,
  subtitle,
  chips,
  children,
  defaultOpen = true,
}: {
  number: number;
  title: string;
  subtitle?: string;
  /** Summary chips shown in the header when collapsed */
  chips?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<string | number>(defaultOpen ? "auto" : 0);

  // Track natural size changes (e.g. subtopic pills expanding) via ResizeObserver
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      // Only update when open and already settled to px (avoid fighting "auto")
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
      // Snapshot px height before animating to 0
      setHeight(el.scrollHeight);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setHeight(0));
      });
    } else {
      // Animate from 0 → px, then switch to "auto" so inner content can resize freely
      setHeight(el.scrollHeight);
    }
    setOpen((v) => !v);
  };

  const handleTransitionEnd = () => {
    if (open) setHeight("auto");
  };

  return (
    <div>
      {/* Clickable header */}
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
          {subtitle && open && (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>

        {/* Summary chips — visible when collapsed */}
        {!open && chips && (
          <div className="flex items-center gap-1 flex-wrap justify-end max-w-[55%]">
            {chips}
          </div>
        )}

        <ChevronDown
          className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-250 ${open ? "" : "-rotate-90"}`}
        />
      </button>

      {/* Animated content wrapper */}
      <div
        style={{
          height: typeof height === "number" ? `${height}px` : height,
          overflow: "hidden",
          transition: "height 250ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
        onTransitionEnd={handleTransitionEnd}
      >
        <div ref={innerRef}>
          {children}
        </div>
      </div>
    </div>
  );
}

function SectionDivider() {
  return <div className="h-px bg-border/60 my-1" />;
}

function SubtopicGroup({
  label,
  hint,
  items,
  selected,
  onToggle,
}: {
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

// ─── Cost formatter ──────────────────────────────────────────────────────────

// NOTE: cost formatting is provided by app-utils `formatCostUsd`.

// ─── Last-generation stats strip ─────────────────────────────────────────────

function LastGenerationStats({ telemetry }: { telemetry: GenerationTelemetry }) {
  console.debug("[SetupPanel] LastGenerationStats rendering with:", telemetry);
  const items: { icon: React.ReactNode; label: string; value: string }[] = [];

  if (telemetry.estimatedCostUsd != null) {
    items.push({
      icon: <DollarSign className="w-3 h-3" />,
      label: "Cost",
      value: formatCostUsd(telemetry.estimatedCostUsd),
    });
  }

  if (telemetry.totalTokens != null) {
    items.push({
      icon: <Coins className="w-3 h-3" />,
      label: "Tokens",
      value: telemetry.totalTokens.toLocaleString(),
    });
  }

  if (telemetry.durationMs != null) {
    items.push({
      icon: <Clock3 className="w-3 h-3" />,
      label: "Time",
      value: telemetry.durationMs < 1000
        ? `${Math.round(telemetry.durationMs)}ms`
        : `${(telemetry.durationMs / 1000).toFixed(1)}s`,
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
        Last Generation
      </p>
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

// ─── Generation timeline components ──────────────────────────────────────────

type TimelinePhase = "waiting" | "active" | "done" | "error";

const STAGE_ORDER = ["preparing", "generating", "parsing", "completed"] as const;
type KnownStage = typeof STAGE_ORDER[number];

function phaseForStage(
  stage: KnownStage,
  currentStage: string,
  isFailed: boolean,
): TimelinePhase {
  const currentIdx = STAGE_ORDER.indexOf(currentStage as KnownStage);
  const thisIdx = STAGE_ORDER.indexOf(stage);
  if (isFailed && stage === currentStage) return "error";
  if (thisIdx < currentIdx) return "done";
  if (thisIdx === currentIdx) return isFailed ? "error" : "active";
  return "waiting";
}

function TimelineDot({ phase }: { phase: TimelinePhase }) {
  if (phase === "done")
    return <CheckCircle2 className="w-3.5 h-3.5 text-green-500 dark:text-green-400 shrink-0 mt-0.5" />;
  if (phase === "error")
    return <XCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />;
  if (phase === "active")
    return (
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
  generationStatus,
  formattedElapsedTime,
  streamText,
  isGenerating,
}: {
  generationStatus: import("@/types").GenerationStatusEvent | null;
  formattedElapsedTime: string;
  streamText: string;
  isGenerating: boolean;
}) {
  const streamRef = useRef<HTMLDivElement>(null);
  const currentStage = generationStatus?.stage ?? "preparing";
  const isFailed = currentStage === "failed";
  const isDone = currentStage === "completed";

  // Auto-scroll stream box as tokens arrive.
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [streamText]);

  const completedEvent = isDone ? generationStatus : null;

  return (
    <div className="w-full rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {isGenerating
            ? <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />
            : isDone
              ? <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
              : <XCircle className="w-3 h-3 text-destructive shrink-0" />
          }
          <span className="text-xs font-medium text-foreground">
            {generationStatus?.message ?? "Generating…"}
          </span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground tabular-nums flex items-center gap-1">
          <Clock3 className="w-2.5 h-2.5" />
          {formattedElapsedTime}
        </span>
      </div>

      {/* Timeline rows */}
      <div className="relative flex flex-col gap-1.5 pl-0.5">
        {/* Vertical guide line */}
        <div className="absolute left-[6px] top-2 bottom-2 w-px bg-border/60" />

        {STAGE_ORDER.map((stage) => {
          const phase = phaseForStage(stage, currentStage, isFailed);
          if (phase === "waiting" && !isGenerating && !isDone && !isFailed) return null;
          return (
            <div key={stage} className="flex items-start gap-2 pl-0.5">
              <TimelineDot phase={phase} />
              <span
                className={`text-[11px] font-mono leading-tight pt-0.5 ${phase === "active" ? "text-foreground font-semibold" :
                  phase === "done" ? "text-muted-foreground" :
                    phase === "error" ? "text-destructive" :
                      "text-muted-foreground/40"
                  }`}
              >
                {STAGE_LABELS[stage]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Stream box — shown while generating */}
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

      {/* Completion summary */}
      {isDone && completedEvent && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 border-t border-border/40">
          {completedEvent.totalTokens != null && completedEvent.totalTokens > 0 && (
            <span className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
              <Coins className="w-3 h-3" />
              <span className="tabular-nums font-semibold text-foreground">
                {completedEvent.totalTokens.toLocaleString()}
              </span>
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
                {completedEvent.estimatedCostUsd < 0.0001
                  ? "<$0.0001"
                  : `$${completedEvent.estimatedCostUsd.toFixed(4)}`}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

type SetupPanelProps = {
  questionMode: QuestionMode;
  onSetQuestionMode: (mode: QuestionMode) => void;
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
  maxMarksPerQuestion: number;
  onSetMaxMarksPerQuestion: (marks: number) => void;
  avoidSimilarQuestions: boolean;
  onSetAvoidSimilarQuestions: (enabled: boolean) => void;
  hasApiKey: boolean;
  canGenerate: boolean;
  isGenerating: boolean;
  generationStatus: GenerationStatusEvent | null;
  generationStartedAt: number | null;
  formattedElapsedTime: string;
  onGenerate: () => void;
  lastGenerationTelemetry?: GenerationTelemetry | null;
  streamText?: string;
};

// ─── Component ───────────────────────────────────────────────────────────────

export function SetupPanel({
  questionMode, onSetQuestionMode,
  selectedTopics, onToggleTopic,
  mathMethodsSubtopics, onToggleMathMethodsSubtopic,
  specialistMathSubtopics, onToggleSpecialistMathSubtopic,
  chemistrySubtopics, onToggleChemistrySubtopic,
  physicalEducationSubtopics, onTogglePhysicalEducationSubtopic,
  techMode, onSetTechMode,
  customFocusArea, onSetCustomFocusArea,
  difficulty, onSetDifficulty,
  questionCount, onSetQuestionCount,
  maxMarksPerQuestion, onSetMaxMarksPerQuestion,
  avoidSimilarQuestions, onSetAvoidSimilarQuestions,
  hasApiKey, canGenerate, isGenerating,
  generationStatus, generationStartedAt, formattedElapsedTime,
  onGenerate,
  lastGenerationTelemetry,
  streamText = "",
}: SetupPanelProps) {
  const navigate = useNavigate();
  const { apiKey, model } = useAppSettings();
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


  let stepNum = 0;
  const step = () => ++stepNum;

  // Fetch model pricing (if available) to compute estimates
  useEffect(() => {
    let cancelled = false;
    async function fetchStats() {
      if (!apiKey || !model || model === "custom") return;
      try {
        const stats = await invoke<any>("get_model_stats", { apiKey, modelId: model });
        if (cancelled) return;
        setPromptPricePerToken(stats.promptPricePerToken ?? null);
        setCompletionPricePerToken(stats.completionPricePerToken ?? null);
      } catch (err) {
        // ignore failures — pricing is optional
        setPromptPricePerToken(null);
        setCompletionPricePerToken(null);
      }
    }

    void fetchStats();
    return () => { cancelled = true; };
  }, [apiKey, model]);

  // Heuristic token estimate per question based on mode/difficulty/marks
  const estimated = useMemo(() => {
    // Base tokens by question mode
    let totalTokens = 0;
    let totalTokensPerQuestion = 0;
    let promptTokensPerQuestion = 0;
    let completionTokensPerQuestion = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    if (questionMode === "multiple-choice") {
      // MC: 2250 for first, +350 for each additional
      totalTokens = questionCount > 0 ? 2250 + (questionCount - 1) * 350 : 0;
      totalTokensPerQuestion = questionCount > 0 ? Math.round(totalTokens / questionCount) : 0;
      // Use same prompt/completion split as before
      const ratios = { prompt: 0.6, completion: 0.4 };
      promptTokensPerQuestion = Math.round(totalTokensPerQuestion * ratios.prompt);
      completionTokensPerQuestion = Math.round(totalTokensPerQuestion * ratios.completion);
      totalPromptTokens = promptTokensPerQuestion * questionCount;
      totalCompletionTokens = completionTokensPerQuestion * questionCount;
    } else {
      // Written: 2000 for first, +350 for each additional (easy)
      totalTokens = questionCount > 0 ? 2000 + (questionCount - 1) * 350 : 0;
      totalTokensPerQuestion = questionCount > 0 ? Math.round(totalTokens / questionCount) : 0;
      const ratios = { prompt: 0.35, completion: 0.65 };
      promptTokensPerQuestion = Math.round(totalTokensPerQuestion * ratios.prompt);
      completionTokensPerQuestion = Math.round(totalTokensPerQuestion * ratios.completion);
      totalPromptTokens = promptTokensPerQuestion * questionCount;
      totalCompletionTokens = completionTokensPerQuestion * questionCount;
    }

    const promptCost = promptPricePerToken != null ? promptPricePerToken * totalPromptTokens : null;
    const completionCost = completionPricePerToken != null ? completionPricePerToken * totalCompletionTokens : null;
    const totalCost = (promptCost ?? 0) + (completionCost ?? 0);

    return {
      totalTokensPerQuestion,
      promptTokensPerQuestion,
      completionTokensPerQuestion,
      totalTokens,
      totalPromptTokens,
      totalCompletionTokens,
      promptCost,
      completionCost,
      totalCost,
    };
  }, [questionMode, difficulty, maxMarksPerQuestion, customFocusArea, avoidSimilarQuestions, questionCount, promptPricePerToken, completionPricePerToken])

  return (
    <Card className="border shadow-lg overflow-hidden">
      {/* ── Header ── */}
      <div className="px-4 pb-2 border-b">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2 leading-tight">
              <Sparkles className="w-4 h-4 text-primary shrink-0" />
              Practice Generator
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Configure your VCE revision session
            </p>
          </div>

          {/* Mode toggle */}
          <div className="flex rounded-lg border bg-background p-0.5 gap-0.5 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => onSetQuestionMode("written")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer
                ${questionMode === "written"
                  ? "bg-sky-500 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"}`}
            >
              <BookOpen className="w-3.5 h-3.5" /> Written
            </button>
            <button
              type="button"
              onClick={() => onSetQuestionMode("multiple-choice")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer
                ${questionMode === "multiple-choice"
                  ? "bg-violet-500 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"}`}
            >
              <Target className="w-3.5 h-3.5" /> Multiple Choice
            </button>
          </div>
        </div>
      </div>


      <CardContent className="px-4 space-y-1">

        {/* ── Step 1: Subjects ── */}
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
            {hasSubtopicSection && (
              <>
                <SectionDivider />
                <div className="rounded-lg border bg-muted/20 px-4 py-3 space-y-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Focus Areas
                    <span className="ml-2 font-normal normal-case">— leave blank to cover all</span>
                  </p>

                  {selectedTopics.includes("Mathematical Methods") && (
                    <SubtopicGroup
                      label="Mathematical Methods"
                      items={MATH_METHODS_SUBTOPICS}
                      selected={mathMethodsSubtopics}
                      onToggle={onToggleMathMethodsSubtopic as (s: string) => void}
                    />
                  )}
                  {selectedTopics.includes("Specialist Mathematics") && (
                    <SubtopicGroup
                      label="Specialist Mathematics"
                      items={SPECIALIST_MATH_SUBTOPICS}
                      selected={specialistMathSubtopics}
                      onToggle={onToggleSpecialistMathSubtopic as (s: string) => void}
                    />
                  )}
                  {selectedTopics.includes("Chemistry") && (
                    <SubtopicGroup
                      label="Chemistry"
                      items={CHEMISTRY_SUBTOPICS}
                      selected={chemistrySubtopics}
                      onToggle={onToggleChemistrySubtopic as (s: string) => void}
                    />
                  )}
                  {selectedTopics.includes("Physical Education") && (
                    <SubtopicGroup
                      label="Physical Education"
                      hint="Based on the 2025 Study Design"
                      items={PHYSICAL_EDUCATION_SUBTOPICS}
                      selected={physicalEducationSubtopics}
                      onToggle={onTogglePhysicalEducationSubtopic as (s: string) => void}
                    />
                  )}
                </div>
              </>
            )}
          </CollapsibleStep>
        </div>


        <SectionDivider />

        {/* ── Step 2: Difficulty ── */}
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
                    ${isSelected
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-primary/40 hover:bg-muted/30"
                      }`}
                  >
                    <span className={`text-xs font-semibold leading-tight ${isSelected ? meta.color : "text-foreground"}`}>
                      {meta.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground leading-tight hidden sm:block">{meta.desc}</span>
                  </button>
                );
              })}
            </div>
          </CollapsibleStep>
        </div>

        <SectionDivider />

        {/* ── Step 3: Questions + Marks ── */}
        <div>
          <CollapsibleStep
            number={step()}
            title="Session Size"
            chips={
              <>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-foreground">
                  {questionCount} questions
                </span>
                {questionMode === "written" && hasAnyMathTopic && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                    ≤{maxMarksPerQuestion}mk
                  </span>
                )}
              </>
            }
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5" /> Questions
                  </Label>
                  <Badge variant="secondary" className="text-xs px-2 py-0 tabular-nums">{questionCount}</Badge>
                </div>
                <Slider
                  min={1} max={20} step={1}
                  value={[questionCount]}
                  onValueChange={(val) => onSetQuestionCount(val[0])}
                  className="py-1"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>1</span><span>20</span>
                </div>
              </div>

              {questionMode === "written" && hasAnyMathTopic && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <BarChart3 className="w-3.5 h-3.5" /> Max marks per question
                    </Label>
                    <Badge variant="secondary" className="text-xs px-2 py-0 tabular-nums">{maxMarksPerQuestion}</Badge>
                  </div>
                  <Slider
                    min={1} max={30} step={1}
                    value={[maxMarksPerQuestion]}
                    onValueChange={(val) => onSetMaxMarksPerQuestion(val[0])}
                    className="py-1"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>1</span><span>30</span>
                  </div>
                </div>
              )}
            </div>
          </CollapsibleStep>
        </div>

        <SectionDivider />

        {/* ── Step 4: Calculator mode (math only) + options ── */}
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

              {/* Calculator mode */}
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
                          ${isActive
                              ? "bg-primary text-primary-foreground border-primary shadow-sm"
                              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                            }`}
                        >
                          {icon} {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Variation guardrail toggle */}
              <button
                type="button"
                onClick={() => onSetAvoidSimilarQuestions(!avoidSimilarQuestions)}
                className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg border text-left transition-all duration-150 cursor-pointer
                ${avoidSimilarQuestions
                    ? "bg-primary/5 border-primary/40"
                    : "border-border hover:border-primary/30 hover:bg-muted/20"
                  }`}
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

              {/* Custom focus area */}
              <div className="space-y-1.5">
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

        {/* Estimated tokens & cost (live) */}
        {/* <div className="w-full rounded-lg border bg-muted/20 px-3 py-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[11px] text-muted-foreground">Est. tokens / question</p>
              <p className="font-semibold tabular-nums">{estimated.totalTokensPerQuestion.toLocaleString()} tok</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Est. total tokens</p>
              <p className="font-semibold tabular-nums">{estimated.totalTokens.toLocaleString()} tok</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-muted-foreground">Est. cost</p>
            {promptPricePerToken == null && completionPricePerToken == null ? (
              <p className="font-semibold">—</p>
            ) : (
              <div>
                <p className="font-semibold">{formatCostUsd(estimated.totalCost)}</p>
                <p className="text-[10px] text-muted-foreground">{promptPricePerToken != null ? `input ${formatCostUsd(estimated.promptCost)}` : ""}{promptPricePerToken != null && completionPricePerToken != null ? " • " : ""}{completionPricePerToken != null ? `output ${formatCostUsd(estimated.completionCost)}` : ""}</p>
              </div>
            )}
          </div>
        </div> */}
      </CardContent>

      {/* ── Footer / Generate ── */}
      <CardFooter className="px-4 py-3 border-t bg-muted/20 flex flex-col gap-2.5">

        {/* ── Full config summary strip (always visible when idle) ── */}
        {!isGenerating && generationStatus?.stage !== "completed" && (
          <div className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Session Summary</p>

            {/* Subjects */}
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

            {/* Difficulty · Questions · Marks · Mode */}
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
              {questionMode === "written" && hasAnyMathTopic && (
                <>
                  <span className="text-border">·</span>
                  <span className="flex items-center gap-1">
                    <span className="text-muted-foreground/60">Max marks</span>
                    <span className="font-semibold text-foreground tabular-nums">{maxMarksPerQuestion}</span>
                  </span>
                </>
              )}
              <span className="text-border">·</span>
              <span className={`font-semibold ${questionMode === "written" ? "text-sky-600 dark:text-sky-400" : "text-violet-600 dark:text-violet-400"}`}>
                {questionMode === "written" ? "Written" : "Multiple Choice"}
              </span>
            </div>

            {/* Options row */}
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

            {/* Cost / token estimate */}
            <div className="flex items-center justify-between text-[11px] border-t border-border/40 pt-1.5">
              <span className="text-muted-foreground/70 tabular-nums flex items-center gap-1">
                <Coins className="w-3 h-3" /> ~{estimated.totalTokens.toLocaleString()} tokens
              </span>
              {estimated.promptCost != null || estimated.completionCost != null ? (
                <span className="font-semibold text-foreground tabular-nums flex items-center gap-1">
                  <DollarSign className="w-3 h-3 text-muted-foreground" />
                  {formatCostUsd(estimated.totalCost)}
                </span>
              ) : (
                <span className="text-muted-foreground/50">cost unavailable</span>
              )}
            </div>
          </div>
        )}

        <Button
          size="lg"
          className="w-full h-11 text-sm font-bold gap-2 transition-all duration-200 disabled:opacity-50"
          onClick={onGenerate}
          disabled={!canGenerate}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Crafting questions…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate Revision Set
            </>
          )}
        </Button>

        {/* Generation timeline — shown while generating or just after completion */}
        {(isGenerating || generationStatus?.stage === "completed" || generationStatus?.stage === "failed") && generationStartedAt !== null && (
          <GenerationTimeline
            generationStatus={generationStatus}
            formattedElapsedTime={formattedElapsedTime}
            streamText={streamText}
            isGenerating={isGenerating}
          />
        )}

        {/* Last generation stats — shown when idle and telemetry is available,
            but only if the timeline isn't already showing a completed run */}
        {!isGenerating && generationStatus?.stage !== "completed" && lastGenerationTelemetry && (
          <LastGenerationStats telemetry={lastGenerationTelemetry} />
        )}
      </CardFooter>
    </Card>
  );
}