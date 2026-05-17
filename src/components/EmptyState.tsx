import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type EmptyStateProps = {
  title: string;
  description: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
  compact?: boolean;
};

export function EmptyState({
  title,
  description,
  icon: Icon,
  actions,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex h-full flex-col items-center justify-center gap-4 text-center',
        compact ? 'p-4' : 'p-3 sm:p-4 lg:p-5',
        className,
      )}
    >
      {Icon ? (
        <div className='rounded-xl bg-primary/[0.07] p-3.5 text-primary ring-1 ring-primary/10 ring-inset'>
          <Icon className='h-7 w-7' />
        </div>
      ) : null}
      <div className='max-w-sm space-y-1.5'>
        <h2 className='text-xl font-semibold tracking-tight'>{title}</h2>
        <p className='text-sm text-muted-foreground leading-relaxed'>
          {description}
        </p>
      </div>
      {actions && <div className='mt-1'>{actions}</div>}
    </div>
  );
}
