import {
  BookmarkIcon,
  ChartColumnIncreasingIcon,
  CircleXIcon,
  CloudIcon,
  FileTextIcon,
  HistoryIcon,
  type LucideIcon,
  MenuIcon,
  SettingsIcon,
  SparklesIcon,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useFirebaseSyncContext } from '@/context/FirebaseSyncContext';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store';

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  showSessionDot?: boolean;
};

const PRIMARY_NAV: readonly NavItem[] = [
  { to: '/', label: 'Generate', icon: SparklesIcon, showSessionDot: true },
  { to: '/pdf-marker', label: 'PDF', icon: FileTextIcon },
  { to: '/history', label: 'History', icon: HistoryIcon },
  { to: '/analytics', label: 'Stats', icon: ChartColumnIncreasingIcon },
];

const MORE_NAV: readonly NavItem[] = [
  { to: '/mistakes', label: 'Mistakes', icon: CircleXIcon },
  { to: '/saved', label: 'Saved', icon: BookmarkIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function MobileNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const { isSyncEnabled, syncStatus } = useFirebaseSyncContext();
  const hasActiveSession = useAppStore(
    (s) => s.questions.length > 0 || s.mcQuestions.length > 0,
  );

  const isSyncing = syncStatus === 'syncing' || syncStatus === 'connecting';
  const isMoreActive = MORE_NAV.some((item) =>
    location.pathname.startsWith(item.to),
  );

  return (
    <>
      <nav
        className='flex h-14 shrink-0 items-center justify-around border-t bg-background'
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {PRIMARY_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'relative flex h-full flex-1 flex-col items-center justify-center gap-0.5 text-muted-foreground transition-colors hover:text-foreground',
                isActive && 'text-primary',
              )
            }
          >
            <span className='relative'>
              <item.icon />
              {item.showSessionDot && hasActiveSession && (
                <span className='absolute -right-1.5 -top-0.5 size-2 rounded-full border border-background bg-primary' />
              )}
            </span>
            <span className='text-[10px] font-medium'>{item.label}</span>
          </NavLink>
        ))}

        <Button
          type='button'
          variant='ghost'
          aria-expanded={moreOpen}
          aria-haspopup='dialog'
          onClick={() => setMoreOpen(true)}
          className={cn(
            'h-full flex-1 flex-col gap-0.5 rounded-none',
            isMoreActive
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <MenuIcon />
          <span className='text-[10px] font-medium'>More</span>
        </Button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side='bottom' className='px-3 pb-6'>
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <div className='flex flex-col gap-1'>
            {MORE_NAV.map((item) => (
              <Button
                key={item.to}
                asChild
                variant={
                  location.pathname.startsWith(item.to) ? 'secondary' : 'ghost'
                }
                className='h-11 justify-start'
              >
                <NavLink to={item.to} onClick={() => setMoreOpen(false)}>
                  <item.icon data-icon='inline-start' />
                  {item.label}
                </NavLink>
              </Button>
            ))}

            {isSyncEnabled && (
              <div className='flex h-11 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground'>
                <CloudIcon className={cn(isSyncing && 'animate-pulse')} />
                <span>{isSyncing ? 'Syncing...' : 'Synced to Firestore'}</span>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
