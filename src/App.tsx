import { useEffect } from 'react';

import { AppProvider } from '@/components/AppProvider';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Toaster } from '@/components/ui/sonner';
import { SupabaseSyncProvider } from '@/context/SupabaseSyncContext';
import { useAppearanceSettings } from '@/hooks/useAppearanceSettings';
import { useTextSizeCssVars } from '@/hooks/useTextSizeCssVars';
import { AppRoutesGate } from '@/lib/app-routes';
import { loadMathJax } from '@/lib/mathjax-loader';

/**
 * Top-level application shell.
 *
 * Wires up appearance settings, triggers MathJax loading, then mounts
 * the routed React tree inside boundary + provider stack.
 */
export default function App() {
  useTextSizeCssVars();
  useAppearanceSettings();

  useEffect(() => {
    void loadMathJax();
  }, []);

  return (
    <AppProvider>
      <SupabaseSyncProvider>
        <ErrorBoundary>
          <AppRoutesGate />
          <Toaster
            position='bottom-right'
            richColors
            closeButton
            toastOptions={{
              duration: 4000,
            }}
          />
        </ErrorBoundary>
      </SupabaseSyncProvider>
    </AppProvider>
  );
}
