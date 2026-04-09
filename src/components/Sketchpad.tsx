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

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

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
  sessionKey?: string; // For persisting canvas per session/question
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

const A4_ASPECT = 210 / 297;
const INTERNAL_RES_WIDTH = 1240; // Approx 150 DPI for A4
const INTERNAL_RES_HEIGHT = Math.round(INTERNAL_RES_WIDTH / A4_ASPECT);

const DEFAULT_TOOL_SETTINGS: ToolSettingsMap = {
  pen: {
    size: 3,
    opacity: 1,
    smoothing: 0.5,
    pressureCurve: 'smooth',
    disablePressure: false,
    color: '#111827',
  },
  eraser: {
    size: 40,
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
    size: 4,
    opacity: 1,
    smoothing: 0,
    pressureCurve: 'linear',
    disablePressure: true,
    color: '#111827',
  },
  rect: {
    size: 4,
    opacity: 1,
    smoothing: 0,
    pressureCurve: 'linear',
    disablePressure: true,
    color: '#111827',
  },
  ellipse: {
    size: 4,
    opacity: 1,
    smoothing: 0,
    pressureCurve: 'linear',
    disablePressure: true,
    color: '#111827',
  },
  text: {
    size: 24,
    opacity: 1,
    smoothing: 0,
    pressureCurve: 'linear',
    disablePressure: true,
    color: '#111827',
  },
};

const STORAGE_KEY = 'sketchpad-tool-settings';
const PEN_ONLY_STORAGE_KEY = 'sketchpad-pen-only-mode';
const CANVAS_STORAGE_KEY_PREFIX = 'sketchpad-canvas';
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;
const KEYBOARD_ZOOM_STEP = 0.25;

// ─── Constants ────────────────────────────────────────────────────────────────

const PALETTE = [
  '#2D3436', // Obsidian
  '#D63031', // Crimson
  '#0984E3', // Royal Blue
  '#00B894', // Mint
  '#F1C40F', // Sunflower
  '#6C5CE7', // Lavender
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
  pen: 'Pen',
  eraser: 'Eraser',
  fill: 'Fill',
  line: 'Line',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  text: 'Text',
};

const PALM_REJECTION = {
  WIDTH_THRESHOLD: 25,
  HEIGHT_THRESHOLD: 25,
  MIN_PRESSURE: 0.02,
  MIN_TOUCH_DURATION: 30, // ms
  EDGE_MARGIN: 10,
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

// ─── Cropping ─────────────────────────────────────────────────────────────────

function getCropBoundingBox(canvas: HTMLCanvasElement, padding: number = 20) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  let minX = w,
    minY = h,
    maxX = 0,
    maxY = 0;
  let found = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * 4 + 3];
      if (alpha > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        found = true;
      }
    }
  }

  if (!found) return null;

  return {
    x: Math.max(0, minX - padding),
    y: Math.max(0, minY - padding),
    width: Math.min(w, maxX - minX + padding * 2),
    height: Math.min(h, maxY - minY + padding * 2),
  };
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
    {
      open = true,
      onClose,
      onSave,
      embedded = false,
      sessionKey,
    }: SketchpadProps,
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
    const [bg, setBg] = useState<BgType>('lined');
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
    const [recentColors, setRecentColors] = useState<string[]>([
      '#111827',
      '#ef4444',
      '#007AFF',
    ]);
    const [antiAlias] = useState(true);
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
    const shapeStart = useRef<{ x: number; y: number } | null>(null);
    const shapeSnapshot = useRef<string | null>(null);
    const previousNonEraserRef = useRef<ToolType>('pen');
    const hasMoved = useRef(false);
    const lastPointReal = useRef<{
      x: number;
      y: number;
      pressure: number;
      time: number;
    } | null>(null);
    const velocityRef = useRef(0);
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
      lastDistance: number;
      lastCenter: { x: number; y: number };
    } | null>(null);
    const multiTouchActive = useRef(false);
    const undoActionRef = useRef<() => void>(() => {});
    const redoActionRef = useRef<() => void>(() => {});
    const clearActionRef = useRef<() => void>(() => {});
    const keyboardZoomStepRef = useRef<(direction: 1 | -1) => void>(() => {});
    const resetViewportRef = useRef<() => void>(() => {});

    // ─── Persistence helpers ───────────────────────────────────────────────────
    const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
      null
    );
    const getCanvasStorageKey = useCallback(
      (key?: string): string =>
        key ? `${CANVAS_STORAGE_KEY_PREFIX}-${key}` : '',
      []
    );

    const saveCanvasToStorage = useCallback(
      (key?: string) => {
        if (!key) return;
        try {
          const canvas = canvasRef.current;
          if (!canvas) return;

          const dataUrl = canvas.toDataURL('image/webp', 0.85);
          localStorage.setItem(getCanvasStorageKey(key), dataUrl);
        } catch (err) {
          console.warn('Failed to save canvas to localStorage:', err);
        }
      },
      [getCanvasStorageKey]
    );

    const restoreCanvasFromStorage = useCallback(
      (key?: string) => {
        if (!key) return;
        try {
          const canvas = canvasRef.current;
          if (!canvas) return;

          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          // Always clear first so drawings from a previous question never bleed into this one.
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const overlayCanvas = overlayRef.current;
          if (overlayCanvas) {
            const overlayCtx = overlayCanvas.getContext('2d');
            overlayCtx?.clearRect(
              0,
              0,
              overlayCanvas.width,
              overlayCanvas.height
            );
          }
          undoStack.current = [];
          redoStack.current = [];
          hasMoved.current = false;
          lastPointReal.current = null;
          forceUpdate((n) => n + 1);

          const storedDataUrl = localStorage.getItem(getCanvasStorageKey(key));
          if (!storedDataUrl) return;

          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, 0, 0);
          };
          img.onerror = () => {
            console.warn('Failed to load saved canvas image');
          };
          img.src = storedDataUrl;
        } catch (err) {
          console.warn('Failed to restore canvas from localStorage:', err);
        }
      },
      [getCanvasStorageKey]
    );

    const clearCanvasFromStorage = useCallback(
      (key?: string) => {
        if (!key) return;
        try {
          localStorage.removeItem(getCanvasStorageKey(key));
        } catch (err) {
          console.warn('Failed to clear canvas from localStorage:', err);
        }
      },
      [getCanvasStorageKey]
    );

    const scheduleAutoSave = useCallback(
      (key?: string) => {
        if (!key) return;
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current);
        }
        autoSaveTimeoutRef.current = setTimeout(() => {
          saveCanvasToStorage(key);
        }, 1000); // Save 1s after last drawing action
      },
      [saveCanvasToStorage]
    );

    const bgRef2 = useRef<BgType>(bg);

    const clampZoom = useCallback(
      (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)),
      []
    );

    const zoomAroundClientPoint = useCallback(
      (clientX: number, clientY: number, nextZoom: number) => {
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const localX = clientX - rect.left;
        const localY = clientY - rect.top;

        const currentZoom = zoomRef.current;
        const currentPan = panRef.current;
        const safeCurrentZoom = Math.max(currentZoom, 0.0001);
        const targetZoom = clampZoom(nextZoom);

        if (Math.abs(targetZoom - currentZoom) < 0.0001) return;

        const contentX = (localX - currentPan.x) / safeCurrentZoom;
        const contentY = (localY - currentPan.y) / safeCurrentZoom;

        setZoom(targetZoom);
        setPan({
          x: localX - contentX * targetZoom,
          y: localY - contentY * targetZoom,
        });
      },
      [clampZoom]
    );

    const zoomAroundCenter = useCallback(
      (nextZoom: number) => {
        const container = containerRef.current;
        if (!container) {
          setZoom(clampZoom(nextZoom));
          return;
        }
        const rect = container.getBoundingClientRect();
        zoomAroundClientPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
          nextZoom
        );
      },
      [clampZoom, zoomAroundClientPoint]
    );

    const zoomByKeyboardStep = useCallback(
      (direction: 1 | -1) => {
        zoomAroundCenter(zoomRef.current + direction * KEYBOARD_ZOOM_STEP);
      },
      [zoomAroundCenter]
    );

    const resetViewport = useCallback(() => {
      const container = containerRef.current;
      const nextZoom = 1;
      if (!container) {
        setZoom(nextZoom);
        setPan({ x: 0, y: 0 });
        return;
      }

      setZoom(nextZoom);
      setPan({
        x: (container.clientWidth - INTERNAL_RES_WIDTH * nextZoom) / 2,
        y: (container.clientHeight - INTERNAL_RES_HEIGHT * nextZoom) / 2,
      });
    }, []);

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

    // Restore canvas from storage on mount/session changes.
    useEffect(() => {
      if (sessionKey && canvasRef.current) {
        restoreCanvasFromStorage(sessionKey);
      }
    }, [sessionKey, restoreCanvasFromStorage]);

    // Auto-save canvas after drawing completes
    useEffect(() => {
      if (!isDrawing && hasExplicitlySaved.current === false && sessionKey) {
        scheduleAutoSave(sessionKey);
      }
    }, [isDrawing, sessionKey, scheduleAutoSave]);

    // Save canvas immediately when sessionKey changes (user switched questions)
    useEffect(() => {
      return () => {
        // On unmount or cleanup: flush any pending auto-save
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current);
          // Immediately save if not explicitly saved yet
          if (!hasExplicitlySaved.current && sessionKey) {
            saveCanvasToStorage(sessionKey);
          }
        }
      };
    }, [sessionKey, saveCanvasToStorage]);

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
        .catch(() => {});
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

      const newW = INTERNAL_RES_WIDTH;
      const newH = INTERNAL_RES_HEIGHT;

      // Only resize if needed (prevents unnecessary clear)
      if (canvas.width === newW && canvas.height === newH) return;

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
        const ctx = c.getContext('2d')!;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }

      bgCanvas.width = newW;
      bgCanvas.height = newH;
      const bgCtx = bgCanvas.getContext('2d')!;
      bgCtx.setTransform(1, 0, 0, 1, 0, 0);
      paintBackground(bgCtx, newW, newH, bgRef2.current);

      if (snapshot) {
        const ctx = canvas.getContext('2d')!;
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0);
        };
        img.src = snapshot;
      }

      // Initial zoom to fit
      const containerW = container.clientWidth;
      const containerH = container.clientHeight;
      const fitZoom = Math.min(
        (containerW - 80) / newW,
        (containerH - 80) / newH
      );
      setZoom(fitZoom);
      setPan({
        x: (containerW - newW * fitZoom) / 2,
        y: (containerH - newH * fitZoom) / 2,
      });
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
            redoActionRef.current();
          } else {
            undoActionRef.current();
          }
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
          redoActionRef.current();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Delete') {
          e.preventDefault();
          clearActionRef.current();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === '=') {
          e.preventDefault();
          keyboardZoomStepRef.current(1);
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === '-') {
          e.preventDefault();
          keyboardZoomStepRef.current(-1);
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === '0') {
          e.preventDefault();
          resetViewportRef.current();
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
    }, [textInput, switchTool]);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        if (!e.ctrlKey && !e.metaKey) {
          setPan((prev) => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
          return;
        }

        const zoomFactor = Math.exp(-e.deltaY * 0.01);
        zoomAroundClientPoint(
          e.clientX,
          e.clientY,
          zoomRef.current * zoomFactor
        );
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
            lastDistance: Math.hypot(t2.x - t1.x, t2.y - t1.y),
            lastCenter: { x: (t1.x + t2.x) / 2, y: (t1.y + t2.y) / 2 },
          };

          setIsDrawing(false);
          activeDrawingPointerId.current = null;
          lastPointReal.current = null;
          hasMoved.current = false;
          shapeStart.current = null;
          shapeSnapshot.current = null;

          const overlay = overlayRef.current;
          const overlayCtx = overlay?.getContext('2d');
          if (overlay && overlayCtx) {
            overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
          }
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

          const { lastDistance, lastCenter } = touchGesture.current;
          const currentPan = panRef.current;
          const currentZoom = zoomRef.current;

          const scaleDelta = lastDistance > 0 ? currentDist / lastDistance : 1;
          let newZoom = currentZoom * scaleDelta;
          newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));

          const actualScaleDelta = currentZoom > 0 ? newZoom / currentZoom : 1;

          const dx = center.x - lastCenter.x;
          const dy = center.y - lastCenter.y;

          let nextPanX = currentPan.x + dx;
          let nextPanY = currentPan.y + dy;

          const container = containerRef.current;
          if (container && actualScaleDelta !== 1) {
            const rect = container.getBoundingClientRect();
            const localX = center.x - rect.left;
            const localY = center.y - rect.top;

            const contentX = (localX - nextPanX) / currentZoom;
            const contentY = (localY - nextPanY) / currentZoom;

            nextPanX = localX - contentX * newZoom;
            nextPanY = localY - contentY * newZoom;
          }

          setZoom(newZoom);
          setPan({ x: nextPanX, y: nextPanY });

          touchGesture.current.lastDistance = currentDist;
          touchGesture.current.lastCenter = center;
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
    }, [zoomAroundClientPoint]);

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

      const tool = activeToolRef.current;

      for (const m of moves) {
        const pt = { x: m.x, y: m.y };
        const pressure = m.pressure;
        const now = performance.now();

        if (
          ['line', 'rect', 'ellipse'].includes(tool) &&
          shapeStart.current &&
          shapeSnapshot.current
        ) {
          const octx = getOverlayCtx();
          if (!octx) continue;
          clearOverlay();
          applyToolStyle(octx, pressure, 0);
          drawShape(octx, tool, shapeStart.current, pt);
          continue;
        }

        if (tool === 'text') continue;
        if (!lastPointReal.current) {
          lastPointReal.current = { ...pt, pressure, time: now };
          continue;
        }

        // Calculate velocity for dynamic stroke width
        const dx = pt.x - lastPointReal.current.x;
        const dy = pt.y - lastPointReal.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const dt = Math.max(1, now - lastPointReal.current.time);
        const velocity = dist / dt;

        velocityRef.current = velocityRef.current * 0.8 + velocity * 0.2;

        applyToolStyle(ctx, pressure, velocityRef.current);

        // Midpoint logic for smoothing
        const midX = (lastPointReal.current.x + pt.x) / 2;
        const midY = (lastPointReal.current.y + pt.y) / 2;

        ctx.quadraticCurveTo(
          lastPointReal.current.x,
          lastPointReal.current.y,
          midX,
          midY
        );
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(midX, midY);

        lastPointReal.current = { x: pt.x, y: pt.y, pressure, time: now };
      }

      lastMove.current = [];
    }

    function pushUndo() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      hasExplicitlySaved.current = false;
      try {
        undoStack.current.push(canvas.toDataURL('image/png'));
        if (undoStack.current.length > 40) {
          undoStack.current.shift();
        }
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
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
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
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
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

    useEffect(() => {
      undoActionRef.current = undo;
      redoActionRef.current = redo;
      clearActionRef.current = clearCanvas;
      keyboardZoomStepRef.current = zoomByKeyboardStep;
      resetViewportRef.current = resetViewport;
    }, [undo, redo, clearCanvas, zoomByKeyboardStep, resetViewport]);

    function getCanvasPoint(e: PointerEvent) {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
      const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    }

    function applyToolStyle(
      ctx: CanvasRenderingContext2D,
      pressure: number,
      velocity: number = 0
    ) {
      const tool = activeToolRef.current;
      const settings = toolSettingsMapRef.current[tool];
      const adjustedPressure = applyPressureCurve(
        pressure,
        settings.pressureCurve
      );
      const isPressureSensitive =
        !settings.disablePressure && (tool === 'pen' || tool === 'eraser');

      let size = settings.size;
      if (isPressureSensitive) {
        // Taper based on pressure AND velocity
        // Lower velocity = thicker, Higher velocity = thinner
        const velocityFactor = Math.max(0.5, 1.5 - velocity * 0.5);
        size = settings.size * adjustedPressure * velocityFactor;
      }

      ctx.lineWidth = Math.max(0.5, size);
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
      lastPointReal.current = { ...pt, pressure, time: performance.now() };
      velocityRef.current = 0;
      activeDrawingPointerId.current = pointerId;
      ctx.beginPath();
      applyToolStyle(ctx, pressure, 0);
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
        floodFill(ctx, Math.round(pt.x), Math.round(pt.y), currentColor, 1, 32);
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
      lastPointReal.current = null;
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
          lastPointReal.current = null;
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

      const bounds = getCropBoundingBox(canvas, 40);
      const exportW = bounds ? bounds.width : canvas.width;
      const exportH = bounds ? bounds.height : canvas.height;
      const startX = bounds ? bounds.x : 0;
      const startY = bounds ? bounds.y : 0;

      return new Promise((resolve, reject) => {
        const tmp = document.createElement('canvas');
        tmp.width = exportW;
        tmp.height = exportH;
        const tctx = tmp.getContext('2d');
        if (!tctx) return reject(new Error('Unable to export'));

        // Draw background cropped
        const bgCanvas = bgRef.current;
        if (bgCanvas) {
          tctx.drawImage(
            bgCanvas,
            startX,
            startY,
            exportW,
            exportH,
            0,
            0,
            exportW,
            exportH
          );
        } else {
          paintBackground(tctx, exportW, exportH, bg);
        }

        // Draw ink cropped
        tctx.drawImage(
          canvas,
          startX,
          startY,
          exportW,
          exportH,
          0,
          0,
          exportW,
          exportH
        );

        tmp.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('Unable to export'));
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('Read error'));
            reader.readAsDataURL(blob);
          },
          'image/webp',
          0.85
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
        className="relative flex-1 min-w-0 min-h-0 overflow-hidden bg-muted/30 touch-none"
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
            className="absolute z-50 px-2 py-1 text-sm border-2 border-primary rounded-md bg-background/90 shadow-lg outline-none"
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
          className="absolute top-0 left-0 pointer-events-none"
          style={{
            ...canvasTransform,
            boxShadow: 'var(--shadow-xl)',
            border: '1px solid var(--border)',
          }}
        />

        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0"
          style={{
            cursor: cursorStyle,
            touchAction: 'none',
            ...canvasTransform,
          }}
        />

        <canvas
          ref={overlayRef}
          className="absolute top-0 left-0 pointer-events-none"
          style={canvasTransform}
        />

        {/* Subtle Paper Texture Overlay */}
        <div
          className="absolute top-0 left-0 pointer-events-none opacity-[0.03]"
          style={{
            ...canvasTransform,
            width: INTERNAL_RES_WIDTH,
            height: INTERNAL_RES_HEIGHT,
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>
    );

    const activeColorPalette = Array.from(
      new Set([currentColor, ...recentColors])
    ).slice(0, 3);
    while (activeColorPalette.length < 3) {
      const fallback = PALETTE.find((c) => !activeColorPalette.includes(c));
      if (fallback) activeColorPalette.push(fallback);
    }

    const settingsFooter = (
      <Card className="flex flex-row items-center gap-1 bg-card/80 backdrop-blur-md border border-border/50 rounded-2xl p-1.5 shadow-xl transition-all hover:bg-card pointer-events-auto">
        <Select onValueChange={(val) => setBg(val as BgType)} value={bg}>
          <SelectTrigger className="h-9 w-32 border-none rounded-xl transition-all">
            <SelectValue placeholder="Background" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectGroup>
              <SelectItem value="lined">Lined Paper</SelectItem>
              <SelectItem value="white-grid">Grid Paper</SelectItem>
              <SelectItem value="dot-grid">Dotted Paper</SelectItem>
              <SelectItem value="black-grid">Dark Canvas</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>

        <Button
          variant={penOnlyMode ? 'default' : 'secondary'}
          size="sm"
          onClick={() => setPenOnlyMode(!penOnlyMode)}
          className="rounded-xl h-9"
        >
          {penOnlyMode ? 'Stylus Only' : 'Touch + Stylus'}
        </Button>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <Label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
          Size
        </Label>

        <Slider
          min={1}
          max={100}
          step={1}
          value={[currentSize]}
          onValueChange={([val]) => setSize(val)}
          className="w-20 ml-1"
        />

        <Separator orientation="vertical" className="h-6 mx-1" />

        <div className="flex items-center gap-3 px-2">
          <Label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
            Smooth
          </Label>
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={[currentSmoothing]}
            onValueChange={([val]) => setSmoothing(val)}
            className="w-24"
          />
        </div>
      </Card>
    );

    useImperativeHandle(
      ref,
      () => ({
        exportDataUrl: saveAsDataUrl,
        save: async () => {
          const dataUrl = await saveAsDataUrl();
          onSave(dataUrl);
          hasExplicitlySaved.current = true;
          // Clear persisted canvas after explicit save
          clearCanvasFromStorage(sessionKey);
        },
      }),
      [onSave, saveAsDataUrl, sessionKey, clearCanvasFromStorage]
    );

    const topNavigationBar = (
      <TooltipProvider>
        <Card className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-row items-center gap-1 bg-card/80 backdrop-blur-md border border-border/50 rounded-2xl p-1.5 shadow-xl z-50 transition-all hover:bg-card">
          <div className="flex items-center gap-0.5 px-1 pr-2">
            {!embedded && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="rounded-xl"
                  >
                    <ChevronLeft size={20} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Close</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={undo}
                  disabled={undoStack.current.length === 0}
                  className="rounded-xl disabled:opacity-20"
                >
                  <Undo2 size={20} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Undo</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={redo}
                  disabled={redoStack.current.length === 0}
                  className="rounded-xl disabled:opacity-20"
                >
                  <Redo2 size={20} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Redo</TooltipContent>
            </Tooltip>
          </div>

          <Separator orientation="vertical" className="h-8 mx-1" />

          <div className="flex items-center gap-1 px-1">
            {(Object.keys(TOOL_ICONS) as ToolType[]).map((tool) => {
              const isActive = activeTool === tool;
              return (
                <Tooltip key={tool}>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isActive ? 'default' : 'ghost'}
                      size="icon"
                      onClick={() => switchTool(tool)}
                      className={cn(
                        'rounded-xl transition-all',
                        isActive && 'shadow-lg shadow-primary/20 scale-105'
                      )}
                    >
                      {TOOL_ICONS[tool]}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{TOOL_LABELS[tool]}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          <Separator orientation="vertical" className="h-8 mx-1" />

          <div className="flex items-center gap-3 px-2">
            <div className="flex items-center gap-1">
              {[0.5, 1, 2].map((m) => {
                const baseSize = activeTool === 'eraser' ? 40 : 4;
                const size = baseSize * m;
                const isActive = currentSize === size;
                return (
                  <Button
                    key={size}
                    variant={isActive ? 'default' : 'ghost'}
                    size="icon-sm"
                    onClick={() => setSize(size)}
                    className="size-6 rounded-lg"
                  >
                    <div
                      className={cn(
                        'rounded-full',
                        isActive ? 'bg-primary-foreground' : 'bg-foreground/50'
                      )}
                      style={{ width: 6 * m, height: 6 * m }}
                    />
                  </Button>
                );
              })}
            </div>
          </div>

          <Separator orientation="vertical" className="h-8 mx-1" />

          <div className="flex items-center gap-3 px-2">
            <div className="flex items-center gap-2">
              {activeColorPalette.map((c, i) => (
                <button
                  key={`${c}-${i}`}
                  onClick={() => setColor(c)}
                  className={cn(
                    'w-7 h-7 rounded-full border-2 transition-all',
                    currentColor === c && activeTool !== 'eraser'
                      ? 'border-primary scale-110 shadow-md ring-4 ring-primary/20'
                      : 'border-background hover:scale-110'
                  )}
                  style={{ background: c }}
                />
              ))}
              <div className="relative w-7 h-7 rounded-full overflow-hidden border border-border shadow-sm hover:scale-110 transition-all">
                <input
                  type="color"
                  value={currentColor}
                  onChange={(e) => {
                    setColor(e.target.value);
                    addRecentColor(e.target.value);
                  }}
                  className="absolute inset-0 w-[200%] h-[200%] -translate-x-1/4 -translate-y-1/4 cursor-pointer"
                />
              </div>
            </div>
            <Separator orientation="vertical" className="h-8 mx-1" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearCanvas}
                  className="p-2 text-destructive hover:bg-destructive/10 hover:text-destructive rounded-xl"
                >
                  <Trash2 size={20} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Clear Canvas</TooltipContent>
            </Tooltip>
          </div>
        </Card>
      </TooltipProvider>
    );

    const zoomIndicator = (
      <Card className="absolute bottom-6 right-6 flex flex-row items-center gap-1 bg-card/80 backdrop-blur-md border border-border/50 rounded-2xl p-1.5 shadow-xl z-50">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => zoomByKeyboardStep(-1)}
          className="rounded-xl"
        >
          <ZoomOut size={12} />
        </Button>
        <Badge
          variant="secondary"
          className="bg-muted px-2 py-0.5 text-[10px] font-bold tabular-nums rounded-lg"
        >
          {Math.round(zoom * 100)}%
        </Badge>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => zoomByKeyboardStep(1)}
          className="rounded-xl"
        >
          <ZoomIn size={12} />
        </Button>
      </Card>
    );

    if (!embedded && !open) return null;

    if (embedded) {
      return (
        <div className="flex flex-col flex-1 min-h-[70vh] bg-muted/20 relative overflow-hidden font-sans border border-border rounded-2xl shadow-inner">
          {topNavigationBar}
          {canvasArea}
          {zoomIndicator}
          <div className="absolute bottom-6 left-6 z-50">{settingsFooter}</div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center font-sans overflow-hidden">
        <div
          className="absolute inset-0 bg-background/60 backdrop-blur-xl"
          onClick={
            void (async () => {
              if (!hasExplicitlySaved.current) {
                try {
                  const dataUrl = await saveAsDataUrl();
                  onSave(dataUrl);
                  hasExplicitlySaved.current = true;
                  clearCanvasFromStorage(sessionKey);
                } catch (err) {
                  console.error('Save failed', err);
                }
              }
              onClose?.();
            })
          }
        />
        <div className="relative w-full h-full flex flex-col items-center justify-center pointer-events-none">
          <div className="pointer-events-auto h-full w-full relative flex flex-col">
            {topNavigationBar}
            {canvasArea}
            {zoomIndicator}
            <div className="absolute bottom-6 left-6 z-50 pointer-events-auto">
              {settingsFooter}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

Sketchpad.displayName = 'Sketchpad';

export default Sketchpad;
