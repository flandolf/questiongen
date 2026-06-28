import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';

import { AppShell } from '@/components/layout/AppShell';
import { LoadingScreen, RouteFallback } from '@/components/LoadingScreen';
import { RouteErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useAppStore } from '@/store';

import { importWithRetry } from './mathjax-loader';

// ─── Lazy views ──────────────────────────────────────────────────────────────

const GeneratorView = lazy(() =>
  importWithRetry(() =>
    import('@/views/GeneratorView').then((m) => ({ default: m.GeneratorView })),
  ),
);
const HistoryView = lazy(() =>
  importWithRetry(() =>
    import('@/views/HistoryView').then((m) => ({ default: m.HistoryView })),
  ),
);
const AnalyticsView = lazy(() =>
  importWithRetry(() =>
    import('@/views/AnalyticsView').then((m) => ({ default: m.AnalyticsView })),
  ),
);
const SavedView = lazy(() =>
  importWithRetry(() =>
    import('@/views/SavedView').then((m) => ({ default: m.SavedView })),
  ),
);
const SettingsView = lazy(() =>
  importWithRetry(() =>
    import('@/views/SettingsView').then((m) => ({ default: m.SettingsView })),
  ),
);
const PDFMarkerView = lazy(() =>
  importWithRetry(() =>
    import('@/views/PDFMarkerView').then((m) => ({ default: m.PDFMarkerView })),
  ),
);
const PDFMarkingResultsView = lazy(() =>
  importWithRetry(() =>
    import('@/views/PDFMarkingResultsView').then((m) => ({
      default: m.PDFMarkingResultsView,
    })),
  ),
);
const PDFMarkerHistoryView = lazy(() =>
  importWithRetry(() =>
    import('@/views/PDFMarkerHistoryView').then((m) => ({
      default: m.PDFMarkerHistoryView,
    })),
  ),
);
const WrongQuestionView = lazy(() =>
  importWithRetry(() => import('@/views/WrongQuestionView')),
);
const NotFound = lazy(() =>
  importWithRetry(() =>
    import('@/views/NotFound').then((m) => ({ default: m.NotFound })),
  ),
);

// ─── Hydration error fallback ────────────────────────────────────────────────

type HydrationErrorViewProps = {
  onRetry: () => void;
  onContinue: () => void;
};

function HydrationErrorView({ onRetry, onContinue }: HydrationErrorViewProps) {
  return (
    <div className='min-h-dvh flex items-center justify-center bg-background px-6'>
      <div className='text-center space-y-4 max-w-md'>
        <h2 className='text-lg font-semibold tracking-tight'>
          Failed to load saved data
        </h2>
        <p className='text-sm text-muted-foreground'>
          Your saved questions, history, and settings could not be restored.
          You can continue with a fresh workspace or try loading again.
        </p>
        <div className='flex gap-2 justify-center'>
          <button
            type='button'
            onClick={onRetry}
            className='inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors'
          >
            Try again
          </button>
          <button
            type='button'
            onClick={onContinue}
            className='inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors'
          >
            Continue anyway
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Route registration ──────────────────────────────────────────────────────

function RegisteredRoutes() {
  return (
    <Routes>
      <Route path='/' element={<AppShell />}>
        <Route
          index
          element={
            <RouteErrorBoundary routeName='Generator'>
              <GeneratorView />
            </RouteErrorBoundary>
          }
        />
        <Route
          path='history'
          element={
            <RouteErrorBoundary routeName='History'>
              <HistoryView />
            </RouteErrorBoundary>
          }
        />
        <Route
          path='analytics'
          element={
            <RouteErrorBoundary routeName='Analytics'>
              <AnalyticsView />
            </RouteErrorBoundary>
          }
        />
        <Route
          path='mistakes'
          element={
            <RouteErrorBoundary routeName='Mistakes'>
              <WrongQuestionView />
            </RouteErrorBoundary>
          }
        />
        <Route
          path='saved'
          element={
            <RouteErrorBoundary routeName='Saved'>
              <SavedView />
            </RouteErrorBoundary>
          }
        />
        <Route
          path='pdf-marker'
          element={
            <RouteErrorBoundary routeName='PDF Marker'>
              <PDFMarkerView />
            </RouteErrorBoundary>
          }
        />
        <Route
          path='pdf-marker/results'
          element={
            <RouteErrorBoundary routeName='PDF Marking Results'>
              <PDFMarkingResultsView />
            </RouteErrorBoundary>
          }
        />
        <Route
          path='pdf-marker/history'
          element={
            <RouteErrorBoundary routeName='PDF Marker History'>
              <PDFMarkerHistoryView />
            </RouteErrorBoundary>
          }
        />
        <Route
          path='settings'
          element={
            <RouteErrorBoundary routeName='Settings'>
              <SettingsView />
            </RouteErrorBoundary>
          }
        />
        <Route path='*' element={<NotFound />} />
      </Route>
    </Routes>
  );
}

// ─── Top-level router with hydration gating ──────────────────────────────────

function retryHydration(): void {
  void useAppStore.getState().hydrate();
}

function continueAfterHydrationError(): void {
  useAppStore.setState({ errorMessage: null });
}

/**
 * Renders the loading screen until persisted state has been restored,
 * then renders the configured route tree. When persisted state cannot
 * be restored, the user is shown a choice to retry or continue.
 */
export function AppRoutesGate() {
  const isHydrated = useAppStore((s) => s.isHydrated);
  const errorMessage = useAppStore((s) => s.errorMessage);

  if (!isHydrated) return <LoadingScreen />;

  if (errorMessage === 'Could not load saved app data.') {
    return (
      <HydrationErrorView
        onRetry={retryHydration}
        onContinue={continueAfterHydrationError}
      />
    );
  }

  return (
    <HashRouter>
      <Suspense fallback={<RouteFallback />}>
        <RegisteredRoutes />
      </Suspense>
    </HashRouter>
  );
}
