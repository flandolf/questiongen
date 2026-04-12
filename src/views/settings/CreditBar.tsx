import { cn } from '@/lib/utils';

export function CreditBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const color =
    pct > 90 ? 'bg-destructive' : pct > 70 ? 'bg-amber-500' : 'bg-primary';
  return (
    <div className='w-full h-1.5 rounded-full bg-muted overflow-hidden'>
      <div
        className={cn('h-full rounded-full transition-all duration-500', color)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
