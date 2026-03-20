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
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

function StepHeader({
  number,
  title,
  subtitle,
}: {
  number: number;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center py-1 gap-3 mb-3">
      <div className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold mt-0.5">
        {number}
      </div>
      <div>
        <p className="text-sm font-semibold leading-tight">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
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
}: SetupPanelProps) {
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

      <CardContent className="px-4 pb-4 space-y-3">

        {/* ── Step 1: Subjects ── */}
        <div>
          <StepHeader
            number={step()}
            title="Select Subjects"
            subtitle={selectedTopics.length > 0 ? `${selectedTopics.length} selected` : "Choose at least one to continue"}
          />
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
        </div>

        {/* ── Subtopics (conditional) ── */}
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

        <SectionDivider />

        {/* ── Step 2: Difficulty ── */}
        <div>
          <StepHeader number={step()} title="Difficulty" />
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
        </div>

        <SectionDivider />

        {/* ── Step 3: Questions + Marks ── */}
        <div>
          <StepHeader number={step()} title="Session Size" />
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
        </div>

        <SectionDivider />

        {/* ── Step 4: Calculator mode (math only) + options ── */}
        <div>
          <StepHeader number={step()} title="Options" />
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
        </div>

        {/* ── API key warning ── */}
        {!hasApiKey && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-400/40 bg-amber-500/5 px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400 leading-snug">
              <strong>API key missing.</strong> Go to Settings to configure your OpenRouter key before generating.
            </p>
          </div>
        )}
      </CardContent>

      {/* ── Footer / Generate ── */}
      <CardFooter className="px-4 py-3 border-t bg-muted/20 flex flex-col gap-2.5">
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

        {/* Generation status strip */}
        {isGenerating && generationStartedAt !== null && (
          <div className="w-full rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-foreground font-medium">
              <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />
              {generationStatus?.message ?? "Generating questions…"}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground flex-wrap">
              {generationStatus?.stage && (
                <span className="px-1.5 py-0.5 rounded-full bg-background border text-[10px]">
                  {generationStatus.stage}
                </span>
              )}
              {generationStatus?.attempt && (
                <span className="px-1.5 py-0.5 rounded-full bg-background border text-[10px]">
                  Attempt {generationStatus.attempt}
                </span>
              )}
              <span className="flex items-center gap-1 ml-auto font-medium tabular-nums">
                <Clock3 className="w-3 h-3" /> {formattedElapsedTime}
              </span>
            </div>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}