import {
  Info,
  Shuffle,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { useAppStore } from '../../../store';
import { Card, SectionHeader } from '../SettingsUI';

export function GenerationSettingsSection() {
  const avoidSimilarQuestions = useAppStore((s) => s.avoidSimilarQuestions);
  const setAvoidSimilarQuestions = useAppStore(
    (s) => s.setAvoidSimilarQuestions
  );
  const aiDifficultyScalingEnabled = useAppStore(
    (s) => s.aiDifficultyScalingEnabled
  );
  const setAiDifficultyScalingEnabled = useAppStore(
    (s) => s.setAiDifficultyScalingEnabled
  );
  const difficultyThresholds = useAppStore((s) => s.difficultyThresholds);
  const setDifficultyThresholds = useAppStore((s) => s.setDifficultyThresholds);
  const diversityStrictness = useAppStore((s) => s.diversityStrictness);
  const setDiversityStrictness = useAppStore((s) => s.setDiversityStrictness);
  const strictLatexValidation = useAppStore((s) => s.strictLatexValidation);
  const setStrictLatexValidation = useAppStore(
    (s) => s.setStrictLatexValidation
  );
  const strictSubtopicCoverage = useAppStore((s) => s.strictSubtopicCoverage);
  const setStrictSubtopicCoverage = useAppStore(
    (s) => s.setStrictSubtopicCoverage
  );
  const minSubtopicCoverageRatio = useAppStore(
    (s) => s.minSubtopicCoverageRatio
  );
  const setMinSubtopicCoverageRatio = useAppStore(
    (s) => s.setMinSubtopicCoverageRatio
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Generation Settings"
        description="Configure default options for question generation."
      />
      <Card className="flex items-center justify-between p-4">
        <div>
          <p className="text-sm font-medium">Avoid Similar Questions</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {avoidSimilarQuestions
              ? 'Avoid similar questions is enabled.'
              : 'Avoid similar questions is disabled.'}
          </p>
        </div>
        <Button
          type="button"
          variant={avoidSimilarQuestions ? 'default' : 'outline'}
          size="sm"
          className="gap-2 shrink-0 ml-4"
          onClick={() => setAvoidSimilarQuestions(!avoidSimilarQuestions)}
        >
          <Shuffle className="h-4 w-4" />
          {avoidSimilarQuestions ? 'Disable' : 'Enable'}
        </Button>
      </Card>
      <Card className="flex flex-row items-center justify-between p-4">
        <div>
          <p className="text-sm font-medium">AI Difficulty Scaling</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {aiDifficultyScalingEnabled
              ? 'Difficulty will adjust based on your performance.'
              : 'Difficulty will remain constant.'}
          </p>
        </div>
        <Button
          type="button"
          variant={aiDifficultyScalingEnabled ? 'default' : 'outline'}
          size="sm"
          className="gap-2 shrink-0 mt-2"
          onClick={() =>
            setAiDifficultyScalingEnabled(!aiDifficultyScalingEnabled)
          }
        >
          <Sparkles className="h-4 w-4" />
          {aiDifficultyScalingEnabled ? 'Disable' : 'Enable'}
        </Button>
      </Card>
      {aiDifficultyScalingEnabled && (
        <Card className="flex flex-col p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <p>Difficulty Thresholds</p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-4 h-4 text-muted-foreground cursor-help hover:text-primary transition-colors" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs text-sm">
                      Set the percentage thresholds for increasing or decreasing
                      difficulty based on your performance.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 text-sm font-medium text-foreground/80">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  Increase Difficulty At
                </Label>
                <span className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50 font-semibold px-2.5 py-0.5 rounded-md text-sm tabular-nums">
                  {difficultyThresholds.increase}%
                </span>
              </div>
              <Slider
                min={50}
                max={100}
                step={5}
                value={[difficultyThresholds.increase]}
                onValueChange={(val) =>
                  setDifficultyThresholds({
                    ...difficultyThresholds,
                    increase: val[0],
                  })
                }
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 text-sm font-medium text-foreground/80">
                  <TrendingDown className="w-4 h-4 text-rose-500" />
                  Decrease Difficulty At
                </Label>
                <span className="bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 font-semibold px-2.5 py-0.5 rounded-md text-sm tabular-nums">
                  {difficultyThresholds.decrease}%
                </span>
              </div>
              <Slider
                min={0}
                max={100}
                step={5}
                value={[difficultyThresholds.decrease]}
                onValueChange={(val) =>
                  setDifficultyThresholds({
                    ...difficultyThresholds,
                    decrease: val[0],
                  })
                }
              />
            </div>
          </div>
        </Card>
      )}
      <Card className="flex flex-col p-4">
        <SectionHeader
          title="Generation Flags"
          description="Global generation defaults."
        />

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium">Diversity Strictness</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(['lenient', 'moderate', 'strict'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setDiversityStrictness(lvl)}
                  className={cn(
                    'text-xs font-semibold rounded-md py-2 transition-colors',
                    diversityStrictness === lvl
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-background'
                  )}
                >
                  {lvl[0].toUpperCase() + lvl.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Strict LaTeX Validation</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {strictLatexValidation
                  ? 'Malformed math is rejected.'
                  : 'Malformed math may be tolerated.'}
              </p>
            </div>
            <Switch
              checked={strictLatexValidation}
              onCheckedChange={setStrictLatexValidation}
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Strict Subtopic Coverage</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {strictSubtopicCoverage
                    ? 'Generator will prioritise selected subtopics.'
                    : 'Subtopic coverage is flexible.'}
                </p>
              </div>
              <Switch
                checked={strictSubtopicCoverage}
                onCheckedChange={setStrictSubtopicCoverage}
              />
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium">Minimum Subtopic Coverage</p>
                <span className="text-sm font-semibold">
                  {Math.round(minSubtopicCoverageRatio * 100)}%
                </span>
              </div>
              <Slider
                min={40}
                max={100}
                step={5}
                value={[Math.round(minSubtopicCoverageRatio * 100)]}
                onValueChange={(val) =>
                  setMinSubtopicCoverageRatio(val[0] / 100)
                }
              />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
