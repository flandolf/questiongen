import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import Titlebar from "./Titlebar";
import { useEffect, useState } from "react";
import "../../App.css";

export function Layout() {
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setIsAndroid(/Android/i.test(navigator.userAgent));
    }
  }, []);

  return (
    <div className="flex flex-col h-dvh bg-background text-foreground overflow-hidden">
      {!isAndroid && <Titlebar />}
      <div className={`flex flex-1 min-h-0 min-w-0 ${isAndroid ? "pt-10" : ""}`}>
        <Sidebar />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
