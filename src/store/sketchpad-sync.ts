import {
  INTERNAL_RES_HEIGHT,
  INTERNAL_RES_WIDTH,
  paintBackground,
} from '../components/sketchpadUtils';
import { getLuminance } from '../lib/color-helpers';
import {
  parseStrokesFromSvgString,
  renderStrokesToCanvas,
} from '../lib/sketchpad-renderer';
import { getStoreItem } from '../lib/tauri-store';

export interface ExportOptions {
  forceLightTheme?: boolean;
}

// ─── Legacy SketchpadApi kept for imperative-handle / backward compat ─────────
export interface SketchpadApi {
  exportDataUrl: (options?: ExportOptions) => Promise<string>;
  save: () => Promise<void>;
  registeredAt: number;
}

declare global {
  interface Window {
    __sketchpadLiveApis?: Map<string, SketchpadApi>;
  }
}

const getGlobalApis = (): Map<string, SketchpadApi> => {
  if (!window.__sketchpadLiveApis) {
    window.__sketchpadLiveApis = new Map<string, SketchpadApi>();
  }
  return window.__sketchpadLiveApis;
};

export const sketchpadLiveApis = {
  set: (key: string, api: SketchpadApi) => getGlobalApis().set(key, api),
  get: (key: string) => getGlobalApis().get(key),
  delete: (key: string) => getGlobalApis().delete(key),
  keys: () => Array.from(getGlobalApis().keys()),
};

// ─── Event-based export (new, reliable approach) ──────────────────────────────
//
// Instead of calling a potentially stale function reference from a global map,
// we dispatch a CustomEvent requesting the live Sketchpad to export itself.
// The Sketchpad component listens for this event and responds with the data URL.
// This completely avoids stale closures because the Sketchpad handles the export
// in its own execution context with its own live state.

export interface SketchpadExportRequest {
  sessionKey: string;
  requestId: string;
  options?: ExportOptions;
}

export interface SketchpadExportResponse {
  requestId: string;
  dataUrl: string;
}

/**
 * Request a live export from the Sketchpad via CustomEvents.
 * Returns the data URL if a live Sketchpad responds within the timeout,
 * otherwise returns undefined.
 */
function requestLiveExport(
  sessionKey: string,
  options?: ExportOptions,
  timeoutMs = 3000,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    let settled = false;

    const handleResponse = (e: Event) => {
      const detail = (e as CustomEvent<SketchpadExportResponse>).detail;
      if (detail.requestId !== requestId) return;
      if (settled) return;
      settled = true;
      window.removeEventListener('sketchpad-export-response', handleResponse);
      resolve(detail.dataUrl);
    };

    window.addEventListener('sketchpad-export-response', handleResponse);

    // Dispatch the request
    window.dispatchEvent(
      new CustomEvent<SketchpadExportRequest>('sketchpad-export-request', {
        detail: { sessionKey, requestId, options },
      }),
    );

    // Timeout fallback
    setTimeout(() => {
      if (settled) return;
      settled = true;
      window.removeEventListener('sketchpad-export-response', handleResponse);
      console.log(
        `[SketchpadSync] Live export timed out for ${sessionKey} after ${timeoutMs}ms`,
      );
      resolve(undefined);
    }, timeoutMs);
  });
}

/**
 * Helper to fetch a fresh screenshot from a live Sketchpad instance,
 * falling back to the persisted storage if the instance is unmounted.
 */
export async function getLatestSketch(
  sessionKey: string,
  options?: ExportOptions,
): Promise<string | undefined> {
  console.log(`[SketchpadSync] getLatestSketch: ${sessionKey}`);

  // 1. Try the event-based live export (preferred, no stale closures)
  const liveResult = await requestLiveExport(sessionKey, options);
  if (liveResult) {
    console.log(
      `[SketchpadSync] Live export success: ${liveResult.length} chars`,
    );
    return liveResult;
  }

  // 2. Fallback: Restore from storage and render manually if the Sketchpad is unmounted
  console.log(
    `[SketchpadSync] No live response for ${sessionKey}, checking storage.`,
  );
  try {
    const storageKey = `sketchpad-canvas-${sessionKey}`;
    const payload = await getStoreItem<{ strokeSvg?: string }>(storageKey);
    if (!payload?.strokeSvg) {
      console.log(`[SketchpadSync] No storage found for ${sessionKey}`);
      return undefined;
    }

    const strokes = parseStrokesFromSvgString(payload.strokeSvg);
    if (strokes.length === 0) {
      console.log(`[SketchpadSync] Stored SVG is empty for ${sessionKey}`);
      return undefined;
    }

    // Render the stored strokes to a temporary canvas
    const canvas = document.createElement('canvas');
    canvas.width = INTERNAL_RES_WIDTH;
    canvas.height = INTERNAL_RES_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const forceLight = options?.forceLightTheme ?? false;

    // Prepare strokes for light theme if needed
    const strokesToRender = forceLight
      ? strokes.map((s) => {
          if (s.tool === 'eraser') return s;
          if (getLuminance(s.color) > 0.7) {
            return { ...s, color: '#111827' };
          }
          return s;
        })
      : strokes;

    // To handle erasers correctly, we MUST render strokes onto a
    // separate transparent layer first, then composite that layer over the
    // background. Otherwise, 'destination-out' erases the paper background too.
    const strokeLayer = document.createElement('canvas');
    strokeLayer.width = INTERNAL_RES_WIDTH;
    strokeLayer.height = INTERNAL_RES_HEIGHT;
    const strokeCtx = strokeLayer.getContext('2d');
    if (!strokeCtx) return undefined;

    // Paint background on main canvas
    paintBackground(
      ctx,
      INTERNAL_RES_WIDTH,
      INTERNAL_RES_HEIGHT,
      'lined',
      false,
      1,
      { x: 0, y: 0 },
      1,
      '#ffffff',
      forceLight,
    );

    // Render strokes to the transparent layer
    renderStrokesToCanvas(strokeCtx, strokesToRender, {
      dpr: 1,
      zoom: 1,
      pan: { x: 0, y: 0 },
      clear: true,
      quality: 'high',
    });

    // Composite
    ctx.drawImage(strokeLayer, 0, 0);

    const dataUrl = canvas.toDataURL('image/png');
    console.log(
      `[SketchpadSync] Storage fallback success: ${dataUrl.length} chars`,
    );
    return dataUrl;
  } catch (err) {
    console.warn(
      `[SketchpadSync] Fallback render failed for ${sessionKey}:`,
      err,
    );
    return undefined;
  }
}
