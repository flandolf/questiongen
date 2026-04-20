'use client';

import { Pipette } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { isValidHexColor, normalizeHexColor } from '@/lib/color-helpers';
import { cn } from '@/lib/utils';

const DEFAULT_SWATCHES = [
  '#111827',
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#ffffff',
  '#f3f4f6',
];

type ColorPickerProps = {
  value: string;
  onChange: (value: string) => void;
  swatches?: string[];
  label?: string;
  triggerClassName?: string;
  contentClassName?: string;
  showHexInput?: boolean;
  showNativeInput?: boolean;
  hideLabel?: boolean;
};

export function ColorPicker({
  value,
  onChange,
  swatches = DEFAULT_SWATCHES,
  label = 'Color',
  triggerClassName,
  contentClassName,
  showHexInput = true,
  showNativeInput = true,
  hideLabel = false,
}: ColorPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [draftValue, setDraftValue] = React.useState(normalizeHexColor(value));

  React.useEffect(() => {
    if (!open) {
      setDraftValue(normalizeHexColor(value));
    }
  }, [open, value]);

  const commitColor = React.useCallback(
    (nextValue: string) => {
      const normalized = normalizeHexColor(nextValue);
      setDraftValue(normalized);
      onChange(normalized);
    },
    [onChange],
  );

  const currentValue = normalizeHexColor(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='outline'
          className={cn(
            'group h-10 gap-2 rounded-xl border-border/70 bg-background/80 px-2.5 text-left font-normal hover:bg-muted/40',
            triggerClassName,
          )}
        >
          <span
            className='size-5 shrink-0 rounded-full border border-border shadow-sm ring-2 ring-background'
            style={{ backgroundColor: currentValue }}
          />
          {!hideLabel && (
            <>
              <span className='min-w-0 flex-1 truncate text-sm text-foreground'>
                {currentValue.toUpperCase()}
              </span>
              <Pipette className='size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground' />
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn('w-80 space-y-4 rounded-2xl p-4', contentClassName)}
        align='end'
      >
        <div className='flex items-center justify-between gap-3'>
          <div>
            <p className='text-sm font-semibold'>{label}</p>
            <p className='text-xs text-muted-foreground'>
              Pick a preset or enter a custom hex value.
            </p>
          </div>
          <div
            className='size-10 shrink-0 rounded-xl border border-border shadow-sm'
            style={{ backgroundColor: currentValue }}
          />
        </div>

        <div className='grid grid-cols-6 gap-2'>
          {swatches.map((swatch) => {
            const selected =
              currentValue.toLowerCase() === swatch.toLowerCase();
            return (
              <button
                key={swatch}
                type='button'
                aria-label={`Select ${swatch}`}
                aria-pressed={selected}
                onClick={() => commitColor(swatch)}
                className={cn(
                  'size-9 rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  selected
                    ? 'border-foreground scale-105 shadow-md'
                    : 'border-border hover:scale-105 hover:border-foreground/50',
                )}
                style={{ backgroundColor: swatch }}
              />
            );
          })}
        </div>

        {(showHexInput || showNativeInput) && (
          <div className='space-y-3'>
            {showHexInput && (
              <div className='space-y-1.5'>
                <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                  Hex value
                </p>
                <Input
                  value={draftValue}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setDraftValue(nextValue);
                    if (isValidHexColor(nextValue)) {
                      onChange(normalizeHexColor(nextValue));
                    }
                  }}
                  onBlur={() => {
                    if (!isValidHexColor(draftValue)) {
                      setDraftValue(currentValue);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && isValidHexColor(draftValue)) {
                      commitColor(draftValue);
                      setOpen(false);
                    }
                  }}
                  placeholder='#7c3aed'
                  className='font-mono text-sm uppercase'
                />
              </div>
            )}

            {showNativeInput && (
              <div className='flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5'>
                <div>
                  <p className='text-sm font-medium'>Custom picker</p>
                  <p className='text-xs text-muted-foreground'>
                    Open the system color chooser.
                  </p>
                </div>
                <label className='relative size-10 cursor-pointer overflow-hidden rounded-full border border-border shadow-sm'>
                  <span
                    className='absolute inset-0'
                    style={{ backgroundColor: currentValue }}
                  />
                  <input
                    type='color'
                    value={currentValue}
                    onChange={(e) => commitColor(e.target.value)}
                    className='absolute inset-0 h-[200%] w-[200%] -translate-x-1/4 -translate-y-1/4 cursor-pointer opacity-0'
                    aria-label={label}
                  />
                </label>
              </div>
            )}
          </div>
        )}

        <div className='flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted-foreground'>
          <span>Current</span>
          <span className='font-mono uppercase'>{currentValue}</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
