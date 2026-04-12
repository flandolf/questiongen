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
      let data: unknown = undefined;
      const messageParts: string[] = [];

      args.forEach((arg) => {
        if (arg instanceof Error) {
          messageParts.push(`${arg.name}: ${arg.message}\n${arg.stack ?? ''}`);
        } else if (typeof arg === 'object' && arg !== null) {
          if (data === undefined) {
            data = arg;
          } else {
            // If we already have a data object, just stringify this one into the message
            try {
              messageParts.push(JSON.stringify(arg, null, 2));
            } catch {
              messageParts.push('[Unserializable Object]');
            }
          }
        } else {
          messageParts.push(String(arg));
        }
      });

      const message = messageParts.join(' ');

      // Use the store to add the log
      useAppStore.getState().addLog({ level, message, data });
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
