import { HashRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "./AppContext";
import { useAppContext } from "./AppContext";
import { Layout } from "./components/layout/Layout";
import { GeneratorView } from "./views/GeneratorView";
import { HistoryView } from "./views/HistoryView";
import { AnalyticsView } from "./views/AnalyticsView";
import { SavedView } from "./views/SavedView";
import { SettingsView } from "./views/SettingsView";

function AppRoutes() {
  const { isHydrated } = useAppContext();

  if (!isHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Loading your workspace</h1>
          <p className="text-sm text-muted-foreground">Restoring saved question sets, history, and analytics.</p>
        </div>
      </div>
    );
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<GeneratorView />} />
          <Route path="history" element={<HistoryView />} />
          <Route path="analytics" element={<AnalyticsView />} />
          <Route path="saved" element={<SavedView />} />
          <Route path="settings" element={<SettingsView />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppRoutes />
    </AppProvider>
  );
}
