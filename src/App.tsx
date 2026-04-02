import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { MathJaxContext } from 'better-react-mathjax';
import { Toaster } from '@/components/ui/sonner';
import { AppProvider } from './AppContext';
import { useAppStore } from './store';
import { FirebaseSyncProvider } from './context/FirebaseSyncContext';
import { TimerBarProvider } from './context/TimerBarContext';
import { Layout } from '@/components/layout/Layout';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useTextSizeCssVars } from './hooks/useTextSizeCssVars';

const MATHJAX_CDN_URL =
  'https://cdn.jsdelivr.net/npm/mathjax@4/tex-mml-chtml.js';

const GeneratorView = lazy(() =>
  import('./views/GeneratorView').then((m) => ({ default: m.GeneratorView }))
);
const HistoryView = lazy(() =>
  import('./views/HistoryView').then((m) => ({ default: m.HistoryView }))
);
const AnalyticsView = lazy(() =>
  import('./views/AnalyticsView').then((m) => ({ default: m.AnalyticsView }))
);
const SavedView = lazy(() =>
  import('./views/SavedView').then((m) => ({ default: m.SavedView }))
);
const SettingsView = lazy(() =>
  import('./views/SettingsView').then((m) => ({ default: m.SettingsView }))
);
const WrongQuestionView = lazy(() => import('./views/WrongQuestionView'));
const NotFound = lazy(() =>
  import('./views/NotFound').then((m) => ({ default: m.NotFound }))
);

function RouteFallback() {
  return (
    <div className="min-h-full flex items-center justify-center p-8">
      <div className="text-center space-y-2">
        <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

function AppRoutes() {
  const isHydrated = useAppStore((s) => s.isHydrated);

  if (!isHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Loading your workspace
          </h1>
          <p className="text-sm text-muted-foreground">
            Restoring saved question sets, history, and analytics.
          </p>
        </div>
      </div>
    );
  }

  return (
    <HashRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<GeneratorView />} />
            <Route path="history" element={<HistoryView />} />
            <Route path="analytics" element={<AnalyticsView />} />
            <Route path="mistakes" element={<WrongQuestionView />} />
            <Route path="saved" element={<SavedView />} />
            <Route path="settings" element={<SettingsView />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </HashRouter>
  );
}

export default function App() {
  useTextSizeCssVars();

  return (
    <MathJaxContext
      version={4}
      src={MATHJAX_CDN_URL}
      config={{
        tex: {
          inlineMath: [['$', '$']],
          displayMath: [['$$', '$$']],
          packages: {
            '[+]': ['textmacros'],
          },
        },
        loader: {
          load: ['[tex]/textmacros'],
        },
      }}
    >
      <AppProvider>
        <FirebaseSyncProvider>
          <TimerBarProvider>
            <ErrorBoundary>
              <AppRoutes />
              <Toaster
                position="bottom-right"
                richColors
                closeButton
                toastOptions={{
                  duration: 4000,
                }}
              />
            </ErrorBoundary>
          </TimerBarProvider>
        </FirebaseSyncProvider>
      </AppProvider>
    </MathJaxContext>
  );
}
