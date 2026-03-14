import { NavLink } from "react-router-dom";
import { Sparkles, History, ChartColumnIncreasing, Settings } from "lucide-react";
import { cn } from "../../lib/utils";

export function Sidebar() {
  const links = [
    { to: "/", label: "Generator", icon: <Sparkles className="w-5 h-5" /> },
    { to: "/history", label: "History", icon: <History className="w-5 h-5" /> },
    { to: "/analytics", label: "Analytics", icon: <ChartColumnIncreasing className="w-5 h-5" /> },
    { to: "/settings", label: "Settings", icon: <Settings className="w-5 h-5" /> },
  ];

  return (
    <aside className="app-sidebar w-64 h-screen flex flex-col pt-6 font-medium">
      <div className="px-6 mb-8">
        <div className="app-sidebar__brand">
        <h1 className="text-xl font-bold tracking-tight">QuestionGen</h1>
        <div className="text-xs text-muted-foreground mt-1">VCE Study Studio</div>
        </div>
      </div>
      <nav className="flex-1 px-4 space-y-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              cn(
                "app-sidebar__link flex items-center gap-3 px-3 py-2 rounded-md",
                isActive
                  ? "app-sidebar__link--active"
                  : "text-muted-foreground"
              )
            }
          >
            {link.icon}
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
