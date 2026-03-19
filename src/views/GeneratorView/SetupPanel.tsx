import { useMemo, useState, useEffect } from "react";
import { useAppPreferences, useAppSettings, useAppContext } from "@/AppContext";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardTitle,
} from "@/components/ui/card";
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
  CHEMISTRY_SUBTOPICS,
  ChemistrySubtopic,
  PHYSICAL_EDUCATION_SUBTOPICS,
  PhysicalEducationSubtopic,
  Difficulty,
  SpecialistMathSubtopic,
  SPECIALIST_MATH_SUBTOPICS,
  VCE_COMMAND_TERMS,
  VceCommandTerm,
} from "@/types";
import {
  Sparkles,
  BookOpen,
  Target,
  Album,
  Settings2,
  Pen,
  Calculator,
  BookCheck,
  Loader2,
  Clock3,
} from "lucide-react";
import { ElapsedTimerText } from "./SharedComponents";
import { getDifficultyBadgeClasses, isMathTopic, makeToggle } from "../generatorUtils";

interface SetupPanelProps {
  isPassageMode: boolean;
  sessionFinishedAt: number | null;
  onGenerateWritten: () => void;
  onGeneratePassage: () => void;
  onGenerateMc: () => void;
  canGenerate: boolean;
  canGeneratePassage: boolean;
  canGenerateMc: boolean;
}

export function SetupPanel({
  isPassageMode,
  onGenerateWritten,
  onGeneratePassage,
  onGenerateMc,
  canGenerate,
  canGeneratePassage,
  canGenerateMc,
}: SetupPanelProps) {
  const { apiKey, } = useAppSettings();
  const {
    selectedTopics,
    setSelectedTopics,
    difficulty,
    setDifficulty,
    avoidSimilarQuestions,
    setAvoidSimilarQuestions,
    techMode,
    setTechMode,
    mathMethodsSubtopics,
    setMathMethodsSubtopics,
    specialistMathSubtopics,
    setSpecialistMathSubtopics,
    chemistrySubtopics,
    setChemistrySubtopics,
    physicalEducationSubtopics,
    setPhysicalEducationSubtopics,
    questionCount,
    setQuestionCount,
    maxMarksPerQuestion,
    setMaxMarksPerQuestion,
    passageQuestionCount,
    setPassageQuestionCount,
    prioritizedCommandTerms,
    setPrioritizedCommandTerms,
    questionMode,
    setQuestionMode,
    customFocusArea,
    setCustomFocusArea,
  } = useAppPreferences();
  const {
    isGenerating,
    generationStatus,
    generationStartedAt,
  } = useAppContext();

  const [showAdvanced, setShowAdvanced] = useState(false);

  const hasAnyMathTopic = selectedTopics.some((topic) => isMathTopic(topic));
  const hasPeTopic = selectedTopics.includes("Physical Education");
  const commandTermsDisabled = !hasPeTopic;

  const toggleTopic = (topic: Topic) => {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((t: Topic) => t !== topic) : [...prev, topic],
    );
  };

  const toggleMathMethodsSubtopic = makeToggle<MathMethodsSubtopic>(setMathMethodsSubtopics);
  const toggleSpecialistMathSubtopic = makeToggle<SpecialistMathSubtopic>(setSpecialistMathSubtopics);
  const toggleChemistrySubtopic = makeToggle<ChemistrySubtopic>(setChemistrySubtopics);
  const togglePhysicalEducationSubtopic = makeToggle<PhysicalEducationSubtopic>(setPhysicalEducationSubtopics);
  const togglePrioritizedCommandTerm = makeToggle<VceCommandTerm>(setPrioritizedCommandTerms);

  const hasAdvancedSelections = useMemo(
    () =>
      mathMethodsSubtopics.length > 0 ||
      specialistMathSubtopics.length > 0 ||
      chemistrySubtopics.length > 0 ||
      physicalEducationSubtopics.length > 0 ||
      prioritizedCommandTerms.length > 0 ||
      customFocusArea.trim().length > 0,
    [
      chemistrySubtopics.length,
      customFocusArea,
      mathMethodsSubtopics.length,
      physicalEducationSubtopics.length,
      prioritizedCommandTerms.length,
      specialistMathSubtopics.length,
    ],
  );

  useEffect(() => {
    if (hasAdvancedSelections) setShowAdvanced(true);
  }, [hasAdvancedSelections]);

  const generateHandler =
    questionMode === "written"
      ? isPassageMode
        ? onGeneratePassage
        : onGenerateWritten
      : onGenerateMc;

  const generateDisabled =
    questionMode === "written"
      ? isPassageMode
        ? !canGeneratePassage
        : !canGenerate
      : !canGenerateMc;

  return (
    <>
      <Card className="border-0 shadow-xl bg-card/50 backdrop-blur-sm overflow-hidden">
        {/* Header */}
        <div className="px-5 pb-3 border-b">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-2xl font-extrabold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Practice Generator
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                Configure your custom VCE revision session
              </CardDescription>
            </div>
            <div className="bg-background/80 p-1 rounded-xl shadow-sm border inline-flex">
              <Button
                variant={questionMode === "written" ? "default" : "ghost"}
                size="sm"
                className={`rounded-lg transition-all ${questionMode === "written" ? "shadow-md" : ""}`}
                onClick={() => setQuestionMode("written")}
              >
                <BookOpen className="w-4 h-4 mr-2" /> Written Answer
              </Button>
              <Button
                variant={questionMode === "multiple-choice" ? "default" : "ghost"}
                size="sm"
                className={`rounded-lg transition-all ${questionMode === "multiple-choice" ? "shadow-md" : ""}`}
                onClick={() => setQuestionMode("multiple-choice")}
              >
                <Target className="w-4 h-4 mr-2" /> Multiple Choice
              </Button>
            </div>
          </div>
        </div>

        <CardContent className="space-y-2">
          {/* ── Quick Start ── */}
          <div className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <Label className="text-base font-semibold">Quick Start</Label>
                <p className="text-xs text-muted-foreground">
                  Pick your essentials. Advanced options are below.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAdvanced((prev) => !prev)}
              >
                {showAdvanced ? "Hide Advanced" : "Show Advanced"}
              </Button>
            </div>

            {/* Subject Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Select Subjects</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {TOPICS.map((topic) => {
                  const isSelected = selectedTopics.includes(topic);
                  return (
                    <Button
                      key={topic}
                      variant={isSelected ? "default" : "outline"}
                      className={`w-full transition-colors ${isSelected ? "shadow-md" : "hover:bg-primary/10"}`}
                      onClick={() => toggleTopic(topic)}
                    >
                      {topic}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Settings summary badges */}
            <div className="rounded-xl border border-border/50 bg-background/70 p-3">
              <div className="flex flex-wrap gap-2 text-xs font-medium">
                <Badge variant="outline" className={`font-semibold ${getDifficultyBadgeClasses(difficulty)}`}>
                  Difficulty: {difficulty}
                </Badge>
                <Badge variant="outline">
                  {isPassageMode
                    ? `${passageQuestionCount} passage questions`
                    : `${questionCount} questions`}
                </Badge>
                {hasAnyMathTopic && questionMode === "written" && (
                  <Badge variant="outline">Maximum marks: {maxMarksPerQuestion}</Badge>
                )}
              </div>
            </div>

            {/* Difficulty selector */}
            <div className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Album className="w-4 h-4 sm:hidden lg:flex" />
                <Label className="text-sm font-semibold">Difficulty</Label>
              </div>
              <div className="flex flex-nowrap items-center gap-2 overflow-x-auto [scrollbar-width:thin] py-1 px-1">
                {(["Essential Skills", "Easy", "Medium", "Hard", "Extreme"] as Difficulty[]).map(
                  (level) => {
                    const isSelected = difficulty === level;
                    return (
                      <Button
                        key={level}
                        variant={isSelected ? "default" : "outline"}
                        className={`h-9 shrink-0 whitespace-nowrap px-3 text-sm transition-all ${isSelected ? "shadow-md ring-2 ring-primary/20 ring-offset-1" : ""}`}
                        onClick={() => setDifficulty(level)}
                      >
                        {level}
                      </Button>
                    );
                  },
                )}
              </div>
            </div>

            {/* Question / passage count */}
            {isPassageMode ? (
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between items-center">
                  <Label className="text-sm font-semibold">Passage Question Count</Label>
                  <Badge variant="secondary" className="px-2 py-0.5 text-xs">
                    {passageQuestionCount}
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <Slider
                    min={3}
                    max={10}
                    step={1}
                    value={[passageQuestionCount]}
                    onValueChange={(val) => setPassageQuestionCount(val[0])}
                    className="py-1 flex-1"
                  />
                  <Input
                    type="number"
                    min={3}
                    max={10}
                    value={passageQuestionCount}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (!Number.isNaN(next)) {
                        setPassageQuestionCount(Math.min(10, Math.max(3, Math.round(next))));
                      }
                    }}
                    className="w-20"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5 pt-1">
                <Label className="text-sm font-semibold">Question Count</Label>
                <div className="flex items-center gap-3">
                  <Slider
                    min={1}
                    max={20}
                    step={1}
                    value={[questionCount]}
                    onValueChange={(val) => setQuestionCount(val[0])}
                    className="py-1 flex-1"
                  />
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={questionCount}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (!Number.isNaN(next)) {
                        setQuestionCount(Math.min(20, Math.max(1, Math.round(next))));
                      }
                    }}
                    className="w-20"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Advanced Setup ── */}
          {showAdvanced && (
            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <Label className="text-base font-semibold">Advanced Setup</Label>
                  <p className="text-xs text-muted-foreground">
                    Refine subtopics, modes, and guardrails.
                  </p>
                </div>
                {hasAdvancedSelections && <Badge variant="secondary">Configured</Badge>}
              </div>

              {/* Subtopic Drill-downs */}
              {(selectedTopics.includes("Mathematical Methods") ||
                selectedTopics.includes("Specialist Mathematics") ||
                selectedTopics.includes("Chemistry") ||
                selectedTopics.includes("Physical Education")) && (
                <div className="bg-muted/30 p-4 rounded-xl border space-y-2">
                  {selectedTopics.includes("Mathematical Methods") && (
                    <SubtopicSection
                      label="Mathematical Methods Focus Areas"
                      hint="Leave all unselected to test across the entire curriculum."
                      items={MATH_METHODS_SUBTOPICS}
                      selected={mathMethodsSubtopics}
                      onToggle={toggleMathMethodsSubtopic}
                    />
                  )}
                  {selectedTopics.includes("Specialist Mathematics") && (
                    <SubtopicSection
                      label="Specialist Mathematics Focus Areas"
                      hint="Leave all unselected to test across the entire curriculum."
                      items={SPECIALIST_MATH_SUBTOPICS}
                      selected={specialistMathSubtopics}
                      onToggle={toggleSpecialistMathSubtopic}
                    />
                  )}
                  {selectedTopics.includes("Chemistry") && (
                    <SubtopicSection
                      label="Chemistry Focus Areas"
                      hint="Select one or more Chemistry study points, or leave all unselected to span the full course."
                      items={CHEMISTRY_SUBTOPICS}
                      selected={chemistrySubtopics}
                      onToggle={toggleChemistrySubtopic}
                    />
                  )}
                  {selectedTopics.includes("Physical Education") && (
                    <SubtopicSection
                      label="Physical Education Unit 3/4 Focus Areas"
                      hint="Based on the 2025 Study Design."
                      items={PHYSICAL_EDUCATION_SUBTOPICS}
                      selected={physicalEducationSubtopics}
                      onToggle={togglePhysicalEducationSubtopic}
                    />
                  )}
                </div>
              )}

              {/* Configuration Parameters */}
              <div className="flex flex-col gap-y-3">
                {(selectedTopics.includes("Mathematical Methods") ||
                  selectedTopics.includes("Specialist Mathematics")) && (
                  <div className="space-y-1.5 md:col-span-2">
                    <Label className="text-sm font-semibold flex items-center gap-2">
                      <Settings2 className="w-4 h-4" /> Calculator Mode
                    </Label>
                    <div className="grid grid-cols-3 gap-2 w-full md:w-2/3 lg:w-1/2">
                      {(["tech-free", "mix", "tech-active"] as TechMode[]).map((mode) => {
                        const isActive = techMode === mode;
                        return (
                          <Button
                            key={mode}
                            variant={isActive ? "default" : "outline"}
                            className={`w-full h-9 text-sm transition-all ${isActive ? "shadow-md ring-2 ring-primary/20 ring-offset-1" : ""}`}
                            onClick={() => setTechMode(mode)}
                          >
                            {mode === "tech-free" && <Pen className="w-4 h-4 mr-1" />}
                            {mode === "tech-active" && <Calculator className="w-4 h-4 mr-1" />}
                            {mode === "tech-free"
                              ? "Tech-Free"
                              : mode === "tech-active"
                                ? "Tech-Active"
                                : "Mixed"}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 md:col-span-2">
                  <div className="flex items-center gap-2">
                    <BookCheck className="w-4 h-4" />
                    <Label className="text-sm font-semibold">Custom Focus Area (Optional)</Label>
                  </div>
                  <Input
                    value={customFocusArea}
                    onChange={(e) => setCustomFocusArea(e.target.value)}
                    maxLength={160}
                    placeholder="e.g. projectile motion with optimization constraints"
                  />
                  <p className="text-xs text-muted-foreground">
                    Add a custom topic or skill focus to guide generation. This is appended to the
                    selected subtopics sent to the model.
                  </p>
                </div>

                {questionMode === "written" && hasAnyMathTopic && (
                  <div className="space-y-1.5 pt-1">
                    <Label className="text-sm font-semibold">Max Marks per Question</Label>
                    <div className="flex items-center gap-3">
                      <Slider
                        min={1}
                        max={30}
                        step={1}
                        value={[maxMarksPerQuestion]}
                        onValueChange={(val) => setMaxMarksPerQuestion(val[0])}
                        className="py-1 flex-1"
                      />
                      <Input
                        type="number"
                        min={1}
                        max={30}
                        value={maxMarksPerQuestion}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          if (!Number.isNaN(next)) {
                            setMaxMarksPerQuestion(Math.min(30, Math.max(1, Math.round(next))));
                          }
                        }}
                        className="w-20"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Caps the mark value for each generated maths question.
                    </p>
                  </div>
                )}

                {questionMode === "written" && hasPeTopic && (
                  <div className="space-y-1.5 pt-1 md:col-span-2">
                    <div className="flex justify-between items-center">
                      <Label className="text-sm font-semibold">
                        VCE Command Terms to Prioritise
                      </Label>
                      <Badge variant="secondary" className="px-2 py-0.5 text-xs">
                        {prioritizedCommandTerms.length} Selected
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {VCE_COMMAND_TERMS.map((term) => {
                        const isSelected = prioritizedCommandTerms.includes(term);
                        return (
                          <Badge
                            key={term}
                            variant={isSelected ? "default" : "outline"}
                            className={`px-3 py-1.5 text-xs transition-colors ${commandTermsDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${isSelected ? "shadow-md" : "hover:bg-primary/10"}`}
                            onClick={() => {
                              if (!commandTermsDisabled) togglePrioritizedCommandTerm(term);
                            }}
                          >
                            {term}
                          </Badge>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      The model is instructed to focus on what each command term means.
                      {commandTermsDisabled
                        ? " Command-term prioritisation is currently disabled because only Mathematics topics are selected."
                        : hasAnyMathTopic
                          ? " Command-term prioritisation applies to non-Mathematics questions only."
                          : ""}
                    </p>
                  </div>
                )}

                <div className="space-y-1.5 md:col-span-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-sm font-semibold">Variation Guardrail</Label>
                    <button
                      type="button"
                      aria-pressed={avoidSimilarQuestions}
                      onClick={() => setAvoidSimilarQuestions(!avoidSimilarQuestions)}
                      className={`relative inline-flex h-7 w-12 items-center rounded-full border transition-colors ${avoidSimilarQuestions ? "bg-primary/80 border-primary" : "bg-muted/60 border-border"}`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform ${avoidSimilarQuestions ? "translate-x-6" : "translate-x-1"}`}
                      />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    When enabled, generation includes your recent same-topic prompts (if available)
                    and asks the model to avoid repeating them.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!apiKey && (
            <div className="bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 p-3 rounded-lg text-xs flex items-center gap-2">
              <Settings2 className="w-4 h-4 shrink-0" />
              <span>
                <strong>API Key Missing:</strong> Go to Settings to configure your OpenRouter API
                Key before generating questions.
              </span>
            </div>
          )}
        </CardContent>

        <CardFooter className="bg-muted/20 border-t flex flex-col gap-3 sm:pb-2">
          {isGenerating && generationStartedAt !== null && (
            <div className="w-full rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  <span>{generationStatus?.message ?? "Generating questions..."}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Badge variant="outline" className="bg-background/70 px-1.5 py-0">
                    {generationStatus?.stage ?? "generating"}
                  </Badge>
                  <Badge variant="outline" className="bg-background/70 px-1.5 py-0">
                    Attempt {generationStatus?.attempt ?? 1}
                  </Badge>
                  <span className="inline-flex items-center gap-1 font-medium text-xs">
                    <Clock3 className="w-3 h-3" />
                    <ElapsedTimerText startAt={generationStartedAt} endAt={null} />
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardFooter>
      </Card>

      {/* Sticky Generate bar */}
      <div className="sticky bottom-3 z-20 px-1.5">
        <div className="rounded-xl border border-border/60 bg-background/95 shadow-xl backdrop-blur flex items-center gap-3 p-3">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ready to generate
            </div>
            <div className="text-sm font-medium truncate">
              {questionMode === "written" ? "Written Answer" : "Multiple Choice"} ·{" "}
              {isPassageMode
                ? `${passageQuestionCount} passage questions`
                : `${questionCount} questions`}
            </div>
          </div>
          <Button
            size="sm"
            className="h-9"
            onClick={generateHandler}
            disabled={generateDisabled}
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-1" />
            )}
            {isGenerating ? "Generating" : "Generate"}
          </Button>
        </div>
      </div>
    </>
  );
}

// ── SubtopicSection helper (internal) ────────────────────────────────────────

interface SubtopicSectionProps<T extends string> {
  label: string;
  hint: string;
  items: readonly T[];
  selected: T[];
  onToggle: (item: T) => void;
  labelFn?: (item: T) => string;
}

function SubtopicSection<T extends string>({
  label,
  hint,
  items,
  selected,
  onToggle,
  labelFn,
}: SubtopicSectionProps<T>) {
  return (
    <div className="space-y-2">
      <div>
        <Label className="text-sm font-semibold">{label}</Label>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Badge
            key={item}
            variant={selected.includes(item) ? "default" : "outline"}
            className={`cursor-pointer p-3 text-xs transition-colors ${selected.includes(item) ? "shadow-md" : "hover:bg-primary/10"}`}
            onClick={() => onToggle(item)}
          >
            {labelFn ? labelFn(item) : item}
          </Badge>
        ))}
      </div>
    </div>
  );
}
