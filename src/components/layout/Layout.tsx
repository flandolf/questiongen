import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import "../../App.css";

export function Layout() {
  return (
    <div className="flex bg-background text-foreground overflow-hidden h-dvhh-[100dvh] in-[.platform-android]:h-(--android-app-height,100dvh) in-[.platform-android]:min-h-(--android-app-height,100dvh) in-[.platform-android]:pt-[max(0.5rem,env(safe-area-inset-top,0px))]">
      <Sidebar />
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto in-[.platform-android]:h-full in-[.platform-android]:pr-[max(0.4rem,env(safe-area-inset-right,0px))] in-[.platform-android]:pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] in-[.platform-android]:overscroll-contain">
        <Outlet />
      </main>
    </div>
  );
}
