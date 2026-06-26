import { AnimatePresence, motion } from 'framer-motion';
import {
  Bookmark,
  ChartColumnIncreasing,
  ChevronRight,
  CircleX,
  Cloud,
  FileText,
  Flame,
  History,
  type LucideIcon,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useFirebaseSyncContext } from '@/context/FirebaseSyncContext';
import { EASE, SPRING } from '@/lib/motion';
import { cn, getTodayKey } from '@/lib/utils';
import { useAppStore } from '@/store';

// ─── GoalProgressBar ─────────────────────────────────────────────────────────
function GoalProgressBar({
  label,
  current,
  goal,
  color,
}: {
  label: string;
  current: number;
  goal: number;
  color: string;
}) {
  const pct = Math.min(100, (current / goal) * 100);
  const complete = current >= goal;
  return (
    <div className='space-y-1.5'>
      <div className='flex items-center justify-between px-0.5'>
        <p className='text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider'>
          {label}
        </p>
        <p className='text-[10px] font-bold tabular-nums opacity-80'>
          {current}/{goal}
        </p>
      </div>
      <div className='h-1.5 w-full bg-muted/20 rounded-full overflow-hidden'>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }} // slight overshoot
          className={cn(
            'h-full rounded-full',
            complete ? color : 'bg-primary/60',
          )}
        />
      </div>
    </div>
  );
}

// ─── ConcentricRings ─────────────────────────────────────────────────────────
function ConcentricRings({
  goals,
}: {
  goals: { current: number; goal: number; color: string; label: string }[];
}) {
  const activeGoals = goals.filter((g) => g.goal > 0);
  if (activeGoals.length === 0) return null;
  const size = 36,
    cx = size / 2,
    cy = size / 2;
  const strokeWidth = 3,
    gap = 1.5;
  const maxRadius = cx - strokeWidth / 2;
  const ringSpacing = strokeWidth + gap;
  return (
    <div className='flex flex-col items-center gap-1 py-1 w-full'>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className='overflow-visible'
      >
        {activeGoals.map((g, i) => {
          const r = maxRadius - i * ringSpacing;
          if (r <= 0) return null;
          const circumference = 2 * Math.PI * r;
          const dashoffset =
            circumference * (1 - Math.min(1, g.current / g.goal));
          return (
            <g key={g.label}>
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill='none'
                stroke='currentColor'
                className='text-muted/10'
                strokeWidth={strokeWidth}
              />
              <motion.circle
                cx={cx}
                cy={cy}
                r={r}
                fill='none'
                stroke={g.color}
                strokeWidth={strokeWidth}
                strokeLinecap='round'
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: dashoffset }}
                transition={{ duration: 0.8, ease: 'circOut', delay: i * 0.12 }}
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Shared types & nav contents ─────────────────────────────────────────────
type SidebarLink = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** When true, this link renders a small emerald dot when a session is active. */
  showSessionDot?: boolean;
};

const TOP_LINKS: readonly SidebarLink[] = [
  { to: '/', label: 'Generator', icon: Sparkles, showSessionDot: true },
  { to: '/pdf-marker', label: 'PDF Marker', icon: FileText },
  { to: '/history', label: 'History', icon: History },
  { to: '/analytics', label: 'Analytics', icon: ChartColumnIncreasing },
  { to: '/mistakes', label: 'Mistakes', icon: CircleX },
  { to: '/saved', label: 'Saved', icon: Bookmark },
];

const SETTINGS_LINK: SidebarLink = {
  to: '/settings',
  label: 'Settings',
  icon: Settings,
};

// ─── Single nav item: Tooltip wrapper is unconditional so the same
//     element shape is returned on every render — no remount on collapse,
//     no missing-key warning, and the label floats reliably via Radix Portal.
function SidebarNavLink({ link, collapsed }: { link: SidebarLink; collapsed: boolean }) {
  const hasActiveSession = useAppStore(
    (s) => s.questions.length > 0 || s.mcQuestions.length > 0,
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={link.to}
          className={({ isActive }) =>
            cn(
              `flex items-center ${collapsed ? 'justify-center' : 'justify-start'} h-10 px-3 rounded-lg transition-colors duration-150 relative group w-full outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background`,
              isActive
                ? 'bg-primary/10 text-primary shadow-sm'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
            )
          }
        >
          <div className='relative flex items-center justify-center min-w-6'>
            <link.icon className='h-5 w-5 shrink-0 transition-transform duration-150 group-hover:scale-105' />
            {link.showSessionDot && hasActiveSession && (
              <span className='absolute -top-0.5 -right-1 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-background' />
            )}
          </div>
          <AnimatePresence mode='wait' initial={false}>
            {!collapsed && (
              <motion.span
                key='label'
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4, transition: { duration: 0.1 } }}
                transition={{ ...EASE, delay: 0.06 }}
                className='ml-3 text-sm font-medium whitespace-nowrap overflow-hidden'
              >
                {link.label}
              </motion.span>
            )}
          </AnimatePresence>
        </NavLink>
      </TooltipTrigger>
      {collapsed && (
        <TooltipContent side='right' sideOffset={10}>
          {link.label}
        </TooltipContent>
      )}
    </Tooltip>
  );
}

// ─── Collapse toggle ─────────────────────────────────────────────────────────
function CollapseToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          type='button'
          onClick={onToggle}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          transition={SPRING}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className='p-1.5 rounded-md text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background hover:bg-muted/50'
        >
          <motion.div
            animate={{ rotate: collapsed ? 0 : 180 }}
            transition={SPRING}
          >
            <ChevronRight size={16} />
          </motion.div>
        </motion.button>
      </TooltipTrigger>
      <TooltipContent side='right' sideOffset={10}>
        {collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Sync indicator: chip when expanded, icon-only when collapsed ───────────
function SyncStatusIndicator({
  isEnabled,
  isSyncing,
  collapsed,
}: {
  isEnabled: boolean;
  isSyncing: boolean;
  collapsed: boolean;
}) {
  if (!isEnabled) return null;
  const statusLabel = isSyncing ? 'Syncing' : 'Synced to Firestore';
  const wrapperClass = cn(
    'w-full',
    collapsed ? 'px-2 pb-2 pt-3' : 'px-3 pb-2 pt-4',
  );
  if (collapsed) {
    return (
      <div className={wrapperClass}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type='button'
              aria-label={statusLabel}
              className={cn(
                'relative flex h-9 w-full items-center justify-center rounded-lg border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                isSyncing
                  ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-500'
                  : 'border-border/40 bg-muted/30 text-muted-foreground hover:text-foreground',
              )}
            >
              <Cloud className={cn('h-4 w-4', isSyncing && 'motion-safe:animate-pulse')} />
              {isSyncing && (
                <span className='absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-2 ring-background' />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side='right' sideOffset={10}>
            {isSyncing ? 'Syncing…' : 'Synced to Firestore'}
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }
  return (
    <div className={wrapperClass}>
      <div
        className={cn(
          'flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-colors',
          isSyncing
            ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-500'
            : 'bg-muted/30 border-border/40 text-muted-foreground',
        )}
      >
        <Cloud
          className={cn('h-4 w-4 shrink-0', isSyncing && 'motion-safe:animate-pulse')}
        />
        <span className='text-[11px] font-semibold'>
          {isSyncing ? 'Syncing…' : 'Synced'}
        </span>
      </div>
    </div>
  );
}

// ─── Streak badge: tile when collapsed (with accessible tooltip), row+label
//     when expanded. AnimatePresence on outer motion preserves the
//     original cross-fade between modes.
function StreakBadge({ streak, collapsed }: { streak: number; collapsed: boolean }) {
  const ariaLabel = `Current streak: ${streak} day${streak === 1 ? '' : 's'}`;
  return (
    <div
      className={cn(
        'flex items-center rounded-xl transition-all duration-300',
        collapsed
          ? 'justify-center'
          : 'gap-3 px-3 py-2.5 bg-orange-500/5 border border-orange-500/10',
      )}
    >
      <AnimatePresence mode='wait' initial={false}>
        {collapsed ? (
          <motion.div
            key='streak-collapsed'
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={SPRING}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type='button'
                  aria-label={ariaLabel}
                  className='relative flex flex-col items-center justify-center w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/25 shadow-[0_0_8px_rgba(249,115,22,0.15)]'
                >
                  <Flame className='h-4 w-4 text-orange-400 motion-safe:animate-pulse shrink-0' />
                  <span className='text-[10px] font-semibold leading-none text-orange-300 tabular-nums'>
                    {streak}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side='right' sideOffset={10}>
                {ariaLabel}
              </TooltipContent>
            </Tooltip>
          </motion.div>
        ) : (
          <motion.div
            key='streak-expanded'
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ ...EASE, delay: 0.08 }}
            className='relative flex items-center gap-2.5 px-3 py-2 rounded-xl overflow-hidden w-full'
          >
            <Flame className='shrink-0 h-5 w-5 text-orange-400 drop-shadow-[0_0_5px_rgba(251,146,60,0.9)] motion-safe:animate-pulse' />
            <div className='flex flex-col gap-0.5 min-w-0'>
              <span className='text-[11px] font-semibold text-orange-300/70 leading-none tracking-wide uppercase'>
                Current Streak
              </span>
              <span className='text-sm font-bold text-orange-400 leading-none tabular-nums'>
                {streak} days
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Goals block: rings when collapsed (with accessible tooltip), three bars
//     when expanded. AnimatePresence on outer motion preserves cross-fade.
function GoalsBlock({
  collapsed,
  studyGoals,
  todayCompletions,
}: {
  collapsed: boolean;
  studyGoals: {
    dailyQuestionGoal: number;
    dailyMcGoal: number;
    dailyWrittenGoal: number;
  };
  todayCompletions: { total: number; written: number; mc: number };
}) {
  const goalRows = [
    { name: 'Daily', current: todayCompletions.total, goal: studyGoals.dailyQuestionGoal },
    { name: 'MC', current: todayCompletions.mc, goal: studyGoals.dailyMcGoal },
    { name: 'Written', current: todayCompletions.written, goal: studyGoals.dailyWrittenGoal },
  ].filter((g) => g.goal > 0);

  const goalSummary =
    goalRows.length === 0
      ? 'No goals set'
      : goalRows.map((g) => `${g.name} ${g.current} / ${g.goal}`).join('  ·  ');

  if (goalRows.length === 0) return null;

  const ringsData = goalRows.map((g) => ({
    label: g.name,
    current: g.current,
    goal: g.goal,
    color:
      g.name === 'Daily'
        ? 'oklch(69.6% 0.17 162.48)'
        : g.name === 'MC'
          ? 'oklch(60.6% 0.25 292.717)'
          : 'oklch(68.5% 0.169 237.323)',
  }));

  return (
    <div className='px-1 pt-4'>
      <AnimatePresence mode='wait' initial={false}>
        {collapsed ? (
          <motion.div
            key='goals-collapsed'
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.12 } }}
            transition={{ ...EASE }}
            className='flex justify-center'
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type='button'
                  aria-label={goalSummary}
                  className='inline-flex'
                >
                  <ConcentricRings goals={ringsData} />
                </button>
              </TooltipTrigger>
              <TooltipContent side='right' sideOffset={10}>
                {goalSummary}
              </TooltipContent>
            </Tooltip>
          </motion.div>
        ) : (
          <motion.div
            key='goals-expanded'
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4, transition: { duration: 0.12 } }}
            className='space-y-4'
          >
            {studyGoals.dailyQuestionGoal > 0 && (
              <GoalProgressBar
                label='Overall'
                current={todayCompletions.total}
                goal={studyGoals.dailyQuestionGoal}
                color='bg-emerald-500'
              />
            )}
            {studyGoals.dailyMcGoal > 0 && (
              <GoalProgressBar
                label='Multiple Choice'
                current={todayCompletions.mc}
                goal={studyGoals.dailyMcGoal}
                color='bg-violet-500'
              />
            )}
            {studyGoals.dailyWrittenGoal > 0 && (
              <GoalProgressBar
                label='Written'
                current={todayCompletions.written}
                goal={studyGoals.dailyWrittenGoal}
                color='bg-sky-500'
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────
export function Sidebar() {
  const { isSyncEnabled, syncStatus } = useFirebaseSyncContext();
  const streakData = useAppStore((s) => s.streakData);
  const studyGoals = useAppStore((s) => s.studyGoals);

  const isSyncing = syncStatus === 'syncing' || syncStatus === 'connecting';

  const todayCompletions = useMemo(() => {
    const today = getTodayKey();
    return (
      streakData.dailyCompletions[today] ?? { total: 0, written: 0, mc: 0 }
    );
  }, [streakData.dailyCompletions]);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebarCollapsed') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(collapsed));
  }, [collapsed]);

  return (
    <TooltipProvider delayDuration={120}>
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 64 : 208 }}
        transition={SPRING}
        className='flex flex-col items-center h-full border-r border-border/50 bg-background/80 backdrop-blur-md relative overflow-hidden shrink-0'
      >
        {/* Header */}
        <div className='h-14 flex items-center justify-center px-3 mb-2 w-full'>
          <CollapseToggle
            collapsed={collapsed}
            onToggle={() => setCollapsed(!collapsed)}
          />
        </div>

        {/* Navigation */}
        <nav className='px-2 flex flex-col gap-1.5 no-scrollbar w-full'>
          {TOP_LINKS.map((link) => (
            <SidebarNavLink key={link.to} link={link} collapsed={collapsed} />
          ))}
        </nav>

        {/* Footer / Stats */}
        <div className='mt-auto px-3 pb-6 w-full'>
          <div
            className={cn(
              'pt-4 border-t border-border/40',
              collapsed ? 'space-y-1' : 'space-y-4',
            )}
          >
            {streakData.currentStreak > 0 && (
              <StreakBadge
                streak={streakData.currentStreak}
                collapsed={collapsed}
              />
            )}
            <GoalsBlock
              collapsed={collapsed}
              studyGoals={studyGoals}
              todayCompletions={todayCompletions}
            />
          </div>

          <SyncStatusIndicator
            isEnabled={isSyncEnabled}
            isSyncing={isSyncing}
            collapsed={collapsed}
          />

          <div className='w-full pb-4'>
            <SidebarNavLink link={SETTINGS_LINK} collapsed={collapsed} />
          </div>
        </div>
      </motion.aside>
    </TooltipProvider>
  );
}
