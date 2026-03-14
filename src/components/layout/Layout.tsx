import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import "../../App.css";

export function Layout() {
  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
