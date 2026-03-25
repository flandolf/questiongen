import { NavLink } from "react-router-dom";
import { Sparkles, History, ChartColumnIncreasing, Settings, Bookmark, CircleX, Timer, Flame, Trophy } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";
import { useMemo } from "react";

export function Sidebar() {
  const isAndroid = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
  const streakData = useAppStore((s) => s.streakData);
  const studyGoals = useAppStore((s) => s.studyGoals);

  const todayCompletions = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return streakData.dailyCompletions[today] ?? { total: 0, written: 0, mc: 0 };
  }, [streakData.dailyCompletions]);

  const dailyProgress = studyGoals.dailyQuestionGoal > 0
    ? Math.min(100, (todayCompletions.total / studyGoals.dailyQuestionGoal) * 100)
    : 0;

  const links = [
    { to: "/", label: "Generator", icon: Sparkles },
    { to: "/exam", label: "Exam Sim", icon: Timer },
    { to: "/history", label: "History", icon: History },
    { to: "/exam-history", label: "Exam History", icon: Trophy },
    { to: "/analytics", label: "Analytics", icon: ChartColumnIncreasing },
    { to: "/mistakes", label: "Mistakes", icon: CircleX },
    { to: "/saved", label: "Saved", icon: Bookmark },
    { to: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <aside className={cn(
      "flex flex-col font-medium min-h-full border-r border-border/80 backdrop-blur-md transition-all",
      isAndroid 
        ? "w-[3.4rem] pt-[0.9rem] pb-[max(0.85rem,env(safe-area-inset-bottom,0px))]" 
        : "pt-[1.35rem] pb-4 w-56 max-[1100px]:w-[10.5rem]"
    )}>
      <nav className={cn(
        "flex-1 space-y-1 sm:px-3 grid content-start gap-[0.35rem]",
        isAndroid && "justify-items-center px-[0.35rem] sm:px-[0.35rem]"
      )}>
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            aria-label={link.label}
            title={link.label}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-xl transition-all duration-200 hover:translate-x-px",
                isAndroid 
                  ? "w-[2.5rem] min-h-[2.5rem] justify-center px-0" 
                  : "px-3 py-3 min-h-[3rem]",
                isActive
                  ? "bg-primary/15 text-foreground ring-1 ring-inset ring-primary/20"
                  : "text-muted-foreground hover:bg-muted/50"
              )
            }
          >
            <link.icon className="h-5 w-5 shrink-0" />
            {!isAndroid && <span className="overflow-hidden text-ellipsis whitespace-nowrap">{link.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Streak & daily progress */}
      {!isAndroid && (
        <div className="mx-3 mt-auto pt-3 border-t border-border/40 space-y-2">
          {streakData.currentStreak > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/5">
              <Flame className="w-4 h-4 text-amber-500" />
              <div>
                <p className="text-xs font-bold text-amber-600 dark:text-amber-400">{streakData.currentStreak} day streak</p>
                <p className="text-[10px] text-muted-foreground">Best: {streakData.longestStreak} days</p>
              </div>
            </div>
          )}
          {studyGoals.dailyQuestionGoal > 0 && (
            <div className="px-3 py-2">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-semibold text-muted-foreground">Daily goal</p>
                <p className="text-[10px] font-bold tabular-nums">{todayCompletions.total}/{studyGoals.dailyQuestionGoal}</p>
              </div>
              <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${dailyProgress >= 100 ? "bg-emerald-500" : "bg-primary/70"}`}
                  style={{ width: `${dailyProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
