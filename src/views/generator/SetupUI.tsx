import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { toCanonicalSubtopicName, type TopicSubtopicGroup } from '@/types';

const SPRING = { type: 'spring' as const, stiffness: 300, damping: 30 };

export function ResizableAccordionContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const measuredRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const measured = measuredRef.current;
    const content = contentRef.current;

    if (!wrapper || !measured || !content) return;

    const updateHeight = () => {
      const currentHeight = measured.scrollHeight;
      content.style.setProperty(
        '--radix-accordion-content-height',
        `${currentHeight}px`,
      );
    };

    const resizeObserver = new ResizeObserver(() => updateHeight());
    resizeObserver.observe(measured);
    updateHeight();

    return () => resizeObserver.disconnect();
  }, []);

  return (
    <AccordionPrimitive.Content
      ref={contentRef}
      data-slot='accordion-content'
      className='overflow-hidden text-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
    >
      <div
        ref={wrapperRef}
        className={cn(
          'h-(--radix-accordion-content-height) transition-[height] duration-300 ease-in-out pb-4',
          className,
        )}
      >
        <div ref={measuredRef}>{children}</div>
      </div>
    </AccordionPrimitive.Content>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex items-center pt-1 pb-2 w-full'>
      <h2 className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50'>
        {children}
      </h2>
    </div>
  );
}

export function SectionDivider() {
  return <div className='h-10 w-full' />;
}

export function GroupedSubtopicSelector({
  label,
  groups,
  selected,
  onToggle,
}: {
  label: string;
  groups: readonly TopicSubtopicGroup[];
  selected: string[];
  onToggle: (item: string | string[]) => void;
}) {
  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(() => {
    const units = new Set<string>();
    for (const group of groups) {
      if (group.subtopics.some((s) => selected.includes(s))) {
        units.add(group.unit);
      }
    }
    return units;
  });

  const [searchTerm, setSearchTerm] = useState('');

  const filteredGroups = useMemo(() => {
    if (!searchTerm.trim()) return groups;
    const lowerSearch = searchTerm.toLowerCase();
    return groups
      .map((group) => ({
        ...group,
        subtopics: group.subtopics.filter(
          (s) =>
            toCanonicalSubtopicName(s).toLowerCase().includes(lowerSearch) ||
            group.aos.toLowerCase().includes(lowerSearch),
        ),
      }))
      .filter((group) => group.subtopics.length > 0);
  }, [groups, searchTerm]);

  const toggleSelectAllInUnit = (unit: string) => {
    // When searching, only affect visible subtopics in this unit.
    const unitGroups = (searchTerm.trim() ? filteredGroups : groups).filter(
      (g) => g.unit === unit,
    );
    const allSubtopics = unitGroups.flatMap((g) => g.subtopics);

    const toSelect = allSubtopics.filter((s) => !selected.includes(s));
    if (toSelect.length > 0) {
      onToggle(toSelect);
      return;
    }

    const toDeselect = allSubtopics.filter((s) => selected.includes(s));
    onToggle(toDeselect);
  };

  const toggleSelectAllInGroup = (group: TopicSubtopicGroup) => {
    const toSelect = group.subtopics.filter((s) => !selected.includes(s));
    if (toSelect.length > 0) {
      onToggle(toSelect);
      return;
    }

    const toDeselect = group.subtopics.filter((s) => selected.includes(s));
    onToggle(toDeselect);
  };

  const toggleUnit = (unit: string) => {
    setSelectedUnits((prev) => {
      const next = new Set(prev);
      if (next.has(unit)) {
        next.delete(unit);
      } else {
        next.add(unit);
      }
      return next;
    });
  };

  const units = useMemo(
    () =>
      Array.from(new Set(groups.map((group) => group.unit))).sort((a, b) => {
        const unitNumber = (value: string) => {
          const match = value.match(/^Unit\s+(\d+)$/i);
          return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
        };
        const numberDiff = unitNumber(a) - unitNumber(b);
        if (numberDiff !== 0) return numberDiff;
        return a.localeCompare(b);
      }),
    [groups],
  );

  const visibleGroups = useMemo(() => {
    if (searchTerm.trim()) return filteredGroups;
    return groups.filter((group) => selectedUnits.has(group.unit));
  }, [groups, selectedUnits, searchTerm, filteredGroups]);

  const unitsWithMatches = useMemo(() => {
    if (!searchTerm.trim()) return new Set(units);
    return new Set(filteredGroups.map((g) => g.unit));
  }, [filteredGroups, searchTerm, units]);

  return (
    <div className='flex flex-col gap-8 w-full'>
      <div className='flex flex-col gap-5'>
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
          <h3 className='text-sm font-bold text-foreground'>{label}</h3>
          <div className='relative w-full sm:w-64'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground' />
            <input
              type='text'
              placeholder='Search subtopics...'
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label='Search subtopics'
              className='w-full h-9 pl-9 pr-8 text-xs rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all'
            />
            {searchTerm && (
              <button
                type='button'
                onClick={() => setSearchTerm('')}
                aria-label='Clear search'
                className='absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground'
              >
                <X className='h-3.5 w-3.5' />
              </button>
            )}
          </div>
        </div>

        {/* High-density Unit Selector Cards */}
        <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4'>
          {units.map((unit) => {
            const hasMatches = unitsWithMatches.has(unit);
            if (!hasMatches && searchTerm.trim()) return null;

            const isActive = searchTerm.trim() || selectedUnits.has(unit);
            const unitGroups = groups.filter((g) => g.unit === unit);
            const totalSubs = unitGroups.reduce(
              (sum, g) => sum + g.subtopics.length,
              0,
            );
            const selectedCount = unitGroups.reduce(
              (sum, g) =>
                sum + g.subtopics.filter((s) => selected.includes(s)).length,
              0,
            );

            return (
              <motion.button
                key={unit}
                type='button'
                onClick={() => toggleUnit(unit)}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.99 }}
                transition={SPRING}
                className={cn(
                  'group relative flex items-center justify-between p-3 rounded-xl transition-all border',
                  isActive
                    ? 'bg-primary/5 border-primary/20'
                    : 'bg-card border-border hover:bg-muted/50 text-muted-foreground',
                )}
              >
                <div className='flex flex-col items-start'>
                  <span
                    className={cn(
                      'font-bold text-xs',
                      isActive ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {unit}
                  </span>
                  <span
                    className={cn(
                      'text-[10px] tabular-nums',
                      selectedCount > 0
                        ? 'text-primary/70 font-bold'
                        : 'text-muted-foreground/40',
                    )}
                  >
                    {selectedCount}/{totalSubs}
                  </span>
                </div>

                <div
                  role='button'
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    toggleSelectAllInUnit(unit);
                  }}
                  className='cursor-pointer text-[10px] font-bold text-muted-foreground/50 hover:text-foreground px-2 py-1 rounded bg-muted/30 hover:bg-muted transition-colors'
                >
                  ALL
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode='popLayout'>
        {visibleGroups.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className='grid grid-cols-1 lg:grid-cols-2 gap-6'
          >
            {visibleGroups.map((group) => {
              const selectedCount = group.subtopics.filter((s) =>
                selected.includes(s),
              ).length;
              const allSelected = selectedCount === group.subtopics.length;

              return (
                <motion.div
                  layout
                  key={group.groupId}
                  initial={{ opacity: 0, scale: 0.99 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={cn(
                    'flex flex-col gap-3 p-4 rounded-xl border transition-all relative overflow-hidden',
                    allSelected
                      ? 'bg-primary/5 border-primary/20'
                      : 'bg-card border-border',
                  )}
                >
                  <div className='flex items-center justify-between relative z-10'>
                    <h4 className='text-xs font-bold text-foreground leading-tight'>
                      {group.aos}
                    </h4>
                    <button
                      type='button'
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelectAllInGroup(group);
                      }}
                      className='text-[10px] font-bold text-muted-foreground/40 hover:text-foreground bg-muted/30 hover:bg-muted px-2 py-1 rounded transition-colors shrink-0'
                    >
                      {allSelected ? 'CLEAR' : 'SELECT ALL'}
                    </button>
                  </div>

                  <div className='flex flex-wrap gap-1.5 relative z-10'>
                    {group.subtopics.map((subtopic) => {
                      const isSelected = selected.includes(subtopic);
                      return (
                        <motion.button
                          key={subtopic}
                          type='button'
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => onToggle(subtopic)}
                          className={cn(
                            'inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors border',
                            isSelected
                              ? 'bg-primary/10 text-primary border-primary/20 font-bold'
                              : 'bg-background text-muted-foreground/60 border-border hover:bg-muted/50',
                          )}
                        >
                          {toCanonicalSubtopicName(subtopic)}
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
