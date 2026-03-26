import { useState, useMemo } from "react";
import { NavLink } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
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
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const streakData = useAppStore((s) => s.streakData);
  const studyGoals = useAppStore((s) => s.studyGoals);

  const todayCompletions = useMemo(() => {
    const today = new Date().toLocaleDateString('en-CA');
    return streakData.dailyCompletions[today] ?? { total: 0, written: 0, mc: 0 };
  }, [streakData.dailyCompletions]);

  const dailyProgress = studyGoals.dailyQuestionGoal > 0
    ? Math.min(100, (todayCompletions.total / studyGoals.dailyQuestionGoal) * 100)
    : 0;

  const topLinks = [
    { to: "/", label: "Generator", icon: Sparkles },
    { to: "/history", label: "History", icon: History },
    { to: "/exam-history", label: "Exam History", icon: Trophy },
    { to: "/analytics", label: "Analytics", icon: ChartColumnIncreasing },
    { to: "/mistakes", label: "Mistakes", icon: CircleX },
    { to: "/saved", label: "Saved", icon: Bookmark },
  ];

  const renderLink = (link: typeof topLinks[0]) => (
    <NavLink
      key={link.to}
      to={link.to}
      aria-label={link.label}
      title={isCollapsed ? link.label : ""}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-xl transition-colors relative group",
          isCollapsed
            ? "w-10 h-10 justify-center px-0 mx-auto"
            : "px-3 py-2.5 min-h-[2.8rem]",
          isActive
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:bg-muted/50"
        )
      }
    >
      <link.icon className="h-5 w-5 shrink-0 transition-transform duration-300 group-hover:scale-110" />
      <AnimatePresence mode="wait">
        {!isCollapsed && (
          <motion.span
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-light"
          >
            {link.label}
          </motion.span>
        )}
      </AnimatePresence>
    </NavLink>
  );

  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? "4rem" : "15rem" }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="flex flex-col h-full border-r border-border/60 bg-background/50 backdrop-blur-xl relative"
    >
      <div className="p-4 flex items-center justify-center">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center justify-center w-full gap-2 p-2 rounded-lg hover:bg-muted/80 text-muted-foreground transition-all border border-transparent hover:border-border/50 group"
        >
          <motion.div
            animate={{ rotate: isCollapsed ? 180 : 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          >
            <ChevronLeft className="w-5 h-5" />
          </motion.div>
          {!isCollapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              className="text-xs font-bold uppercase tracking-widest overflow-hidden"
            >
              Collapse
            </motion.span>
          )}
        </button>
      </div>

      <nav className="flex-1 px-3 space-y-1 mt-2 overflow-y-auto no-scrollbar">
        {topLinks.map(renderLink)}
      </nav>

      <div className={cn(
        "mt-auto pt-4 border-t border-border/40 space-y-4 pb-[env(safe-area-inset-bottom,1rem)]",
        isCollapsed ? "px-1" : "px-3"
      )}>
        <AnimatePresence>
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="space-y-4 px-1"
            >
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
                      className={cn(
                        "h-full rounded-full",
                        todayCompletions.written >= studyGoals.dailyWrittenGoal ? "bg-blue-500" : "bg-primary"
                      )}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="pb-2">
          {renderLink({ to: "/settings", label: "Settings", icon: Settings })}
        </div>
      </div>
    </motion.aside>
  );
}