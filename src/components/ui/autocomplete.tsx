'use client';

import { Check, ChevronDown, Search, X } from 'lucide-react';
import * as React from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';
import { Button } from './button';
import { Input } from './input';

interface AutocompleteOption {
  value: string;
  label: string;
  matchScore?: number;
}

interface AutocompleteGroup {
  label: string;
  options: AutocompleteOption[];
}

type NormalizedOption = {
  option: AutocompleteOption;
  labelLower: string;
  valueLower: string;
};

type NormalizedGroup = {
  label: string;
  options: NormalizedOption[];
};

interface AutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  groups?: AutocompleteGroup[];
  placeholder?: string;
  className?: string;
  showMatchScore?: boolean;
  confidenceThreshold?: number;
}

const MAX_VISIBLE = 25;

export const Autocomplete = React.memo(function Autocomplete({
  value,
  onChange,
  groups = [],
  placeholder = 'Select...',
  className,
  showMatchScore = true,
  confidenceThreshold = 0.4,
}: AutocompleteProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dropdownStyle, setDropdownStyle] = React.useState<React.CSSProperties>(
    {},
  );

  const totalOptionCount = React.useMemo(
    () => groups.reduce((sum, g) => sum + g.options.length, 0),
    [groups],
  );

  const normalizedGroups = React.useMemo<NormalizedGroup[]>(
    () =>
      groups.map((group) => ({
        label: group.label,
        options: group.options.map((option) => ({
          option,
          labelLower:
            typeof option.label === 'string' ? option.label.toLowerCase() : '',
          valueLower:
            typeof option.value === 'string' ? option.value.toLowerCase() : '',
        })),
      })),
    [groups],
  );

  const selectedLabel = React.useMemo(() => {
    if (!value) return null;
    for (const group of groups) {
      for (const option of group.options) {
        if (option.value === value) {
          return option.label;
        }
      }
    }
    return null;
  }, [groups, value]);

  const { filteredGroups, filteredTotal } = React.useMemo(() => {
    if (!open) {
      return { filteredGroups: [] as AutocompleteGroup[], filteredTotal: 0 };
    }

    const q = search.trim().toLowerCase();
    if (!q) return { filteredGroups: groups, filteredTotal: totalOptionCount };

    let total = 0;
    const result: AutocompleteGroup[] = [];

    for (const group of normalizedGroups) {
      const filteredOptions: AutocompleteOption[] = [];
      for (const normalizedOption of group.options) {
        if (
          normalizedOption.labelLower.includes(q) ||
          normalizedOption.valueLower.includes(q)
        ) {
          filteredOptions.push(normalizedOption.option);
        }
      }

      if (filteredOptions.length > 0) {
        total += filteredOptions.length;
        result.push({ label: group.label, options: filteredOptions });
      }
    }

    return { filteredGroups: result, filteredTotal: total };
  }, [open, groups, normalizedGroups, search, totalOptionCount]);

  const truncatedGroups = React.useMemo(() => {
    if (filteredTotal <= MAX_VISIBLE) return filteredGroups;
    let remaining = MAX_VISIBLE;
    const result: typeof filteredGroups = [];
    for (const g of filteredGroups) {
      if (remaining <= 0) break;
      const slice = g.options.slice(0, remaining);
      result.push({ ...g, options: slice });
      remaining -= slice.length;
    }
    return result;
  }, [filteredGroups, filteredTotal]);

  const deferAllRendering = !search.trim() && totalOptionCount > 50;

  // Position the dropdown relative to the trigger button
  const updatePosition = React.useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: 'fixed',
      left: rect.left,
      top: rect.bottom + 4,
      minWidth: rect.width,
      zIndex: 50,
    });
  }, []);

  // Open/close: update position and focus
  React.useEffect(() => {
    if (open) {
      updatePosition();
      // Focus the search input after the dropdown renders
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    } else {
      setSearch('');
    }
  }, [open, updatePosition]);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    // Delay adding the listener so the opening click doesn't close it
    const id = setTimeout(
      () => document.addEventListener('click', handleClick),
      0,
    );
    return () => {
      clearTimeout(id);
      document.removeEventListener('click', handleClick);
    };
  }, [open]);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  // Reposition on scroll/resize
  React.useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setOpen(false);
    setSearch('');
  };

  const dropdown = open
    ? createPortal(
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className='rounded-md border bg-popover text-popover-foreground shadow-md outline-none'
        >
          <div className='flex items-center border-b px-2'>
            <Search className='mr-2 h-3 w-3 shrink-0 text-muted-foreground' />
            <Input
              ref={inputRef}
              placeholder='Search...'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className='h-8 border-0 focus-visible:ring-0 text-xs'
            />
            {search && (
              <button
                type='button'
                onClick={(e) => {
                  e.stopPropagation();
                  setSearch('');
                }}
                className='p-1 hover:bg-muted rounded'
              >
                <X className='h-3 w-3' />
              </button>
            )}
          </div>
          <div
            className='max-h-75 overflow-y-auto p-1'
            style={{ contain: 'layout style', willChange: 'transform' }}
          >
            {deferAllRendering ? (
              <div className='p-4 text-xs text-muted-foreground text-center'>
                Type to search {totalOptionCount} options…
              </div>
            ) : truncatedGroups.length === 0 ? (
              <div className='p-2 text-xs text-muted-foreground'>
                No results found
              </div>
            ) : (
              <>
                {filteredTotal > MAX_VISIBLE && (
                  <div className='px-2 py-1.5 text-[10px] text-muted-foreground text-center border-b bg-amber-500/5'>
                    Showing {MAX_VISIBLE} of {filteredTotal} results — type to
                    narrow down
                  </div>
                )}
                {truncatedGroups.map((group) => (
                  <div key={group.label}>
                    <div className='px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/50 sticky top-0'>
                      {group.label}
                    </div>
                    {group.options.map((option) => (
                      <button
                        key={option.value}
                        type='button'
                        onClick={() => handleSelect(option.value)}
                        className={cn(
                          'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-2 text-xs outline-none hover:bg-accent hover:text-accent-foreground justify-start text-left',
                          value === option.value && 'bg-accent',
                        )}
                      >
                        <span className='flex-1 truncate text-left'>
                          {option.label}
                        </span>
                        {showMatchScore &&
                          option.matchScore !== undefined &&
                          option.matchScore >= confidenceThreshold && (
                            <span className='ml-2 text-[10px] text-muted-foreground'>
                              ({Math.round(option.matchScore * 100)}%)
                            </span>
                          )}
                        {value === option.value && (
                          <Check className='ml-2 h-3 w-3 shrink-0' />
                        )}
                      </button>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <Button
        ref={triggerRef}
        variant='outline'
        role='combobox'
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          'w-full justify-between h-7 text-xs font-normal',
          !value && 'text-muted-foreground',
          className,
        )}
      >
        <span className='truncate'>{selectedLabel || placeholder}</span>
        <ChevronDown className='ml-2 h-3 w-3 shrink-0 opacity-50' />
      </Button>
      {dropdown}
    </>
  );
});
