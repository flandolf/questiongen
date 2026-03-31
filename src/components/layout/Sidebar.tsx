import { useMemo, useCallback, useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  History,
  ChartColumnIncreasing,
  Settings,
  Bookmark,
  CircleX,
  Flame,
  Trophy,
  ChevronRight,
} from 'lucide-react';
import { cn, getTodayKey } from '../../lib/utils';
import { useAppStore } from '../../store';

// ─── Shared transition presets ───────────────────────────────────────────────
const SPRING = { type: 'spring' as const, stiffness: 280, damping: 26 };
const EASE = { duration: 0.22, ease: [0.4, 0, 0.2, 1] as const };

// ─── GoalProgressBar (unchanged logic, smoother bar) ─────────────────────────
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
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-0.5">
        <p className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">
          {label}
        </p>
        <p className="text-[10px] font-bold tabular-nums opacity-80">
          {current}/{goal}
        </p>
      </div>
      <div className="h-1.5 w-full bg-muted/20 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }} // slight overshoot
          className={cn(
            'h-full rounded-full',
            complete ? color : 'bg-primary/60'
          )}
        />
      </div>
    </div>
  );
}

// ─── ConcentricRings (unchanged) ─────────────────────────────────────────────
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
    <div className="flex flex-col items-center gap-1 py-1 w-full">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible"
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
                fill="none"
                stroke="currentColor"
                className="text-muted/10"
                strokeWidth={strokeWidth}
              />
              <motion.circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={g.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
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

// ─── Sidebar ─────────────────────────────────────────────────────────────────
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

  // Nav link renderer
  const renderLink = useCallback(
    (link: {
      to: string;
      label: string;
      icon: any;
      showSessionDot?: boolean;
    }) => (
      <NavLink
        key={link.to}
        to={link.to}
        className={({ isActive }) =>
          cn(
            `flex items-center ${collapsed ? 'justify-center' : 'justify-start'} h-10 px-3 rounded-lg transition-colors duration-150 relative group w-full`,
            isActive
              ? 'bg-primary/10 text-primary shadow-sm'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
          )
        }
      >
        <div className="flex items-center justify-center min-w-[24px]">
          <link.icon className="h-5 w-5 shrink-0 transition-transform duration-150 group-hover:scale-105" />
          {link.showSessionDot && hasActiveSession && (
            <span className="absolute top-2.5 left-7 w-2 h-2 rounded-full bg-emerald-500 border-2 border-background" />
          )}
        </div>

        {/* Label: slides + fades in; exits instantly so it doesn't linger during collapse */}
        <AnimatePresence mode="wait" initial={false}>
          {!collapsed && (
            <motion.span
              key="label"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4, transition: { duration: 0.1 } }}
              transition={{ ...EASE, delay: 0.06 }}
              className="ml-3 text-sm font-medium whitespace-nowrap overflow-hidden"
            >
              {link.label}
            </motion.span>
          )}
        </AnimatePresence>

        {/* Tooltip when collapsed */}
        {collapsed && (
          <div className="absolute left-14 hidden group-hover:block z-50 px-2 py-1 bg-popover text-popover-foreground text-xs rounded border shadow-md whitespace-nowrap">
            {link.label}
          </div>
        )}
      </NavLink>
    ),
    [hasActiveSession, collapsed]
  );

  const topLinks = [
    { to: '/', label: 'Generator', icon: Sparkles, showSessionDot: true },
    { to: '/history', label: 'History', icon: History },
    { to: '/exam-history', label: 'Exam History', icon: Trophy },
    { to: '/analytics', label: 'Analytics', icon: ChartColumnIncreasing },
    { to: '/mistakes', label: 'Mistakes', icon: CircleX },
    { to: '/saved', label: 'Saved', icon: Bookmark },
  ];

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 64 : 192 }}
      transition={SPRING}
      className="flex flex-col items-center h-full border-r border-border/50 bg-background/80 backdrop-blur-md relative overflow-hidden"
    >
      {/* Header */}
      <div className="h-14 flex items-center justify-center px-3 mb-2 w-full">
        <motion.button
          onClick={() => setCollapsed(!collapsed)}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          transition={SPRING}
          className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground transition-colors"
        >
          <motion.div
            animate={{ rotate: collapsed ? 0 : 180 }}
            transition={SPRING}
          >
            <ChevronRight size={16} />
          </motion.div>
        </motion.button>
      </div>

      {/* Navigation */}
      <nav className="px-2 space-y-1 flex flex-col no-scrollbar w-full">
        {topLinks.map(renderLink)}
      </nav>

      {/* Footer / Stats */}
      <div className="mt-auto px-3 pb-6 w-full">
        <div
          className={cn(
            'pt-4 border-t border-border/40',
            collapsed ? 'space-y-1' : 'space-y-4'
          )}
        >
          {/* Streak badge */}
          {streakData.currentStreak > 0 && (
            <div
              className={cn(
                'flex items-center rounded-xl transition-all duration-300',
                collapsed
                  ? 'justify-center'
                  : 'gap-3 px-3 py-2.5 bg-orange-500/5 border border-orange-500/10'
              )}
            >
              <AnimatePresence mode="wait" initial={false}>
                {collapsed ? (
                  <motion.div
                    key="streak-collapsed"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={SPRING}
                    className="relative flex flex-col items-center justify-center w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/25 shadow-[0_0_8px_rgba(249,115,22,0.15)] cursor-default"
                  >
                    <Flame className="h-4 w-4 text-orange-400 animate-pulse shrink-0" />
                    <span className="text-[10px] font-semibold leading-none text-orange-300 tabular-nums">
                      {streakData.currentStreak}
                    </span>
                  </motion.div>
                ) : (
                  <motion.div
                    key="streak-expanded"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ ...EASE, delay: 0.08 }}
                    className="relative flex items-center gap-2.5 px-3 py-2 rounded-xl overflow-hidden w-full"
                  >
                    <Flame className="shrink-0 h-5 w-5 text-orange-400 drop-shadow-[0_0_5px_rgba(251,146,60,0.9)] animate-pulse" />
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-[11px] font-semibold text-orange-300/70 leading-none tracking-wide uppercase">
                        Current Streak
                      </span>
                      <span className="text-sm font-bold text-orange-400 leading-none tabular-nums">
                        {streakData.currentStreak} days
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Goals */}
          <div className="px-1 pt-4">
            <AnimatePresence mode="wait" initial={false}>
              {!collapsed ? (
                <motion.div
                  key="goals-expanded"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4, transition: { duration: 0.12 } }}
                  className="space-y-4"
                >
                  {studyGoals.dailyQuestionGoal > 0 && (
                    <GoalProgressBar
                      label="Overall"
                      current={todayCompletions.total}
                      goal={studyGoals.dailyQuestionGoal}
                      color="bg-blue-500"
                    />
                  )}
                  {studyGoals.dailyMcGoal > 0 && (
                    <GoalProgressBar
                      label="Multiple Choice"
                      current={todayCompletions.mc}
                      goal={studyGoals.dailyMcGoal}
                      color="bg-violet-500"
                    />
                  )}
                  {studyGoals.dailyWrittenGoal > 0 && (
                    <GoalProgressBar
                      label="Written"
                      current={todayCompletions.written}
                      goal={studyGoals.dailyWrittenGoal}
                      color="bg-sky-500"
                    />
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="goals-collapsed"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{
                    opacity: 0,
                    scale: 0.85,
                    transition: { duration: 0.12 },
                  }}
                >
                  <ConcentricRings
                    goals={[
                      {
                        label: 'Daily',
                        current: todayCompletions.total,
                        goal: studyGoals.dailyQuestionGoal,
                        color: '#10b981',
                      },
                      {
                        label: 'MC',
                        current: todayCompletions.mc,
                        goal: studyGoals.dailyMcGoal,
                        color: '#8b5cf6',
                      },
                      {
                        label: 'Written',
                        current: todayCompletions.written,
                        goal: studyGoals.dailyWrittenGoal,
                        color: '#3b82f6',
                      },
                    ]}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Settings */}
        <div className="pt-6 w-full">
          {renderLink({ to: '/settings', label: 'Settings', icon: Settings })}
        </div>
      </div>
    </motion.aside>
  );
}
