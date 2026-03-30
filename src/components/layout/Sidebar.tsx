import { useMemo, useCallback, useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Sparkles,
  History,
  ChartColumnIncreasing,
  Settings,
  Bookmark,
  CircleX,
  Flame,
  Trophy,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn, getTodayKey } from '../../lib/utils';
import { useAppStore } from '../../store';

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
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter">
          {label}
        </p>
        <p className="text-[10px] font-bold tabular-nums">
          {current}/{goal}
        </p>
      </div>
      <div className="h-2 w-full bg-muted/30 rounded-full overflow-hidden p-[2px]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.18, ease: 'linear' }}
          className={cn('h-full rounded-full', complete ? color : 'bg-primary')}
        />
      </div>
    </div>
  );
}

/** Compact circular ring used when sidebar is collapsed */
function RingGoal({
  label,
  current,
  goal,
  color,
  size = 36,
}: {
  label: string;
  current: number;
  goal: number;
  color: string;
  size?: number;
}) {
  const pct = Math.min(100, (current / goal) * 100);
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference * (1 - pct / 100);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block"
        aria-hidden
      >
        <defs>
          <linearGradient id={`g-${label}`} x1="0" x2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="4"
          fill="none"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashoffset }}
          transition={{ duration: 0.3, ease: 'linear' }}
        />
      </svg>
      <span className="text-[10px] text-muted-foreground font-medium">
        {label}
      </span>
    </div>
  );
}

export function Sidebar() {
  const streakData = useAppStore((s) => s.streakData);
  const studyGoals = useAppStore((s) => s.studyGoals);
  const questions = useAppStore((s) => s.questions);
  const mcQuestions = useAppStore((s) => s.mcQuestions);
  const hasActiveSession = questions.length > 0 || mcQuestions.length > 0;

  const todayCompletions = useMemo(() => {
    const today = getTodayKey();
    return (
      streakData.dailyCompletions[today] ?? { total: 0, written: 0, mc: 0 }
    );
  }, [streakData.dailyCompletions]);

  const topLinks = [
    { to: '/', label: 'Generator', icon: Sparkles, showSessionDot: true },
    { to: '/history', label: 'History', icon: History },
    { to: '/exam-history', label: 'Exam History', icon: Trophy },
    { to: '/analytics', label: 'Analytics', icon: ChartColumnIncreasing },
    { to: '/mistakes', label: 'Mistakes', icon: CircleX },
    { to: '/saved', label: 'Saved', icon: Bookmark },
  ];

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('sidebarCollapsed');
      return raw === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('sidebarCollapsed', collapsed ? 'true' : 'false');
    } catch {}
  }, [collapsed]);

  const renderLink = useCallback(
    (link: (typeof topLinks)[0]) => (
      <NavLink
        key={link.to}
        to={link.to}
        aria-label={link.label}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-3 rounded-xl transition-colors relative group px-3 py-2.5 min-h-[2.8rem]',
            isActive
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-muted/50'
          )
        }
      >
        <div className="relative flex items-center justify-center w-6">
          <link.icon className="h-5 w-5 shrink-0 transition-transform duration-300 group-hover:scale-110" />
          {link.showSessionDot && hasActiveSession && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-background" />
          )}
        </div>
        {!collapsed && (
          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-light">
            {link.label}
          </span>
        )}
      </NavLink>
    ),
    [hasActiveSession, collapsed]
  );

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 64 : 240 }}
      className={cn(
        'flex flex-col h-full border-r border-border/60 bg-background/50 backdrop-blur-xl relative',
        'transition-width duration-200 ease-in-out'
      )}
      style={{ minWidth: collapsed ? 64 : 240 }}
    >
      <div className="flex items-center justify-between px-2 py-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-md">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          {!collapsed && <h3 className="text-sm font-bold">Study</h3>}
        </div>

        <button
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((c) => !c)}
          className="p-1 rounded-md hover:bg-muted/30 text-muted-foreground"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      <nav
        className={cn(
          'flex-1 px-2 mt-2 overflow-y-auto no-scrollbar',
          collapsed ? 'space-y-1' : 'space-y-1'
        )}
      >
        {topLinks.map(renderLink)}
      </nav>

      <div className="mt-auto pt-4 border-t border-border/40 pb-[env(safe-area-inset-bottom,1rem)] px-3">
        <div className="space-y-4 px-1">
          {streakData.currentStreak > 0 && !collapsed && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-linear-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 shadow-sm">
              <Flame className="w-4 h-4 text-amber-500 animate-pulse" />
              <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                {streakData.currentStreak} day streak
              </span>
            </div>
          )}

          {/* Expanded goals */}
          {!collapsed && (
            <>
              {studyGoals.dailyQuestionGoal > 0 && (
                <GoalProgressBar
                  label="Daily Goal"
                  current={todayCompletions.total}
                  goal={studyGoals.dailyQuestionGoal}
                  color="bg-emerald-500"
                />
              )}

              {studyGoals.dailyMcGoal > 0 && (
                <GoalProgressBar
                  label="MC Goal"
                  current={todayCompletions.mc}
                  goal={studyGoals.dailyMcGoal}
                  color="bg-violet-500"
                />
              )}

              {studyGoals.dailyWrittenGoal > 0 && (
                <GoalProgressBar
                  label="Written Goal"
                  current={todayCompletions.written}
                  goal={studyGoals.dailyWrittenGoal}
                  color="bg-blue-500"
                />
              )}
            </>
          )}

          {/* Collapsed ring goals */}
          {collapsed && (
            <div className="flex items-center justify-between px-1">
              {studyGoals.dailyQuestionGoal > 0 && (
                <RingGoal
                  label="All"
                  current={todayCompletions.total}
                  goal={studyGoals.dailyQuestionGoal}
                  color="#10B981"
                  size={40}
                />
              )}
              {studyGoals.dailyMcGoal > 0 && (
                <RingGoal
                  label="MC"
                  current={todayCompletions.mc}
                  goal={studyGoals.dailyMcGoal}
                  color="#7C3AED"
                  size={40}
                />
              )}
              {studyGoals.dailyWrittenGoal > 0 && (
                <RingGoal
                  label="W"
                  current={todayCompletions.written}
                  goal={studyGoals.dailyWrittenGoal}
                  color="#3B82F6"
                  size={40}
                />
              )}
            </div>
          )}
        </div>

        <div className="pt-4 pb-4">
          {renderLink({ to: '/settings', label: 'Settings', icon: Settings })}
        </div>
      </div>
    </motion.aside>
  );
}
