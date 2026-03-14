import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import "../../App.css";

export function Layout() {
  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
