import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { Plus } from 'lucide-react';
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

    const resizeObserver = new ResizeObserver(() => updateHeight());
    resizeObserver.observe(measured);
    updateHeight();

    return () => resizeObserver.disconnect();
  }, []);

  return (
    <AccordionPrimitive.Content
      ref={contentRef}
      data-slot="accordion-content"
      className="overflow-hidden text-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    >
      <div
        ref={wrapperRef}
        className={cn(
          'h-(--radix-accordion-content-height) transition-[height] duration-300 ease-in-out pb-4',
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
    <div className="flex items-center gap-3 py-2">
      <p className="text-xs font-bold text-primary tracking-[0.2em] uppercase">
        {children}
      </p>
      <div className="h-px flex-1 bg-border/50 rounded-full" />
    </div>
  );
}

export function SectionDivider() {
  return <div className="h-6 w-full" />;
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

  const toggleSelectAllInUnit = (unit: string) => {
    const unitGroups = groups.filter((g) => g.unit === unit);
    const allSubtopics = unitGroups.flatMap((g) => g.subtopics);

    const toSelect = allSubtopics.filter((s) => !selected.includes(s));
    if (toSelect.length > 0) {
      toSelect.forEach((s) => onToggle(s));
      return;
    }

    const toDeselect = allSubtopics.filter((s) => selected.includes(s));
    toDeselect.forEach((s) => onToggle(s));
  };

  const toggleSelectAllInGroup = (group: TopicSubtopicGroup) => {
    const toSelect = group.subtopics.filter((s) => !selected.includes(s));
    if (toSelect.length > 0) {
      toSelect.forEach((s) => onToggle(s));
      return;
    }

    const toDeselect = group.subtopics.filter((s) => selected.includes(s));
    toDeselect.forEach((s) => onToggle(s));
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
    [groups]
  );

  const visibleGroups = useMemo(
    () => groups.filter((group) => selectedUnits.has(group.unit)),
    [groups, selectedUnits]
  );

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col gap-3">
        <div className="flex items-end justify-between px-1">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {label}
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 p-1.5 bg-muted/30 rounded-2xl border border-border/40">
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

            const progressPercentage =
              totalSubs > 0 ? (selectedCount / totalSubs) * 100 : 0;

            return (
              <button
                key={unit}
                type="button"
                onClick={() => toggleUnit(unit)}
                className={cn(
                  'relative flex-1 min-w-[120px] flex flex-col items-start gap-1.5 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 overflow-hidden',
                  isActive
                    ? 'bg-background shadow-sm border border-border/60 text-foreground ring-1 ring-primary/10'
                    : 'bg-transparent border border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2 z-10">
                    <span className="font-semibold">{unit}</span>
                    <span
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        toggleSelectAllInUnit(unit);
                      }}
                      className="cursor-pointer text-[11px] font-medium text-muted-foreground px-2 py-0.5 rounded-md hover:bg-muted/20"
                    >
                      <Plus className="w-3 h-3" />
                    </span>
                  </div>
                  {selectedCount > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-primary/10 text-primary z-10">
                      {selectedCount}/{totalSubs}
                    </span>
                  )}
                </div>

                <div className="w-full h-1 bg-muted/50 rounded-full overflow-hidden z-10">
                  <div
                    className="h-full bg-primary transition-all duration-500 ease-out"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {visibleGroups.length > 0 && (
        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {visibleGroups.map((group) => {
            const selectedCount = group.subtopics.filter((s) =>
              selected.includes(s)
            ).length;
            const allSelected = selectedCount === group.subtopics.length;

            return (
              <div
                key={group.groupId}
                className={cn(
                  'flex flex-col gap-3 p-4 rounded-2xl border transition-all duration-300',
                  allSelected
                    ? 'bg-primary/5 border-primary/20'
                    : 'bg-card border-border/40 shadow-sm hover:border-border'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={cn(
                        'w-2 h-2 rounded-full',
                        allSelected
                          ? 'bg-primary shadow-[0_0_8px_rgba(var(--primary),0.6)]'
                          : 'bg-muted-foreground/30'
                      )}
                    />
                    <h4 className="text-xs font-bold text-foreground/80 uppercase tracking-wide">
                      {group.aos}
                    </h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelectAllInGroup(group);
                      }}
                      className="text-[11px] font-medium text-muted-foreground hover:text-foreground px-2 py-0.5 rounded-md"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <Badge
                      variant="outline"
                      className="text-[10px] px-2 py-0 h-5 font-semibold bg-background/50"
                    >
                      {selectedCount} selected
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {group.subtopics.map((subtopic) => {
                    const isSelected = selected.includes(subtopic);
                    return (
                      <button
                        key={subtopic}
                        type="button"
                        onClick={() => onToggle(subtopic)}
                        className={cn(
                          'inline-flex items-center justify-center px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all duration-200 border',
                          isSelected
                            ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20 hover:bg-primary/90'
                            : 'bg-background text-muted-foreground border-border/60 hover:border-primary/40 hover:bg-muted/30 hover:text-foreground'
                        )}
                      >
                        {subtopic}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
