import { useMemo, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Sparkles,
  History,
  ChartColumnIncreasing,
  Settings,
  Bookmark,
  CircleX,
  Flame,
  Trophy,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";

export function Sidebar() {
  const streakData = useAppStore((s) => s.streakData);
  const studyGoals = useAppStore((s) => s.studyGoals);
  const questions = useAppStore((s) => s.questions);
  const mcQuestions = useAppStore((s) => s.mcQuestions);
  const hasActiveSession = questions.length > 0 || mcQuestions.length > 0;

  const todayCompletions = useMemo(() => {
    const today = new Date().toLocaleDateString('en-CA');
    return streakData.dailyCompletions[today] ?? { total: 0, written: 0, mc: 0 };
  }, [streakData.dailyCompletions]);

  const dailyProgress = studyGoals.dailyQuestionGoal > 0
    ? Math.min(100, (todayCompletions.total / studyGoals.dailyQuestionGoal) * 100)
    : 0;

  const topLinks = [
    { to: "/", label: "Generator", icon: Sparkles, showSessionDot: true },
    { to: "/history", label: "History", icon: History },
    { to: "/exam-history", label: "Exam History", icon: Trophy },
    { to: "/analytics", label: "Analytics", icon: ChartColumnIncreasing },
    { to: "/mistakes", label: "Mistakes", icon: CircleX },
    { to: "/saved", label: "Saved", icon: Bookmark },
  ];

  const renderLink = useCallback((link: typeof topLinks[0]) => (
    <NavLink
      key={link.to}
      to={link.to}
      aria-label={link.label}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-xl transition-colors relative group px-3 py-2.5 min-h-[2.8rem]",
          isActive
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:bg-muted/50"
        )
      }
    >
      <div className="relative">
        <link.icon className="h-5 w-5 shrink-0 transition-transform duration-300 group-hover:scale-110" />
        {link.showSessionDot && hasActiveSession && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-background" />
        )}
      </div>
      <span className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-light">
        {link.label}
      </span>
    </NavLink>
  ), [hasActiveSession]);

  return (
    <aside
      className="flex flex-col h-full w-60 border-r border-border/60 bg-background/50 backdrop-blur-xl relative"
    >
      <nav className="flex-1 px-3 space-y-1 mt-4 overflow-y-auto no-scrollbar">
        {topLinks.map(renderLink)}
      </nav>

      <div className="mt-auto pt-4 border-t border-border/40 space-y-4 pb-[env(safe-area-inset-bottom,1rem)] px-3">
        <div className="space-y-4 px-1">
              {streakData.currentStreak > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-linear-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 shadow-sm">
                  <Flame className="w-4 h-4 text-amber-500 animate-pulse" />
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                    {streakData.currentStreak} day streak
                  </span>
                </div>
              )}

              {studyGoals.dailyQuestionGoal > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter">Daily Goal</p>
                    <p className="text-[10px] font-bold tabular-nums">{todayCompletions.total}/{studyGoals.dailyQuestionGoal}</p>
                  </div>
                  <div className="h-2 w-full bg-muted/30 rounded-full overflow-hidden p-[2px]">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${dailyProgress}%` }}
                      transition={{ duration: 0.18, ease: "linear" }}
                      className={cn(
                        "h-full rounded-full",
                        dailyProgress >= 100 ? "bg-emerald-500" : "bg-primary"
                      )}
                    />
                  </div>
                </div>
              )}

              {studyGoals.dailyMcGoal > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter">MC Goal</p>
                    <p className="text-[10px] font-bold tabular-nums">{todayCompletions.mc}/{studyGoals.dailyMcGoal}</p>
                  </div>
                  <div className="h-2 w-full bg-muted/30 rounded-full overflow-hidden p-[2px]">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, (todayCompletions.mc / studyGoals.dailyMcGoal) * 100)}%` }}
                      transition={{ duration: 0.18, ease: "linear" }}
                      className={cn(
                        "h-full rounded-full",
                        todayCompletions.mc >= studyGoals.dailyMcGoal ? "bg-violet-500" : "bg-primary"
                      )}
                    />
                  </div>
                </div>
              )}

              {studyGoals.dailyWrittenGoal > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter">Written Goal</p>
                    <p className="text-[10px] font-bold tabular-nums">{todayCompletions.written}/{studyGoals.dailyWrittenGoal}</p>
                  </div>
                  <div className="h-2 w-full bg-muted/30 rounded-full overflow-hidden p-[2px]">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, (todayCompletions.written / studyGoals.dailyWrittenGoal) * 100)}%` }}
                      transition={{ duration: 0.18, ease: "linear" }}
                      className={cn(
                        "h-full rounded-full",
                        todayCompletions.written >= studyGoals.dailyWrittenGoal ? "bg-blue-500" : "bg-primary"
                      )}
                    />
                  </div>
                </div>
              )}
        </div>

        <div className="pb-4">
          {renderLink({ to: "/settings", label: "Settings", icon: Settings })}
        </div>
      </div>
    </aside>
  );
}