import type { ComponentType } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

type MathJaxMenuSettings = {
  enrich: boolean;
  collapsible: boolean;
  speech: boolean;
  braille: boolean;
  assistiveMml: boolean;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const MATHJAX_CDN_URL = 'https://cdn.jsdelivr.net/npm/mathjax@4/tex-chtml.js';
const MATHJAX_SCRIPT_ID = 'mathjax-script';

const MATHJAX_MENU_SETTINGS: MathJaxMenuSettings = {
  assistiveMml: false,
  speech: false,
  braille: false,
  enrich: false,
  collapsible: false,
};

// ─── Module state ────────────────────────────────────────────────────────────

let mathJaxLoaderPromise: Promise<void> | null = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generic import wrapper that retries failed dynamic imports once after
 * a short delay. Used by route-level `React.lazy` to make view chunks
 * more resilient to transient network errors.
 */
export async function importWithRetry<T extends ComponentType<unknown>>(
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
    const defaultConfig: MathJaxConfig = {
      tex: {
        inlineMath: [['$', '$']],
        displayMath: [['$$', '$$']],
      },
      options: {
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

  const runtime = window.MathJax;

  runtime.options = {
    ...(runtime.options ?? {}),
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

    const runtimeProbe = window.MathJax;
    if (existing && typeof runtimeProbe?.typesetPromise === 'function') {
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
      const runtimeLoad = window.MathJax;
      if (runtimeLoad?.startup?.promise) {
        runtimeLoad.startup.promise
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

/** Trigger MathJax script loading/dispatch. Idempotent and cached. */
export function loadMathJax(): Promise<void> {
  return ensureMathJaxLoaded();
}
