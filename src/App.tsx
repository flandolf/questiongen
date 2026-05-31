import { type ComponentType, lazy, Suspense, useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';

import { Layout } from '@/components/layout/Layout';
import { LoadingScreen, RouteFallback } from '@/components/LoadingScreen';
import { ErrorBoundary, RouteErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Toaster } from '@/components/ui/sonner';

import { AppProvider } from './components/AppProvider';
import { FirebaseSyncProvider } from './context/FirebaseSyncContext';
import { useAppearanceSettings } from './hooks/useAppearanceSettings';
import { useTextSizeCssVars } from './hooks/useTextSizeCssVars';
import { useAppStore } from './store';

const MATHJAX_CDN_URL = 'https://cdn.jsdelivr.net/npm/mathjax@4/tex-chtml.js';
const MATHJAX_SCRIPT_ID = 'mathjax-script';
let mathJaxLoaderPromise: Promise<void> | null = null;

type MathJaxMenuSettings = {
  enrich: boolean;
  collapsible: boolean;
  speech: boolean;
  braille: boolean;
  assistiveMml: boolean;
};

type MathJaxRuntimeOptions = {
  enableAssistiveMml: boolean;
  enableEnrichment?: boolean;
  enableSpeech?: boolean;
  enableBraille?: boolean;
  speechError?: (doc: unknown, math: unknown, err: unknown) => void;
  menuOptions?: {
    settings?: Partial<MathJaxMenuSettings>;
  };
};

type MathJaxRuntime = {
  tex?: {
    inlineMath?: [string, string][];
    displayMath?: [string, string][];
    packages?: Record<string, string[]>;
  };
  loader?: {
    load?: string[];
  };
  startup?: {
    typeset?: boolean;
    promise?: Promise<unknown>;
  };
  sre?: {
    enabled?: boolean;
  };
  options?: MathJaxRuntimeOptions;
  typesetPromise?: (elements?: Element[]) => Promise<void>;
  typesetClear?: (elements?: Element[]) => void;
};

const MATHJAX_MENU_SETTINGS: MathJaxMenuSettings = {
  assistiveMml: false,
  speech: false,
  braille: false,
  enrich: false,
  collapsible: false,
};

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
    const defaultConfig: MathJaxRuntime = {
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
      options: {
        enableAssistiveMml: false,
        enableEnrichment: false,
        enableSpeech: false,
        enableBraille: false,
        speechError: (doc, math, err) => {
          console.error('MathJax Speech Error:', err, { doc, math });
        },
        menuOptions: {
          settings: {
            ...MATHJAX_MENU_SETTINGS,
          },
        },
      },
      startup: {
        typeset: false,
      },
      sre: {
        enabled: false,
      },
    };

    window.MathJax = defaultConfig;
  }

  const runtime = window.MathJax as unknown as MathJaxRuntime;

  runtime.options = {
    ...(runtime.options ?? {}),
    enableAssistiveMml: false,
    enableEnrichment: false,
    enableSpeech: false,
    enableBraille: false,
    speechError: (doc, math, err) => {
      console.error('MathJax Speech Error:', err, { doc, math });
    },
    menuOptions: {
      ...(runtime.options?.menuOptions ?? {}),
      settings: {
        ...(runtime.options?.menuOptions?.settings ?? {}),
        ...MATHJAX_MENU_SETTINGS,
      },
    },
  };

  runtime.sre = {
    enabled: false,
  };

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
      Object.assign(document.createElement('script'), {
        id: MATHJAX_SCRIPT_ID,
        async: true,
        src: MATHJAX_CDN_URL,
      });

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
const PDFMarkerView = lazy(() =>
  importWithRetry(() =>
    import('./views/PDFMarkerView').then((m) => ({ default: m.PDFMarkerView })),
  ),
);
const PDFMarkingResultsView = lazy(() =>
  importWithRetry(() =>
    import('./views/PDFMarkingResultsView').then((m) => ({
      default: m.PDFMarkingResultsView,
    })),
  ),
);
const PDFMarkerHistoryView = lazy(() =>
  importWithRetry(() =>
    import('./views/PDFMarkerHistoryView').then((m) => ({
      default: m.PDFMarkerHistoryView,
    })),
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
  const errorMessage = useAppStore((s) => s.errorMessage);
  const hydrate = useAppStore((s) => s.hydrate);

  if (!isHydrated) {
    return <LoadingScreen />;
  }

  if (errorMessage === 'Could not load saved app data.') {
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
              onClick={() => void hydrate()}
              className='inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors'
            >
              Try again
            </button>
            <button
              type='button'
              onClick={() => {
                useAppStore.setState({ errorMessage: null });
              }}
              className='inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors'
            >
              Continue anyway
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <HashRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path='/' element={<Layout />}>
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
