import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { TopicSubtopicGroup } from '@/types';

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
        `${currentHeight}px`
      );
    };

    const resizeObserver = new ResizeObserver(() => {
      updateHeight();
    });

    resizeObserver.observe(measured);
    updateHeight();

    return () => resizeObserver.disconnect();
  }, []);

  return (
    <AccordionPrimitive.Content
      ref={contentRef}
      data-slot="accordion-content"
      className="overflow-hidden px-2 text-xs/relaxed data-open:animate-accordion-down data-closed:animate-accordion-up"
    >
      <div
        ref={wrapperRef}
        className={cn(
          'h-(--radix-accordion-content-height) pt-0 pb-4 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4',
          className
        )}
      >
        <div ref={measuredRef}>{children}</div>
      </div>
    </AccordionPrimitive.Content>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <p className="text-[10px] font-bold text-primary/80 uppercase tracking-[0.15em]">
        {children}
      </p>
    </div>
  );
}

export function SectionDivider() {
  return <div className="h-4" />;
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
  onToggle: (item: string) => void;
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

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const group of groups) {
      if (group.subtopics.some((s) => selected.includes(s))) {
        initial.add(group.groupId);
      }
    }
    return initial;
  });

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

  const toggleGroup = (groupId: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
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
    [groups]
  );

  const visibleGroups = useMemo(
    () => groups.filter((group) => selectedUnits.has(group.unit)),
    [groups, selectedUnits]
  );

  return (
    <div className="mt-5 mb-2 space-y-4">
      <div className="flex items-baseline justify-between px-1">
        <p className="text-[13px] font-semibold text-foreground/90">{label}</p>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
          Select unit & area
        </p>
      </div>

      <div
        className={cn(
          'grid gap-2',
          units.length > 2 ? 'grid-cols-3' : 'grid-cols-2'
        )}
      >
        {units.map((unit) => {
          const isActive = selectedUnits.has(unit);
          const unitGroups = groups.filter((g) => g.unit === unit);
          const totalSubs = unitGroups.reduce(
            (sum, g) => sum + g.subtopics.length,
            0
          );
          const selectedCount = unitGroups.reduce(
            (sum, g) =>
              sum + g.subtopics.filter((s) => selected.includes(s)).length,
            0
          );

          return (
            <button
              key={unit}
              type="button"
              onClick={() => toggleUnit(unit)}
              className={cn(
                'relative flex items-center justify-between px-3 py-3 rounded-lg border text-[13px] font-medium transition-all duration-200 cursor-pointer select-none overflow-hidden',
                isActive
                  ? 'bg-primary/5 border-primary shadow-[0_2px_10px_-4px_rgba(var(--primary),0.3)] text-primary'
                  : 'bg-background border-border/50 text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-muted/10 hover:shadow-sm'
              )}
            >
              <span className="relative z-10">{unit}</span>
              {selectedCount > 0 && (
                <Badge
                  variant={isActive ? 'default' : 'secondary'}
                  className={cn(
                    'text-[10px] relative z-10',
                    isActive ? 'bg-primary text-primary-foreground' : ''
                  )}
                >
                  {selectedCount}/{totalSubs}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {visibleGroups.map((group) => {
        const isGroupOpen = openGroups.has(group.groupId);
        return (
          <div key={group.groupId} className="space-y-1">
            <button
              type="button"
              onClick={() => toggleGroup(group.groupId)}
              className="flex w-full items-center justify-between px-2 py-1.5 text-[12px] font-medium text-foreground/80 hover:text-foreground"
            >
              <span>{group.aos}</span>
              <span className="text-muted-foreground/50">
                {group.subtopics.filter((s) => selected.includes(s)).length}/
                {group.subtopics.length}
              </span>
            </button>
            {isGroupOpen && (
              <div className="grid grid-cols-2 gap-1.5 pl-1">
                {group.subtopics.map((subtopic) => {
                  const isSelected = selected.includes(subtopic);
                  return (
                    <button
                      key={subtopic}
                      type="button"
                      onClick={() => onToggle(subtopic)}
                      className={cn(
                        'px-2 py-1.5 rounded text-[11px] font-medium transition-all cursor-pointer text-left',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                      )}
                    >
                      {subtopic}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
