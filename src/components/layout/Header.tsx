import { AnimatePresence, motion } from 'framer-motion';
import {
  Bookmark,
  ChartColumnIncreasing,
  CircleX,
  Cloud,
  FileText,
  Flame,
  History,
  type LucideIcon,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';

import { useFirebaseSyncContext } from '@/context/FirebaseSyncContext';
import { SPRING } from '@/lib/motion';
import { cn, getTodayKey } from '@/lib/utils';
import { useAppStore } from '@/store';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';

function GoalProgressBar({
  label,
  current,
  goal,
  color,
  ringColor,
}: {
  label: string;
  current: number;
  goal: number;
  color: string;
  ringColor: string;
}) {
  const pct = Math.min(100, (current / goal) * 100);
  const complete = current >= goal;
  return (
    <div className='flex items-center gap-3'>
      <div className='flex items-center gap-1.5 w-28 shrink-0'>
        <div
          className='h-2 w-2 rounded-full shrink-0'
          style={{ backgroundColor: ringColor }}
        />
        <span className='text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate'>
          {label}
        </span>
      </div>
      <div className='flex-1 h-1.5 bg-muted/20 rounded-full overflow-hidden'>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: [0.34, 1.56, 0.64, 1] }}
          className={cn(
            'h-full rounded-full',
            color,
            complete && 'brightness-110',
          )}
        />
      </div>
      <div className='flex items-baseline gap-0.5 w-12 justify-end shrink-0'>
        <span className='text-[12px] font-bold tabular-nums'>{current}</span>
        <span className='text-[10px] text-muted-foreground/50 tabular-nums'>
          /{goal}
        </span>
      </div>
    </div>
  );
}

function ConcentricRings({
  goals,
}: {
  goals: { current: number; goal: number; color: string; label: string }[];
}) {
  const activeGoals = goals.filter((g) => g.goal > 0);
  if (activeGoals.length === 0) return null;
  const size = 28,
    cx = size / 2,
    cy = size / 2;
  const strokeWidth = 3,
    gap = 1.5;
  const maxRadius = cx - strokeWidth / 2;
  const ringSpacing = strokeWidth + gap;
  return (
    <div className='flex items-center'>
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

function GoalsPopover({
  goalItems,
  allGoalsMet,
}: {
  goalItems: {
    label: string;
    current: number;
    goal: number;
    color: string;
    ringColor: string;
  }[];
  todayCompletions: { total: number; written: number; mc: number };
  completedGoalCount: number;
  goalCount: number;
  allGoalsMet: boolean;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };

  const handleMouseLeave = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <div
      className='relative'
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type='button'
        onClick={() => setOpen((v) => !v)}
        className='flex items-center gap-1 rounded-full px-1 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
      >
        <ConcentricRings
          goals={goalItems.map((goal) => ({
            label: goal.label,
            current: goal.current,
            goal: goal.goal,
            color: goal.ringColor,
          }))}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: 'top right' }}
            className='absolute right-0 top-[calc(100%+10px)] z-50 w-72 overflow-hidden rounded-2xl border border-border/60 bg-popover/95 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.5)] backdrop-blur-xl'
          >
            <div className='relative space-y-4'>
              {/* Progress bars */}
              {goalItems.some((g) => g.goal > 0) && (
                <div className='rounded-xl border border-border/40 bg-background/40 px-3 py-3 space-y-3'>
                  {goalItems.map((goal) =>
                    goal.goal > 0 ? (
                      <GoalProgressBar
                        key={goal.label}
                        label={goal.label}
                        current={goal.current}
                        goal={goal.goal}
                        color={goal.color}
                        ringColor={goal.ringColor}
                      />
                    ) : null,
                  )}
                </div>
              )}

              {/* All goals met banner */}
              {allGoalsMet && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className='rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-2.5 text-center m-1'
                >
                  <p className='text-[11px] font-semibold text-emerald-400'>
                    🎉 All goals complete — keep the streak alive!
                  </p>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Header() {
  const { isSyncEnabled, syncStatus } = useFirebaseSyncContext();
  const streakData = useAppStore((s) => s.streakData);
  const studyGoals = useAppStore((s) => s.studyGoals);
  const hasActiveSession = useAppStore(
    (s) => s.questions.length > 0 || s.mcQuestions.length > 0,
  );

  const todayCompletions = useMemo(() => {
    const today = getTodayKey();
    return (
      streakData.dailyCompletions[today] ?? { total: 0, written: 0, mc: 0 }
    );
  }, [streakData.dailyCompletions]);

  const goalItems = useMemo(
    () => [
      {
        label: 'Overall',
        current: todayCompletions.total,
        goal: studyGoals.dailyQuestionGoal,
        color: 'bg-emerald-500',
        ringColor: 'oklch(69.6% 0.17 162.48)',
      },
      {
        label: 'MC',
        current: todayCompletions.mc,
        goal: studyGoals.dailyMcGoal,
        color: 'bg-violet-500',
        ringColor: 'oklch(60.6% 0.25 292.717)',
      },
      {
        label: 'Written',
        current: todayCompletions.written,
        goal: studyGoals.dailyWrittenGoal,
        color: 'bg-sky-500',
        ringColor: 'oklch(68.5% 0.169 237.323)',
      },
    ],
    [
      studyGoals.dailyMcGoal,
      studyGoals.dailyQuestionGoal,
      studyGoals.dailyWrittenGoal,
      todayCompletions,
    ],
  );

  const activeGoalItems = goalItems.filter((goal) => goal.goal > 0);
  const completedGoalCount = activeGoalItems.filter(
    (goal) => goal.current >= goal.goal,
  ).length;
  const goalCount = activeGoalItems.length;

  const isSyncing = syncStatus === 'syncing' || syncStatus === 'connecting';

  const allGoalsMet = useMemo(() => {
    return goalCount > 0 && completedGoalCount === goalCount;
  }, [completedGoalCount, goalCount]);

  const renderLink = useCallback(
    (link: {
      to: string;
      label: string;
      icon: LucideIcon;
      showSessionDot?: boolean;
    }) => (
      <NavLink
        key={link.to}
        to={link.to}
        className={({ isActive }) =>
          cn(
            'flex items-center h-9 px-3 rounded-lg transition-colors duration-150 relative group',
            isActive
              ? 'bg-primary/10 text-primary shadow-sm'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
          )
        }
      >
        <div className='flex items-center justify-center'>
          <link.icon className='h-4 w-4 shrink-0 transition-transform duration-150 group-hover:scale-105' />
          {link.showSessionDot && hasActiveSession && (
            <span className='absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary' />
          )}
        </div>
        <span className='ml-2 text-sm font-medium whitespace-nowrap'>
          {link.label}
        </span>
      </NavLink>
    ),
    [hasActiveSession],
  );

  const navLinks = [
    { to: '/', label: 'Generator', icon: Sparkles, showSessionDot: true },
    { to: '/pdf-marker', label: 'PDF Marker', icon: FileText },
    { to: '/history', label: 'History', icon: History },
    { to: '/analytics', label: 'Analytics', icon: ChartColumnIncreasing },
    { to: '/mistakes', label: 'Mistakes', icon: CircleX },
    { to: '/saved', label: 'Saved', icon: Bookmark },
  ];

  const isAndroid =
    typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

  return (
    <motion.header
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={SPRING}
      className={`flex items-center justify-between h-14 px-4 bg-background/80 backdrop-blur-md w-full z-50 ${isAndroid ? 'mt-8' : ''} mb-1`}
    >
      {/* Left: Navigation */}
      <nav className='flex items-center gap-1 no-scrollbar'>
        {navLinks.map(renderLink)}
      </nav>

      {/* Right: Stats + Settings */}
      <div className='flex items-center gap-3'>
        <TooltipProvider>
          {/* Sync Indicator */}
          {isSyncEnabled && (
            <div className='flex items-center'>
              {isSyncing ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <motion.div
                      animate={{ opacity: [1, 0.4, 1] }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                      className='text-emerald-500'
                      title='Syncing...'
                    >
                      <Cloud className='h-4 w-4' />
                    </motion.div>
                  </TooltipTrigger>
                  <TooltipContent side='bottom'>Syncing...</TooltipContent>
                </Tooltip>
              ) : (
                <div
                  className='text-emerald-500/80'
                  title='Synced to Firestore'
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Cloud className='h-4 w-4' />
                    </TooltipTrigger>
                    <TooltipContent side='bottom'>
                      Synced to Firestore
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}
            </div>
          )}
        </TooltipProvider>

        {/* Goals — custom hover+click popover */}
        {todayCompletions.total > 0 && (
          <GoalsPopover
            goalItems={goalItems}
            todayCompletions={todayCompletions}
            completedGoalCount={completedGoalCount}
            goalCount={goalCount}
            allGoalsMet={allGoalsMet}
          />
        )}

        {/* Streak */}
        {streakData.currentStreak > 0 && (
          <div className='flex items-center gap-2 px-3 py-1.5 rounded-xl bg-orange-500/5 border border-orange-500/10'>
            <Flame className='h-4 w-4 text-orange-400 animate-pulse shrink-0' />
            <span className='text-xs font-bold text-orange-400 tabular-nums'>
              {streakData.currentStreak}
            </span>
          </div>
        )}

        {/* Settings */}
        <NavLink
          to='/settings'
          className={({ isActive }) =>
            cn(
              'flex items-center h-9 px-3 rounded-lg transition-colors duration-150',
              isActive
                ? 'bg-primary/10 text-primary shadow-sm'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
            )
          }
        >
          <Settings className='h-4 w-4' />
        </NavLink>
      </div>
    </motion.header>
  );
}
