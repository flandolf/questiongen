import { useEffect, useRef, useState, useCallback } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

// ─── Types ────────────────────────────────────────────────────────────────────

type ToolType =
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'fill'
  | 'line'
  | 'rect'
  | 'ellipse';
type BgType = 'white' | 'dark' | 'graph' | 'transparent';

type SketchpadProps = {
  open?: boolean;
  onClose?: () => void;
  onSave: (dataUrl: string) => void;
  embedded?: boolean;
};

type ActivePointerMeta = {
  type: string;
  touchDownTime?: number;
  rejected?: boolean;
  strokeStarted?: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PALETTE = [
  '#111827',
  '#ffffff',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
  '#f59e0b',
];

const TOOL_KEYS: Record<string, ToolType> = {
  p: 'pen',
  h: 'highlighter',
  e: 'eraser',
  b: 'fill',
  l: 'line',
  r: 'rect',
  c: 'ellipse',
};

const TOOL_ICONS: Record<ToolType, string> = {
  pen: '✏️',
  highlighter: '🖊',
  eraser: '⬜',
  fill: '🪣',
  line: '╱',
  rect: '▭',
  ellipse: '⬭',
};

const TOOL_LABELS: Record<ToolType, string> = {
  pen: 'Pen (P)',
  highlighter: 'Highlighter (H)',
  eraser: 'Eraser (E)',
  fill: 'Fill (B)',
  line: 'Line (L)',
  rect: 'Rectangle (R)',
  ellipse: 'Ellipse (C)',
};

const PALM_REJECTION = {
  WIDTH_THRESHOLD: 35,
  HEIGHT_THRESHOLD: 35,
  MIN_PRESSURE: 0.05,
  MIN_TOUCH_DURATION: 50,
  EDGE_MARGIN: 15,
};

// ─── Flood Fill ───────────────────────────────────────────────────────────────

function hexToRgba(
  hex: string,
  alpha: number
): [number, number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b, Math.round(alpha * 255)];
}

function floodFill(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  fillColor: string,
  alpha: number
) {
  const canvas = ctx.canvas;
  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const idx = (x: number, y: number) => (y * w + x) * 4;
  const si = idx(startX, startY);
  const targetR = data[si],
    targetG = data[si + 1],
    targetB = data[si + 2],
    targetA = data[si + 3];
  const [fr, fg, fb, fa] = hexToRgba(fillColor, alpha);

  if (fr === targetR && fg === targetG && fb === targetB && fa === targetA)
    return;

  const matches = (i: number) =>
    data[i] === targetR &&
    data[i + 1] === targetG &&
    data[i + 2] === targetB &&
    data[i + 3] === targetA;

  const stack = [[startX, startY]];
  const visited = new Uint8Array(w * h);

  while (stack.length) {
    const [x, y] = stack.pop()!;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const flat = y * w + x;
    if (visited[flat]) continue;
    if (!matches(flat * 4)) continue;
    visited[flat] = 1;
    const i = flat * 4;
    data[i] = fr;
    data[i + 1] = fg;
    data[i + 2] = fb;
    data[i + 3] = fa;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  ctx.putImageData(imageData, 0, 0);
}

// ─── Draw shape preview ───────────────────────────────────────────────────────

function drawShape(
  ctx: CanvasRenderingContext2D,
  tool: ToolType,
  start: { x: number; y: number },
  end: { x: number; y: number }
) {
  ctx.beginPath();
  if (tool === 'line') {
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  } else if (tool === 'rect') {
    ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
  } else if (tool === 'ellipse') {
    const rx = Math.abs(end.x - start.x) / 2;
    const ry = Math.abs(end.y - start.y) / 2;
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function Sketchpad({
  open = true,
  onClose,
  onSave,
  embedded = false,
}: SketchpadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null); // shape preview layer
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#111827');
  const [size, setSize] = useState(4);
  const [opacity, setOpacity] = useState(1);
  const [smoothing, setSmoothing] = useState(0.5);
  const [activeTool, setActiveTool] = useState<ToolType>('pen');
  const [bg, setBg] = useState<BgType>('white');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const [, forceUpdate] = useState(0); // for undo/redo button state

  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const activePointers = useRef<Map<number, ActivePointerMeta>>(new Map());
  const activeDrawingPointerId = useRef<number | null>(null);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const shapeStart = useRef<{ x: number; y: number } | null>(null);
  const shapeSnapshot = useRef<string | null>(null);
  const previousNonEraserRef = useRef<ToolType>('pen');
  const isAndroid =
    typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

  // rAF batching refs to improve responsiveness on mobile/Android
  const moveRaf = useRef<number | null>(null);
  const lastMove = useRef<{
    x: number;
    y: number;
    pressure: number;
    pointerId: number;
  } | null>(null);
  const cursorRaf = useRef<number | null>(null);
  const lastCursor = useRef<{ x: number; y: number } | null>(null);
  const spaceDown = useRef(false);
  const panStart = useRef<{
    mx: number;
    my: number;
    px: number;
    py: number;
  } | null>(null);

  // Keep track of last non-eraser tool so we can restore it after toggling
  useEffect(() => {
    if (activeTool !== 'eraser') previousNonEraserRef.current = activeTool;
  }, [activeTool]);

  // Listen for native stylus double-tap events (emitted by the Android side via Tauri)
  useEffect(() => {
    if (!isAndroid) return;
    let unlisten: UnlistenFn | null = null;
    listen('stylus-double-tap', () => {
      setActiveTool((cur) =>
        cur !== 'eraser' ? 'eraser' : (previousNonEraserRef.current ?? 'pen')
      );
    })
      .then((u) => {
        unlisten = u;
      })
      .catch(() => {
        /* ignore if not running inside Tauri */
      });
    return () => {
      if (unlisten) unlisten();
    };
  }, [isAndroid]);

  // ── Canvas init ──────────────────────────────────────────────────────────

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const container = containerRef.current;
    if (!canvas || !overlay || !container) return;
    const deviceRatio = window.devicePixelRatio || 1;
    // Limit DPR on Android to avoid huge canvas sizes and keep responsiveness
    const ratio = isAndroid ? Math.min(deviceRatio, 2) : deviceRatio;
    // Measure the container, not the canvas (canvas is absolute so has no intrinsic size)
    const clientW = Math.max(1, Math.floor(container.clientWidth));
    const clientH = Math.max(1, Math.floor(container.clientHeight));
    const newW = Math.floor(clientW * ratio);
    const newH = Math.floor(clientH * ratio);

    // Always resize — skip guard so layout changes are always applied.
    // Preserve drawing by snapshotting first.
    let snapshot: string | null = null;
    if (canvas.width > 0 && canvas.height > 0) {
      try {
        snapshot = canvas.toDataURL('image/png');
      } catch {
        /* ignore */
      }
    }

    for (const c of [canvas, overlay]) {
      c.width = newW;
      c.height = newH;
      // Do NOT set style.width/height — CSS (w-full h-full) controls display size
      const ctx = c.getContext('2d')!;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    // Restore drawing content after resize
    if (snapshot) {
      const ctx = canvas.getContext('2d')!;
      const img = new Image();
      img.onload = () => {
        // Draw at device pixels but respect ratio clamp
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(img, 0, 0, newW, newH);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      };
      img.src = snapshot;
    }
  }, []);

  useEffect(() => {
    if (!embedded && !open) return;
    initCanvas();
  }, [embedded, open, initCanvas]);

  // ── Resize observer ──────────────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Use rAF so the browser finishes layout before we measure
    const handler = () => requestAnimationFrame(() => initCanvas());
    const ro = new ResizeObserver(handler);
    ro.observe(container);
    return () => ro.disconnect();
  }, [initCanvas]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown.current = true;
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.shiftKey ? redo() : undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        redo();
        return;
      }
      const tool = TOOL_KEYS[e.key.toLowerCase()];
      if (tool) setActiveTool(tool);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDown.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // ── Zoom via scroll ──────────────────────────────────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => Math.min(5, Math.max(0.2, z - e.deltaY * 0.001)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────

  function getCtx() {
    return canvasRef.current?.getContext('2d') ?? null;
  }
  function getOverlayCtx() {
    return overlayRef.current?.getContext('2d') ?? null;
  }
  function clearOverlay() {
    const canvas = overlayRef.current;
    const ctx = getOverlayCtx();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // Process pending pointer moves once per animation frame to avoid
  // heavy work on high-frequency pointermove events (improves Android)
  function processPendingMove() {
    moveRaf.current = null;
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    const m = lastMove.current;
    if (!m) return;

    const pt = { x: m.x, y: m.y };
    const pressure = m.pressure;

    if (
      ['line', 'rect', 'ellipse'].includes(activeTool) &&
      shapeStart.current &&
      shapeSnapshot.current
    ) {
      const octx = getOverlayCtx();
      if (!octx) return;
      clearOverlay();
      applyToolStyle(octx, pressure);
      drawShape(octx, activeTool, shapeStart.current, pt);
      return;
    }

    if (!lastPoint.current) return;

    applyToolStyle(ctx, pressure);

    const s = smoothing;
    const sx = lastPoint.current.x + (pt.x - lastPoint.current.x) * (1 - s);
    const sy = lastPoint.current.y + (pt.y - lastPoint.current.y) * (1 - s);

    ctx.quadraticCurveTo(
      lastPoint.current.x,
      lastPoint.current.y,
      (lastPoint.current.x + sx) / 2,
      (lastPoint.current.y + sy) / 2
    );
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo((lastPoint.current.x + sx) / 2, (lastPoint.current.y + sy) / 2);

    lastPoint.current = { x: sx, y: sy };
  }

  function pushUndo() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      // Synchronous toDataURL can be expensive on mobile; prefer toBlob
      // when available. Fall back to toDataURL if toBlob isn't supported.
      if (canvas.toBlob) {
        canvas.toBlob(
          (blob) => {
            try {
              if (!blob) return;
              const url = URL.createObjectURL(blob);
              undoStack.current.push(url);
              if (undoStack.current.length > 40) {
                const removed = undoStack.current.shift();
                if (removed && removed.startsWith('blob:'))
                  URL.revokeObjectURL(removed);
              }
              redoStack.current = [];
              forceUpdate((n) => n + 1);
            } catch {
              /* ignore */
            }
          },
          'image/png',
          0.9
        );
      } else {
        undoStack.current.push(canvas.toDataURL('image/png'));
      }
      if (undoStack.current.length > 40) undoStack.current.shift();
      redoStack.current = [];
      forceUpdate((n) => n + 1);
    } catch {
      /* ignore */
    }
  }

  function restoreImage(dataUrl: string) {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    const img = new Image();
    img.onload = () => {
      const ratio = window.devicePixelRatio || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      // Accept either data: URLs or blob object URLs
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    img.src = dataUrl;
  }

  function undo() {
    const canvas = canvasRef.current;
    if (!canvas || !undoStack.current.length) return;
    redoStack.current.push(canvas.toDataURL('image/png'));
    const last = undoStack.current.pop();
    if (last) restoreImage(last);
    forceUpdate((n) => n + 1);
  }

  function redo() {
    const canvas = canvasRef.current;
    if (!canvas || !redoStack.current.length) return;
    undoStack.current.push(canvas.toDataURL('image/png'));
    const next = redoStack.current.pop();
    if (next) restoreImage(next);
    forceUpdate((n) => n + 1);
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    pushUndo();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    forceUpdate((n) => n + 1);
  }

  function getCanvasPoint(e: PointerEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / zoom,
      y: (e.clientY - rect.top) / zoom,
    };
  }

  function applyToolStyle(ctx: CanvasRenderingContext2D, pressure: number) {
    ctx.lineWidth = Math.max(1, size * pressure);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (activeTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else if (activeTool === 'highlighter') {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.4 * opacity;
      ctx.strokeStyle = color;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = color;
    }
  }

  function hasActivePenPointer() {
    return Array.from(activePointers.current.values()).some(
      (pointer) => pointer.type === 'pen'
    );
  }

  function isNearCanvasEdge(e: PointerEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    return (
      localX < PALM_REJECTION.EDGE_MARGIN ||
      localY < PALM_REJECTION.EDGE_MARGIN ||
      rect.width - localX < PALM_REJECTION.EDGE_MARGIN ||
      rect.height - localY < PALM_REJECTION.EDGE_MARGIN
    );
  }

  function isLikelyPalmTouch(e: PointerEvent) {
    if (e.pointerType !== 'touch') return false;
    const isLargeContact =
      e.width >= PALM_REJECTION.WIDTH_THRESHOLD ||
      e.height >= PALM_REJECTION.HEIGHT_THRESHOLD;
    const isVeryLightTouch =
      e.pressure > 0 && e.pressure < PALM_REJECTION.MIN_PRESSURE;
    const isEdgeTouch = isNearCanvasEdge(e);
    return isLargeContact || isVeryLightTouch || isEdgeTouch;
  }

  function startStroke(
    pointerId: number,
    pt: { x: number; y: number },
    ctx: CanvasRenderingContext2D,
    pressure: number
  ) {
    pushUndo();
    setIsDrawing(true);
    lastPoint.current = pt;
    activeDrawingPointerId.current = pointerId;
    ctx.beginPath();
    applyToolStyle(ctx, pressure);
    ctx.moveTo(pt.x, pt.y);
  }

  // ── Pointer handlers ─────────────────────────────────────────────────────

  function handlePointerDown(e: PointerEvent) {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;

    // Pan mode
    if (spaceDown.current) {
      setIsPanning(true);
      panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
      return;
    }

    if (e.pointerType === 'touch' && hasActivePenPointer()) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    activePointers.current.set(e.pointerId, {
      type: e.pointerType,
      touchDownTime: e.pointerType === 'touch' ? performance.now() : undefined,
      rejected: e.pointerType === 'touch' && isLikelyPalmTouch(e),
      strokeStarted: false,
    });

    const pointerMeta = activePointers.current.get(e.pointerId);
    if (!pointerMeta || pointerMeta.rejected) return;

    const pt = getCanvasPoint(e);
    const pressure = e.pressure > 0 ? e.pressure : 1;

    if (activeTool === 'fill') {
      pushUndo();
      floodFill(ctx, Math.round(pt.x), Math.round(pt.y), color, opacity);
      return;
    }

    if (['line', 'rect', 'ellipse'].includes(activeTool)) {
      pushUndo();
      shapeStart.current = pt;
      shapeSnapshot.current = canvas.toDataURL('image/png');
      setIsDrawing(true);
      activeDrawingPointerId.current = e.pointerId;
      pointerMeta.strokeStarted = true;
      return;
    }

    // Temporal filter for accidental palm taps on freehand tools.
    if (
      e.pointerType === 'touch' &&
      PALM_REJECTION.MIN_TOUCH_DURATION > 0 &&
      ['pen', 'highlighter', 'eraser'].includes(activeTool)
    ) {
      return;
    }

    startStroke(e.pointerId, pt, ctx, pressure);
    pointerMeta.strokeStarted = true;
  }

  function handlePointerMove(e: PointerEvent) {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    const pt = getCanvasPoint(e);

    // Throttle cursor updates to rAF to avoid re-render storms
    lastCursor.current = { x: e.clientX, y: e.clientY };
    if (!cursorRaf.current) {
      cursorRaf.current = requestAnimationFrame(() => {
        cursorRaf.current = null;
        const c = lastCursor.current;
        if (c) setCursorPos({ x: c.x, y: c.y });
      });
    }

    // Pan handling remains immediate
    if (isPanning && panStart.current) {
      setPan({
        x: panStart.current.px + (e.clientX - panStart.current.mx),
        y: panStart.current.py + (e.clientY - panStart.current.my),
      });
      return;
    }

    const pointerMeta = activePointers.current.get(e.pointerId);
    if (!pointerMeta || pointerMeta.rejected) return;

    // For touch inputs, keep existing temporal filter
    if (pointerMeta.type === 'touch' && !pointerMeta.strokeStarted) {
      const touchDownTime = pointerMeta.touchDownTime ?? performance.now();
      const elapsed = performance.now() - touchDownTime;
      if (
        ['pen', 'highlighter', 'eraser'].includes(activeTool) &&
        elapsed < PALM_REJECTION.MIN_TOUCH_DURATION
      ) {
        return;
      }
      const pressureForStart = e.pressure > 0 ? e.pressure : 1;
      startStroke(e.pointerId, pt, ctx, pressureForStart);
      pointerMeta.strokeStarted = true;
      return;
    }

    if (!isDrawing) return;
    if (activeDrawingPointerId.current !== e.pointerId) return;

    const pressure = e.pressure > 0 ? e.pressure : 1;

    // Batch shape overlay / drawing per-frame
    lastMove.current = { x: pt.x, y: pt.y, pressure, pointerId: e.pointerId };
    if (!moveRaf.current)
      moveRaf.current = requestAnimationFrame(processPendingMove);
  }

  function handlePointerUp(e: PointerEvent) {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;

    if (isPanning) {
      setIsPanning(false);
      panStart.current = null;
      return;
    }

    const pointerMeta = activePointers.current.get(e.pointerId);
    if (!pointerMeta) return;

    if (pointerMeta.type === 'touch') {
      const elapsed =
        performance.now() - (pointerMeta.touchDownTime ?? performance.now());
      if (
        elapsed < PALM_REJECTION.MIN_TOUCH_DURATION &&
        !pointerMeta.strokeStarted
      ) {
        activePointers.current.delete(e.pointerId);
        return;
      }
    }

    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    activePointers.current.delete(e.pointerId);

    if (
      activeDrawingPointerId.current !== null &&
      e.pointerId !== activeDrawingPointerId.current
    ) {
      return;
    }

    // Ensure any pending move is flushed before finishing stroke
    if (moveRaf.current) {
      cancelAnimationFrame(moveRaf.current);
      moveRaf.current = null;
      processPendingMove();
    }

    const pt = getCanvasPoint(e);
    const pressure = e.pressure > 0 ? e.pressure : 1;

    // Commit shape to main canvas
    if (
      ['line', 'rect', 'ellipse'].includes(activeTool) &&
      shapeStart.current
    ) {
      clearOverlay();
      applyToolStyle(ctx, pressure);
      drawShape(ctx, activeTool, shapeStart.current, pt);
      shapeStart.current = null;
      shapeSnapshot.current = null;
    }

    setIsDrawing(false);
    lastPoint.current = null;
    activeDrawingPointerId.current = null;
    ctx.closePath();
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [
    isDrawing,
    isPanning,
    color,
    size,
    opacity,
    smoothing,
    activeTool,
    zoom,
    pan,
  ]);

  // Cleanup any pending animation frames on unmount
  useEffect(() => {
    return () => {
      if (moveRaf.current) cancelAnimationFrame(moveRaf.current);
      if (cursorRaf.current) cancelAnimationFrame(cursorRaf.current);
    };
  }, []);

  // ── Export ───────────────────────────────────────────────────────────────

  async function saveAsDataUrl(): Promise<string> {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error('Canvas missing');
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Unable to export'));
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Read error'));
          reader.readAsDataURL(blob);
        },
        'image/webp',
        0.92
      );
    });
  }

  function downloadPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Composite bg + drawing
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const tctx = tmp.getContext('2d')!;

    if (bg === 'white') {
      tctx.fillStyle = '#ffffff';
      tctx.fillRect(0, 0, tmp.width, tmp.height);
    } else if (bg === 'dark') {
      tctx.fillStyle = '#1a1a2e';
      tctx.fillRect(0, 0, tmp.width, tmp.height);
    }
    tctx.drawImage(canvas, 0, 0);

    const a = document.createElement('a');
    a.download = `sketch-${Date.now()}.png`;
    a.href = tmp.toDataURL('image/png');
    a.click();
  }

  // ── Background rendering ─────────────────────────────────────────────────

  function getBgStyle(): React.CSSProperties {
    if (bg === 'white') return { background: '#ffffff' };
    if (bg === 'dark') return { background: '#1a1a2e' };
    if (bg === 'graph')
      return {
        background: '#ffffff',
        backgroundImage:
          'linear-gradient(#e0e0e0 1px, transparent 1px), linear-gradient(90deg, #e0e0e0 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      };
    return {
      background:
        'repeating-conic-gradient(#ccc 0% 25%, transparent 0% 50%) 0 0 / 16px 16px',
    };
  }

  // Ensure performant rendering hints on mobile/Android
  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;
    canvas.style.touchAction = 'none';
    overlay.style.touchAction = 'none';
    canvas.style.willChange = 'transform';
    overlay.style.willChange = 'transform';
    // Reduce smoothing on Android devices with high DPR to reduce work
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.imageSmoothingEnabled = !isAndroid;
  }, [isAndroid]);

  // ── Cursor ───────────────────────────────────────────────────────────────

  const cursorStyle = spaceDown.current
    ? isPanning
      ? 'grabbing'
      : 'grab'
    : activeTool === 'eraser'
      ? 'cell'
      : activeTool === 'fill'
        ? 'crosshair'
        : 'none'; // hidden — we render a custom cursor dot

  // ── UI ───────────────────────────────────────────────────────────────────

  const canvasArea = (
    <div
      ref={containerRef}
      className="relative flex-1 min-w-0 min-h-0 rounded-xl overflow-hidden border border-white/10 shadow-2xl"
      style={{ ...getBgStyle(), minHeight: 360 }}
    >
      {/* Custom brush cursor */}
      {cursorPos &&
        activeTool !== 'eraser' &&
        activeTool !== 'fill' &&
        !spaceDown.current && (
          <div
            className="pointer-events-none fixed z-50 rounded-full border-2 border-black/40"
            style={{
              left: cursorPos.x,
              top: cursorPos.y,
              width: size,
              height: size,
              transform: 'translate(-50%, -50%)',
              background:
                activeTool === 'highlighter' ? color + '66' : 'transparent',
              borderColor: color,
              boxShadow: `0 0 0 1px white`,
              transition: 'width 0.1s, height 0.1s',
            }}
          />
        )}

      {/* Drawing canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{
          cursor: cursorStyle,
          touchAction: 'none',
          transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
          transformOrigin: '0 0',
        }}
      />

      {/* Shape preview overlay */}
      <canvas
        ref={overlayRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{
          transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
          transformOrigin: '0 0',
        }}
      />

      {/* Zoom indicator */}
      {zoom !== 1 && (
        <div className="absolute bottom-3 right-3 text-xs font-mono bg-black/60 text-white px-2 py-1 rounded-md pointer-events-none">
          {Math.round(zoom * 100)}%
        </div>
      )}
      <div className="absolute bottom-3 left-3 text-xs text-black/30 pointer-events-none select-none">
        Ctrl+scroll to zoom · Space+drag to pan
      </div>
    </div>
  );

  const toolbar = (
    <div className="flex flex-col gap-3 w-[200px] shrink-0">
      {/* Tools */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-2">
        <p className="text-[10px] uppercase tracking-widest text-white/30 mb-2 px-1">
          Tools
        </p>
        <div className="grid grid-cols-2 gap-1">
          {(Object.keys(TOOL_ICONS) as ToolType[]).map((tool) => (
            <button
              key={tool}
              onClick={() => setActiveTool(tool)}
              title={TOOL_LABELS[tool]}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTool === tool
                  ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                  : 'text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="text-sm">{TOOL_ICONS[tool]}</span>
              <span className="truncate">
                {tool.charAt(0).toUpperCase() + tool.slice(1)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Color */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-2">
        <p className="text-[10px] uppercase tracking-widest text-white/30 mb-2 px-1">
          Color
        </p>
        <div className="grid grid-cols-6 gap-1 mb-2">
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-md transition-all border-2 ${
                color === c
                  ? 'border-white scale-110 shadow-lg'
                  : 'border-transparent hover:scale-105'
              }`}
              style={{ background: c === '#ffffff' ? '#f0f0f0' : c }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-8 h-8 cursor-pointer rounded-lg border border-white/20"
            disabled={activeTool === 'eraser'}
          />
          <span className="text-xs font-mono text-white/50">{color}</span>
        </div>
      </div>

      {/* Brush settings */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-2">
        <p className="text-[10px] uppercase tracking-widest text-white/30 mb-2 px-1">
          Brush
        </p>
        <label className="flex flex-col gap-1 mb-2">
          <span className="text-xs text-white/40 flex justify-between">
            <span>Size</span>
            <span className="font-mono">{size}px</span>
          </span>
          <input
            type="range"
            min={1}
            max={80}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="w-full accent-indigo-400"
          />
        </label>
        <label className="flex flex-col gap-1 mb-2">
          <span className="text-xs text-white/40 flex justify-between">
            <span>Opacity</span>
            <span className="font-mono">{Math.round(opacity * 100)}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(opacity * 100)}
            onChange={(e) => setOpacity(Number(e.target.value) / 100)}
            disabled={activeTool === 'eraser'}
            className="w-full accent-indigo-400"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-white/40 flex justify-between">
            <span>Smoothing</span>
            <span className="font-mono">{Math.round(smoothing * 100)}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={90}
            value={Math.round(smoothing * 100)}
            onChange={(e) => setSmoothing(Number(e.target.value) / 100)}
            disabled={['fill', 'line', 'rect', 'ellipse'].includes(activeTool)}
            className="w-full accent-indigo-400"
          />
        </label>
      </div>

      {/* Canvas */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-2">
        <p className="text-[10px] uppercase tracking-widest text-white/30 mb-2 px-1">
          Canvas
        </p>
        <div className="grid grid-cols-2 gap-1 mb-2">
          {(['white', 'dark', 'graph', 'transparent'] as BgType[]).map((b) => (
            <button
              key={b}
              onClick={() => setBg(b)}
              className={`py-1 text-xs rounded-lg border transition-all ${
                bg === b
                  ? 'border-indigo-400 text-indigo-300 bg-indigo-500/10'
                  : 'border-white/10 text-white/50 hover:border-white/30 hover:text-white/80'
              }`}
            >
              {b.charAt(0).toUpperCase() + b.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setZoom((z) => Math.min(5, z + 0.25))}
            className="flex-1 text-xs py-1 rounded-lg border border-white/10 text-white/50 hover:bg-white/10 hover:text-white"
          >
            +
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="flex-1 text-xs py-1 rounded-lg border border-white/10 text-white/50 hover:bg-white/10 hover:text-white"
          >
            1:1
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.2, z - 0.25))}
            className="flex-1 text-xs py-1 rounded-lg border border-white/10 text-white/50 hover:bg-white/10 hover:text-white"
          >
            −
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-2">
        <p className="text-[10px] uppercase tracking-widest text-white/30 mb-2 px-1">
          Actions
        </p>
        <div className="flex gap-1 mb-1">
          <button
            onClick={undo}
            disabled={undoStack.current.length === 0}
            className="flex-1 py-1 text-xs rounded-lg border border-white/10 text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ↩ Undo
          </button>
          <button
            onClick={redo}
            disabled={redoStack.current.length === 0}
            className="flex-1 py-1 text-xs rounded-lg border border-white/10 text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ↪ Redo
          </button>
        </div>
        <button
          onClick={clearCanvas}
          className="w-full py-1.5 text-xs rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 mb-1"
        >
          🗑 Clear
        </button>
        <button
          onClick={downloadPng}
          className="w-full py-1.5 text-xs rounded-lg border border-white/10 text-white/60 hover:bg-white/10 hover:text-white mb-1"
        >
          ⬇ Download PNG
        </button>
        <button
          onClick={async () => {
            try {
              onSave(await saveAsDataUrl());
            } catch {
              /* ignore */
            }
          }}
          className="w-full py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all"
        >
          Export
        </button>
      </div>
    </div>
  );

  if (!embedded && !open) return null;

  const inner = (
    <div
      className="flex gap-4 h-full min-h-0"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      {toolbar}
      {canvasArea}
    </div>
  );

  if (embedded) {
    return <div className="flex-1 min-h-0">{inner}</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={() => onClose?.()}
      />
      <div
        className="relative w-full max-w-6xl mx-4 rounded-2xl border border-white/10 p-5 shadow-2xl flex flex-col"
        style={{
          background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%)',
          maxHeight: '95vh',
        }}
      >
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <div
                className="w-3 h-3 rounded-full bg-red-500/80 cursor-pointer"
                onClick={() => onClose?.()}
              />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <h3 className="text-base font-semibold text-white/70">
              Sketchpad Studio
            </h3>
          </div>
        </div>
        <div className="flex-1 min-h-0">{inner}</div>
      </div>
    </div>
  );
}

export default Sketchpad;
