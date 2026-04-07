/* eslint-disable complexity */
import type { UnlistenFn } from '@tauri-apps/api/event';
import { listen } from '@tauri-apps/api/event';
import {
  ChevronLeft,
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
    size: 2,
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
    color: '#007AFF',
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
  '#111827', // Black
  '#ef4444', // Red
  '#007AFF', // iOS Blue
  '#22c55e', // Green
  '#f59e0b', // Yellow/Orange
  '#ec4899', // Pink
];

const PRESET_PEN_SIZES = [2, 5, 10];
const PRESET_ERASER_SIZES = [20, 30, 40];

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
  pen: 'Pen',
  eraser: 'Eraser',
  fill: 'Fill',
  line: 'Line',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  text: 'Text',
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

  const darkBg = 'oklch(27.4% 0.006 286.033)';
  const lightBg = 'oklch(98.5% 0 0)';
  const darkStroke = 'oklch(20% 0.1 0)';
  const lightStroke = 'oklch(87% 0 0)';

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
    const [recentColors, setRecentColors] = useState<string[]>(['#111827', '#ef4444', '#007AFF']);
    const [antiAlias, _setAntiAlias] = useState(true);
    const [floodFillTolerance, setFloodFillTolerance] = useState(32);
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
        const updated = [newColor, ...filtered].slice(0, 3);
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
      });
      return () => cancelAnimationFrame(raf);
    }, [textInput, textInput?.id]);

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
        });
      return () => {
        if (unlisten) unlisten();
      };
    }, [isAndroid, switchTool, activeTool]);

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

      let snapshot: string | null = null;
      if (canvas.width > 0 && canvas.height > 0) {
        try {
          snapshot = canvas.toDataURL('image/png');
        } catch {
          throw new Error('Failed to capture canvas snapshot for resizing');
        }
      }

      for (const c of [canvas, overlay]) {
        c.width = newW;
        c.height = newH;
        const ctx = c.getContext('2d')!;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      }

      bgCanvas.width = newW;
      bgCanvas.height = newH;
      const bgCtx = bgCanvas.getContext('2d')!;
      bgCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
      paintBackground(bgCtx, clientW, clientH, bgRef2.current);

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

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const handler = () => requestAnimationFrame(() => initCanvas());
      const ro = new ResizeObserver(handler);
      ro.observe(container);
      return () => ro.disconnect();
    }, [initCanvas]);

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
    }, [textInput, switchTool]);

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

          const newZoom = Math.min(
            10,
            Math.max(0.1, touchGesture.current.initialZoom * scale)
          );

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

    function getCtx() {
      return canvasRef.current?.getContext('2d') ?? null;
    }
    function getOverlayCtx() {
      return overlayRef.current?.getContext('2d') ?? null;
    }
    const clearOverlay = useCallback(() => {
      const canvas = overlayRef.current;
      const ctx = getOverlayCtx();
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }, []);

    function processPendingMove() {
      moveRaf.current = null;
      const canvas = canvasRef.current;
      const ctx = getCtx();
      if (!canvas || !ctx) return;
      const moves = lastMove.current;
      if (moves.length === 0) return;

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
                throw new Error('Failed to capture canvas snapshot for undo');
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
        throw new Error('Failed to capture canvas snapshot for undo');
      }
    }

    const undo = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas || !undoStack.current.length) return;
      redoStack.current.push(canvas.toDataURL('image/png'));
      const last = undoStack.current.pop();
      if (last) {
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
        img.src = last;
      }
      forceUpdate((n) => n + 1);
    }, []);

    const redo = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas || !redoStack.current.length) return;
      undoStack.current.push(canvas.toDataURL('image/png'));
      const next = redoStack.current.pop();
      if (next) {
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
        img.src = next;
      }
      forceUpdate((n) => n + 1);
    }, []);

    const clearCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = getCtx();
      if (!canvas || !ctx) return;
      pushUndo();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      forceUpdate((n) => n + 1);
    }, []);

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
        console.error('Failed to capture pointer');
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

      const events: PointerEvent[] =
        isAndroid && typeof e.getCoalescedEvents === 'function'
          ? e.getCoalescedEvents()
          : [];

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
        console.error('Failed to release pointer capture');
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

    const canvasTransform: React.CSSProperties = {
      transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
      transformOrigin: '0 0',
    };

    const canvasArea = (
      <div
        ref={containerRef}
        className="relative flex-1 min-w-0 min-h-0 overflow-hidden bg-gray-200"
      >
        {cursorPos &&
          activeTool !== 'fill' &&
          activeTool !== 'text' &&
          (isHovering || !spaceDown.current) && (
            <div
              className="pointer-events-none fixed z-50 rounded-full"
              style={{
                left: cursorPos.x,
                top: cursorPos.y,
                width: currentSize * zoom,
                height: currentSize * zoom,
                transform: 'translate(-50%, -50%)',
                border:
                  activeTool === 'eraser'
                    ? '1px solid rgba(0,0,0,0.5)'
                    : `1px solid ${currentColor}`,
                background: 'transparent',
                transition: 'width 0.1s, height 0.1s',
                opacity: isHovering && !spaceDown.current ? 0.7 : 1,
              }}
            />
          )}

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
            className="absolute z-50 px-2 py-1 text-sm border border-dashed border-[#007AFF] bg-white/90 outline-none"
            style={{
              left: textInput.x * zoom + pan.x,
              top: textInput.y * zoom + pan.y,
              transform: `scale(${zoom})`,
              transformOrigin: '0 0',
              color: currentColor,
            }}
          />
        )}

        <canvas
          ref={bgRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={canvasTransform}
        />

        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{
            cursor: cursorStyle,
            touchAction: 'none',
            ...canvasTransform,
          }}
        />

        <canvas
          ref={overlayRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={canvasTransform}
        />
      </div>
    );

    const activeColorPalette = Array.from(new Set([currentColor, ...recentColors])).slice(0, 3);
    while (activeColorPalette.length < 3) {
      const fallback = PALETTE.find(c => !activeColorPalette.includes(c));
      if (fallback) activeColorPalette.push(fallback);
    }

    const topNavigationBar = (
      <div className="flex flex-col w-full border-b border-gray-200 bg-[#F7F7F9] shrink-0 z-10 shadow-sm">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200/60 bg-white">
          <div className="flex items-center gap-4">
            {!embedded && (
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-800 transition-colors font-medium text-sm flex items-center gap-1"
              >
                <ChevronLeft size={16} /> Close
              </button>
            )}
            <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
              <button
                onClick={undo}
                disabled={undoStack.current.length === 0}
                className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-md disabled:opacity-30 transition-colors"
                title="Undo"
              >
                <Undo2 size={18} />
              </button>
              <button
                onClick={redo}
                disabled={redoStack.current.length === 0}
                className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-md disabled:opacity-30 transition-colors"
                title="Redo"
              >
                <Redo2 size={18} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-light text-gray-800 tracking-tight">Sketchpad</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button onClick={() => setZoom((z) => Math.max(0.2, z - 0.25))} className="p-1 text-gray-500 hover:bg-white rounded shadow-sm transition-all"><ZoomOut size={14} /></button>
              <span className="text-xs font-medium text-gray-600 px-2 w-12 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(10, z + 0.25))} className="p-1 text-gray-500 hover:bg-white rounded shadow-sm transition-all"><ZoomIn size={14} /></button>
            </div>
            <button
              onClick={clearCanvas}
              className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors"
              title="Clear Canvas"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-2 bg-[#F7F7F9] relative">
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
            {(Object.keys(TOOL_ICONS) as ToolType[]).map((tool) => {
              const isActive = activeTool === tool;
              return (
                <button
                  key={tool}
                  onClick={() => switchTool(tool)}
                  title={TOOL_LABELS[tool]}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${isActive
                    ? 'bg-[#007AFF]/10 text-[#007AFF]'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                    }`}
                >
                  {TOOL_ICONS[tool]}
                </button>
              );
            })}
          </div>

          <div className="absolute right-4 flex items-center gap-6">
            <div className="flex items-center gap-2">
              {activeColorPalette.map((c, i) => (
                <button
                  key={`${c}-${i}`}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${currentColor === c && activeTool !== 'eraser'
                    ? 'border-[#007AFF] scale-110 shadow-sm'
                    : 'border-transparent hover:scale-105'
                    }`}
                  style={{ background: c === '#ffffff' ? '#f0f0f0' : c }}
                />
              ))}
              <div className="w-px h-6 bg-gray-300 mx-1" />
              <input
                type="color"
                value={currentColor}
                onChange={(e) => {
                  setColor(e.target.value);
                  addRecentColor(e.target.value);
                }}
                className="w-7 h-7 p-0 border-0 rounded-full cursor-pointer overflow-hidden bg-transparent"
                disabled={activeTool === 'eraser'}
              />
            </div>

            <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-full px-3 py-1.5 shadow-sm">
              {(activeTool === 'eraser' ? PRESET_ERASER_SIZES : PRESET_PEN_SIZES).map((s, i) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className="flex items-center justify-center w-6 h-6 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <div
                    className={`rounded-full transition-all ${currentSize === s ? 'bg-[#007AFF]' : 'bg-gray-400'
                      }`}
                    style={{
                      width: `${Math.max(2, PRESET_PEN_SIZES[i] * 1.5)}px`,
                      height: `${Math.max(2, PRESET_PEN_SIZES[i] * 1.5)}px`
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );

    const settingsFooter = (
      <div className="h-10 border-t border-gray-200 flex items-center justify-between px-4 text-xs text-gray-500 bg-white shrink-0">
        <div className="flex items-center gap-4">
          <Select onValueChange={(val) => setBg(val as BgType)} value={bg}>
            <SelectTrigger className="h-7 w-32 text-xs border-gray-200 bg-gray-50">
              <SelectValue placeholder="Background" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="white-grid">Grid Paper</SelectItem>
                <SelectItem value="lined">Lined Paper</SelectItem>
                <SelectItem value="dot-grid">Dotted Paper</SelectItem>
                <SelectItem value="black-grid">Dark Canvas</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>

          <label className="flex items-center gap-2 cursor-pointer hover:text-gray-700">
            <Checkbox
              checked={penOnlyMode}
              onCheckedChange={(e) => setPenOnlyMode(e as boolean)}
              className="border-gray-300 w-4 h-4 rounded-sm data-[state=checked]:bg-[#007AFF] data-[state=checked]:border-[#007AFF]"
            />
            Stylus Only
          </label>
        </div>

        <div className="flex items-center gap-4">
          {activeTool === 'fill' && (
            <div className="flex items-center gap-2">
              <span>Tolerance:</span>
              <input type="range" min={0} max={128} value={floodFillTolerance} onChange={(e) => setFloodFillTolerance(Number(e.target.value))} className="w-20 accent-[#007AFF]" />
            </div>
          )}
          <div className="flex items-center gap-1">
            <span>Smoothing:</span>
            <input type="range" min={0} max={1} step={0.05} value={currentSmoothing} onChange={(e) => setSmoothing(Number(e.target.value))} className="w-20 accent-[#007AFF]" />
          </div>
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

    if (embedded) {
      return (
        <div className="flex flex-col flex-1 min-h-[70vh] bg-white border border-gray-200 rounded-xl overflow-hidden font-sans shadow-sm">
          {topNavigationBar}
          {canvasArea}
          {settingsFooter}
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center font-sans">
        <div
          className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
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
          className="relative w-full max-w-[90vw] h-[85vh] rounded-2xl shadow-2xl flex flex-col bg-white overflow-hidden border border-gray-200"
        >
          <div className="flex-1 min-h-0 flex flex-col">
            {topNavigationBar}
            {canvasArea}
            {settingsFooter}
          </div>
        </div>
      </div>
    );
  }
);

Sketchpad.displayName = 'Sketchpad';

export default Sketchpad;