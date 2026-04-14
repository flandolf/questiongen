import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

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
  // Defaults and persistence
  const STORAGE_KEY = `question-split-${mode}`;
  const DEFAULT_LEFT_PCT = 40; // Question 40% / Sketchpad 60%
  const MIN_PCT = 25;
  const MAX_PCT = 75;

  const clamp = (v: number) => Math.max(MIN_PCT, Math.min(MAX_PCT, v));

  const [leftPct, setLeftPct] = useState<number>(() => {
    try {
      if (typeof window === 'undefined') return DEFAULT_LEFT_PCT;
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (!v) return DEFAULT_LEFT_PCT;
      const n = Number(v);
      return Number.isFinite(n) ? clamp(n) : DEFAULT_LEFT_PCT;
    } catch {
      return DEFAULT_LEFT_PCT;
    }
  });

  // Refs for drag handling
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(leftPct));
    } catch {
      // ignore
    }
  }, [leftPct, STORAGE_KEY]);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = clamp((x / rect.width) * 100);
      setLeftPct(pct);
    },
    [setLeftPct],
  );

  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
    setIsDragging(false);
    try {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    } catch {
      // ignore
    }
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }, [onPointerMove]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!containerRef.current) return;
      draggingRef.current = true;
      setIsDragging(true);
      try {
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      } catch {
        // ignore
      }
      // start listening at window level
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      // immediate update
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      setLeftPct(clamp((x / rect.width) * 100));
      // capture pointer to the target element so we get all events
      try {
        (e.target as Element).setPointerCapture?.(e.pointerId);
      } catch {
        // ignore
      }
    },
    [onPointerMove, onPointerUp],
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    let consumed = false;
    if (e.key === 'ArrowLeft') {
      setLeftPct((p) => clamp(p - 2));
      consumed = true;
    } else if (e.key === 'ArrowRight') {
      setLeftPct((p) => clamp(p + 2));
      consumed = true;
    } else if (e.key === 'PageDown') {
      setLeftPct((p) => clamp(p + 10));
      consumed = true;
    } else if (e.key === 'PageUp') {
      setLeftPct((p) => clamp(p - 10));
      consumed = true;
    } else if (e.key === 'Home') {
      setLeftPct(MIN_PCT);
      consumed = true;
    } else if (e.key === 'End') {
      setLeftPct(MAX_PCT);
      consumed = true;
    }
    if (consumed) e.preventDefault();
  }, []);

  // Responsive rendering: on small screens, fall back to stacked columns
  return (
    <div className={cn('pb-10', className)}>
      {/* Large screens: three-column flex layout with draggable handle */}
      <div
        ref={containerRef}
        className={cn(
          'hidden lg:flex w-full lg:gap-8 stagger-reveal',
          sketchpadActive ? '' : '',
        )}
        style={{ alignItems: 'stretch' }}
      >
        <motion.div
          className='min-w-0 space-y-5'
          // animate width changes for snappier feel; disable transition while dragging
          animate={{ width: `${leftPct}%` }}
          transition={
            isDragging
              ? { duration: 0 }
              : { type: 'spring', stiffness: 1200, damping: 70 }
          }
        >
          {leftSlot}
        </motion.div>

        {sketchpadActive ? (
          <div
            role='separator'
            aria-orientation='vertical'
            aria-label='Resize question and sketchpad'
            aria-valuemin={MIN_PCT}
            aria-valuemax={MAX_PCT}
            aria-valuenow={Math.round(leftPct)}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onPointerDown={handlePointerDown}
            className='flex items-center justify-center px-1'
            style={{ cursor: 'col-resize', touchAction: 'none' }}
          >
            <motion.div
              className='h-10 w-1 rounded-full bg-border/40 hover:bg-border transition-colors'
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 600, damping: 40 }}
            />
          </div>
        ) : (
          // When sketchpad is not active, render a small spacer
          <div className='w-0.5' />
        )}

        <div className='min-w-0 flex-1 space-y-5'>{rightSlot}</div>
      </div>

      {/* Small screens: stacked layout (original behaviour) */}
      <div className='grid grid-cols-1 lg:hidden gap-8 stagger-reveal'>
        {leftSlot}
        {rightSlot}
      </div>
    </div>
  );
}
