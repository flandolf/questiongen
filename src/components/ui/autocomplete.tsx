'use client';

import { Check, ChevronDown, Search, X } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';
import { Button } from './button';
import { Input } from './input';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

interface AutocompleteOption {
  value: string;
  label: string;
  matchScore?: number;
}

interface AutocompleteGroup {
  label: string;
  options: AutocompleteOption[];
}

interface AutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  groups?: AutocompleteGroup[];
  placeholder?: string;
  className?: string;
  showMatchScore?: boolean;
  confidenceThreshold?: number;
}

export function Autocomplete({
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

  const allOptions = React.useMemo(() => {
    return groups.flatMap((g) =>
      g.options.map((o) => ({ ...o, group: g.label })),
    );
  }, [groups]);

  const filteredGroups = React.useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        options: g.options.filter(
          (o) =>
            o.label.toLowerCase().includes(q) ||
            o.value.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.options.length > 0);
  }, [groups, search]);

  const selectedOption = allOptions.find((o) => o.value === value);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          role='combobox'
          aria-expanded={open}
          className={cn(
            'w-full justify-between h-7 text-xs font-normal',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <span className='truncate'>
            {selectedOption?.label || placeholder}
          </span>
          <ChevronDown className='ml-2 h-3 w-3 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-100 p-0' align='start' sideOffset={4}>
        <div className='flex items-center border-b px-2'>
          <Search className='mr-2 h-3 w-3 shrink-0 text-muted-foreground' />
          <Input
            placeholder='Search...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='h-8 border-0 focus-visible:ring-0 text-xs'
            autoFocus
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
        <div className='max-h-75 overflow-y-auto p-1'>
          {filteredGroups.length === 0 ? (
            <div className='p-2 text-xs text-muted-foreground'>
              No results found
            </div>
          ) : (
            filteredGroups.map((group) => (
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
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
