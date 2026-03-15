import { NavLink } from "react-router-dom";
import { Sparkles, History, ChartColumnIncreasing, Settings, Bookmark } from "lucide-react";
import { cn } from "../../lib/utils";

export function Sidebar() {
  const links = [
    { to: "/", label: "Generator", icon: Sparkles },
    { to: "/history", label: "History", icon: History },
    { to: "/analytics", label: "Analytics", icon: ChartColumnIncreasing },
    { to: "/saved", label: "Saved", icon: Bookmark },
    { to: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <aside className="app-sidebar flex flex-col font-medium">
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
