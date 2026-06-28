import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
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
    <TooltipProvider delayDuration={120}>
      <div className='app-shell flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground'>
        {!isAndroid && <Titlebar />}

        <SidebarProvider
          className='min-h-0 flex-1'
          style={
            {
              '--sidebar-top': isAndroid
                ? 'var(--android-status-bar-offset)'
                : '2.25rem',
            } as React.CSSProperties
          }
        >
          <Sidebar />

          <SidebarInset className='min-h-0 overflow-y-auto'>
            <Outlet />
          </SidebarInset>
        </SidebarProvider>

        <div className='md:hidden'>
          <MobileNav />
        </div>

        <CommandPalette
          open={isCommandPaletteOpen}
          onClose={closeCommandPalette}
        />
        <KeyboardShortcutsOverlay />
      </div>
    </TooltipProvider>
  );
}
