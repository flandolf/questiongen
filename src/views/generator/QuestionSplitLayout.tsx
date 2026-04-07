import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface QuestionSplitLayoutProps {
  leftSlot: ReactNode;
  rightSlot: ReactNode;
  sketchpadActive?: boolean;
  mode: 'written' | 'mc';
  className?: string;
}

/**
 * A shared layout component that provides the "side-by-side" split view for questions.
 * Handles the responsive grid and special width ratios for the sketchpad.
 */
export function QuestionSplitLayout({
  leftSlot,
  rightSlot,
  sketchpadActive,
  mode,
  className,
}: QuestionSplitLayoutProps) {
  const isWritten = mode === 'written';
  
  // Ratios match existing GeneratorView logic
  const gridCols = sketchpadActive
    ? isWritten
      ? 'lg:grid-cols-[45%_55%]'
      : 'lg:grid-cols-[40%_60%]'
    : 'lg:grid-cols-2';

  return (
    <div
      className={cn(
        'grid grid-cols-1 lg:gap-8 pb-10',
        gridCols,
        className
      )}
    >
      <div className="min-w-0 space-y-5">
        {leftSlot}
      </div>
      <div className="min-w-0 space-y-5">
        {rightSlot}
      </div>
    </div>
  );
}
