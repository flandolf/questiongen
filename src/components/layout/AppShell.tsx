import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';

import { isEditableTarget, isMetaCommand } from '@/lib/keyboard-targets';
import { useAppStore } from '@/store';
import { applyDesignTheme } from '@/themes/designThemes';

import { CommandPalette } from './CommandPalette';
import { KeyboardShortcutsOverlay } from './KeyboardShortcutsOverlay';
import { MobileNav } from './MobileNav';
import { Sidebar } from './Sidebar';
import Titlebar from './Titlebar';

/**
 * AppShell — Notion-like layout shell.
 *
 * Desktop: collapsible left sidebar + scrollable main content area.
 * Mobile: full-width main content + bottom tab navigation.
 *
 * Hosts the global command palette (Cmd/Ctrl+K).
 *
 * Design tokens are consumed through Tailwind aliases:
 *  - bg-background  → var(--surface-primary)
 *  - text-foreground → var(--text-primary)
 *  - border-border  → var(--border-subtle)
 */
export function AppShell() {
  const [isAndroid, setIsAndroid] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setIsAndroid(/Android/i.test(navigator.userAgent));
    }
  }, []);

  useEffect(() => {
    void applyDesignTheme(theme);
  }, [theme]);

  const closeCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(false);
  }, []);

  // Global keyboard shortcut: Cmd/Ctrl+K toggles the command palette.
  // Skip when user is typing into an input or contenteditable region.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isMetaCommand(e)) return;
      if (e.key !== 'k' && e.key !== 'K') return;
      e.preventDefault();
      if (isEditableTarget(e.target)) return;
      setIsCommandPaletteOpen((prev) => !prev);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className='flex flex-col h-dvh bg-background text-foreground overflow-hidden'>
      {/* Tauri custom titlebar — desktop only */}
      {!isAndroid && <Titlebar />}

      {/* Main layout row: sidebar (desktop) + content */}
      <div className='flex flex-1 min-h-0'>
        {/* Desktop sidebar — hidden on mobile */}
        <div className='hidden md:flex h-full shrink-0'>
          <Sidebar />
        </div>

        {/* Main content area */}
        <main className='flex-1 overflow-y-auto min-w-0 min-h-0 md:border-l border-border/40'>
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom navigation — hidden on desktop */}
      <div className='md:hidden'>
        <MobileNav />
      </div>

      <CommandPalette open={isCommandPaletteOpen} onClose={closeCommandPalette} />
      <KeyboardShortcutsOverlay />
    </div>
  );
}
