import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';

import { Layout } from '@/components/layout/Layout';
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
  import('./views/GeneratorView').then((m) => ({ default: m.GeneratorView })),
);
const HistoryView = lazy(() =>
  import('./views/HistoryView').then((m) => ({ default: m.HistoryView })),
);
const AnalyticsView = lazy(() =>
  import('./views/AnalyticsView').then((m) => ({ default: m.AnalyticsView })),
);
const SavedView = lazy(() =>
  import('./views/SavedView').then((m) => ({ default: m.SavedView })),
);
const SettingsView = lazy(() =>
  import('./views/SettingsView').then((m) => ({ default: m.SettingsView })),
);
const WrongQuestionView = lazy(() => import('./views/WrongQuestionView'));
const NotFound = lazy(() =>
  import('./views/NotFound').then((m) => ({ default: m.NotFound })),
);

function RouteFallback() {
  return (
    <div className='min-h-full flex items-center justify-center p-8'>
      <div className='text-center space-y-2'>
        <div className='h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto' />
        <p className='text-sm text-muted-foreground'>Loading...</p>
      </div>
    </div>
  );
}

function AppRoutes() {
  const isHydrated = useAppStore((s) => s.isHydrated);

  if (!isHydrated) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-background text-foreground px-6'>
        <div className='text-center space-y-2'>
          <h1 className='text-2xl font-bold tracking-tight'>
            Loading your workspace
          </h1>
          <p className='text-sm text-muted-foreground'>
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
