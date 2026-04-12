import { useAppStore } from '@/store';

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;
const originalDebug = console.debug;
const originalInfo = console.info;

let isLogging = false;

function wrapLog(
  level: 'log' | 'warn' | 'error' | 'debug' | 'info',
  original: (...args: unknown[]) => void,
) {
  /**
   * Wrap console functions so logs are forwarded into the app store.
   * Guards against re-entrancy and ensures original console behavior is preserved.
   */
  return (...args: unknown[]) => {
    // Always call original first
    original(...args);

    if (isLogging) return;
    isLogging = true;
    try {
      const message = args
        .map((arg) => {
          if (arg instanceof Error) {
            return `${arg.name}: ${arg.message}\n${arg.stack ?? ''}`;
          }
          if (typeof arg === 'object' && arg !== null) {
            try {
              return JSON.stringify(arg, null, 2);
            } catch {
              return '[Unserializable Object]';
            }
          }
          return String(arg);
        })
        .join(' ');

      // Use the store to add the log
      useAppStore.getState().addLog({ level, message });
    } catch {
      // Ignore errors in logger to avoid infinite loops
    } finally {
      isLogging = false;
    }
  };
}

export function initLogger() {
  /**
   * Replace console methods with wrapped versions that persist logs to store.
   * Call once during app initialization.
   */
  console.log = wrapLog('log', originalLog);
  console.warn = wrapLog('warn', originalWarn);
  console.error = wrapLog('error', originalError);
  console.debug = wrapLog('debug', originalDebug);
  console.info = wrapLog('info', originalInfo);
}
