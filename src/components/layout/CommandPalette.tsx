/*
 * CommandPalette — global Cmd/Ctrl+K palette (Notion-style).
 *
 * Fire-and-forget convention: when an action body calls a Promise-returning
 * function (e.g. `setTheme`, `navigate`), wrap the call with `void` either
 * inside the action body or at the executor's call site. This keeps the
 * palette fully lint-clean under `@typescript-eslint/no-floating-promises`
 * without per-line disables.
 */

import { AnimatePresence, motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import {
  Bookmark,
  ChartColumnIncreasing,
  ChevronRight,
  CircleX,
  Command as CommandIcon,
  FileText,
  History,
  Moon,
  Search,
  Settings,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { cn } from '@/lib/utils';
import { useAppStore } from '@/store';

type CommandItemAction = () => void;

type CommandItem = {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  shortcut?: string;
  to?: string;
  /**
   * Optional custom action. Strictly typed as `() => void` to avoid
   * Promise-union negotiations with the executor. Future async helpers
   * (like `setTheme`) are wrapped with `void` at the call site — see the
   * palette's file-level comment on the fire-and-forget convention.
   */
  action?: CommandItemAction;
  keywords?: string[];
};

type CommandGroup = {
  heading: string;
  items: CommandItem[];
};

const NAVIGATION_LINKS: {
  to: string;
  label: string;
  icon: LucideIcon;
  keywords: string[];
}[] = [
  { to: '/', label: 'Generator', icon: Sparkles, keywords: ['create', 'new', 'practice'] },
  { to: '/pdf-marker', label: 'PDF Marker', icon: FileText, keywords: ['exam', 'upload'] },
  { to: '/history', label: 'History', icon: History, keywords: ['past', 'log', 'sessions'] },
  { to: '/analytics', label: 'Analytics', icon: ChartColumnIncreasing, keywords: ['stats', 'insights'] },
  { to: '/mistakes', label: 'Mistakes', icon: CircleX, keywords: ['wrong', 'study queue'] },
  { to: '/saved', label: 'Saved', icon: Bookmark, keywords: ['bank', 'questions'] },
  { to: '/settings', label: 'Settings', icon: Settings, keywords: ['preferences'] },
];

function matchItem(item: CommandItem, query: string): boolean {
  if (!query) return true;
  const haystack = [item.label, item.description, ...(item.keywords ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // ────────────────────────────────────────────────────────────────
  // Lifecycle
  // ────────────────────────────────────────────────────────────────

  // Capture the element that had focus before the palette opened, so we can
  // restore it when the user dismisses the palette.
  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      // Use rAF so the dialog has mounted before we steal focus.
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    const previouslyFocused = previouslyFocusedRef.current;
    previouslyFocusedRef.current = null;
    // Allow exit animation to start before returning focus.
    const id = window.setTimeout(() => {
      previouslyFocused?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  // Lock body scroll while open — preserve scroll position AND compensate
  // for the scrollbar width so the page doesn't jump right on Chromium.
  useEffect(() => {
    if (!open) return undefined;
    const scrollY = window.scrollY;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  // Reset filter input each time the palette opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  // ────────────────────────────────────────────────────────────────
  // Command definitions
  // ────────────────────────────────────────────────────────────────

  const groups = useMemo<CommandGroup[]>(() => {
    const navigationItems: CommandItem[] = NAVIGATION_LINKS.map((link) => ({
      id: `nav:${link.to}`,
      label: link.label,
      icon: link.icon,
      to: link.to,
      keywords: link.keywords,
    }));      const themeItem: CommandItem = {
        id: 'action:toggle-theme',
        label:
          theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme',
        icon: theme === 'dark' ? Sun : Moon,
        description: `Currently: ${theme}`,
        // `setTheme` may be Promise-returning — discard result explicitly.
        action: () => {
          void setTheme(theme === 'dark' ? 'light' : 'dark');
        },
        keywords: ['appearance', 'mode'],
      };

    return [
      { heading: 'Navigate', items: navigationItems },
      { heading: 'Actions', items: [themeItem] },
    ];
  }, [theme, setTheme]);

  // Flat, pre-indexed results — lookup by id is O(1).
  const flatItems = useMemo(
    () =>
      groups
        .flatMap((group) => group.items)
        .filter((it) => matchItem(it, query)),
    [groups, query],
  );

  const flatIndexById = useMemo(() => {
    const map = new Map<string, number>();
    flatItems.forEach((item, index) => map.set(item.id, index));
    return map;
  }, [flatItems]);

  // Reset selection to first item whenever the visible result set changes.
  // Relies on `flatItems` being memoized upstream — if `useMemo` is
  // replaced with a non-stable reference, swap this for a deep-equality
  // check.
  const prevFlatItemsRef = useRef<CommandItem[]>(flatItems);
  useEffect(() => {
    if (prevFlatItemsRef.current !== flatItems) {
      prevFlatItemsRef.current = flatItems;
      setActiveIndex(0);
    }
  }, [flatItems]);

  // Scroll the active item into view inside the scrollable list.
  useEffect(() => {
    const items = listRef.current?.querySelectorAll<HTMLElement>(
      '[data-cmd-item]',
    );
    const active = items?.[activeIndex];
    if (active) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  // ────────────────────────────────────────────────────────────────
  // Interaction
  // ────────────────────────────────────────────────────────────────

  const executeItem = useCallback(
    (item: CommandItem) => {
      if (item.action) {
        item.action();
      } else if (item.to) {
        // React Router v7's navigate returns a Promise; ignore it for fire-and-forget UX.
        void navigate(item.to);
      }
      onClose();
    },
    [navigate, onClose],
  );

  // Focus trap: prevent Tab from leaving the palette while it's open.
  const onDialogKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [],
  );

  const onInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) =>
          flatItems.length === 0 ? 0 : Math.min(i + 1, flatItems.length - 1),
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        setActiveIndex(0);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        setActiveIndex(Math.max(flatItems.length - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const item = flatItems[activeIndex];
        if (item) executeItem(item);
      }
    },
    [flatItems, activeIndex, executeItem, onClose],
  );

  const onQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
    },
    [],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className='fixed inset-0 z-[200] flex items-start justify-center pt-[12vh] px-4'
          role='presentation'
        >
          {/* Backdrop — clickable to dismiss. `aria-hidden` would prevent keyboard
              users from activating it via the focus trap; instead we keep it
              in the accessibility tree with a clear label. */}
          <button
            type='button'
            tabIndex={-1}
            aria-label='Close command palette'
            onClick={onClose}
            className='absolute inset-0 bg-[var(--surface-overlay)] backdrop-blur-sm border-0 p-0 m-0'
          />

          {/* Palette */}
          <motion.div
            ref={dialogRef}
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            role='dialog'
            aria-modal='true'
            aria-label='Command palette'
            onKeyDown={onDialogKeyDown}
            className='relative w-full max-w-[640px] bg-[var(--surface-primary)] border border-[var(--border-subtle)] rounded-xl shadow-[var(--shadow-xl)] overflow-hidden'
          >
            {/* Search input */}
            <div className='flex items-center gap-3 px-4 h-14 border-b border-[var(--border-subtle)]'>
              <Search className='h-4 w-4 text-[var(--text-tertiary)] shrink-0' />
              <input
                ref={inputRef}
                value={query}
                onChange={onQueryChange}
                onKeyDown={onInputKeyDown}
                placeholder='Type a command or search…'
                className='flex-1 h-full bg-transparent outline-none text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] font-[var(--interface-font)]'
                autoComplete='off'
                autoCorrect='off'
                autoCapitalize='off'
                spellCheck={false}
                aria-label='Command search'
              />
              <button
                type='button'
                onClick={onClose}
                aria-label='Close command palette'
                className='p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors'
              >
                <X className='h-4 w-4' />
              </button>
            </div>

            {/* Results */}
            <div
              ref={listRef}
              role='listbox'
              aria-label='Commands'
              className='max-h-[60vh] overflow-y-auto py-2'
            >
              {flatItems.length === 0 && (
                <div className='px-4 py-12 text-center'>
                  <p className='text-sm text-[var(--text-tertiary)]'>
                    {query
                      ? `No results for "${query}"`
                      : 'Start typing to search…'}
                  </p>
                </div>
              )}

              {groups.map((group) => {
                const filtered = group.items.filter((it) =>
                  matchItem(it, query),
                );
                if (filtered.length === 0) return null;
                return (
                  <div key={group.heading} className='px-2 py-1'>
                    <p className='px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]'>
                      {group.heading}
                    </p>
                    {filtered.map((item) => {
                      const flatIndex = flatIndexById.get(item.id) ?? -1;
                      const isActive = flatIndex === activeIndex;
                      return (
                        <button
                          key={item.id}
                          type='button'
                          data-cmd-item
                          role='option'
                          aria-selected={isActive}
                          onClick={() => executeItem(item)}
                          onMouseEnter={() => setActiveIndex(flatIndex)}
                          className={cn(
                            'w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors',
                            isActive
                              ? 'bg-[var(--accent-subtle)] text-[var(--text-primary)]'
                              : 'text-[var(--text-secondary)]',
                          )}
                        >
                          <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-secondary)]'>
                            <item.icon className='h-3.5 w-3.5 text-[var(--text-secondary)]' />
                          </div>
                          <div className='flex-1 min-w-0'>
                            <p className='text-sm font-medium leading-tight'>
                              {item.label}
                            </p>
                            {item.description && (
                              <p className='text-xs text-[var(--text-tertiary)] truncate'>
                                {item.description}
                              </p>
                            )}
                          </div>
                          {item.shortcut && (
                            <span className='text-[10px] font-mono text-[var(--text-tertiary)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--surface-secondary)]'>
                              {item.shortcut}
                            </span>
                          )}
                          {isActive && (
                            <ChevronRight className='h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0' />
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className='flex items-center justify-between gap-3 px-4 h-10 border-t border-[var(--border-subtle)] bg-[var(--surface-secondary)] text-[10px] text-[var(--text-tertiary)]'>
              <div className='flex items-center gap-3'>
                <span className='flex items-center gap-1'>
                  <kbd className='px-1.5 py-0.5 rounded border border-[var(--border-subtle)] font-mono'>
                    ↑↓
                  </kbd>
                  Navigate
                </span>
                <span className='flex items-center gap-1'>
                  <kbd className='px-1.5 py-0.5 rounded border border-[var(--border-subtle)] font-mono'>
                    ↵
                  </kbd>
                  Select
                </span>
                <span className='flex items-center gap-1'>
                  <kbd className='px-1.5 py-0.5 rounded border border-[var(--border-subtle)] font-mono'>
                    esc
                  </kbd>
                  Close
                </span>
              </div>
              <span className='flex items-center gap-1 font-medium'>
                <CommandIcon className='h-3 w-3' />
                Command Palette
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
