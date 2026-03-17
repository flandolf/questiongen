import { NavLink } from "react-router-dom";
import { Sparkles, History, ChartColumnIncreasing, Settings, Bookmark } from "lucide-react";
import { cn } from "../../lib/utils";

export function Sidebar() {
  const isAndroid = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
  const links = [
    { to: "/", label: "Generator", icon: Sparkles },
    { to: "/history", label: "History", icon: History },
    { to: "/analytics", label: "Analytics", icon: ChartColumnIncreasing },
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
    </aside>
  );
}
