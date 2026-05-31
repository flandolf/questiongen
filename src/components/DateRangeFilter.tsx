import type { DateRangePreset } from '@/hooks/useDateFilter';

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'this-month', label: 'This month' },
  { value: 'this-year', label: 'This year' },
  { value: 'all', label: 'All time' },
];

export function DateRangeFilter({
  active,
  onChange,
}: {
  active: DateRangePreset;
  onChange: (preset: DateRangePreset) => void;
}) {
  return (
    <div className='flex flex-wrap gap-2'>
      {PRESETS.map(({ value, label }) => (
        <button
          key={value}
          type='button'
          onClick={() => onChange(value)}
          className={`inline-flex items-center gap-2 rounded-sm px-4 py-1.5 text-xs font-medium border transition-colors ${
            active === value
              ? 'border-foreground/30 bg-secondary text-secondary-foreground'
              : 'border-border/50 bg-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/50'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
