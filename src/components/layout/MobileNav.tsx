import { AnimatePresence, motion } from 'framer-motion';
import {
  Bookmark,
  ChartColumnIncreasing,
  CircleX,
  Cloud,
  FileText,
  History,
  Menu,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import { useFirebaseSyncContext } from '@/context/FirebaseSyncContext';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store';

type NavItem = {
  to: string;
  label: string;
  icon: React.ElementType;
  showSessionDot?: boolean;
};

const PRIMARY_NAV: NavItem[] = [
  { to: '/', label: 'Generate', icon: Sparkles, showSessionDot: true },
  { to: '/pdf-marker', label: 'PDF', icon: FileText },
  { to: '/history', label: 'History', icon: History },
  { to: '/analytics', label: 'Stats', icon: ChartColumnIncreasing },
];

const MORE_NAV: NavItem[] = [
  { to: '/mistakes', label: 'Mistakes', icon: CircleX },
  { to: '/saved', label: 'Saved', icon: Bookmark },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function MobileNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const { isSyncEnabled, syncStatus } = useFirebaseSyncContext();
  const hasActiveSession = useAppStore(
    (s) => s.questions.length > 0 || s.mcQuestions.length > 0,
  );

  const isSyncing =
    syncStatus === 'syncing' || syncStatus === 'connecting';

  const isMoreActive = MORE_NAV.some((n) =>
    location.pathname.startsWith(n.to),
  );

  /* Close sheet on Escape */
  useEffect(() => {
    if (!moreOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMoreOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [moreOpen]);

  /* Focus close button when sheet opens */
  useEffect(() => {
    if (moreOpen) {
      closeButtonRef.current?.focus();
    }
  }, [moreOpen]);

  return (
    <>
      <nav
        className={cn(
          'flex items-center justify-around h-14 border-t shrink-0 z-40',
          'bg-background/95 backdrop-blur-md',
        )}
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {PRIMARY_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors duration-150',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )
            }
          >
            <div className='relative'>
              <item.icon className='h-5 w-5' />
              {item.showSessionDot && hasActiveSession && (
                <span className='absolute -top-0.5 -right-1.5 h-2 w-2 rounded-full bg-emerald-500 border border-background' />
              )}
            </div>
            <span className='text-[10px] font-medium'>{item.label}</span>
          </NavLink>
        ))}

        {/* More button */}
        <button
          type='button'
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          aria-haspopup='dialog'
          className={cn(
            'flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors duration-150',
            isMoreActive
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Menu className='h-5 w-5' />
          <span className='text-[10px] font-medium'>More</span>
        </button>
      </nav>

      {/* ─── More Menu Sheet ─── */}
      <AnimatePresence>
        {moreOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className='fixed inset-0 bg-black/40 z-50'
              onClick={() => setMoreOpen(false)}
            />

            {/* Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{
                type: 'spring',
                damping: 28,
                stiffness: 320,
              }}
              role='dialog'
              aria-modal='true'
              aria-label='More navigation'
              className='fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t bg-popover shadow-[0_-8px_40px_rgba(0,0,0,0.15)]'
              style={{
                paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
              }}
            >
              {/* Handle bar */}
              <div className='flex justify-center pt-3 pb-1'>
                <div className='w-10 h-1 rounded-full bg-muted-foreground/20' />
              </div>

              {/* Header */}
              <div className='flex items-center justify-between px-5 pb-3'>
                <span className='text-sm font-semibold text-foreground'>
                  More
                </span>
                <button
                  ref={closeButtonRef}
                  type='button'
                  onClick={() => setMoreOpen(false)}
                  className='p-1.5 rounded-lg hover:bg-muted transition-colors'
                >
                  <X className='h-4 w-4 text-muted-foreground' />
                </button>
              </div>

              {/* Nav items */}
              <div className='px-3 pb-2 space-y-0.5'>
                {MORE_NAV.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-3 py-3 rounded-xl transition-colors duration-150',
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-foreground hover:bg-muted/60',
                      )
                    }
                  >
                    <item.icon className='h-5 w-5 shrink-0' />
                    <span className='text-sm font-medium'>{item.label}</span>
                  </NavLink>
                ))}

                {/* Sync status (if enabled) */}
                {isSyncEnabled && (
                  <div className='flex items-center gap-3 px-3 py-3 rounded-xl text-muted-foreground'>
                    <Cloud
                      className={cn(
                        'h-5 w-5 shrink-0',
                        isSyncing
                          ? 'text-emerald-500 animate-pulse'
                          : 'text-emerald-500/80',
                      )}
                    />
                    <span className='text-sm font-medium'>
                      {isSyncing ? 'Syncing…' : 'Synced to Firestore'}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
