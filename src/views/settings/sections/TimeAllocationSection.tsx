import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import type { Difficulty, TimeAllocationConfig } from '@/types';

import { useAppStore } from '../../../store';
import { Card, SectionHeader } from '../SettingsUI';

export function TimeAllocationSection() {
  const timeAllocations = useAppStore((s) => s.timeAllocations);
  const setTimeAllocations = useAppStore((s) => s.setTimeAllocations);

  const difficulties: Difficulty[] = [
    'Essential Skills',
    'Easy',
    'Medium',
    'Hard',
    'Extreme',
  ];

  const handleUpdateAllocation = (
    difficulty: Difficulty,
    field: 'minutesPerQuestion',
    value: number,
  ) => {
    const updated: TimeAllocationConfig = timeAllocations.map((alloc) =>
      alloc.difficulty === difficulty
        ? { ...alloc, [field]: value, marksPerQuestion: 1 }
        : alloc,
    );
    setTimeAllocations(updated);
  };

  return (
    <div className='space-y-6'>
      <SectionHeader
        title='Time & Mark Allocations'
        description='Customize the time and marks allocated per question by difficulty level.'
      />
      <Button
        variant='outline'
        onClick={() =>
          setTimeAllocations([
            {
              difficulty: 'Essential Skills',
              minutesPerQuestion: 0.8,
              marksPerQuestion: 1,
            },
            { difficulty: 'Easy', minutesPerQuestion: 1, marksPerQuestion: 1 },
            {
              difficulty: 'Medium',
              minutesPerQuestion: 1.4,
              marksPerQuestion: 1,
            },
            {
              difficulty: 'Hard',
              minutesPerQuestion: 1.8,
              marksPerQuestion: 1,
            },
            {
              difficulty: 'Extreme',
              minutesPerQuestion: 2,
              marksPerQuestion: 1,
            },
          ])
        }
      >
        Reset to Defaults
      </Button>
      {difficulties.map((difficulty) => {
        const allocation = timeAllocations.find(
          (a) => a.difficulty === difficulty,
        );
        if (!allocation) return null;

        return (
          <Card key={difficulty} className='p-6 space-y-4'>
            <div>
              <p className='text-sm font-semibold'>{difficulty}</p>
            </div>

            <div className='space-y-1'>
              <label className='text-xs text-muted-foreground'>
                Minutes per 1 Mark
              </label>
              <Slider
                min={0.1}
                max={5}
                step={0.1}
                value={[allocation.minutesPerQuestion]}
                onValueChange={(value) =>
                  handleUpdateAllocation(
                    difficulty,
                    'minutesPerQuestion',
                    value[0],
                  )
                }
              />
            </div>

            <p>
              <span className='text-xs text-muted-foreground'>
                {allocation.minutesPerQuestion.toFixed(1)} min/mark
              </span>
            </p>
          </Card>
        );
      })}
    </div>
  );
}
