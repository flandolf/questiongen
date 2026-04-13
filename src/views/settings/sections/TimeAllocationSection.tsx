import { motion } from 'framer-motion';
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
import { SectionHeader } from '../SettingsUI';

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

  const handleReset = () => {
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
    ]);
  };

  return (
    <div className='max-w-2xl space-y-8'>
      <div className='flex items-end justify-between border-b border-border/50 pb-6'>
        <div className='space-y-1'>
          <SectionHeader
            title='Time Allocation'
            description='Configure the expected time allocation for each difficulty level.'
          />
        </div>
        <Button
          variant='ghost'
          size='sm'
          onClick={handleReset}
          className='text-muted-foreground hover:text-primary gap-2 h-8 px-3 rounded-full hover:bg-primary/5 transition-all'
        >
          <RotateCcw className='size-3.5' />
          <span className='text-[10px] font-bold uppercase tracking-widest'>
            Reset
          </span>
        </Button>
      </div>

      <div className='grid gap-4'>
        {difficulties.map((difficulty, index) => {
          const allocation = timeAllocations.find(
            (a) => a.difficulty === difficulty,
          );
          if (!allocation) return null;

          const config = DIFFICULTY_CONFIG[difficulty];

          return (
            <motion.div
              key={difficulty}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                delay: index * 0.01,
                duration: 0.2,
                ease: 'easeOut',
              }}
              className={cn(
                'group relative flex flex-col gap-4 p-5 rounded-2xl border transition-all duration-300 overflow-hidden',
                'bg-muted/10 border-border/50 hover:border-primary/30 hover:bg-muted/20 hover:shadow-lg hover:shadow-primary/5',
              )}
            >
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-3'>
                  <div
                    className={cn(
                      'p-2 rounded-xl transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3',
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

                <div className='flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/50 border border-border/50 shadow-sm'>
                  <Timer className='size-3 text-primary/60' />
                  <span className='text-xs font-mono font-bold tabular-nums text-primary'>
                    {allocation.minutesPerQuestion.toFixed(2)}
                  </span>
                  <span className='text-[10px] font-semibold text-muted-foreground uppercase tracking-tighter'>
                    min/mark
                  </span>
                </div>
              </div>

              <div className='relative px-1 pt-2 pb-1'>
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

              <div className='absolute top-0 right-0 w-32 h-32 bg-linear-to-br from-transparent via-transparent to-primary/5 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity' />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
