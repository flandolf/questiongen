import { type ComponentType, lazy, Suspense, useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';

import { Layout } from '@/components/layout/Layout';
import { LoadingScreen, RouteFallback } from '@/components/LoadingScreen';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Toaster } from '@/components/ui/sonner';

import { AppProvider } from './AppContext';
import { FirebaseSyncProvider } from './context/FirebaseSyncContext';
import { useAppearanceSettings } from './hooks/useAppearanceSettings';
import { useTextSizeCssVars } from './hooks/useTextSizeCssVars';
import { useAppStore } from './store';

const MATHJAX_CDN_URL =
  'https://cdn.jsdelivr.net/npm/mathjax@4/tex-mml-chtml.js';
const MATHJAX_SCRIPT_ID = 'mathjax-script';
let mathJaxLoaderPromise: Promise<void> | null = null;

async function importWithRetry<T extends ComponentType<unknown>>(
  loader: () => Promise<{ default: T }>,
  retries = 1,
): Promise<{ default: T }> {
  try {
    return await loader();
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
    return importWithRetry(loader, retries - 1);
  }
}

function ensureMathJaxLoaded(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  if (mathJaxLoaderPromise) {
    return mathJaxLoaderPromise;
  }

  if (!window.MathJax) {
    window.MathJax = {
      tex: {
        inlineMath: [['$', '$']],
        displayMath: [['$$', '$$']],
        packages: {
          '[+]': ['ams', 'textmacros'],
        },
      },
      loader: {
        load: ['[tex]/ams', '[tex]/textmacros'],
      },
      startup: {
        typeset: false,
      },
    };
  }

  mathJaxLoaderPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(
      MATHJAX_SCRIPT_ID,
    ) as HTMLScriptElement | null;

    const runtime = window.MathJax;
    if (existing && typeof runtime?.typesetPromise === 'function') {
      window.dispatchEvent(new Event('mathjax:ready'));
      resolve();
      return;
    }

    const script =
      existing ??
      (Object.assign(document.createElement('script'), {
        id: MATHJAX_SCRIPT_ID,
        async: true,
        src: MATHJAX_CDN_URL,
      }) as HTMLScriptElement);

    script.addEventListener('load', () => {
      // For MathJax 4, script 'load' only means the core is there.
      // We should wait for the component-level readiness if possible,
      // but dispatching mathjax:ready here is the minimum signal.
      const runtime = window.MathJax;
      if (runtime?.startup?.promise) {
        runtime.startup.promise
          .then(() => {
            window.dispatchEvent(new Event('mathjax:ready'));
            resolve();
          })
          .catch(() => {
            // Even on error, we resolve/dispatch so components can try fallback
            window.dispatchEvent(new Event('mathjax:ready'));
            resolve();
          });
      } else {
        window.dispatchEvent(new Event('mathjax:ready'));
        resolve();
      }
    });

    script.addEventListener('error', () => {
      reject(new Error('Failed to load MathJax script'));
    });

    if (!existing) {
      document.head.appendChild(script);
    }
  });

  return mathJaxLoaderPromise;
}

const GeneratorView = lazy(() =>
  importWithRetry(() =>
    import('./views/GeneratorView').then((m) => ({ default: m.GeneratorView })),
  ),
);
const HistoryView = lazy(() =>
  importWithRetry(() =>
    import('./views/HistoryView').then((m) => ({ default: m.HistoryView })),
  ),
);
const AnalyticsView = lazy(() =>
  importWithRetry(() =>
    import('./views/AnalyticsView').then((m) => ({ default: m.AnalyticsView })),
  ),
);
const SavedView = lazy(() =>
  importWithRetry(() =>
    import('./views/SavedView').then((m) => ({ default: m.SavedView })),
  ),
);
const SettingsView = lazy(() =>
  importWithRetry(() =>
    import('./views/SettingsView').then((m) => ({ default: m.SettingsView })),
  ),
);
const WrongQuestionView = lazy(() =>
  importWithRetry(() => import('./views/WrongQuestionView')),
);
const NotFound = lazy(() =>
  importWithRetry(() =>
    import('./views/NotFound').then((m) => ({ default: m.NotFound })),
  ),
);

function AppRoutes() {
  const isHydrated = useAppStore((s) => s.isHydrated);

  if (!isHydrated) {
    return <LoadingScreen />;
  }

  return (
    <HashRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path='/' element={<Layout />}>
            <Route index element={<GeneratorView />} />
            <Route path='history' element={<HistoryView />} />
            <Route path='analytics' element={<AnalyticsView />} />
            <Route path='mistakes' element={<WrongQuestionView />} />
            <Route path='saved' element={<SavedView />} />
            <Route path='settings' element={<SettingsView />} />
            <Route path='*' element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </HashRouter>
  );
}

export default function App() {
  useTextSizeCssVars();
  useAppearanceSettings();

  useEffect(() => {
    void ensureMathJaxLoaded();
  }, []);

  return (
    <AppProvider>
      <FirebaseSyncProvider>
        <ErrorBoundary>
          <AppRoutes />
          <Toaster
            position='bottom-right'
            richColors
            closeButton
            toastOptions={{
              duration: 4000,
            }}
          />
        </ErrorBoundary>
      </FirebaseSyncProvider>
    </AppProvider>
  );
}
