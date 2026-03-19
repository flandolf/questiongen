import { Loader2, Settings2, BookOpen, Target, Sparkles, Album, BookCheck, Calculator, Pen, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
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
  GenerationStatusEvent
} from "@/types";
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
    (t) => t === "Mathematical Methods" || t === "Specialist Mathematics",
  );

  const hasSubtopicSection =
    selectedTopics.includes("Mathematical Methods") ||
    selectedTopics.includes("Specialist Mathematics") ||
    selectedTopics.includes("Chemistry") ||
    selectedTopics.includes("Physical Education");

  return (
    <Card className="border-0 shadow-xl bg-card/50 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 pb-3 border-b">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-2xl font-extrabold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Practice Generator
            </CardTitle>
            <CardDescription className="text-sm mt-1">Configure your custom VCE revision session</CardDescription>
          </div>
          <div className="bg-background/80 p-1 rounded-xl shadow-sm border inline-flex">
            <Button
              variant={questionMode === "written" ? "default" : "ghost"}
              size="sm"
              className={`rounded-lg transition-all ${questionMode === "written" ? "shadow-md" : ""}`}
              onClick={() => onSetQuestionMode("written")}
            >
              <BookOpen className="w-4 h-4 mr-2" /> Written Answer
            </Button>
            <Button
              variant={questionMode === "multiple-choice" ? "default" : "ghost"}
              size="sm"
              className={`rounded-lg transition-all ${questionMode === "multiple-choice" ? "shadow-md" : ""}`}
              onClick={() => onSetQuestionMode("multiple-choice")}
            >
              <Target className="w-4 h-4 mr-2" /> Multiple Choice
            </Button>
          </div>
        </div>
      </div>

      <CardContent className="p-4 md:p-5 space-y-5">
        {/* Subject Selection */}
        <div className="space-y-2">
          <Label className="text-base font-semibold">Select Subjects</Label>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {TOPICS.map((topic) => {
              const isSelected = selectedTopics.includes(topic);
              return (
                <Button
                  key={topic}
                  variant={isSelected ? "default" : "outline"}
                  className={`w-full transition-colors ${isSelected ? "shadow-md" : "hover:bg-primary/10"}`}
                  onClick={() => onToggleTopic(topic)}
                >
                  {topic}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Subtopic Drill-downs */}
        {hasSubtopicSection && (
          <div className="bg-muted/30 p-4 rounded-xl border space-y-2">
            {selectedTopics.includes("Mathematical Methods") && (
              <div className="space-y-2">
                <div>
                  <Label className="text-sm font-semibold">Mathematical Methods Focus Areas</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Leave all unselected to test across the entire curriculum.</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {MATH_METHODS_SUBTOPICS.map((sub) => (
                    <Badge
                      key={sub}
                      variant={mathMethodsSubtopics.includes(sub) ? "default" : "outline"}
                      className={`cursor-pointer p-3 text-xs transition-colors ${mathMethodsSubtopics.includes(sub) ? "shadow-md" : "hover:bg-primary/10"}`}
                      onClick={() => onToggleMathMethodsSubtopic(sub)}
                    >
                      {sub}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {selectedTopics.includes("Specialist Mathematics") && (
              <div className="space-y-2">
                <div>
                  <Label className="text-sm font-semibold">Specialist Mathematics Focus Areas</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Leave all unselected to test across the entire curriculum.</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SPECIALIST_MATH_SUBTOPICS.map((sub) => (
                    <Badge
                      key={sub}
                      variant={specialistMathSubtopics.includes(sub) ? "default" : "outline"}
                      className={`cursor-pointer p-3 text-xs transition-colors ${specialistMathSubtopics.includes(sub) ? "shadow-md" : "hover:bg-primary/10"}`}
                      onClick={() => onToggleSpecialistMathSubtopic(sub)}
                    >
                      {sub}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {selectedTopics.includes("Chemistry") && (
              <div className="space-y-2">
                <div>
                  <Label className="text-sm font-semibold">Chemistry Focus Areas</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Select one or more Chemistry study points, or leave all unselected to span the full course.</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CHEMISTRY_SUBTOPICS.map((sub) => (
                    <Badge
                      key={sub}
                      variant={chemistrySubtopics.includes(sub) ? "default" : "outline"}
                      className={`cursor-pointer p-3 text-xs transition-colors ${chemistrySubtopics.includes(sub) ? "shadow-md" : "hover:bg-primary/10"}`}
                      onClick={() => onToggleChemistrySubtopic(sub)}
                    >
                      {sub}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {selectedTopics.includes("Physical Education") && (
              <div className="space-y-2">
                <div>
                  <Label className="text-sm font-semibold">Physical Education Unit 3/4 Focus Areas</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Based on the 2025 Study Design.</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PHYSICAL_EDUCATION_SUBTOPICS.map((sub) => (
                    <Badge
                      key={sub}
                      variant={physicalEducationSubtopics.includes(sub) ? "default" : "outline"}
                      className={`cursor-pointer p-3 text-xs transition-colors ${physicalEducationSubtopics.includes(sub) ? "shadow-md" : "hover:bg-primary/10"}`}
                      onClick={() => onTogglePhysicalEducationSubtopic(sub)}
                    >
                      {sub}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Configuration Parameters */}
        <div className="flex flex-col gap-y-3">
          {/* Calculator Mode — math topics only */}
          {hasAnyMathTopic && (
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
                      onClick={() => onSetTechMode(mode)}
                    >
                      {mode === "tech-free" && <Pen className="w-4 h-4 mr-1" />}
                      {mode === "tech-active" && <Calculator className="w-4 h-4 mr-1" />}
                      {mode === "tech-free" ? "Tech-Free" : mode === "tech-active" ? "Tech-Active" : "Mixed"}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Custom Focus Area */}
          <div className="space-y-1.5 md:col-span-2">
            <div className="flex items-center gap-2">
              <BookCheck className="w-4 h-4" />
              <Label className="text-sm font-semibold">Custom Focus Area (Optional)</Label>
            </div>
            <Input
              value={customFocusArea}
              onChange={(e) => onSetCustomFocusArea(e.target.value)}
              maxLength={160}
              placeholder="e.g. projectile motion with optimization constraints"
            />
            <p className="text-xs text-muted-foreground">
              Add a custom topic or skill focus to guide generation. This is appended to the selected subtopics sent to the model.
            </p>
          </div>

          {/* Difficulty */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Album className="w-4 h-4" />
              <Label className="text-sm font-semibold">Difficulty</Label>
            </div>
            <div className="pl-px flex w-full flex-nowrap items-start gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] py-1">
              {(["Essential Skills", "Easy", "Medium", "Hard", "Extreme"] as Difficulty[]).map((level) => {
                const isSelected = difficulty === level;
                return (
                  <Button
                    key={level}
                    variant={isSelected ? "default" : "outline"}
                    className={`h-9 shrink-0 whitespace-nowrap px-3 text-sm transition-all ${isSelected ? "shadow-md ring-2 ring-primary/20 ring-offset-1" : ""}`}
                    onClick={() => onSetDifficulty(level)}
                  >
                    {level}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Question Count */}
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between items-center">
              <Label className="text-sm font-semibold">Question Count</Label>
              <Badge variant="secondary" className="px-2 py-0.5 text-xs">{questionCount}</Badge>
            </div>
            <Slider min={1} max={20} step={1} value={[questionCount]} onValueChange={(val) => onSetQuestionCount(val[0])} className="py-1" />
          </div>

          {/* Max Marks — written + math only */}
          {questionMode === "written" && hasAnyMathTopic && (
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between items-center">
                <Label className="text-sm font-semibold">Max Marks per Question</Label>
                <Badge variant="secondary" className="px-2 py-0.5 text-xs">{maxMarksPerQuestion}</Badge>
              </div>
              <Slider min={1} max={30} step={1} value={[maxMarksPerQuestion]} onValueChange={(val) => onSetMaxMarksPerQuestion(val[0])} className="py-1" />
              <p className="text-xs text-muted-foreground">Caps the mark value for each generated maths question.</p>
            </div>
          )}

          {/* Variation Guardrail */}
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-sm font-semibold">Variation Guardrail</Label>
            <Button
              type="button"
              variant={avoidSimilarQuestions ? "default" : "outline"}
              className="h-auto w-full justify-start py-2.5 text-left whitespace-normal"
              onClick={() => onSetAvoidSimilarQuestions(!avoidSimilarQuestions)}
            >
              <div className="min-w-0 flex flex-col items-start gap-0.5">
                <span className="w-full wrap-break-word">
                  {avoidSimilarQuestions ? "Avoid Similar Questions: On" : "Avoid Similar Questions: Off"}
                </span>
                <span className="w-full wrap-break-word text-xs font-normal opacity-80">
                  When enabled, generation includes your recent same-topic prompts (if available) and asks the model to avoid repeating them.
                </span>
              </div>
            </Button>
          </div>
        </div>

        {/* API Key warning */}
        {!hasApiKey && (
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 p-3 rounded-lg text-xs flex items-center gap-2">
            <Settings2 className="w-4 h-4 shrink-0" />
            <span><strong>API Key Missing:</strong> Go to Settings to configure your OpenRouter API Key before generating questions.</span>
          </div>
        )}
      </CardContent>

      <CardFooter className="bg-muted/20 border-t flex flex-col gap-3">
        <Button
          size="lg"
          className={`w-full h-12 text-base font-bold transition-all duration-300 ${isGenerating ? "opacity-90" : "hover:scale-[1.01] hover:shadow-xl hover:shadow-primary/25 bg-linear-to-r from-primary to-primary/90"}`}
          onClick={onGenerate}
          disabled={!canGenerate}
        >
          {isGenerating
            ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Crafting Questions...</>
            : <><Sparkles className="w-4 h-4 mr-2" /> Generate Revision Set</>}
        </Button>

        {isGenerating && generationStartedAt !== null && (
          <div className="w-full rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                <span>{generationStatus?.message ?? "Generating questions..."}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                <Badge variant="outline" className="bg-background/70 px-1.5 py-0">{generationStatus?.stage ?? "generating"}</Badge>
                <Badge variant="outline" className="bg-background/70 px-1.5 py-0">Attempt {generationStatus?.attempt ?? 1}</Badge>
                <span className="inline-flex items-center gap-1 font-medium text-xs">
                  <Clock3 className="w-3 h-3" /> {formattedElapsedTime}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
