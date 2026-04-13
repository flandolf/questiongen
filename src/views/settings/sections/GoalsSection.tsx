import { Slider } from '@/components/ui/slider';

import { useAppStore } from '../../../store';
import { Card, SectionHeader } from '../SettingsUI';

export function GoalsSection() {
  const studyGoals = useAppStore((s) => s.studyGoals);
  const setStudyGoals = useAppStore((s) => s.setStudyGoals);
  const streakData = useAppStore((s) => s.streakData);

  return (
    <div className='space-y-6'>
      <SectionHeader
        title='Study Goals'
        description='Set daily targets and track your study streaks.'
      />
      {/* Streak stats */}
      <Card className='p-4'>
        <div className='flex items-center justify-between'>
          <div>
            <p className='text-sm font-medium'>Current streak</p>
            <p className='text-xs text-muted-foreground mt-0.5'>
              Consecutive days with at least one question completed.
            </p>
          </div>
          <div className='text-right'>
            <p className='text-2xl font-black tabular-nums text-amber-500'>
              {streakData.currentStreak}
            </p>
            <p className='text-xs text-muted-foreground'>
              Best: {streakData.longestStreak}
            </p>
          </div>
        </div>
      </Card>
      <Card className='p-4 space-y-4'>
        <div>
          <p className='text-sm font-medium'>Daily question goal</p>
          <p className='text-xs text-muted-foreground mt-0.5'>
            Target number of questions to complete each day.
          </p>
        </div>
        <div className='flex items-center gap-3'>
          <Slider
            min={1}
            max={50}
            step={1}
            value={[studyGoals.dailyQuestionGoal]}
            onValueChange={(v) => setStudyGoals({ dailyQuestionGoal: v[0] })}
            className='flex-1'
          />
          <span className='text-sm font-bold tabular-nums w-8 text-center'>
            {studyGoals.dailyQuestionGoal}
          </span>
        </div>
      </Card>
      <Card className='p-4 space-y-4'>
        <div>
          <p className='text-sm font-medium'>Daily written goal</p>
          <p className='text-xs text-muted-foreground mt-0.5'>
            Target number of written questions per day.
          </p>
        </div>
        <div className='flex items-center gap-3'>
          <Slider
            min={0}
            max={20}
            step={1}
            value={[studyGoals.dailyWrittenGoal]}
            onValueChange={(v) => setStudyGoals({ dailyWrittenGoal: v[0] })}
            className='flex-1'
          />
          <span className='text-sm font-bold tabular-nums w-8 text-center'>
            {studyGoals.dailyWrittenGoal}
          </span>
        </div>
      </Card>
      <Card className='p-4 space-y-4'>
        <div>
          <p className='text-sm font-medium'>Daily MC goal</p>
          <p className='text-xs text-muted-foreground mt-0.5'>
            Target number of multiple-choice questions per day.
          </p>
        </div>
        <div className='flex items-center gap-3'>
          <Slider
            min={0}
            max={20}
            step={1}
            value={[studyGoals.dailyMcGoal]}
            onValueChange={(v) => setStudyGoals({ dailyMcGoal: v[0] })}
            className='flex-1'
          />
          <span className='text-sm font-bold tabular-nums w-8 text-center'>
            {studyGoals.dailyMcGoal}
          </span>
        </div>
      </Card>
      <Card className='p-4 space-y-4'>
        <div>
          <p className='text-sm font-medium'>Weekly streak goal</p>
          <p className='text-xs text-muted-foreground mt-0.5'>
            Target number of active days per week.
          </p>
        </div>
        <div className='flex items-center gap-3'>
          <Slider
            min={1}
            max={7}
            step={1}
            value={[studyGoals.weeklyStreakGoal]}
            onValueChange={(v) => setStudyGoals({ weeklyStreakGoal: v[0] })}
            className='flex-1'
          />
          <span className='text-sm font-bold tabular-nums w-8 text-center'>
            {studyGoals.weeklyStreakGoal}
          </span>
        </div>
      </Card>
    </div>
  );
}
