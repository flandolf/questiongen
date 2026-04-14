import {
  Activity,
  Flame,
  RotateCcw,
  Shield,
  Skull,
  Timer,
  Zap,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import type { Difficulty, TimeAllocationConfig } from '@/types';

import { useAppStore } from '../../../store';
import { AnimatedSection, Card, SectionHeader } from '../SettingsUI';

const DIFFICULTY_CONFIG: Record<
  Difficulty,
  { icon: React.ReactNode; color: string; bg: string; border: string }
> = {
  'Essential Skills': {
    icon: <Shield className='size-4' />,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
  },
  Easy: {
    icon: <Zap className='size-4' />,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
  },
  Medium: {
    icon: <Activity className='size-4' />,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
  },
  Hard: {
    icon: <Flame className='size-4' />,
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
  },
  Extreme: {
    icon: <Skull className='size-4' />,
    color: 'text-rose-500',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
  },
};

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

  const handleUpdateAllocation = (difficulty: Difficulty, value: number) => {
    const updated: TimeAllocationConfig = timeAllocations.map((alloc) =>
      alloc.difficulty === difficulty
        ? { ...alloc, minutesPerMark: value }
        : alloc,
    );
    setTimeAllocations(updated);
  };

  const handleReset = () => {
    setTimeAllocations([
      {
        difficulty: 'Essential Skills',
        minutesPerMark: 0.8,
      },
      {
        difficulty: 'Easy',
        minutesPerMark: 1,
      },
      {
        difficulty: 'Medium',
        minutesPerMark: 1.25,
      },
      {
        difficulty: 'Hard',
        minutesPerMark: 1.75,
      },
      {
        difficulty: 'Extreme',
        minutesPerMark: 2,
      },
    ]);
  };

  return (
    <AnimatedSection className='space-y-6'>
      <div className='relative'>
        <SectionHeader
          title='Time Allocation'
          description='Configure the expected time allocation for each difficulty level.'
        />
        <Button
          variant='ghost'
          size='sm'
          onClick={handleReset}
          className='absolute right-0 top-0 text-muted-foreground hover:text-primary gap-2 h-8 px-3 rounded-full hover:bg-primary/5 transition-all'
        >
          <RotateCcw className='size-3.5' />
          <span className='text-[10px] font-bold uppercase tracking-widest'>
            Reset
          </span>
        </Button>
      </div>

      {difficulties.map((difficulty) => {
        const allocation = timeAllocations.find(
          (a) => a.difficulty === difficulty,
        );
        if (!allocation) return null;

        const config = DIFFICULTY_CONFIG[difficulty];

        return (
          <Card key={difficulty} className='p-5 space-y-4'>
            <div className='flex flex-wrap items-center justify-between gap-4'>
              <div className='flex items-center gap-3'>
                <div
                  className={cn(
                    'p-2 rounded-xl transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 shrink-0',
                    config.bg,
                    config.color,
                  )}
                >
                  {config.icon}
                </div>
                <div>
                  <h3 className='text-sm font-bold tracking-tight text-foreground/90'>
                    {difficulty}
                  </h3>
                </div>
              </div>

              <div className='flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/50 border border-border/50 shadow-sm shrink-0'>
                <Timer className='size-3 text-primary/60' />
                <span className='text-xs font-mono font-bold tabular-nums text-primary'>
                  {allocation.minutesPerMark.toFixed(2)}
                </span>
                <span className='text-[10px] font-semibold text-muted-foreground uppercase tracking-tighter'>
                  min/mark
                </span>
              </div>
            </div>

            <div className='relative pt-4 pb-1'>
              <Slider
                min={0.1}
                max={5}
                step={0.1}
                value={[allocation.minutesPerMark]}
                onValueChange={(value) =>
                  handleUpdateAllocation(difficulty, value[0])
                }
                className='**:[[role=slider]]:size-4 **:[[role=slider]]:border-primary **:[[role=slider]]:bg-background **:[[role=slider]]:ring-offset-background'
              />
              <div className='flex justify-between mt-2'>
                {[0, 1, 2, 3, 4, 5].map((tick) => (
                  <span
                    key={tick}
                    className='text-[9px] font-mono text-muted-foreground/30 font-bold'
                  >
                    {tick}
                  </span>
                ))}
              </div>
            </div>
          </Card>
        );
      })}
    </AnimatedSection>
  );
}
