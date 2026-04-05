import type { UnlistenFn } from '@tauri-apps/api/event';
import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ToolType =
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'fill'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'text';
type BgType = 'white-grid' | 'black-grid';

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
  t: 'text',
};

const TOOL_ICONS: Record<ToolType, string> = {
  pen: '✏️',
  highlighter: '🖊',
  eraser: '⬜',
  fill: '🪣',
  line: '╱',
  rect: '▭',
  ellipse: '⬭',
  text: 'T',
};

const TOOL_LABELS: Record<ToolType, string> = {
  pen: 'Pen (P)',
  highlighter: 'Highlighter (H)',
  eraser: 'Eraser (E)',
  fill: 'Fill (B)',
  line: 'Line (L)',
  rect: 'Rectangle (R)',
  ellipse: 'Ellipse (C)',
  text: 'Text (T)',
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

function paintBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  bg: BgType
) {
  if (bg === 'black-grid') {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#666666';
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#d0d0d0';
  }

  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0.5; x < width; x += 20) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = 0.5; y < height; y += 20) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function Sketchpad({
  open = true,
  onClose,
  onSave,
  embedded = false,
}: SketchpadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);
  // Dedicated background canvas — sits below the drawing canvas so grid is
  // always painted directly and isn't blocked by GPU compositing layers.
  const bgRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#111827');
  const [size, setSize] = useState(4);
  const [opacity, setOpacity] = useState(1);
  const [smoothing, setSmoothing] = useState(0.5);
  const [activeTool, setActiveTool] = useState<ToolType>('pen');
  const [textInput, setTextInput] = useState<{
    id: number;
    x: number;
    y: number;
    value: string;
  } | null>(null);
  const [bg, setBg] = useState<BgType>('white-grid');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const [, forceUpdate] = useState(0);
  const hasExplicitlySaved = useRef(false);

  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const activePointers = useRef<Map<number, ActivePointerMeta>>(new Map());
  const activeDrawingPointerId = useRef<number | null>(null);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const shapeStart = useRef<{ x: number; y: number } | null>(null);
  const shapeSnapshot = useRef<string | null>(null);
  const previousNonEraserRef = useRef<ToolType>('pen');
  const hasMoved = useRef(false);
  const isAndroid =
    typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

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
  const middleDown = useRef(false);
  const panStart = useRef<{
    mx: number;
    my: number;
    px: number;
    py: number;
  } | null>(null);

  // Keep ref so bg-repaint effect always sees latest value
  const bgRef2 = useRef<BgType>(bg);
  useEffect(() => {
    bgRef2.current = bg;
  }, [bg]);

  useEffect(() => {
    if (activeTool !== 'eraser') previousNonEraserRef.current = activeTool;
  }, [activeTool]);

  useEffect(() => {
    if (!textInput) return;
    const raf = requestAnimationFrame(() => {
      const input = textInputRef.current;
      if (!input) return;
      input.focus();
      input.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [textInput?.id]);

  useEffect(() => {
    if (activeTool === 'eraser') {
      setSize(70);
    } else if (size === 70) {
      setSize(4);
    }
  }, [activeTool, size]);

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
    const bgCanvas = bgRef.current;
    const container = containerRef.current;
    if (!canvas || !overlay || !bgCanvas || !container) return;

    const deviceRatio = window.devicePixelRatio || 1;
    const ratio = deviceRatio;
    const clientW = Math.max(1, Math.floor(container.clientWidth));
    const clientH = Math.max(1, Math.floor(container.clientHeight));
    const newW = Math.floor(clientW * ratio);
    const newH = Math.floor(clientH * ratio);

    // Preserve drawing content across resizes
    let snapshot: string | null = null;
    if (canvas.width > 0 && canvas.height > 0) {
      try {
        snapshot = canvas.toDataURL('image/png');
      } catch {
        /* ignore */
      }
    }

    // Resize drawing + overlay canvases
    for (const c of [canvas, overlay]) {
      c.width = newW;
      c.height = newH;
      const ctx = c.getContext('2d')!;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    // Resize and paint background canvas
    bgCanvas.width = newW;
    bgCanvas.height = newH;
    const bgCtx = bgCanvas.getContext('2d')!;
    bgCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    paintBackground(bgCtx, clientW, clientH, bgRef2.current);

    // Restore drawing content after resize
    if (snapshot) {
      const ctx = canvas.getContext('2d')!;
      const img = new Image();
      img.onload = () => {
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

  // ── Repaint background canvas whenever bg theme changes ──────────────────
  // This is the core fix: instead of relying on CSS bleeding through a
  // GPU-composited canvas layer (unreliable), we paint the grid directly
  // onto a dedicated background canvas element.
  useEffect(() => {
    const bgCanvas = bgRef.current;
    if (!bgCanvas || bgCanvas.width === 0 || bgCanvas.height === 0) return;
    const ratio = window.devicePixelRatio || 1;
    const bgCtx = bgCanvas.getContext('2d')!;
    bgCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    paintBackground(bgCtx, bgCanvas.width / ratio, bgCanvas.height / ratio, bg);
  }, [bg]);

  // ── Resize observer ──────────────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = () => requestAnimationFrame(() => initCanvas());
    const ro = new ResizeObserver(handler);
    ro.observe(container);
    return () => ro.disconnect();
  }, [initCanvas]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      if (target.isContentEditable) return true;
      const tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };

    const down = (e: KeyboardEvent) => {
      const textBoxFocused = document.activeElement === textInputRef.current;
      if (textBoxFocused || isEditableTarget(e.target) || textInput !== null) {
        return;
      }

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
  }, [textInput]);

  // ── Zoom via scroll and pinch ────────────────────────────────────────────

  const initialTouchesRef = useRef<{ x: number; y: number }[]>([]);
  const initialZoomRef = useRef(1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => Math.min(5, Math.max(0.2, z - e.deltaY * 0.001)));
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        initialTouchesRef.current = [
          { x: e.touches[0].clientX, y: e.touches[0].clientY },
          { x: e.touches[1].clientX, y: e.touches[1].clientY },
        ];
        initialZoomRef.current = zoom;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const touches = [
          { x: e.touches[0].clientX, y: e.touches[0].clientY },
          { x: e.touches[1].clientX, y: e.touches[1].clientY },
        ];
        const initialDist = Math.hypot(
          initialTouchesRef.current[1].x - initialTouchesRef.current[0].x,
          initialTouchesRef.current[1].y - initialTouchesRef.current[0].y
        );
        const currentDist = Math.hypot(
          touches[1].x - touches[0].x,
          touches[1].y - touches[0].y
        );
        const scale = currentDist / initialDist;
        setZoom(() =>
          Math.min(5, Math.max(0.2, initialZoomRef.current * scale))
        );
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
    };
  }, [zoom]);

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

    if (activeTool === 'text') return;

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
    hasExplicitlySaved.current = false;
    try {
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
      ctx.fillStyle = 'rgba(0,0,0,1)';
    } else if (activeTool === 'highlighter') {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.4 * opacity;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
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

    if (spaceDown.current || e.button === 1) {
      if (e.button === 1) middleDown.current = true;
      setIsPanning(true);
      panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
      e.preventDefault();
      return;
    }

    const pt = getCanvasPoint(e);

    if (activeTool === 'text') {
      setTextInput({ id: Date.now(), x: pt.x, y: pt.y, value: '' });
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

    if (
      e.pointerType === 'touch' &&
      PALM_REJECTION.MIN_TOUCH_DURATION > 0 &&
      ['pen', 'highlighter', 'eraser'].includes(activeTool)
    ) {
      return;
    }

    hasMoved.current = false;
    startStroke(e.pointerId, pt, ctx, pressure);
    pointerMeta.strokeStarted = true;
  }

  function handlePointerMove(e: PointerEvent) {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    const pt = getCanvasPoint(e);

    lastCursor.current = { x: e.clientX, y: e.clientY };
    if (!cursorRaf.current) {
      cursorRaf.current = requestAnimationFrame(() => {
        cursorRaf.current = null;
        const c = lastCursor.current;
        if (c) setCursorPos({ x: c.x, y: c.y });
      });
    }

    if (isPanning && panStart.current) {
      setPan({
        x: panStart.current.px + (e.clientX - panStart.current.mx),
        y: panStart.current.py + (e.clientY - panStart.current.my),
      });
      return;
    }

    const pointerMeta = activePointers.current.get(e.pointerId);
    if (!pointerMeta || pointerMeta.rejected) return;

    if (activeTool === 'text' || activeTool === 'fill') return;

    const isFreehandTool = ['pen', 'highlighter', 'eraser'].includes(
      activeTool
    );

    if (pointerMeta.type === 'touch' && !pointerMeta.strokeStarted) {
      if (!isFreehandTool) return;
      const touchDownTime = pointerMeta.touchDownTime ?? performance.now();
      const elapsed = performance.now() - touchDownTime;
      if (elapsed < PALM_REJECTION.MIN_TOUCH_DURATION) {
        return;
      }
      const pressureForStart = e.pressure > 0 ? e.pressure : 1;
      startStroke(e.pointerId, pt, ctx, pressureForStart);
      pointerMeta.strokeStarted = true;
      return;
    }

    if (!isDrawing) return;
    if (activeDrawingPointerId.current !== e.pointerId) return;

    hasMoved.current = true;
    const pressure = e.pressure > 0 ? e.pressure : 1;

    lastMove.current = { x: pt.x, y: pt.y, pressure, pointerId: e.pointerId };
    if (!moveRaf.current)
      moveRaf.current = requestAnimationFrame(processPendingMove);
  }

  function handlePointerUp(e: PointerEvent) {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;

    if (isPanning && (spaceDown.current || e.button === 1)) {
      if (e.button === 1) middleDown.current = false;
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

    if (moveRaf.current) {
      cancelAnimationFrame(moveRaf.current);
      moveRaf.current = null;
      processPendingMove();
    }

    const pt = getCanvasPoint(e);
    const pressure = e.pressure > 0 ? e.pressure : 1;

    if (
      ['line', 'rect', 'ellipse'].includes(activeTool) &&
      shapeStart.current
    ) {
      clearOverlay();
      applyToolStyle(ctx, pressure);
      drawShape(ctx, activeTool, shapeStart.current, pt);
      shapeStart.current = null;
      shapeSnapshot.current = null;
    } else if (
      !hasMoved.current &&
      ['pen', 'highlighter', 'eraser'].includes(activeTool)
    ) {
      applyToolStyle(ctx, pressure);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, Math.max(1, size / 2), 0, Math.PI * 2);
      ctx.fill();
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

  useEffect(() => {
    return () => {
      if (moveRaf.current) cancelAnimationFrame(moveRaf.current);
      if (cursorRaf.current) cancelAnimationFrame(cursorRaf.current);
    };
  }, []);

  // ── Rendering hints ──────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const bgCanvas = bgRef.current;
    if (!canvas || !overlay || !bgCanvas) return;
    for (const c of [canvas, overlay, bgCanvas]) {
      c.style.touchAction = 'none';
      c.style.willChange = 'transform';
    }
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.imageSmoothingEnabled = !isAndroid;
  }, [isAndroid]);

  // ── Export ───────────────────────────────────────────────────────────────

  async function saveAsDataUrl(): Promise<string> {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error('Canvas missing');
    return new Promise((resolve, reject) => {
      const tmp = document.createElement('canvas');
      tmp.width = canvas.width;
      tmp.height = canvas.height;
      const tctx = tmp.getContext('2d');
      if (!tctx) return reject(new Error('Unable to export'));
      paintBackground(tctx, tmp.width, tmp.height, bg);
      tctx.drawImage(canvas, 0, 0);

      tmp.toBlob(
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
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const tctx = tmp.getContext('2d')!;
    paintBackground(tctx, tmp.width, tmp.height, bg);
    tctx.drawImage(canvas, 0, 0);
    const a = document.createElement('a');
    a.download = `sketch-${Date.now()}.png`;
    a.href = tmp.toDataURL('image/png');
    a.click();
  }

  // ── Cursor ───────────────────────────────────────────────────────────────

  const isGrabMode = spaceDown.current || middleDown.current;
  const cursorStyle = isGrabMode
    ? isPanning
      ? 'grabbing'
      : 'grab'
    : activeTool === 'eraser'
      ? 'cell'
      : activeTool === 'text'
        ? 'text'
        : activeTool === 'fill'
          ? 'crosshair'
          : 'none';

  // ── UI ───────────────────────────────────────────────────────────────────

  // Shared transform applied to all three canvas layers
  const canvasTransform: React.CSSProperties = {
    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
    transformOrigin: '0 0',
  };

  const canvasArea = (
    <div
      ref={containerRef}
      className="relative flex-1 min-w-0 min-h-0 overflow-hidden"
      style={{ minHeight: 360 }}
    >
      {/* Custom brush cursor */}
      {cursorPos &&
        activeTool !== 'fill' &&
        activeTool !== 'text' &&
        !spaceDown.current && (
          <div
            className="pointer-events-none fixed z-50 rounded-full"
            style={{
              left: cursorPos.x,
              top: cursorPos.y,
              width: size,
              height: size,
              transform: 'translate(-50%, -50%)',
              border:
                activeTool === 'eraser'
                  ? '2px solid black'
                  : `2px solid ${color}`,
              background:
                activeTool === 'eraser'
                  ? 'transparent'
                  : activeTool === 'highlighter'
                    ? color + '66'
                    : 'transparent',
              boxShadow: activeTool === 'eraser' ? 'none' : `0 0 0 1px white`,
              transition: 'width 0.1s, height 0.1s',
            }}
          />
        )}

      {/* Text input */}
      {textInput && (
        <input
          ref={textInputRef}
          type="text"
          autoFocus
          value={textInput.value}
          onChange={(e) =>
            setTextInput({ ...textInput, value: e.target.value })
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter' && textInput.value) {
              const ctx = getCtx();
              if (ctx) {
                pushUndo();
                ctx.font = `${size * 5}px sans-serif`;
                ctx.fillStyle = color;
                ctx.globalAlpha = opacity;
                ctx.globalCompositeOperation = 'source-over';
                ctx.fillText(textInput.value, textInput.x, textInput.y);
                setTextInput(null);
              }
            } else if (e.key === 'Escape') {
              setTextInput(null);
            }
          }}
          onBlur={() => {
            if (textInput.value) {
              const ctx = getCtx();
              if (ctx) {
                pushUndo();
                ctx.font = `${size * 5}px sans-serif`;
                ctx.fillStyle = color;
                ctx.globalAlpha = opacity;
                ctx.globalCompositeOperation = 'source-over';
                ctx.fillText(textInput.value, textInput.x, textInput.y);
                setTextInput(null);
              }
            }
          }}
          className="absolute z-50 px-2 py-1 text-sm border border-dashed border-indigo-500 rounded-none bg-white/90"
          style={{
            left: textInput.x * zoom + pan.x,
            top: textInput.y * zoom + pan.y,
            transform: `scale(${zoom})`,
            transformOrigin: '0 0',
            color: color,
          }}
        />
      )}

      {/* Background grid canvas — painted directly so it's never hidden by
          GPU compositing layers created by willChange: transform on siblings */}
      <canvas
        ref={bgRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={canvasTransform}
      />

      {/* Drawing canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{
          cursor: cursorStyle,
          touchAction: 'none',
          ...canvasTransform,
        }}
      />

      {/* Shape preview overlay */}
      <canvas
        ref={overlayRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={canvasTransform}
      />
    </div>
  );

  const toolPanel = (
    <div className="flex flex-col gap-1 w-12 shrink-0 p-1">
      {(Object.keys(TOOL_ICONS) as ToolType[]).map((tool) => (
        <button
          key={tool}
          onClick={() => setActiveTool(tool)}
          title={TOOL_LABELS[tool]}
          className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg transition-all ${
            activeTool === tool
              ? 'bg-indigo-500 text-white shadow-lg'
              : 'text-white/60 hover:bg-gray-700 hover:text-white'
          }`}
        >
          {TOOL_ICONS[tool]}
        </button>
      ))}
    </div>
  );

  const propertiesPanel = (
    <div className="w-64 shrink-0 p-4 overflow-y-auto">
      {/* Color */}
      <div className="mb-6">
        <h3 className="text-xs uppercase tracking-wider text-white/50 mb-3">
          Color
        </h3>
        <div className="grid grid-cols-6 gap-2 mb-3">
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded border-2 transition-all ${
                color === c
                  ? 'border-white scale-110'
                  : 'border-transparent hover:scale-105'
              }`}
              style={{ background: c === '#ffffff' ? '#f0f0f0' : c }}
            />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-8 h-8 cursor-pointer rounded border border-white/20"
            disabled={activeTool === 'eraser'}
          />
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="flex-1 px-2 py-1 text-xs border-gray-600 rounded text-white font-mono"
            disabled={activeTool === 'eraser'}
          />
        </div>
      </div>

      {/* Brush Settings */}
      <div className="mb-6">
        <h3 className="text-xs uppercase tracking-wider text-white/50 mb-3">
          Brush
        </h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-white/70 mb-1">Size</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={200}
                value={size}
                onChange={(e) => setSize(Number(e.target.value) || 1)}
                className="w-16 px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-white"
              />
              <input
                type="range"
                min={1}
                max={200}
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
                className="flex-1 accent-indigo-400"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-white/70 mb-1">Opacity</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                value={Math.round(opacity * 100)}
                onChange={(e) => setOpacity(Number(e.target.value) / 100)}
                disabled={activeTool === 'eraser'}
                className="w-16 px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-white"
              />
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(opacity * 100)}
                onChange={(e) => setOpacity(Number(e.target.value) / 100)}
                disabled={activeTool === 'eraser'}
                className="flex-1 accent-indigo-400"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-white/70 mb-1">
              Smoothing
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                value={Math.round(smoothing * 100)}
                onChange={(e) => setSmoothing(Number(e.target.value) / 100)}
                disabled={['fill', 'line', 'rect', 'ellipse'].includes(
                  activeTool
                )}
                className="w-16 px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-white"
              />
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(smoothing * 100)}
                onChange={(e) => setSmoothing(Number(e.target.value) / 100)}
                disabled={['fill', 'line', 'rect', 'ellipse'].includes(
                  activeTool
                )}
                className="flex-1 accent-indigo-400"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Canvas Settings */}
      <div className="mb-6">
        <h3 className="text-xs uppercase tracking-wider text-white/50 mb-3">
          Canvas
        </h3>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {(['white-grid', 'black-grid'] as BgType[]).map((b) => (
            <button
              key={b}
              onClick={() => setBg(b)}
              className={`py-2 text-xs rounded border transition-all ${
                bg === b
                  ? 'border-indigo-400 text-indigo-300 bg-indigo-500/20'
                  : 'border-gray-600 text-white/60 hover:border-gray-500 hover:text-white'
              }`}
            >
              {b === 'white-grid' ? 'White Grid' : 'Black Grid'}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setZoom((z) => Math.min(5, z + 0.25))}
            className="flex-1 py-2 text-sm rounded border border-gray-600 text-white/60 hover:bg-gray-700"
          >
            +
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="flex-1 py-2 text-sm rounded border border-gray-600 text-white/60 hover:bg-gray-700"
          >
            1:1
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.2, z - 0.25))}
            className="flex-1 py-2 text-sm rounded border border-gray-600 text-white/60 hover:bg-gray-700"
          >
            −
          </button>
        </div>
      </div>

      {/* Actions */}
      <div>
        <h3 className="text-xs uppercase tracking-wider text-white/50 mb-3">
          Actions
        </h3>
        <div className="space-y-2">
          <div className="flex gap-1">
            <button
              onClick={undo}
              disabled={undoStack.current.length === 0}
              className="flex-1 py-2 text-xs rounded border border-gray-600 text-white/60 hover:bg-gray-700 disabled:opacity-30"
            >
              Undo
            </button>
            <button
              onClick={redo}
              disabled={redoStack.current.length === 0}
              className="flex-1 py-2 text-xs rounded border border-gray-600 text-white/60 hover:bg-gray-700 disabled:opacity-30"
            >
              Redo
            </button>
          </div>
          <button
            onClick={clearCanvas}
            className="w-full py-2 text-xs rounded border border-red-500/30 text-red-400 hover:bg-red-500/10"
          >
            Clear
          </button>
          <button
            onClick={downloadPng}
            className="w-full py-2 text-xs rounded border border-gray-600 text-white/60 hover:bg-gray-700"
          >
            Download PNG
          </button>
          {embedded && (
            <button
              onClick={async () => {
                try {
                  const dataUrl = await saveAsDataUrl();
                  onSave(dataUrl);
                  hasExplicitlySaved.current = true;
                } catch (err) {
                  // noop
                }
              }}
              className="w-full py-2 text-xs rounded border border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/10 font-medium"
            >
              Save Sketch
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const statusBar = (
    <div className="h-8 border-t border-gray-700 flex items-center justify-between px-4 text-xs text-white/70">
      <div className="flex items-center gap-4">
        <span>Tool: {TOOL_LABELS[activeTool]}</span>
        {cursorPos && (
          <span>
            Cursor: {Math.round(cursorPos.x)}, {Math.round(cursorPos.y)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span>Zoom: {Math.round(zoom * 100)}%</span>
        <span>Size: {size}px</span>
        <span>Opacity: {Math.round(opacity * 100)}%</span>
      </div>
    </div>
  );

  if (!embedded && !open) return null;

  const inner = (
    <div
      className="flex gap-0 h-full min-h-0"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      {toolPanel}
      {canvasArea}
      {propertiesPanel}
    </div>
  );

  if (embedded) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        {inner}
        {statusBar}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={async () => {
          if (!hasExplicitlySaved.current) {
            try {
              const dataUrl = await saveAsDataUrl();
              onSave(dataUrl);
            } catch {}
          }
          onClose?.();
        }}
      />
      <div
        className="relative w-full max-w-6xl mx-4 rounded-2xl border border-gray-700 p-5 shadow-2xl flex flex-col bg-gray-900"
        style={{ maxHeight: '95vh' }}
      >
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <div
                className="w-3 h-3 rounded-full bg-red-500/80 cursor-pointer"
                onClick={async () => {
                  if (!hasExplicitlySaved.current) {
                    try {
                      const dataUrl = await saveAsDataUrl();
                      onSave(dataUrl);
                    } catch {}
                  }
                  onClose?.();
                }}
              />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <h3 className="text-base font-semibold text-white/70">
              Sketchpad Studio
            </h3>
          </div>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          {inner}
          {statusBar}
        </div>
      </div>
    </div>
  );
}

export default Sketchpad;
