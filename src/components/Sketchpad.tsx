/* eslint-disable complexity */
import type { UnlistenFn } from '@tauri-apps/api/event';
import { listen } from '@tauri-apps/api/event';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Circle,
  Droplet,
  Eraser,
  Minus,
  Pencil,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';

// ─── Types ────────────────────────────────────────────────────────────────────

type ToolType =
  | 'pen'
  | 'eraser'
  | 'fill'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'text';
type BgType = 'white-grid' | 'black-grid' | 'lined' | 'dot-grid';
type PressureCurve = 'linear' | 'exponential' | 'smooth' | 'heavy-ink';

type SketchpadProps = {
  open?: boolean;
  onClose?: () => void;
  onSave: (dataUrl: string) => void;
  embedded?: boolean;
};

export type SketchpadHandle = {
  exportDataUrl: () => Promise<string>;
  save: () => Promise<void>;
};

type ActivePointerMeta = {
  type: string;
  touchDownTime?: number;
  rejected?: boolean;
  strokeStarted?: boolean;
  tiltX?: number;
  tiltY?: number;
};

type ToolSettings = {
  size: number;
  opacity: number;
  smoothing: number;
  pressureCurve: PressureCurve;
  disablePressure: boolean;
  color: string;
};

type ToolSettingsMap = Record<ToolType, ToolSettings>;

const DEFAULT_TOOL_SETTINGS: ToolSettingsMap = {
  pen: {
    size: 4,
    opacity: 1,
    smoothing: 0.5,
    pressureCurve: 'smooth',
    disablePressure: false,
    color: '#111827',
  },
  eraser: {
    size: 30,
    opacity: 1,
    smoothing: 0.3,
    pressureCurve: 'linear',
    disablePressure: false,
    color: '#ffffff',
  },
  fill: {
    size: 10,
    opacity: 1,
    smoothing: 0,
    pressureCurve: 'linear',
    disablePressure: true,
    color: '#3b82f6',
  },
  line: {
    size: 2,
    opacity: 1,
    smoothing: 0,
    pressureCurve: 'linear',
    disablePressure: true,
    color: '#111827',
  },
  rect: {
    size: 2,
    opacity: 1,
    smoothing: 0,
    pressureCurve: 'linear',
    disablePressure: true,
    color: '#111827',
  },
  ellipse: {
    size: 2,
    opacity: 1,
    smoothing: 0,
    pressureCurve: 'linear',
    disablePressure: true,
    color: '#111827',
  },
  text: {
    size: 16,
    opacity: 1,
    smoothing: 0,
    pressureCurve: 'linear',
    disablePressure: true,
    color: '#111827',
  },
};

const STORAGE_KEY = 'sketchpad-tool-settings';
const PEN_ONLY_STORAGE_KEY = 'sketchpad-pen-only-mode';

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
  e: 'eraser',
  b: 'fill',
  l: 'line',
  r: 'rect',
  c: 'ellipse',
  t: 'text',
};

const TOOL_ICONS: Record<ToolType, React.ReactNode> = {
  pen: <Pencil className="w-5 h-5" />,
  eraser: <Eraser className="w-5 h-5" />,
  fill: <Droplet className="w-5 h-5" />,
  line: <Minus className="w-5 h-5" />,
  rect: <Square className="w-5 h-5" />,
  ellipse: <Circle className="w-5 h-5" />,
  text: <Type className="w-5 h-5" />,
};

const TOOL_LABELS: Record<ToolType, string> = {
  pen: 'Pen (P)',
  eraser: 'Eraser (E)',
  fill: 'Fill (B)',
  line: 'Line (L)',
  rect: 'Rectangle (R)',
  ellipse: 'Ellipse (C)',
  text: 'Text (T)',
};

const TOOL_SHORTCUTS: Record<ToolType, string> = {
  pen: 'P',
  eraser: 'E',
  fill: 'B',
  line: 'L',
  rect: 'R',
  ellipse: 'C',
  text: 'T',
};

const PALM_REJECTION = {
  WIDTH_THRESHOLD: 35,
  HEIGHT_THRESHOLD: 35,
  MIN_PRESSURE: 0.05,
  MIN_TOUCH_DURATION: 50,
  EDGE_MARGIN: 15,
};

// ─── Pressure Curve ──────────────────────────────────────────────────────────

function applyPressureCurve(pressure: number, curve: PressureCurve): number {
  const p = Math.max(0, Math.min(1, pressure));
  switch (curve) {
    case 'exponential':
      return Math.pow(p, 0.5);
    case 'smooth':
      return p * p * (3 - 2 * p);
    case 'heavy-ink':
      return Math.pow(p, 0.3);
    case 'linear':
    default:
      return p;
  }
}

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
  alpha: number,
  tolerance: number = 32
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

  const colorMatch = (i: number) =>
    Math.abs(data[i] - targetR) <= tolerance &&
    Math.abs(data[i + 1] - targetG) <= tolerance &&
    Math.abs(data[i + 2] - targetB) <= tolerance &&
    Math.abs(data[i + 3] - targetA) <= tolerance;

  if (colorMatch(si)) return;

  const queue: number[] = [startX + startY * w];
  const visited = new Uint8Array(w * h);
  const pixelCount = w * h;
  let head = 0;

  while (head < queue.length) {
    const flat = queue[head++];
    if (flat >= pixelCount) continue;
    const x = flat % w;
    const y = Math.floor(flat / w);
    if (visited[flat]) continue;
    if (!colorMatch(flat * 4)) continue;
    visited[flat] = 1;
    const i = flat * 4;
    data[i] = fr;
    data[i + 1] = fg;
    data[i + 2] = fb;
    data[i + 3] = fa;
    if (x + 1 < w) queue.push(flat + 1);
    if (x > 0) queue.push(flat - 1);
    if (y + 1 < h) queue.push(flat + w);
    if (y > 0) queue.push(flat - w);
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
  const isDark = bg === 'black-grid';

  const darkBg = 'oklch(21% 0.006 285.885)';
  const lightBg = 'oklch(96.7% 0.001 286.375)';
  const darkStroke = 'oklch(35% 0.001 286.375)';
  const lightStroke = 'oklch(37% 0.013 285.805)';

  if (isDark) {
    ctx.fillStyle = darkBg;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.fillStyle = lightBg;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.lineWidth = 1;

  if (bg === 'lined') {
    ctx.strokeStyle = isDark ? lightBg : darkBg;
    const lineSpacing = 30;
    ctx.beginPath();
    for (let y = lineSpacing; y < height; y += lineSpacing) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(width, y + 0.5);
    }
    ctx.stroke();
  } else if (bg === 'dot-grid') {
    ctx.fillStyle = isDark ? lightStroke : darkStroke;
    const dotSpacing = 20;
    const dotRadius = 1.5;
    for (let x = dotSpacing; x < width; x += dotSpacing) {
      for (let y = dotSpacing; y < height; y += dotSpacing) {
        ctx.beginPath();
        ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    ctx.strokeStyle = isDark ? lightStroke : darkStroke;
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
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const Sketchpad = forwardRef<SketchpadHandle, SketchpadProps>(
  function Sketchpad(
    { open = true, onClose, onSave, embedded = false }: SketchpadProps,
    ref
  ) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const overlayRef = useRef<HTMLCanvasElement | null>(null);
    const textInputRef = useRef<HTMLInputElement | null>(null);
    // Dedicated background canvas — sits below the drawing canvas so grid is
    // always painted directly and isn't blocked by GPU compositing layers.
    const bgRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const [isDrawing, setIsDrawing] = useState(false);
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
    const [penOnlyMode, setPenOnlyMode] = useState<boolean>(() => {
      if (typeof window === 'undefined' || !window.localStorage) return true;
      try {
        const saved = localStorage.getItem(PEN_ONLY_STORAGE_KEY);
        return saved === null ? true : saved === '1';
      } catch {
        return true;
      }
    });
    const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(
      null
    );
    const [isHovering, setIsHovering] = useState(false);
    const [recentColors, setRecentColors] = useState<string[]>([]);
    const [antiAlias, setAntiAlias] = useState(true);
    const [floodFillTolerance, setFloodFillTolerance] = useState(32);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [toolSettingsMap, setToolSettingsMap] = useState<ToolSettingsMap>(
      () => {
        if (typeof window !== 'undefined' && window.localStorage) {
          try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
              const parsed = JSON.parse(saved) as Partial<ToolSettingsMap>;
              return { ...DEFAULT_TOOL_SETTINGS, ...parsed };
            }
          } catch {
            /* ignore */
          }
        }
        return DEFAULT_TOOL_SETTINGS;
      }
    );
    const [, forceUpdate] = useState(0);
    const hasExplicitlySaved = useRef(false);
    const recentColorsRef = useRef(recentColors);

    const toolSettingsMapRef = useRef(toolSettingsMap);
    const activeToolRef = useRef(activeTool);
    const currentColor = toolSettingsMap[activeTool].color;
    const currentSize = toolSettingsMap[activeTool].size;
    const currentSmoothing = toolSettingsMap[activeTool].smoothing;
    const currentPressureCurve = toolSettingsMap[activeTool].pressureCurve;
    const currentDisablePressure = toolSettingsMap[activeTool].disablePressure;

    const undoStack = useRef<string[]>([]);
    const redoStack = useRef<string[]>([]);
    const activePointers = useRef<Map<number, ActivePointerMeta>>(new Map());
    const activeDrawingPointerId = useRef<number | null>(null);
    const lastPoint = useRef<{ x: number; y: number } | null>(null);
    const shapeStart = useRef<{ x: number; y: number } | null>(null);
    const shapeSnapshot = useRef<string | null>(null);
    const previousNonEraserRef = useRef<ToolType>('pen');
    const hasMoved = useRef(false);
    const isAndroid = useRef(
      typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
    ).current;
    const isHoveringRef = useRef(false);

    const moveRaf = useRef<number | null>(null);
    const lastMove = useRef<
      Array<{
        x: number;
        y: number;
        pressure: number;
        pointerId: number;
        tiltX?: number;
        tiltY?: number;
      }>
    >([]);
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
    const panPointerId = useRef<number | null>(null);
    const zoomRef = useRef(zoom);
    const panRef = useRef(pan);
    const touchGesture = useRef<{
      active: boolean;
      initialDistance: number;
      initialCenter: { x: number; y: number };
      initialZoom: number;
      initialPan: { x: number; y: number };
    } | null>(null);
    const multiTouchActive = useRef(false);

    // Keep ref so bg-repaint effect always sees latest value
    const bgRef2 = useRef<BgType>(bg);
    useEffect(() => {
      bgRef2.current = bg;
    }, [bg]);

    useEffect(() => {
      zoomRef.current = zoom;
    }, [zoom]);

    useEffect(() => {
      panRef.current = pan;
    }, [pan]);

    useEffect(() => {
      toolSettingsMapRef.current = toolSettingsMap;
    }, [toolSettingsMap]);

    useEffect(() => {
      activeToolRef.current = activeTool;
    }, [activeTool]);

    useEffect(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toolSettingsMap));
    }, [toolSettingsMap]);

    useEffect(() => {
      try {
        localStorage.setItem(PEN_ONLY_STORAGE_KEY, penOnlyMode ? '1' : '0');
      } catch {
        /* ignore */
      }
    }, [penOnlyMode]);

    function addRecentColor(newColor: string) {
      if (newColor === '#ffffff') return;
      setRecentColors((prev) => {
        const filtered = prev.filter((c) => c !== newColor);
        const updated = [newColor, ...filtered].slice(0, 5);
        recentColorsRef.current = updated;
        return updated;
      });
    }

    const switchTool = useCallback(
      (newTool: ToolType) => {
        if (newTool === activeTool) return;
        setToolSettingsMap((prev) => ({
          ...prev,
          [activeTool]: {
            size: prev[activeTool].size,
            opacity: prev[activeTool].opacity,
            smoothing: prev[activeTool].smoothing,
            pressureCurve: prev[activeTool].pressureCurve,
            disablePressure: prev[activeTool].disablePressure,
            color: prev[activeTool].color,
          },
        }));
        setActiveTool(newTool);
      },
      [activeTool]
    );

    const updateCurrentTool = useCallback(
      (updates: Partial<ToolSettings>) => {
        setToolSettingsMap((prev) => ({
          ...prev,
          [activeTool]: {
            ...prev[activeTool],
            ...updates,
          },
        }));
      },
      [activeTool]
    );

    const setSize = useCallback(
      (size: number) => {
        updateCurrentTool({ size });
      },
      [updateCurrentTool]
    );

    const setSmoothing = useCallback(
      (smoothing: number) => {
        updateCurrentTool({ smoothing });
      },
      [updateCurrentTool]
    );

    const setPressureCurve = useCallback(
      (pressureCurve: PressureCurve) => {
        updateCurrentTool({ pressureCurve });
      },
      [updateCurrentTool]
    );

    const setDisablePressure = useCallback(
      (disablePressure: boolean) => {
        updateCurrentTool({ disablePressure });
      },
      [updateCurrentTool]
    );

    const setColor = useCallback(
      (color: string) => {
        updateCurrentTool({ color });
      },
      [updateCurrentTool]
    );

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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [textInput?.id]);

    useEffect(() => {
      if (!isAndroid) return;
      let unlisten: UnlistenFn | null = null;
      listen('stylus-double-tap', () => {
        const current = activeTool;
        const nextTool =
          current !== 'eraser'
            ? 'eraser'
            : (previousNonEraserRef.current ?? 'pen');
        switchTool(nextTool);
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAndroid, switchTool]);

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
      paintBackground(
        bgCtx,
        bgCanvas.width / ratio,
        bgCanvas.height / ratio,
        bg
      );
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
        if (
          textBoxFocused ||
          isEditableTarget(e.target) ||
          textInput !== null
        ) {
          return;
        }

        // Toggle sidebar with Shift+Tab
        if (e.shiftKey && e.code === 'Tab') {
          e.preventDefault();
          setSidebarCollapsed((prev) => !prev);
          return;
        }

        if (e.code === 'Space') {
          spaceDown.current = true;
          e.preventDefault();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
          redo();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Delete') {
          e.preventDefault();
          clearCanvas();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === '=') {
          e.preventDefault();
          setZoom((z) => Math.min(10, z + 0.25));
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === '-') {
          e.preventDefault();
          setZoom((z) => Math.max(0.1, z - 0.25));
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === '0') {
          e.preventDefault();
          setZoom(1);
          setPan({ x: 0, y: 0 });
          return;
        }
        const tool = TOOL_KEYS[e.key.toLowerCase()];
        if (tool) switchTool(tool);
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [textInput]);

    // ── Zoom via scroll and pinch ────────────────────────────────────────────

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const onWheel = (e: WheelEvent) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        setZoom((z) => Math.min(10, Math.max(0.1, z - e.deltaY * 0.002)));
      };
      const onTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 2) {
          e.preventDefault();
          const t1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          const t2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };
          touchGesture.current = {
            active: true,
            initialDistance: Math.hypot(t2.x - t1.x, t2.y - t1.y),
            initialCenter: { x: (t1.x + t2.x) / 2, y: (t1.y + t2.y) / 2 },
            initialZoom: zoomRef.current,
            initialPan: panRef.current,
          };

          setIsDrawing(false);
          activeDrawingPointerId.current = null;
          lastPoint.current = null;
          hasMoved.current = false;
          shapeStart.current = null;
          shapeSnapshot.current = null;
          clearOverlay();
          multiTouchActive.current = true;
        } else if (e.touches.length < 2) {
          touchGesture.current = null;
          multiTouchActive.current = false;
        }
      };
      const onTouchMove = (e: TouchEvent) => {
        multiTouchActive.current = e.touches.length >= 2;
        if (e.touches.length === 2 && touchGesture.current) {
          e.preventDefault();
          const t1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          const t2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };
          const currentDist = Math.hypot(t2.x - t1.x, t2.y - t1.y);
          const center = { x: (t1.x + t2.x) / 2, y: (t1.y + t2.y) / 2 };
          const scale =
            touchGesture.current.initialDistance > 0
              ? currentDist / touchGesture.current.initialDistance
              : 1;

          // Compute new zoom clamped to allowed range
          const newZoom = Math.min(
            10,
            Math.max(0.1, touchGesture.current.initialZoom * scale)
          );

          // To zoom towards the gesture *start* point (rather than the top-left),
          // compute the content coordinate that was under the initial gesture
          // center and keep that content point fixed while scaling. Also allow
          // the user to translate the two-finger center, so include the center
          // displacement as an additional pan offset.
          const z0 = touchGesture.current.initialZoom;
          const p0 = touchGesture.current.initialPan;
          const c0 = touchGesture.current.initialCenter;

          const contentAtStart = {
            x: (c0.x - p0.x) / z0,
            y: (c0.y - p0.y) / z0,
          };

          const panAfterScale = {
            x: c0.x - contentAtStart.x * newZoom,
            y: c0.y - contentAtStart.y * newZoom,
          };

          // Apply additional translation from movement of the current center
          const panWithTranslation = {
            x: panAfterScale.x + (center.x - c0.x),
            y: panAfterScale.y + (center.y - c0.y),
          };

          setZoom(newZoom);
          setPan(panWithTranslation);
        }
      };
      const endGesture = () => {
        touchGesture.current = null;
        multiTouchActive.current = false;
      };
      el.addEventListener('wheel', onWheel, { passive: false });
      el.addEventListener('touchstart', onTouchStart, { passive: false });
      el.addEventListener('touchmove', onTouchMove, { passive: false });
      el.addEventListener('touchend', endGesture);
      el.addEventListener('touchcancel', endGesture);
      return () => {
        el.removeEventListener('wheel', onWheel);
        el.removeEventListener('touchstart', onTouchStart);
        el.removeEventListener('touchmove', onTouchMove);
        el.removeEventListener('touchend', endGesture);
        el.removeEventListener('touchcancel', endGesture);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
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

    function processPendingMove() {
      moveRaf.current = null;
      const canvas = canvasRef.current;
      const ctx = getCtx();
      if (!canvas || !ctx) return;
      const moves = lastMove.current;
      if (moves.length === 0) return;

      // Drain the queue — draw every coalesced point in order
      for (const m of moves) {
        const pt = { x: m.x, y: m.y };
        const pressure = m.pressure;

        if (
          ['line', 'rect', 'ellipse'].includes(activeTool) &&
          shapeStart.current &&
          shapeSnapshot.current
        ) {
          const octx = getOverlayCtx();
          if (!octx) continue;
          clearOverlay();
          applyToolStyle(octx, pressure);
          drawShape(octx, activeTool, shapeStart.current, pt);
          // For shape preview only the last move matters visually; still iterate
          // to keep lastPoint up to date.
          continue;
        }

        if (activeToolRef.current === 'text') continue;
        if (!lastPoint.current) continue;

        applyToolStyle(ctx, pressure);

        const s = toolSettingsMapRef.current[activeToolRef.current].smoothing;
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
        ctx.moveTo(
          (lastPoint.current.x + sx) / 2,
          (lastPoint.current.y + sy) / 2
        );

        lastPoint.current = { x: sx, y: sy };
      }

      lastMove.current = [];
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
      const tool = activeToolRef.current;
      const settings = toolSettingsMapRef.current[tool];
      const adjustedPressure = applyPressureCurve(
        pressure,
        settings.pressureCurve
      );
      const isPressureSensitive =
        !settings.disablePressure && (tool === 'pen' || tool === 'eraser');
      ctx.lineWidth = Math.max(
        1,
        isPressureSensitive ? settings.size * adjustedPressure : settings.size
      );

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.fillStyle = 'rgba(0,0,0,1)';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.strokeStyle = settings.color;
        ctx.fillStyle = settings.color;
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

      if (
        e.pointerType === 'touch' &&
        touchGesture.current &&
        touchGesture.current.active
      ) {
        return;
      }

      if (multiTouchActive.current && e.pointerType === 'touch') return;

      if (spaceDown.current || e.button === 1) {
        if (e.button === 1) middleDown.current = true;
        setIsPanning(true);
        panPointerId.current = e.pointerId;
        panStart.current = {
          mx: e.clientX,
          my: e.clientY,
          px: pan.x,
          py: pan.y,
        };
        e.preventDefault();
        return;
      }

      if (penOnlyMode && e.pointerType === 'touch') {
        setIsPanning(true);
        panPointerId.current = e.pointerId;
        panStart.current = {
          mx: e.clientX,
          my: e.clientY,
          px: pan.x,
          py: pan.y,
        };
        e.preventDefault();
        return;
      }

      const pt = getCanvasPoint(e);

      if (activeTool === 'text') {
        setTextInput({ id: Date.now(), x: pt.x, y: pt.y, value: '' });
        return;
      }

      if (e.pointerType === 'touch' && hasActivePenPointer()) return;
      if (penOnlyMode && e.pointerType !== 'pen' && e.pointerType !== 'mouse') {
        return;
      }
      try {
        (e.target as Element).setPointerCapture(e.pointerId);
      } catch {
        /* Android WebView may throw if element state is invalid; safe to ignore */
      }
      activePointers.current.set(e.pointerId, {
        type: e.pointerType,
        touchDownTime:
          e.pointerType === 'touch' ? performance.now() : undefined,
        rejected: e.pointerType === 'touch' && isLikelyPalmTouch(e),
        strokeStarted: false,
        tiltX: e.tiltX,
        tiltY: e.tiltY,
      });

      const pointerMeta = activePointers.current.get(e.pointerId);
      if (!pointerMeta || pointerMeta.rejected) return;

      const pressure = e.pressure > 0 ? e.pressure : 1;

      if (activeTool === 'fill') {
        pushUndo();
        floodFill(
          ctx,
          Math.round(pt.x),
          Math.round(pt.y),
          currentColor,
          1,
          floodFillTolerance
        );
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
        ['pen', 'eraser'].includes(activeTool)
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

      if (multiTouchActive.current && e.pointerType === 'touch') return;

      lastCursor.current = { x: e.clientX, y: e.clientY };
      if (!cursorRaf.current) {
        cursorRaf.current = requestAnimationFrame(() => {
          cursorRaf.current = null;
          const c = lastCursor.current;
          if (c) setCursorPos({ x: c.x, y: c.y });
        });
      }

      if (
        isPanning &&
        panStart.current &&
        (panPointerId.current === null || panPointerId.current === e.pointerId)
      ) {
        setPan({
          x: panStart.current.px + (e.clientX - panStart.current.mx),
          y: panStart.current.py + (e.clientY - panStart.current.my),
        });
        return;
      }

      const pointerMeta = activePointers.current.get(e.pointerId);
      if (!pointerMeta || pointerMeta.rejected) return;

      pointerMeta.tiltX = e.tiltX;
      pointerMeta.tiltY = e.tiltY;

      if (activeTool === 'text' || activeTool === 'fill') return;

      const isFreehandTool = ['pen', 'eraser'].includes(activeTool);

      if (pointerMeta.type === 'touch' && !pointerMeta.strokeStarted) {
        if (!isFreehandTool) return;
        const touchDownTime = pointerMeta.touchDownTime ?? performance.now();
        const elapsed = performance.now() - touchDownTime;
        if (elapsed < PALM_REJECTION.MIN_TOUCH_DURATION) {
          return;
        }
        const pt = getCanvasPoint(e);
        const pressureForStart = e.pressure > 0 ? e.pressure : 1;
        startStroke(e.pointerId, pt, ctx, pressureForStart);
        pointerMeta.strokeStarted = true;
        return;
      }

      if (!isDrawing) return;
      if (activeDrawingPointerId.current !== e.pointerId) return;

      hasMoved.current = true;

      // Use coalesced events on Android to replay all intermediate stylus
      // positions the browser batched since the last frame. This prevents the
      // skippy/jagged strokes caused by event coalescing on high-frequency
      // stylus input.
      const events: PointerEvent[] =
        isAndroid && typeof e.getCoalescedEvents === 'function'
          ? e.getCoalescedEvents()
          : [];

      // Always include the primary event as fallback or last point
      if (events.length === 0) events.push(e);

      for (const ce of events) {
        const pt = getCanvasPoint(ce);
        const pressure = ce.pressure > 0 ? ce.pressure : 1;
        lastMove.current.push({
          x: pt.x,
          y: pt.y,
          pressure,
          pointerId: ce.pointerId,
          tiltX: ce.tiltX,
          tiltY: ce.tiltY,
        });
      }

      if (!moveRaf.current)
        moveRaf.current = requestAnimationFrame(processPendingMove);
    }

    function handlePointerUp(e: PointerEvent) {
      const canvas = canvasRef.current;
      const ctx = getCtx();
      if (!canvas || !ctx) return;

      if (isPanning && panPointerId.current === e.pointerId) {
        if (e.button === 1) middleDown.current = false;
        setIsPanning(false);
        panPointerId.current = null;
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
      } else if (!hasMoved.current && ['pen', 'eraser'].includes(activeTool)) {
        applyToolStyle(ctx, pressure);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(1, currentSize / 2), 0, Math.PI * 2);
        ctx.fill();
      }

      setIsDrawing(false);
      lastPoint.current = null;
      lastMove.current = [];
      activeDrawingPointerId.current = null;
      ctx.closePath();
    }

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const handlePointerEnter = (e: PointerEvent) => {
        if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
          isHoveringRef.current = true;
          setIsHovering(true);
        }
      };

      // pointerover fires more reliably than pointerenter on Android WebView
      // for stylus hover-before-contact detection
      const handlePointerOver = (e: PointerEvent) => {
        if (e.pointerType === 'pen') {
          isHoveringRef.current = true;
          setIsHovering(true);
        }
      };

      const handlePointerLeave = () => {
        isHoveringRef.current = false;
        setIsHovering(false);
      };

      // On Android, pointercancel fires when the OS intercepts the stylus (e.g.
      // palm rejection, app switch). We must clean up all drawing state and the
      // overlay so the next stroke starts fresh.
      const handlePointerCancel = (e: PointerEvent) => {
        clearOverlay();
        activePointers.current.delete(e.pointerId);
        if (activeDrawingPointerId.current === e.pointerId) {
          if (moveRaf.current) {
            cancelAnimationFrame(moveRaf.current);
            moveRaf.current = null;
          }
          lastMove.current = [];
          lastPoint.current = null;
          shapeStart.current = null;
          shapeSnapshot.current = null;
          activeDrawingPointerId.current = null;
          hasMoved.current = false;
          setIsDrawing(false);
        }
      };

      canvas.addEventListener('pointerdown', handlePointerDown);
      canvas.addEventListener('pointermove', handlePointerMove);
      canvas.addEventListener('pointercancel', handlePointerCancel);
      canvas.addEventListener('pointerenter', handlePointerEnter);
      canvas.addEventListener('pointerover', handlePointerOver);
      canvas.addEventListener('pointerleave', handlePointerLeave);
      window.addEventListener('pointerup', handlePointerUp);
      return () => {
        canvas.removeEventListener('pointerdown', handlePointerDown);
        canvas.removeEventListener('pointermove', handlePointerMove);
        canvas.removeEventListener('pointercancel', handlePointerCancel);
        canvas.removeEventListener('pointerenter', handlePointerEnter);
        canvas.removeEventListener('pointerover', handlePointerOver);
        canvas.removeEventListener('pointerleave', handlePointerLeave);
        window.removeEventListener('pointerup', handlePointerUp);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isDrawing, isPanning, activeTool, zoom, pan, penOnlyMode]);

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
      for (const c of [canvas, overlay, bgCanvas]) {
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = antiAlias;
          ctx.imageSmoothingQuality = 'high';
        }
      }
    }, [isAndroid, antiAlias]);

    // ── Export ───────────────────────────────────────────────────────────────

    const saveAsDataUrl = useCallback(async (): Promise<string> => {
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
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('Read error'));
            reader.readAsDataURL(blob);
          },
          'image/webp',
          0.92
        );
      });
    }, [bg]);

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
          (isHovering || !spaceDown.current) && (
            <div
              className="pointer-events-none fixed z-50 rounded-full"
              style={{
                left: cursorPos.x,
                top: cursorPos.y,
                width: currentSize,
                height: currentSize,
                transform: 'translate(-50%, -50%)',
                border:
                  activeTool === 'eraser'
                    ? '2px solid black'
                    : `2px solid ${currentColor}`,
                background:
                  activeTool === 'eraser' ? 'transparent' : 'transparent',
                boxShadow: activeTool === 'eraser' ? 'none' : `0 0 0 1px white`,
                transition: 'width 0.1s, height 0.1s',
                opacity: isHovering && !spaceDown.current ? 0.7 : 1,
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
                  ctx.font = `${currentSize * 5}px sans-serif`;
                  ctx.fillStyle = currentColor;
                  ctx.globalAlpha = 1;
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
                  ctx.font = `${currentSize * 5}px sans-serif`;
                  ctx.fillStyle = currentColor;
                  ctx.globalAlpha = 1;
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
              color: currentColor,
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
      <div className="flex flex-col gap-1 w-14 shrink-0 rounded-xl">
        {(Object.keys(TOOL_ICONS) as ToolType[]).map((tool) => {
          const shortcut =
            Object.entries(TOOL_KEYS).find(([, v]) => v === tool)?.[0] || '';
          const isActive = activeTool === tool;
          return (
            <button
              key={tool}
              onClick={() => switchTool(tool)}
              title={`${TOOL_LABELS[tool]}${shortcut ? ` (${shortcut.toUpperCase()})` : ''}`}
              className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center transition-all ${
                isActive
                  ? 'bg-indigo-500/90 text-white shadow-lg shadow-indigo-500/30'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700/60'
              }`}
            >
              {TOOL_ICONS[tool]}
              <span className="text-[9px] uppercase leading-none mt-0.5 opacity-60">
                {shortcut}
              </span>
            </button>
          );
        })}
      </div>
    );

    const propertiesPanel = sidebarCollapsed ? (
      <div className="w-24 shrink-0 px-2 flex flex-col gap-2 min-h-[90vh] rounded-xl mx-2 border border-gray-700/30">
        {/* Expand Button */}
        <button
          onClick={() => setSidebarCollapsed(false)}
          className="w-full py-2 text-xs rounded-lg border border-indigo-500/40 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-400 transition-all inline-flex items-center justify-center gap-1 font-medium"
          title="Expand Sidebar (Shift+Tab)"
        >
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="hidden xs:inline">Show</span>
        </button>

        {/* Color Swatch */}
        <div
          className="w-full h-12 rounded-lg border-2 border-gray-600/50 cursor-pointer hover:border-indigo-400 transition-all hover:shadow-lg hover:shadow-indigo-500/20 group relative"
          style={{
            background: currentColor === '#ffffff' ? '#f0f0f0' : currentColor,
          }}
          title={`Color: ${currentColor}`}
          onClick={() => {
            const input = document.querySelector(
              'input[type="color"]'
            ) as HTMLInputElement;
            input?.click();
          }}
        >
          <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center bg-black/30">
            <span className="text-white text-[9px] font-mono font-bold">
              Click
            </span>
          </div>
        </div>

        {/* Tool Size Indicator */}
        {['pen', 'eraser'].includes(activeTool) && (
          <div className="space-y-1.5">
            <div className="text-[10px] text-center text-gray-400 uppercase font-semibold tracking-tight">
              Size
            </div>
            <div className="flex items-center justify-center">
              <div
                className="rounded-full border border-gray-500 bg-gray-700/40"
                style={{
                  width: `${Math.min(currentSize, 48)}px`,
                  height: `${Math.min(currentSize, 48)}px`,
                  opacity: 0.6,
                }}
              />
            </div>
            <div className="text-[11px] text-center text-gray-500">
              {currentSize}px
            </div>
          </div>
        )}

        {/* Zoom Display */}
        <div className="space-y-1 pt-1">
          <div className="text-[10px] text-center text-gray-400 uppercase font-semibold tracking-tight">
            Zoom
          </div>
          <div className="text-[13px] text-center text-indigo-400 font-bold monoospace">
            {Math.round(zoom * 100)}%
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setZoom((z) => Math.max(0.2, z - 0.25))}
              className="flex-1 py-1 text-[9px] rounded border border-gray-600/50 text-gray-500 hover:bg-gray-700/40 transition-colors inline-flex items-center justify-center"
              title="Zoom Out"
            >
              −
            </button>
            <button
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className="flex-1 py-1 text-[9px] rounded border border-gray-600/50 text-gray-500 hover:bg-gray-700/40 transition-colors font-medium"
              title="Reset"
            >
              1:1
            </button>
            <button
              onClick={() => setZoom((z) => Math.min(10, z + 0.25))}
              className="flex-1 py-1 text-[9px] rounded border border-gray-600/50 text-gray-500 hover:bg-gray-700/40 transition-colors inline-flex items-center justify-center"
              title="Zoom In"
            >
              +
            </button>
          </div>
        </div>

        {/* Fill Tolerance */}
        {activeTool === 'fill' && (
          <div className="space-y-1">
            <div className="text-[10px] text-center text-gray-400 uppercase font-semibold tracking-tight">
              Tolerance
            </div>
            <div className="text-[12px] text-center text-gray-400 font-mono">
              {floodFillTolerance}
            </div>
            <input
              type="range"
              min={0}
              max={128}
              value={floodFillTolerance}
              onChange={(e) => setFloodFillTolerance(Number(e.target.value))}
              className="w-full h-1 rounded accent-indigo-500"
            />
          </div>
        )}

        {/* Recent Colors */}
        {recentColors.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="text-[10px] text-center text-gray-400 uppercase font-semibold tracking-tight">
              Recent
            </div>
            <div className="grid grid-cols-3 gap-1">
              {recentColors.slice(0, 6).map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-6 h-6 rounded border-2 transition-all hover:scale-110 hover:shadow-lg"
                  style={{
                    background: c === '#ffffff' ? '#f0f0f0' : c,
                    borderColor:
                      currentColor === c ? '#fff' : 'rgba(107, 114, 128, 0.3)',
                  }}
                  title={c}
                />
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-1 border-t border-gray-700/50">
          <button
            onClick={undo}
            disabled={undoStack.current.length === 0}
            className="w-full py-1.5 text-[11px] rounded border border-gray-600/50 text-gray-400 hover:bg-gray-700/40 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center"
            title={`Undo (${undoStack.current.length})`}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={redo}
            disabled={redoStack.current.length === 0}
            className="w-full py-1.5 text-[11px] rounded border border-gray-600/50 text-gray-400 hover:bg-gray-700/40 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center"
            title={`Redo (${redoStack.current.length})`}
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={clearCanvas}
            className="w-full py-1.5 text-[11px] rounded border border-red-500/20 text-red-400/70 hover:bg-red-500/20 hover:text-red-400 transition-colors inline-flex items-center justify-center"
            title="Clear Canvas"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    ) : (
      <div className="w-72 shrink-0 px-4 overflow-y-auto min-h-[90vh] rounded-xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xs uppercase tracking-widest text-gray-400 font-bold">
            Settings
          </h2>
          <button
            onClick={() => setSidebarCollapsed(true)}
            className="text-xs text-gray-500 hover:text-gray-300 p-1 rounded hover:bg-gray-700/40 inline-flex items-center justify-center gap-1 transition-colors"
            title="Collapse Sidebar (Shift+Tab)"
          >
            <span className="text-[10px]">Shift+Tab</span>
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Status Panel */}
        <div className="mb-6 p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
          <div className="flex items-center gap-3 mb-3">
            <div className="text-indigo-400">{TOOL_ICONS[activeTool]}</div>
            <div className="flex-1">
              <div className="text-xs font-semibold text-gray-300">
                {TOOL_LABELS[activeTool]}
              </div>
              <div className="text-[10px] text-gray-500">
                Shortcut:{' '}
                <span className="font-mono font-bold text-gray-400">
                  {TOOL_SHORTCUTS[activeTool]}
                </span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
            <div>
              <div className="text-gray-500">Zoom</div>
              <div className="text-indigo-300 font-bold">
                {Math.round(zoom * 100)}%
              </div>
            </div>
            {['pen', 'eraser'].includes(activeTool) && (
              <div>
                <div className="text-gray-500">Size</div>
                <div className="text-indigo-300 font-bold">{currentSize}px</div>
              </div>
            )}
            {activeTool === 'fill' && (
              <div>
                <div className="text-gray-500">Tolerance</div>
                <div className="text-indigo-300 font-bold">
                  {floodFillTolerance}
                </div>
              </div>
            )}
            <div>
              <div className="text-gray-500">History</div>
              <div className="text-indigo-300 font-bold">
                {undoStack.current.length}/
                {undoStack.current.length + redoStack.current.length}
              </div>
            </div>
          </div>
        </div>

        {/* Color */}
        <div className="mb-6">
          <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">
            Color
          </h3>
          <div className="grid grid-cols-6 gap-2 mb-3">
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setColor(c);
                  addRecentColor(c);
                }}
                className={`w-8 h-8 rounded-lg border-2 transition-all hover:scale-105 ${
                  currentColor === c
                    ? 'border-white shadow-lg scale-105'
                    : 'border-transparent'
                }`}
                style={{ background: c === '#ffffff' ? '#f0f0f0' : c }}
              />
            ))}
          </div>
          {recentColors.length > 0 && (
            <div className="flex gap-2 mb-3">
              {recentColors.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-lg border transition-all hover:scale-105 ${
                    currentColor === c
                      ? 'border-white shadow scale-105'
                      : 'border-gray-600/50'
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
          )}
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={currentColor}
              onChange={(e) => {
                setColor(e.target.value);
                addRecentColor(e.target.value);
              }}
              className="w-10 h-10 cursor-pointer rounded-lg border border-gray-600/50 bg-transparent"
              disabled={activeTool === 'eraser'}
            />
            <input
              type="text"
              value={currentColor}
              onChange={(e) => setColor(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-gray-600/50 rounded-lg text-gray-300 font-mono bg-gray-800/30"
              disabled={activeTool === 'eraser'}
            />
          </div>
        </div>

        {/* Brush Settings */}
        <div className="mb-6">
          <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">
            {TOOL_LABELS[activeTool]}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-2">Size</label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={currentSize}
                  onChange={(e) => setSize(Number(e.target.value))}
                  className="w-20 px-3 py-2 text-sm rounded-lg border border-gray-600/50 bg-gray-800/30 text-gray-300"
                />
                <Input
                  type="range"
                  min={1}
                  max={200}
                  value={currentSize}
                  onChange={(e) => setSize(Number(e.target.value))}
                  className="flex-1 accent-indigo-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-2">
                Smoothing
              </label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={currentSmoothing}
                  onChange={(e) => setSmoothing(Number(e.target.value))}
                  className="w-20 px-3 py-2 text-sm rounded-lg border border-gray-600/50 bg-gray-800/30 text-gray-300"
                />
                <Input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={currentSmoothing}
                  onChange={(e) => setSmoothing(Number(e.target.value))}
                  className="flex-1 accent-indigo-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-2">
                Pressure Curve
              </label>
              <Select
                onValueChange={(value) =>
                  setPressureCurve(value as PressureCurve)
                }
                value={currentPressureCurve}
                disabled={['fill', 'line', 'rect', 'ellipse'].includes(
                  activeTool
                )}
              >
                <SelectTrigger className="w-full rounded-lg border border-gray-600/50 bg-gray-800/30 text-gray-300">
                  <SelectValue placeholder="Pressure Curve" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  <SelectGroup>
                    <SelectItem value="linear" className="text-gray-300">
                      Linear
                    </SelectItem>
                    <SelectItem value="smooth" className="text-gray-300">
                      Smooth
                    </SelectItem>
                    <SelectItem value="exponential" className="text-gray-300">
                      Exponential
                    </SelectItem>
                    <SelectItem value="heavy-ink" className="text-gray-300">
                      Heavy Ink
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              {activeTool === 'fill' && (
                <div className="mt-3">
                  <label className="block text-xs text-gray-400 mb-2">
                    Fill Tolerance
                  </label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min={0}
                      max={128}
                      value={floodFillTolerance}
                      onChange={(e) =>
                        setFloodFillTolerance(Number(e.target.value))
                      }
                      className="w-20 px-3 py-2 text-sm rounded-lg border border-gray-600/50 bg-gray-800/30 text-gray-300"
                    />
                    <Input
                      type="range"
                      min={0}
                      max={128}
                      value={floodFillTolerance}
                      onChange={(e) =>
                        setFloodFillTolerance(Number(e.target.value))
                      }
                      className="flex-1 accent-indigo-500"
                    />
                  </div>
                </div>
              )}
              <label className="flex items-center gap-2 text-xs text-gray-400 mt-3 select-none cursor-pointer">
                <Checkbox
                  checked={currentDisablePressure}
                  onCheckedChange={(e) => {
                    setDisablePressure(e as boolean);
                  }}
                  disabled={[
                    'fill',
                    'line',
                    'rect',
                    'ellipse',
                    'text',
                  ].includes(activeTool)}
                  className="border-gray-600"
                />
                Disable Pressure
              </label>
            </div>
          </div>
        </div>

        {/* Canvas Settings */}
        <div className="mb-6">
          <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">
            Canvas
          </h3>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {(
              ['white-grid', 'black-grid', 'lined', 'dot-grid'] as BgType[]
            ).map((b) => (
              <button
                key={b}
                onClick={() => setBg(b)}
                className={`py-2.5 text-xs rounded-lg border transition-all ${
                  bg === b
                    ? 'border-indigo-400/70 text-indigo-300 bg-indigo-500/20'
                    : 'border-gray-600/50 text-gray-400 hover:border-gray-500 hover:text-gray-300'
                }`}
              >
                {b === 'white-grid'
                  ? 'Grid'
                  : b === 'black-grid'
                    ? 'Dark'
                    : b === 'lined'
                      ? 'Lined'
                      : 'Dots'}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setZoom((z) => Math.min(10, z + 0.25))}
              className="flex-1 py-2.5 text-sm rounded-lg border border-gray-600/50 text-gray-400 hover:bg-gray-700/40 hover:text-gray-300 inline-flex items-center justify-center"
              title="Zoom In (Ctrl++)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              onDoubleClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className="flex-1 py-2.5 text-sm rounded-lg border border-gray-600/50 text-gray-400 hover:bg-gray-700/40 hover:text-gray-300"
              title="Reset Zoom (Ctrl+0)"
            >
              1:1
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(0.2, z - 0.25))}
              className="flex-1 py-2.5 text-sm rounded-lg border border-gray-600/50 text-gray-400 hover:bg-gray-700/40 hover:text-gray-300 inline-flex items-center justify-center"
              title="Zoom Out (Ctrl+-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setPan({ x: pan.x + 50, y: pan.y })}
              className="flex-1 py-2 text-xs rounded-lg border border-gray-600/50 text-gray-500 hover:bg-gray-700/40 inline-flex items-center justify-center"
              title="Pan Left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPan({ x: pan.x, y: pan.y + 50 })}
              className="flex-1 py-2 text-xs rounded-lg border border-gray-600/50 text-gray-500 hover:bg-gray-700/40 inline-flex items-center justify-center"
              title="Pan Up"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPan({ x: pan.x, y: pan.y - 50 })}
              className="flex-1 py-2 text-xs rounded-lg border border-gray-600/50 text-gray-500 hover:bg-gray-700/40 inline-flex items-center justify-center"
              title="Pan Down"
            >
              <ArrowDown className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPan({ x: pan.x - 50, y: pan.y })}
              className="flex-1 py-2 text-xs rounded-lg border border-gray-600/50 text-gray-500 hover:bg-gray-700/40 inline-flex items-center justify-center"
              title="Pan Right"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-row gap-2 items-center">
            <label className="flex items-center gap-2 text-xs text-gray-400 select-none cursor-pointer">
              <Checkbox
                checked={penOnlyMode}
                onCheckedChange={(e) => {
                  setPenOnlyMode(e as boolean);
                }}
                className="border-gray-600"
              />
              Pen Only Mode
            </label>

            <label className="flex items-center gap-2 text-xs text-gray-400 select-none cursor-pointer">
              <Checkbox
                checked={antiAlias}
                onCheckedChange={(e) => {
                  setAntiAlias(e as boolean);
                }}
                className="border-gray-600"
              />
              Anti-Alias
            </label>
          </div>
        </div>

        {/* Actions */}
        <div>
          <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">
            Actions
          </h3>
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                onClick={undo}
                disabled={undoStack.current.length === 0}
                title="Undo (Ctrl+Z)"
                className="flex-1 py-2.5 text-sm rounded-lg border border-gray-600/50 text-gray-400 hover:bg-gray-700/40 hover:text-gray-300 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400 inline-flex items-center justify-center gap-2"
              >
                <Undo2 className="w-4 h-4" /> Undo
              </button>
              <button
                onClick={redo}
                disabled={redoStack.current.length === 0}
                title="Redo (Ctrl+Y)"
                className="flex-1 py-2.5 text-sm rounded-lg border border-gray-600/50 text-gray-400 hover:bg-gray-700/40 hover:text-gray-300 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400 inline-flex items-center justify-center gap-2"
              >
                Redo <Redo2 className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={clearCanvas}
              className="w-full py-2.5 text-sm rounded-lg border border-red-500/30 text-red-400/70 hover:bg-red-500/20 hover:text-red-400"
            >
              Clear Canvas
            </button>
          </div>
        </div>
      </div>
    );

    const statusBar = (
      <div className="h-10 border-t border-gray-700/50 flex items-center justify-between px-5 text-xs text-gray-400 bg-gray-800/30">
        <div className="flex items-center gap-5">
          <span className="text-gray-500">Tool:</span>
          <span className="text-gray-300 font-medium">
            {TOOL_LABELS[activeTool]}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-gray-700/50 text-gray-400 text-[10px]">
            {TOOL_SHORTCUTS[activeTool]}
          </span>
          {isHovering && <span className="text-indigo-400">Stylus Hover</span>}
          {cursorPos && containerRef.current && (
            <span className="text-gray-500 font-mono">
              {Math.round(
                (cursorPos.x -
                  containerRef.current.getBoundingClientRect().left) /
                  zoom
              )}
              ,{' '}
              {Math.round(
                (cursorPos.y -
                  containerRef.current.getBoundingClientRect().top) /
                  zoom
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-5">
          <span className="text-gray-500 flex items-center gap-1">
            {undoStack.current.length > 0 && (
              <>
                <Undo2 className="w-3 h-3" />
                {undoStack.current.length}
              </>
            )}
            {undoStack.current.length > 0 &&
              redoStack.current.length > 0 &&
              ' '}
            {redoStack.current.length > 0 && (
              <>
                <Redo2 className="w-3 h-3" />
                {redoStack.current.length}
              </>
            )}
          </span>
          <span>
            Zoom:{' '}
            <span className="text-gray-300">{Math.round(zoom * 100)}%</span>
          </span>
          <span>
            Size: <span className="text-gray-300">{currentSize}px</span>
          </span>
          <span>
            Curve: <span className="text-gray-300">{currentPressureCurve}</span>
          </span>
        </div>
      </div>
    );

    useImperativeHandle(
      ref,
      () => ({
        exportDataUrl: saveAsDataUrl,
        save: async () => {
          const dataUrl = await saveAsDataUrl();
          onSave(dataUrl);
          hasExplicitlySaved.current = true;
        },
      }),
      [onSave, saveAsDataUrl]
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
      <div className="fixed inset-0 z-50 flex items-center justify-center rounded-md border border-gray-700/60">
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={
            void (async () => {
              if (!hasExplicitlySaved.current) {
                try {
                  const dataUrl = await saveAsDataUrl();
                  onSave(dataUrl);
                } catch (err) {
                  console.error('Save failed', err);
                }
              }
              onClose?.();
            })
          }
        />
        <div
          className="relative w-full max-w-6xl mx-4 rounded-2xl border border-gray-700/60 p-6 shadow-2xl flex flex-col bg-gray-900/95"
          style={{ maxHeight: '95vh' }}
        >
          <div className="flex items-center justify-between mb-5 shrink-0">
            <div className="flex items-center gap-4">
              <div className="flex gap-2">
                <div
                  className="w-3.5 h-3.5 rounded-full bg-red-500/80 cursor-pointer hover:bg-red-500"
                  onClick={
                    void (async () => {
                      if (!hasExplicitlySaved.current) {
                        try {
                          const dataUrl = await saveAsDataUrl();
                          onSave(dataUrl);
                        } catch (err) {
                          console.error('Save failed', err);
                        }
                      }
                      onClose?.();
                    })
                  }
                />
                <div className="w-3.5 h-3.5 rounded-full bg-yellow-500/80" />
                <div className="w-3.5 h-3.5 rounded-full bg-green-500/80" />
              </div>
              <h3 className="text-lg font-semibold text-gray-200">Sketchpad</h3>
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
);

Sketchpad.displayName = 'Sketchpad';

export default Sketchpad;
