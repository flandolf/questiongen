import { NavLink } from "react-router-dom";
import { Sparkles, History, ChartColumnIncreasing, Settings } from "lucide-react";
import { cn } from "../../lib/utils";

export function Sidebar() {
  const links = [
    { to: "/", label: "Generator", icon: Sparkles },
    { to: "/history", label: "History", icon: History },
    { to: "/analytics", label: "Analytics", icon: ChartColumnIncreasing },
    { to: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <aside className="app-sidebar flex flex-col font-medium">
      <div className="app-sidebar__header px-3 mb-6 sm:px-4">
        <div className="app-sidebar__brand">
          <div className="app-sidebar__brand-mark" aria-hidden="true">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="app-sidebar__brand-copy">
            <h1 className="text-lg font-bold tracking-tight">QuestionGen</h1>
            <div className="app-sidebar__brand-tag text-xs text-muted-foreground mt-1">VCE Study Studio</div>
          </div>
        </div>
      </div>
      <nav className="app-sidebar__nav flex-1 px-2 space-y-1 sm:px-3">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            aria-label={link.label}
            title={link.label}
            className={({ isActive }) =>
              cn(
                "app-sidebar__link flex items-center gap-3 rounded-xl px-3 py-3",
                isActive
                  ? "app-sidebar__link--active"
                  : "text-muted-foreground"
              )
            }
          >
            <link.icon className="h-5 w-5 shrink-0" />
            <span className="app-sidebar__link-label">{link.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
