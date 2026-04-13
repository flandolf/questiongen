import { motion } from 'framer-motion';
import {
  Bookmark,
  ChartColumnIncreasing,
  CircleX,
  Cloud,
  Flame,
  History,
  type LucideIcon,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { NavLink } from 'react-router-dom';

import { useFirebaseSyncContext } from '@/context/FirebaseSyncContext';
import { cn, getTodayKey } from '@/lib/utils';
import { useAppStore } from '@/store';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';

const SPRING = { type: 'spring' as const, stiffness: 280, damping: 26 };

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
    <div className='space-y-2 flex-1 min-w-48'>
      <div className='flex items-center justify-between px-0.5'>
        <div className='flex items-center gap-1.5'>
          <div className={cn('h-1.5 w-1.5 rounded-full', color)} />
          <p className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
            {label}
          </p>
        </div>
        <div className='flex items-baseline gap-1'>
          <span className='text-[11px] font-bold tabular-nums'>{current}</span>
          <span className='text-[9px] font-medium text-muted-foreground opacity-60'>
            / {goal}
          </span>
        </div>
      </div>
      <div className='h-2 w-full bg-muted/10 rounded-full overflow-hidden relative group'>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: [0.34, 1.56, 0.64, 1] }}
          className={cn(
            'h-full rounded-full relative transition-all duration-500',
            color,
            complete && 'brightness-110 shadow-[0_0_8px_currentColor]',
          )}
        >
          <div className='absolute inset-0 bg-white/10' />
        </motion.div>
      </div>
      <div className='flex justify-end px-0.5'>
        <p className='text-[9px] font-bold text-muted-foreground/60 tabular-nums'>
          {Math.round(pct)}%
        </p>
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

  const isSyncing = syncStatus === 'syncing' || syncStatus === 'connecting';

  const allGoalsMet = useMemo(() => {
    const goals = [
      { current: todayCompletions.total, goal: studyGoals.dailyQuestionGoal },
      { current: todayCompletions.mc, goal: studyGoals.dailyMcGoal },
      { current: todayCompletions.written, goal: studyGoals.dailyWrittenGoal },
    ].filter((g) => g.goal > 0);
    return goals.length > 0 && goals.every((g) => g.current >= g.goal);
  }, [todayCompletions, studyGoals]);

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
            <span className='absolute top-1.5 left-6 w-1.5 h-1.5 rounded-full bg-emerald-500' />
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

          {/* Goals */}

          {todayCompletions.total > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className='flex items-center gap-1 text-sm font-medium text-muted-foreground cursor-pointer'>
                  <ConcentricRings
                    goals={[
                      {
                        label: 'Daily',
                        current: todayCompletions.total,
                        goal: studyGoals.dailyQuestionGoal,
                        color: 'oklch(69.6% 0.17 162.48)',
                      },
                      {
                        label: 'MC',
                        current: todayCompletions.mc,
                        goal: studyGoals.dailyMcGoal,
                        color: 'oklch(60.6% 0.25 292.717)',
                      },
                      {
                        label: 'Written',
                        current: todayCompletions.written,
                        goal: studyGoals.dailyWrittenGoal,
                        color: 'oklch(68.5% 0.169 237.323)',
                      },
                    ]}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent
                side='bottom'
                className='w-64 p-4 bg-popover/95 backdrop-blur-xl border-border/50 shadow-2xl'
              >
                <div className='space-y-4'>
                  <div className='flex items-center justify-between pb-2 border-b border-border/10'>
                    <h3 className='text-xs font-bold uppercase tracking-widest text-muted-foreground'>
                      Daily Goals
                    </h3>
                    <Sparkles className='h-3.5 w-3.5 text-primary/40' />
                  </div>

                  <div className='space-y-5'>
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
                  </div>

                  {allGoalsMet && (
                    <div className='pt-2 mt-2 border-t border-border/10'>
                      <p className='text-[10px] text-center font-medium text-emerald-500 italic'>
                        All daily goals reached! Great job.
                      </p>
                    </div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </TooltipProvider>

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
