/**
 * Tauri command errors are often plain objects `{ code, message }`, not `Error`
 * instances — unwrap them so UI can show the real message.
 */
export function formatTauriInvokeError(err: unknown): string {
  /**
   * Extract a readable message from a Tauri `invoke` error payload which may
   * be a string, an Error, or an object with `code`/`message` fields.
   */
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>;
    if (typeof o.message === 'string') {
      return typeof o.code === 'string' ? `${o.code}: ${o.message}` : o.message;
    }
    const nested = o.error;
    if (typeof nested === 'string') return nested;
    if (nested && typeof nested === 'object') {
      const inner = nested as Record<string, unknown>;
      if (typeof inner.message === 'string') return String(inner.message);
    }
    try {
      return JSON.stringify(err);
    } catch {
      // fall through
    }
  }
  return 'Unknown error';
}
