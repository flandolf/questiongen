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
  Coins,
  DollarSign,
  FileText,
  Save,
  Trash2,
  Info,
  ChevronDown,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSettings } from "@/AppContext";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { formatCostUsd, estimateTokensAndCost } from "@/lib/app-utils";
import { useCollapsibleHeight } from "@/hooks/useCollapsibleHeight";
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
  Preset,
  PersistedGeneratorPreferences,
  BatchTopicProgress,
} from "@/types";
import { PageHeader, FilterGroup, FilterButton } from "@/components/layout/primitives";
import { useAppStore } from "@/store";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { GenerationTimeline, BatchTimeline, LastGenerationStats } from "./GenerationTimeline";

export type { BatchTopicProgress } from "@/types";

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
  const { open, height, innerRef, toggle, handleTransitionEnd } = useCollapsibleHeight(defaultOpen);

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

// ─── Advanced Options Accordion ───────────────────────────────────────────────

type AdvancedOptionsAccordionProps = {
  questionMode: QuestionMode;
  questionCount: number;
  onSetQuestionCount: (count: number) => void;
  averageMarksPerQuestion: number;
  onSetAverageMarksPerQuestion: (marks: number) => void;
  selectedTopics: Topic[];
  hasSubtopicSection: boolean;
  mathMethodsSubtopics: MathMethodsSubtopic[];
  onToggleMathMethodsSubtopic: (sub: MathMethodsSubtopic) => void;
  specialistMathSubtopics: SpecialistMathSubtopic[];
  onToggleSpecialistMathSubtopic: (sub: SpecialistMathSubtopic) => void;
  chemistrySubtopics: ChemistrySubtopic[];
  onToggleChemistrySubtopic: (sub: ChemistrySubtopic) => void;
  physicalEducationSubtopics: PhysicalEducationSubtopic[];
  onTogglePhysicalEducationSubtopic: (sub: PhysicalEducationSubtopic) => void;
  hasAnyMathTopic: boolean;
  techMode: TechMode;
  onSetTechMode: (mode: TechMode) => void;
  avoidSimilarQuestions: boolean;
  onSetAvoidSimilarQuestions: (enabled: boolean) => void;
  shuffleQuestions: boolean;
  onSetShuffleQuestions: (enabled: boolean) => void;
  customFocusArea: string;
  onSetCustomFocusArea: (value: string) => void;
  aiDifficultyScalingEnabled: boolean;
  onSetAiDifficultyScalingEnabled: (enabled: boolean) => void;
  difficultyThresholds: { increase: number; decrease: number };
  onSetDifficultyThresholds: (thresholds: { increase: number; decrease: number }) => void;
};

function AdvancedOptionsAccordion({
  questionMode, questionCount, onSetQuestionCount,
  averageMarksPerQuestion, onSetAverageMarksPerQuestion,
  selectedTopics, hasSubtopicSection,
  mathMethodsSubtopics, onToggleMathMethodsSubtopic,
  specialistMathSubtopics, onToggleSpecialistMathSubtopic,
  chemistrySubtopics, onToggleChemistrySubtopic,
  physicalEducationSubtopics, onTogglePhysicalEducationSubtopic,
  hasAnyMathTopic, techMode, onSetTechMode,
  avoidSimilarQuestions, onSetAvoidSimilarQuestions,
  shuffleQuestions, onSetShuffleQuestions,
  customFocusArea, onSetCustomFocusArea,
  aiDifficultyScalingEnabled, onSetAiDifficultyScalingEnabled,
  difficultyThresholds, onSetDifficultyThresholds
}: AdvancedOptionsAccordionProps) {
  const { open, height, innerRef, toggle, handleTransitionEnd } = useCollapsibleHeight(false);

  return (
    <div className="rounded-xl border border-border/60 overflow-hidden mb-4">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer select-none group"
      >
        <div className="shrink-0 w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
          <BarChart3 className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-semibold">Advanced Options</p>
          <p className="text-[11px] text-muted-foreground">Customize question count, marks, focus areas, and more</p>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-250 ${open ? "" : "-rotate-90"}`} />
      </button>
      <div
        style={{ height: typeof height === "number" ? `${height}px` : height, overflow: "hidden", transition: "height 250ms cubic-bezier(0.4, 0, 0.2, 1)" }}
        onTransitionEnd={handleTransitionEnd}
      >
        <div ref={innerRef} className="px-4 pb-4 space-y-5">
          {/* Session Size */}
          <div className="space-y-3 pt-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Session Size</p>
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

          <SectionDivider />

          {/* Focus Areas */}
          {hasSubtopicSection && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Focus Areas
                <span className="ml-2 font-normal lowercase">leave blank to cover all</span>
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
          )}

          {/* Calculator Mode */}
          {hasAnyMathTopic && (
            <>
              {hasSubtopicSection && <SectionDivider />}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Calculator Mode</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { value: "tech-free" as TechMode, label: "Tech-Free", icon: <Pen className="w-3.5 h-3.5" /> },
                    { value: "mix" as TechMode, label: "Mixed", icon: <Blend className="w-3.5 h-3.5" /> },
                    { value: "tech-active" as TechMode, label: "Tech-Active", icon: <Calculator className="w-3.5 h-3.5" /> },
                  ]).map(({ value, label, icon }) => {
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
            </>
          )}

          {/* Options toggles */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Options</p>
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

          <SectionDivider />

          {/* AI Difficulty Scaling */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Difficulty Scaling</p>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${aiDifficultyScalingEnabled ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                {aiDifficultyScalingEnabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <div className="space-y-2">
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
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Preset section ──────────────────────────────────────────────────────────

function buildPreferencesSnapshot(props: {
  selectedTopics: Topic[];
  difficulty: Difficulty;
  techMode: TechMode;
  avoidSimilarQuestions: boolean;
  mathMethodsSubtopics: MathMethodsSubtopic[];
  specialistMathSubtopics: SpecialistMathSubtopic[];
  chemistrySubtopics: ChemistrySubtopic[];
  physicalEducationSubtopics: PhysicalEducationSubtopic[];
  questionCount: number;
  averageMarksPerQuestion: number;
  questionMode: QuestionMode;
  generationMode: GenerationMode;
  examTimeLimitMinutes: number;
  subtopicInstructions: Record<string, string>;
  aiDifficultyScalingEnabled: boolean;
  difficultyThresholds: { increase: number; decrease: number };
}): PersistedGeneratorPreferences {
  return {
    selectedTopics: props.selectedTopics,
    difficulty: props.difficulty,
    techMode: props.techMode,
    avoidSimilarQuestions: props.avoidSimilarQuestions,
    mathMethodsSubtopics: props.mathMethodsSubtopics,
    specialistMathSubtopics: props.specialistMathSubtopics,
    chemistrySubtopics: props.chemistrySubtopics,
    physicalEducationSubtopics: props.physicalEducationSubtopics,
    questionCount: props.questionCount,
    averageMarksPerQuestion: props.averageMarksPerQuestion,
    questionMode: props.questionMode,
    generationMode: props.generationMode,
    examTimeLimitMinutes: props.examTimeLimitMinutes,
    subtopicInstructions: props.subtopicInstructions,
    aiDifficultyScalingEnabled: props.aiDifficultyScalingEnabled,
    difficultyThresholds: props.difficultyThresholds,
  };
}


function PresetSection({
  selectedTopics, difficulty, techMode, avoidSimilarQuestions,
  mathMethodsSubtopics, specialistMathSubtopics, chemistrySubtopics,
  physicalEducationSubtopics, questionCount, averageMarksPerQuestion,
  questionMode, generationMode, examTimeLimitMinutes,
  aiDifficultyScalingEnabled, difficultyThresholds,
}: {
  selectedTopics: Topic[];
  difficulty: Difficulty;
  techMode: TechMode;
  avoidSimilarQuestions: boolean;
  mathMethodsSubtopics: MathMethodsSubtopic[];
  specialistMathSubtopics: SpecialistMathSubtopic[];
  chemistrySubtopics: ChemistrySubtopic[];
  physicalEducationSubtopics: PhysicalEducationSubtopic[];
  questionCount: number;
  averageMarksPerQuestion: number;
  questionMode: QuestionMode;
  generationMode: GenerationMode;
  examTimeLimitMinutes: number;
  aiDifficultyScalingEnabled: boolean;
  difficultyThresholds: { increase: number; decrease: number };
}) {
  const presets = useAppStore((s) => s.presets);
  const addPreset = useAppStore((s) => s.addPreset);
  const updatePreset = useAppStore((s) => s.updatePreset);
  const deletePreset = useAppStore((s) => s.deletePreset);
  const setDifficulty = useAppStore((s) => s.setDifficulty);
  const setTechMode = useAppStore((s) => s.setTechMode);
  const setAvoidSimilarQuestions = useAppStore((s) => s.setAvoidSimilarQuestions);
  const setSelectedTopics = useAppStore((s) => s.setSelectedTopics);
  const setMathMethodsSubtopics = useAppStore((s) => s.setMathMethodsSubtopics);
  const setSpecialistMathSubtopics = useAppStore((s) => s.setSpecialistMathSubtopics);
  const setChemistrySubtopics = useAppStore((s) => s.setChemistrySubtopics);
  const setPhysicalEducationSubtopics = useAppStore((s) => s.setPhysicalEducationSubtopics);
  const setQuestionCount = useAppStore((s) => s.setQuestionCount);
  const setAverageMarksPerQuestion = useAppStore((s) => s.setAverageMarksPerQuestion);
  const setQuestionMode = useAppStore((s) => s.setQuestionMode);
  const setGenerationMode = useAppStore((s) => s.setGenerationMode);
  const setExamTimeLimitMinutes = useAppStore((s) => s.setExamTimeLimitMinutes);
  const setAiDifficultyScalingEnabled = useAppStore((s) => s.setAiDifficultyScalingEnabled);
  const setDifficultyThresholds = useAppStore((s) => s.setDifficultyThresholds);
  const subtopicInstructions = useAppStore((s) => s.subtopicInstructions);

  const [presetName, setPresetName] = useState("");
  const [renamingPresetId, setRenamingPresetId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) return;

    const now = new Date().toISOString();
    const existing = presets.find((p) => p.name === name);

    const prefs = buildPreferencesSnapshot({
      selectedTopics, difficulty, techMode, avoidSimilarQuestions,
      mathMethodsSubtopics, specialistMathSubtopics, chemistrySubtopics,
      physicalEducationSubtopics, questionCount, averageMarksPerQuestion,
      questionMode, generationMode, examTimeLimitMinutes,
      subtopicInstructions, aiDifficultyScalingEnabled, difficultyThresholds,
    });

    if (existing) {
      updatePreset({ ...existing, preferences: prefs, updatedAt: now });
    } else {
      addPreset({
        id: `preset-${Date.now()}`,
        name,
        preferences: prefs,
        createdAt: now,
        updatedAt: now,
      });
    }
    setPresetName("");
  };

  const handleLoadPreset = (preset: Preset) => {
    const p = preset.preferences;
    setSelectedTopics([...p.selectedTopics]);
    setDifficulty(p.difficulty);
    setTechMode(p.techMode);
    setAvoidSimilarQuestions(p.avoidSimilarQuestions);
    setMathMethodsSubtopics([...p.mathMethodsSubtopics]);
    setSpecialistMathSubtopics([...p.specialistMathSubtopics]);
    setChemistrySubtopics([...p.chemistrySubtopics]);
    setPhysicalEducationSubtopics([...p.physicalEducationSubtopics]);
    setQuestionCount(p.questionCount);
    setAverageMarksPerQuestion(p.averageMarksPerQuestion);
    setQuestionMode(p.questionMode);
    setGenerationMode(p.generationMode ?? "practice");
    setExamTimeLimitMinutes(p.examTimeLimitMinutes ?? 30);
    setAiDifficultyScalingEnabled(p.aiDifficultyScalingEnabled ?? true);
    setDifficultyThresholds(p.difficultyThresholds ?? { increase: 85, decrease: 70 });
  };

  const handleDeletePreset = (id: string) => {
    deletePreset(id);
  };

  const handleUpdatePreset = (preset: Preset) => {
    const now = new Date().toISOString();
    const prefs = buildPreferencesSnapshot({
      selectedTopics, difficulty, techMode, avoidSimilarQuestions,
      mathMethodsSubtopics, specialistMathSubtopics, chemistrySubtopics,
      physicalEducationSubtopics, questionCount, averageMarksPerQuestion,
      questionMode, generationMode, examTimeLimitMinutes,
      subtopicInstructions, aiDifficultyScalingEnabled, difficultyThresholds,
    });
    updatePreset({ ...preset, preferences: prefs, updatedAt: now });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          placeholder="Preset name…"
          className="text-xs h-8 flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && presetName.trim()) {
              e.preventDefault();
              handleSavePreset();
            }
          }}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-3 text-xs gap-1.5"
          onClick={handleSavePreset}
          disabled={!presetName.trim()}
        >
          <Save className="w-3 h-3" /> Save
        </Button>
      </div>

      {presets.length > 0 ? (
        <div className="space-y-3">
          {presets.map((preset) => (
            <div
              key={preset.id}
              className="flex items-center px-3 py-3 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/20 transition-all duration-150 group"
            >
              {renamingPresetId === preset.id ? (
                <div className="flex-1 min-w-0">
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={renamingValue}
                    onChange={(e) => setRenamingValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && renamingValue.trim()) {
                        updatePreset({ ...preset, name: renamingValue.trim(), updatedAt: new Date().toISOString() });
                        setRenamingPresetId(null);
                      } else if (e.key === "Escape") {
                        setRenamingPresetId(null);
                      }
                    }}
                    onBlur={() => {
                      if (renamingValue.trim() && renamingValue.trim() !== preset.name) {
                        updatePreset({ ...preset, name: renamingValue.trim(), updatedAt: new Date().toISOString() });
                      }
                      setRenamingPresetId(null);
                    }}
                    className="w-full text-xs font-semibold bg-transparent border-b border-primary outline-none px-0 py-0.5"
                    maxLength={60}
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Enter to save · Esc to cancel</p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleLoadPreset(preset)}
                  className="flex-1 min-w-0 text-left cursor-pointer"
                >
                  <p className="text-xs font-semibold truncate">{preset.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
                    <span>{preset.preferences.selectedTopics.map((t) => t.split(" ")[0]).join(", ")}</span>
                    <span>·</span>
                    <span>{preset.preferences.difficulty}</span>
                    <span>·</span>
                    <span>{preset.preferences.questionCount}Q</span>
                  </div>
                </button>
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-all shrink-0 cursor-pointer">
                    <Info className="w-3 h-3" />
                  </TooltipTrigger>
                  <TooltipContent className="flex flex-col" side="right">
                    <p className="text-xs font-light mb-1">{preset.name}</p>
                    <p className="text-[11px] font-light whitespace-pre-wrap">
                      {`Topics: ${preset.preferences.selectedTopics.join(", ")}
Difficulty: ${preset.preferences.difficulty}
Question count: ${preset.preferences.questionCount}
Tech mode: ${preset.preferences.techMode}
Avoid similar questions: ${preset.preferences.avoidSimilarQuestions ? "Yes" : "No"}
Math Methods subtopics: ${preset.preferences.mathMethodsSubtopics.join(", ") || "None"}
Specialist Math subtopics: ${preset.preferences.specialistMathSubtopics.join(", ") || "None"}
Chemistry subtopics: ${preset.preferences.chemistrySubtopics.join(", ") || "None"}
Physical Education subtopics: ${preset.preferences.physicalEducationSubtopics.join(", ") || "None"}
Average marks per question: ${preset.preferences.averageMarksPerQuestion}
Question mode: ${preset.preferences.questionMode}
Generation mode: ${preset.preferences.generationMode}
Exam time limit: ${preset.preferences.examTimeLimitMinutes} minutes
AI difficulty scaling: ${preset.preferences.aiDifficultyScalingEnabled ? "Enabled" : "Disabled"}
Difficulty thresholds: Increase above ${preset.preferences.difficultyThresholds?.increase}%, decrease below ${preset.preferences.difficultyThresholds?.decrease}%`}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <button
                type="button"
                onClick={() => {
                  setRenamingPresetId(preset.id);
                  setRenamingValue(preset.name);
                  setTimeout(() => renameInputRef.current?.focus(), 0);
                }}
                className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-all shrink-0 cursor-pointer"
                title="Rename preset"
              >
                <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all shrink-0 cursor-pointer" />
              </button>
              <button
                type="button"
                onClick={() => handleUpdatePreset(preset)}
                className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-all shrink-0 cursor-pointer"
                title="Update preset with current settings"
              >
                <Save className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => handleDeletePreset(preset.id)}
                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0 cursor-pointer"
                title="Delete preset"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground text-center py-2">
          No presets saved yet. Configure your settings and save one above.
        </p>
      )}
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
  batchProgress?: BatchTopicProgress[];
  includeExamContext?: boolean;
};

// ─── Component ───────────────────────────────────────────────────────────────

function SetupPanelImpl({
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

  const showBatchTimeline = batchProgress.length > 1;
  const examPresets = [
    { label: "Quick Sprint", count: 5, time: 15 },
    { label: "Standard Practice", count: 10, time: 30 },
    { label: "Deep Dive", count: 15, time: 60 },
    { label: "Marathon", count: 20, time: 90 },
  ];

  const selectedSubtopics = useMemo(() => Array.from(new Set([
    ...(selectedTopics.includes("Mathematical Methods") ? mathMethodsSubtopics : []),
    ...(selectedTopics.includes("Specialist Mathematics") ? specialistMathSubtopics : []),
    ...(selectedTopics.includes("Chemistry") ? chemistrySubtopics : []),
    ...(selectedTopics.includes("Physical Education") ? physicalEducationSubtopics : []),
  ])), [selectedTopics, mathMethodsSubtopics, specialistMathSubtopics, chemistrySubtopics, physicalEducationSubtopics]);

  useEffect(() => {
    let cancelled = false;
    async function fetchStats() {
      if (!apiKey || !model || model === "custom") return;
      try {
        const stats = await invoke<{ promptPricePerToken?: number | null; completionPricePerToken?: number | null }>("get_model_stats", { apiKey, modelId: model });
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
  }, [generationHistory, selectedTopics, difficulty, questionCount, questionMode, techMode, averageMarksPerQuestion, customFocusArea, promptPricePerToken, completionPricePerToken, selectedSubtopics]);

  const handleGenerate = () => {
    onGenerate();
  };

  return (
    <div className="pb-12">
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

        {/* ── Subjects (Tier 1 — Always Visible) ── */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Subjects
            {selectedTopics.length > 0 && (
              <span className="ml-1.5 font-normal normal-case text-primary">{selectedTopics.length} selected</span>
            )}
          </p>
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
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
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
        </div>

        {/* ── Mode (Tier 1 — Always Visible) ── */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Mode</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onSetGenerationMode("practice")}
              className={`flex items-center justify-center gap-2 px-3 py-3 rounded-lg border text-sm font-medium text-center transition-all duration-150 cursor-pointer ${generationMode === "practice" ? "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/40 shadow-sm" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-muted/30"}`}
            >
              <BookOpen className="w-4 h-4" /> Practice
              <span className="text-[10px] text-muted-foreground ml-1 hidden sm:inline">Untimed</span>
            </button>
            <button
              type="button"
              onClick={() => onSetGenerationMode("exam")}
              className={`flex items-center justify-center gap-2 px-3 py-3 rounded-lg border text-sm font-medium text-center transition-all duration-150 cursor-pointer ${generationMode === "exam" ? "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/40 shadow-sm" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-muted/30"}`}
            >
              <Clock3 className="w-4 h-4" /> Exam
              <span className="text-[10px] text-muted-foreground ml-1 hidden sm:inline">Timed</span>
            </button>
          </div>
          {generationMode === "exam" && (
            <div className="mt-3 space-y-3 rounded-lg border bg-muted/20 px-3 py-3">
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {examPresets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => { onSetQuestionCount(preset.count); onSetExamTimeLimitMinutes(preset.time); }}
                    className={`group p-2 text-left rounded-lg border transition-all duration-150 cursor-pointer ${questionCount === preset.count && examTimeLimitMinutes === preset.time ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40 hover:bg-muted/30"}`}
                  >
                    <p className="text-[11px] font-semibold leading-tight">{preset.label}</p>
                    <span className="text-[10px] text-muted-foreground">{preset.count}Q / {preset.time}m</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Difficulty (Tier 1 — Always Visible) ── */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Difficulty
            <span className={`ml-1.5 font-normal ${DIFFICULTY_META[difficulty].color}`}>{DIFFICULTY_META[difficulty].label}</span>
          </p>
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
        </div>

        <div className="mb-5">

          {/* Presets */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Presets</p>
            <PresetSection
              selectedTopics={selectedTopics}
              difficulty={difficulty}
              techMode={techMode}
              avoidSimilarQuestions={avoidSimilarQuestions}
              mathMethodsSubtopics={mathMethodsSubtopics}
              specialistMathSubtopics={specialistMathSubtopics}
              chemistrySubtopics={chemistrySubtopics}
              physicalEducationSubtopics={physicalEducationSubtopics}
              questionCount={questionCount}
              averageMarksPerQuestion={averageMarksPerQuestion}
              questionMode={questionMode}
              generationMode={generationMode}
              examTimeLimitMinutes={examTimeLimitMinutes}
              aiDifficultyScalingEnabled={aiDifficultyScalingEnabled}
              difficultyThresholds={difficultyThresholds}
            />
          </div>
        </div>

        {/* ── Advanced Options (Tier 2 — Collapsed Accordion) ── */}
        <AdvancedOptionsAccordion
          questionMode={questionMode}
          questionCount={questionCount}
          onSetQuestionCount={onSetQuestionCount}
          averageMarksPerQuestion={averageMarksPerQuestion}
          onSetAverageMarksPerQuestion={onSetAverageMarksPerQuestion}
          selectedTopics={selectedTopics}
          hasSubtopicSection={hasSubtopicSection}
          mathMethodsSubtopics={mathMethodsSubtopics}
          onToggleMathMethodsSubtopic={onToggleMathMethodsSubtopic}
          specialistMathSubtopics={specialistMathSubtopics}
          onToggleSpecialistMathSubtopic={onToggleSpecialistMathSubtopic}
          chemistrySubtopics={chemistrySubtopics}
          onToggleChemistrySubtopic={onToggleChemistrySubtopic}
          physicalEducationSubtopics={physicalEducationSubtopics}
          onTogglePhysicalEducationSubtopic={onTogglePhysicalEducationSubtopic}
          hasAnyMathTopic={hasAnyMathTopic}
          techMode={techMode}
          onSetTechMode={onSetTechMode}
          avoidSimilarQuestions={avoidSimilarQuestions}
          onSetAvoidSimilarQuestions={onSetAvoidSimilarQuestions}
          shuffleQuestions={shuffleQuestions}
          onSetShuffleQuestions={onSetShuffleQuestions}
          customFocusArea={customFocusArea}
          onSetCustomFocusArea={onSetCustomFocusArea}
          aiDifficultyScalingEnabled={aiDifficultyScalingEnabled}
          onSetAiDifficultyScalingEnabled={onSetAiDifficultyScalingEnabled}
          difficultyThresholds={difficultyThresholds}
          onSetDifficultyThresholds={onSetDifficultyThresholds}
        />

        {/* ── API key warning ── */}
        {!hasApiKey && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-400/40 bg-amber-500/5 px-3 py-2.5 mt-4">
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

        {!isGenerating && generationStatus?.stage !== "completed" && lastGenerationTelemetry && (
          <LastGenerationStats telemetry={lastGenerationTelemetry} />
        )}
      </div>
    </div>
  );
}

export const SetupPanel = memo(SetupPanelImpl);
