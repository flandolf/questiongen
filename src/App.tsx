import { HashRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "./AppContext";
import { Layout } from "./components/layout/Layout";
import { GeneratorView } from "./views/GeneratorView";
import { HistoryView } from "./views/HistoryView";
import { AnalyticsView } from "./views/AnalyticsView";
import { SettingsView } from "./views/SettingsView";

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<GeneratorView />} />
            <Route path="history" element={<HistoryView />} />
            <Route path="analytics" element={<AnalyticsView />} />
            <Route path="settings" element={<SettingsView />} />
          </Route>
        </Routes>
      </HashRouter>
    </AppProvider>
  );
}
