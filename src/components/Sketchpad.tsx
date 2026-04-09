/* eslint-disable complexity */
import type { UnlistenFn } from '@tauri-apps/api/event';
import { listen } from '@tauri-apps/api/event';
import {
  ChevronLeft,
  Circle,
  Droplet,
  Eraser,
  LineChart,
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

import {
  parseStrokesFromSvgString,
  pointsToSvgPath,
  rasterizeSvgString,
  strokesToSvgString,
} from '../lib/sketchpad-renderer';
import type {
  BgType,
  PressureCurve,
  Stroke,
  ToolType,
} from '../types/sketchpad';

// NOTE: ToolType, BgType and PressureCurve are defined in src/types/sketchpad.ts
// and imported above to centralize the sketchpad-related types.

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

type CanvasBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
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
type CanvasSnapshot = {
  bitmap: ImageBitmap;
  strokes: Stroke[];
};

type SketchpadStoragePayload = {
  version: 2;
  rasterDataUrl?: string;
  strokeSvg?: string;
};

const A4_ASPECT = 210 / 297;
const INTERNAL_RES_WIDTH = 1240; // Logical canvas width in CSS pixels (≈150 DPI for A4)
const INTERNAL_RES_HEIGHT = Math.round(INTERNAL_RES_WIDTH / A4_ASPECT);
// The actual canvas buffer is scaled by devicePixelRatio for crisp HiDPI rendering.
// All drawing coordinates use logical pixels; the DPR scale is applied once in initCanvas.

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
  graph: {
    size: 2,
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
const MAX_UNDO_SNAPSHOTS = 40;
const MAX_PENDING_MOVE_POINTS = 240;

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
  g: 'graph',
};

const TOOL_ICONS: Record<ToolType, React.ReactNode> = {
  pen: <Pencil className="w-5 h-5" />,
  eraser: <Eraser className="w-5 h-5" />,
  fill: <Droplet className="w-5 h-5" />,
  line: <Minus className="w-5 h-5" />,
  rect: <Square className="w-5 h-5" />,
  ellipse: <Circle className="w-5 h-5" />,
  text: <Type className="w-5 h-5" />,
  graph: <LineChart className="w-5 h-5" />,
};

const TOOL_LABELS: Record<ToolType, string> = {
  pen: 'Pen',
  eraser: 'Eraser',
  fill: 'Fill',
  line: 'Line',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  text: 'Text',
  graph: 'Graph Axes (G)',
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

function getStrokeBoundingBox(strokes: Stroke[], padding: number = 20) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let found = false;

  for (const stroke of strokes) {
    const halfSize = Math.max(1, stroke.size) / 2;
    for (const point of stroke.points) {
      found = true;
      minX = Math.min(minX, point.x - halfSize);
      minY = Math.min(minY, point.y - halfSize);
      maxX = Math.max(maxX, point.x + halfSize);
      maxY = Math.max(maxY, point.y + halfSize);
    }
  }

  if (!found) return null;

  return {
    x: Math.max(0, minX - padding),
    y: Math.max(0, minY - padding),
    width: Math.max(1, maxX - minX + padding * 2),
    height: Math.max(1, maxY - minY + padding * 2),
  };
}

function mergeBoundingBoxes(
  a: { x: number; y: number; width: number; height: number } | null,
  b: { x: number; y: number; width: number; height: number } | null
) {
  if (!a) return b;
  if (!b) return a;

  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function cloneStrokes(strokeList: Stroke[]): Stroke[] {
  return strokeList.map((stroke) => ({
    ...stroke,
    points: stroke.points.map((point) => ({ ...point })),
  }));
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

// ─── Graph Axes ───────────────────────────────────────────────────────────────

/**
 * Stamps coordinate axes centred at (cx, cy) onto the canvas.
 * Suitable for VCE Math Methods — arrow endpoints, tick marks, faint grid.
 */
function drawGraphAxes(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string,
  strokeWidth: number = 2
) {
  const halfW = 320;
  const halfH = 240;
  const tickSpacing = 40;
  const tickLen = 8;
  const arrowSize = 14;

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Faint grid lines
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.lineWidth = 1;
  for (let tx = tickSpacing; tx < halfW; tx += tickSpacing) {
    ctx.beginPath();
    ctx.moveTo(cx + tx, cy - halfH);
    ctx.lineTo(cx + tx, cy + halfH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - tx, cy - halfH);
    ctx.lineTo(cx - tx, cy + halfH);
    ctx.stroke();
  }
  for (let ty = tickSpacing; ty < halfH; ty += tickSpacing) {
    ctx.beginPath();
    ctx.moveTo(cx - halfW, cy + ty);
    ctx.lineTo(cx + halfW, cy + ty);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - halfW, cy - ty);
    ctx.lineTo(cx + halfW, cy - ty);
    ctx.stroke();
  }
  ctx.restore();

  // X axis
  ctx.beginPath();
  ctx.moveTo(cx - halfW, cy);
  ctx.lineTo(cx + halfW, cy);
  ctx.stroke();
  // Y axis
  ctx.beginPath();
  ctx.moveTo(cx, cy - halfH);
  ctx.lineTo(cx, cy + halfH);
  ctx.stroke();

  // Arrowhead helper
  function arrowhead(tipX: number, tipY: number, dx: number, dy: number) {
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py = ux;
    const base = arrowSize * 0.4;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(
      tipX - ux * arrowSize + px * base,
      tipY - uy * arrowSize + py * base
    );
    ctx.lineTo(
      tipX - ux * arrowSize - px * base,
      tipY - uy * arrowSize - py * base
    );
    ctx.closePath();
    ctx.fill();
  }

  arrowhead(cx + halfW, cy, 1, 0);
  arrowhead(cx - halfW, cy, -1, 0);
  arrowhead(cx, cy - halfH, 0, -1);
  arrowhead(cx, cy + halfH, 0, 1);

  // Tick marks
  ctx.lineWidth = strokeWidth * 0.8;
  for (let tx = tickSpacing; tx < halfW - arrowSize; tx += tickSpacing) {
    ctx.beginPath();
    ctx.moveTo(cx + tx, cy - tickLen);
    ctx.lineTo(cx + tx, cy + tickLen);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - tx, cy - tickLen);
    ctx.lineTo(cx - tx, cy + tickLen);
    ctx.stroke();
  }
  for (let ty = tickSpacing; ty < halfH - arrowSize; ty += tickSpacing) {
    ctx.beginPath();
    ctx.moveTo(cx - tickLen, cy - ty);
    ctx.lineTo(cx + tickLen, cy - ty);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - tickLen, cy + ty);
    ctx.lineTo(cx + tickLen, cy + ty);
    ctx.stroke();
  }

  // Axis labels
  const fontSize = Math.round(tickSpacing * 0.5);
  ctx.font = `italic ${fontSize}px serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('x', cx + halfW + 6, cy - fontSize * 0.6);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('y', cx + fontSize * 0.5, cy - halfH - 4);

  // Origin
  ctx.font = `${fontSize * 0.85}px sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('O', cx - 5, cy + 5);

  ctx.restore();
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
    const svgRef = useRef<SVGSVGElement | null>(null);
    const textInputRef = useRef<HTMLInputElement | null>(null);
    const bgRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const cursorPreviewRef = useRef<HTMLDivElement | null>(null);

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

    // Vector stroke state (for SVG-based rendering)
    const [strokes, setStrokes] = useState<Stroke[]>([]);
    const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
    const strokesRef = useRef<Stroke[]>([]);
    const currentStrokeRef = useRef<Stroke | null>(null);

    const toolSettingsMapRef = useRef(toolSettingsMap);
    const activeToolRef = useRef(activeTool);
    const currentColor = toolSettingsMap[activeTool].color;
    const currentSize = toolSettingsMap[activeTool].size;
    const currentSmoothing = toolSettingsMap[activeTool].smoothing;

    const undoStack = useRef<CanvasSnapshot[]>([]);
    const redoStack = useRef<CanvasSnapshot[]>([]);
    const historyGenerationRef = useRef(0);
    const snapshotQueueRef = useRef<Promise<void>>(Promise.resolve());
    const lastUndoPushTime = useRef<number>(0);
    const activePointers = useRef<Map<number, ActivePointerMeta>>(new Map());
    const activeDrawingPointerId = useRef<number | null>(null);
    const shapeStart = useRef<{ x: number; y: number } | null>(null);
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
    const graphPreviewRaf = useRef<number | null>(null);
    const graphPreviewPointRef = useRef<{ x: number; y: number } | null>(null);
    const lastMove = useRef<
      Array<{
        x: number;
        y: number;
        pressure: number;
        pointerId: number;
        tiltX?: number;
        tiltY?: number;
        time: number;
      }>
    >([]);
    const cursorRaf = useRef<number | null>(null);
    const lastCursor = useRef<{ x: number; y: number } | null>(null);
    const viewportRaf = useRef<number | null>(null);
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
    const isDrawingRef = useRef(isDrawing);
    const isPanningRef = useRef(isPanning);
    const penOnlyModeRef = useRef(penOnlyMode);
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
    const undoActionRef = useRef<() => void>(() => { });
    const redoActionRef = useRef<() => void>(() => { });
    const clearActionRef = useRef<() => void>(() => { });
    const keyboardZoomStepRef = useRef<(direction: 1 | -1) => void>(() => { });
    const resetViewportRef = useRef<() => void>(() => { });
    const updateCursorPreviewRef = useRef<() => void>(() => { });
    const mainCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const overlayCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const bgCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const canvasBoundsRef = useRef<CanvasBounds | null>(null);

    // ─── Persistence helpers ───────────────────────────────────────────────────
    const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
      null
    );
    const hasDirtyCanvasRef = useRef(false);
    const pendingStorageSaveKeyRef = useRef<string | null>(null);
    const isStorageSaveInFlightRef = useRef(false);
    const storageSaveSeqRef = useRef(0);

    const canvasBlobToDataUrl = useCallback(async (blob: Blob) => {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read sketch blob'));
        reader.readAsDataURL(blob);
      });
    }, []);

    const markCanvasDirty = useCallback(() => {
      hasDirtyCanvasRef.current = true;
      hasExplicitlySaved.current = false;
    }, []);
    const disposeSnapshot = useCallback((snapshot: CanvasSnapshot) => {
      snapshot.bitmap.close();
    }, []);

    const clearSnapshotStack = useCallback(
      (stack: CanvasSnapshot[]) => {
        for (const snapshot of stack) {
          disposeSnapshot(snapshot);
        }
      },
      [disposeSnapshot]
    );

    const clearHistoryStacks = useCallback(() => {
      historyGenerationRef.current += 1;
      clearSnapshotStack(undoStack.current);
      clearSnapshotStack(redoStack.current);
      undoStack.current = [];
      redoStack.current = [];
      forceUpdate((n) => n + 1);
    }, [clearSnapshotStack]);

    const captureCanvasSnapshot = useCallback(
      async (canvas: HTMLCanvasElement): Promise<CanvasSnapshot> => {
        const bitmap = await createImageBitmap(canvas);
        const strokeSnapshot = cloneStrokes(strokesRef.current);
        if (typeof OffscreenCanvas === 'undefined') {
          return {
            bitmap,
            strokes: strokeSnapshot,
          };
        }

        const offscreen = new OffscreenCanvas(canvas.width, canvas.height);
        const offscreenCtx = offscreen.getContext('2d');
        if (!offscreenCtx) {
          return {
            bitmap,
            strokes: strokeSnapshot,
          };
        }

        offscreenCtx.clearRect(0, 0, offscreen.width, offscreen.height);
        offscreenCtx.drawImage(bitmap, 0, 0);
        bitmap.close();

        return {
          bitmap: offscreen.transferToImageBitmap(),
          strokes: strokeSnapshot,
        };
      },
      []
    );

    const applySnapshotToCanvas = useCallback(
      (
        snapshot: CanvasSnapshot,
        canvas: HTMLCanvasElement,
        ctx: CanvasRenderingContext2D
      ) => {
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.drawImage(snapshot.bitmap, 0, 0, canvas.width, canvas.height);
        ctx.restore();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const restoredStrokes = cloneStrokes(snapshot.strokes);
        strokesRef.current = restoredStrokes;
        setStrokes(restoredStrokes);
        currentStrokeRef.current = null;
        setCurrentStroke(null);
      },
      []
    );

    const queueSnapshotCapture = useCallback(
      (target: 'undo' | 'redo') => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const generationAtQueue = historyGenerationRef.current;
        const task = async () => {
          try {
            const snapshot = await captureCanvasSnapshot(canvas);
            if (historyGenerationRef.current !== generationAtQueue) {
              disposeSnapshot(snapshot);
              return;
            }

            const stack =
              target === 'undo' ? undoStack.current : redoStack.current;
            stack.push(snapshot);
            if (stack.length > MAX_UNDO_SNAPSHOTS) {
              const dropped = stack.shift();
              if (dropped) {
                disposeSnapshot(dropped);
              }
            }
            forceUpdate((n) => n + 1);
          } catch (err) {
            console.warn('Failed to capture canvas snapshot for history:', err);
          }
        };

        snapshotQueueRef.current = snapshotQueueRef.current.then(task, task);
      },
      [captureCanvasSnapshot, disposeSnapshot]
    );

    const flushSnapshotQueue = useCallback(async () => {
      await snapshotQueueRef.current;
    }, []);

    const getCanvasStorageKey = useCallback(
      (key?: string): string =>
        key ? `${CANVAS_STORAGE_KEY_PREFIX}-${key}` : '',
      []
    );

    const saveCanvasToStorage = useCallback(
      (key?: string) => {
        if (!key) return;
        pendingStorageSaveKeyRef.current = key;
        if (isStorageSaveInFlightRef.current) return;

        const runSave = () => {
          const nextKey = pendingStorageSaveKeyRef.current;
          if (!nextKey) {
            isStorageSaveInFlightRef.current = false;
            return;
          }

          pendingStorageSaveKeyRef.current = null;
          const canvas = canvasRef.current;
          if (!canvas) {
            isStorageSaveInFlightRef.current = false;
            return;
          }

          isStorageSaveInFlightRef.current = true;
          const seq = ++storageSaveSeqRef.current;
          canvas.toBlob(
            (blob: Blob | null) => {
              void (async () => {
                try {
                  if (!blob) return;
                  const rasterDataUrl = await canvasBlobToDataUrl(blob);
                  if (seq !== storageSaveSeqRef.current) return;
                  const strokeSvg =
                    strokesRef.current.length > 0
                      ? strokesToSvgString(
                        strokesRef.current,
                        INTERNAL_RES_WIDTH,
                        INTERNAL_RES_HEIGHT,
                        bgRef2.current,
                        true
                      )
                      : '';
                  const payload: SketchpadStoragePayload = {
                    version: 2,
                    rasterDataUrl,
                    strokeSvg: strokeSvg || undefined,
                  };
                  localStorage.setItem(
                    getCanvasStorageKey(nextKey),
                    JSON.stringify(payload)
                  );
                  hasDirtyCanvasRef.current = false;
                } catch (err) {
                  console.warn('Failed to save canvas to localStorage:', err);
                } finally {
                  if (pendingStorageSaveKeyRef.current) {
                    runSave();
                  } else {
                    isStorageSaveInFlightRef.current = false;
                  }
                }
              })();
            },
            'image/webp',
            0.85
          );
        };

        runSave();
      },
      [canvasBlobToDataUrl, getCanvasStorageKey]
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
          ctx.clearRect(0, 0, INTERNAL_RES_WIDTH, INTERNAL_RES_HEIGHT);
          const overlayCanvas = overlayRef.current;
          if (overlayCanvas) {
            const overlayCtx = overlayCanvas.getContext('2d');
            overlayCtx?.clearRect(
              0,
              0,
              INTERNAL_RES_WIDTH,
              INTERNAL_RES_HEIGHT
            );
          }
          clearHistoryStacks();
          hasMoved.current = false;
          lastPointReal.current = null;
          hasDirtyCanvasRef.current = false;
          currentStrokeRef.current = null;
          setCurrentStroke(null);
          strokesRef.current = [];
          setStrokes([]);

          const storedValue = localStorage.getItem(getCanvasStorageKey(key));
          if (!storedValue) return;

          let rasterDataUrl = storedValue;
          let restoredStrokes: Stroke[] = [];

          if (storedValue.trim().startsWith('{')) {
            try {
              const payload = JSON.parse(storedValue) as Partial<SketchpadStoragePayload>;
              if (typeof payload.rasterDataUrl === 'string') {
                rasterDataUrl = payload.rasterDataUrl;
              }
              if (typeof payload.strokeSvg === 'string' && payload.strokeSvg) {
                restoredStrokes = parseStrokesFromSvgString(payload.strokeSvg);
              }
            } catch (parseErr) {
              console.warn('Failed to parse saved sketch payload:', parseErr);
            }
          }

          const img = new Image();
          img.onload = () => {
            const dpr = Math.max(1, window.devicePixelRatio || 1);
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            ctx.restore();
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          };
          img.onerror = () => {
            console.warn('Failed to load saved canvas image');
          };
          img.src = rasterDataUrl;

          if (restoredStrokes.length > 0) {
            strokesRef.current = restoredStrokes;
            setStrokes(restoredStrokes);
          }
        } catch (err) {
          console.warn('Failed to restore canvas from localStorage:', err);
        }
      },
      [clearHistoryStacks, getCanvasStorageKey]
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
        if (!hasDirtyCanvasRef.current) return;
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current);
        }
        autoSaveTimeoutRef.current = setTimeout(() => {
          saveCanvasToStorage(key);
        }, 1000); // Save 1s after last drawing action
      },
      [saveCanvasToStorage]
    );

    function readCanvasBounds(): CanvasBounds | null {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };
    }

    function getEventTimeStamp(e: Pick<PointerEvent, 'timeStamp'>) {
      return Number.isFinite(e.timeStamp) && e.timeStamp > 0
        ? e.timeStamp
        : performance.now();
    }

    const bgRef2 = useRef<BgType>(bg);

    const clampZoom = useCallback(
      (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)),
      []
    );

    const flushViewportState = useCallback(() => {
      viewportRaf.current = null;
      setZoom(zoomRef.current);
      setPan(panRef.current);
    }, []);

    const commitViewportState = useCallback(() => {
      setZoom(zoomRef.current);
      setPan(panRef.current);
    }, []);

    const queueViewportState = useCallback(() => {
      if (viewportRaf.current !== null) return;
      viewportRaf.current = requestAnimationFrame(flushViewportState);
    }, [flushViewportState]);

    const setViewport = useCallback(
      (
        nextPan: { x: number; y: number },
        nextZoom: number = zoomRef.current
      ) => {
        zoomRef.current = clampZoom(nextZoom);
        panRef.current = nextPan;
        queueViewportState();
      },
      [clampZoom, queueViewportState]
    );

    const setViewportImmediate = useCallback(
      (
        nextPan: { x: number; y: number },
        nextZoom: number = zoomRef.current
      ) => {
        zoomRef.current = clampZoom(nextZoom);
        panRef.current = nextPan;
        commitViewportState();
      },
      [clampZoom, commitViewportState]
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

        setViewport(
          {
            x: localX - contentX * targetZoom,
            y: localY - contentY * targetZoom,
          },
          targetZoom
        );
      },
      [clampZoom, setViewport]
    );

    const zoomAroundCenter = useCallback(
      (nextZoom: number, immediate = false) => {
        const container = containerRef.current;
        if (!container) {
          if (immediate) {
            setViewportImmediate(panRef.current, nextZoom);
          } else {
            setViewport(panRef.current, nextZoom);
          }
          return;
        }
        const rect = container.getBoundingClientRect();
        if (immediate) {
          const localX = rect.width / 2;
          const localY = rect.height / 2;
          const currentZoom = zoomRef.current;
          const currentPan = panRef.current;
          const safeCurrentZoom = Math.max(currentZoom, 0.0001);
          const targetZoom = clampZoom(nextZoom);

          if (Math.abs(targetZoom - currentZoom) < 0.0001) return;

          const contentX = (localX - currentPan.x) / safeCurrentZoom;
          const contentY = (localY - currentPan.y) / safeCurrentZoom;

          setViewportImmediate(
            {
              x: localX - contentX * targetZoom,
              y: localY - contentY * targetZoom,
            },
            targetZoom
          );
          return;
        }

        zoomAroundClientPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
          nextZoom
        );
      },
      [clampZoom, setViewport, setViewportImmediate, zoomAroundClientPoint]
    );

    const zoomByKeyboardStep = useCallback(
      (direction: 1 | -1) => {
        zoomAroundCenter(
          zoomRef.current + direction * KEYBOARD_ZOOM_STEP,
          true
        );
      },
      [zoomAroundCenter]
    );

    const resetViewport = useCallback(() => {
      const container = containerRef.current;
      const nextZoom = 1;
      if (!container) {
        setViewportImmediate({ x: 0, y: 0 }, nextZoom);
        return;
      }

      setViewportImmediate(
        {
          x: (container.clientWidth - INTERNAL_RES_WIDTH * nextZoom) / 2,
          y: (container.clientHeight - INTERNAL_RES_HEIGHT * nextZoom) / 2,
        },
        nextZoom
      );
    }, [setViewportImmediate]);

    useEffect(() => {
      bgRef2.current = bg;
    }, [bg]);

    useEffect(() => {
      penOnlyModeRef.current = penOnlyMode;
    }, [penOnlyMode]);

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
      if (
        !isDrawing &&
        hasExplicitlySaved.current === false &&
        hasDirtyCanvasRef.current &&
        sessionKey
      ) {
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
          if (
            !hasExplicitlySaved.current &&
            hasDirtyCanvasRef.current &&
            sessionKey
          ) {
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
        .catch(() => { });
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

      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const newW = INTERNAL_RES_WIDTH * dpr;
      const newH = INTERNAL_RES_HEIGHT * dpr;

      // Only resize if needed (prevents unnecessary clear)
      if (canvas.width === newW && canvas.height === newH) return;

      let snapshotPromise: Promise<CanvasSnapshot | null> | null = null;
      if (canvas.width > 0 && canvas.height > 0) {
        snapshotPromise = captureCanvasSnapshot(canvas).catch(() => null);
      }

      for (const c of [canvas, overlay]) {
        c.width = newW;
        c.height = newH;
        // Set CSS size to logical pixels so zoom transform works correctly
        c.style.width = `${INTERNAL_RES_WIDTH}px`;
        c.style.height = `${INTERNAL_RES_HEIGHT}px`;
        const ctx = c.getContext('2d')!;
        if (c === canvas) mainCtxRef.current = ctx;
        if (c === overlay) overlayCtxRef.current = ctx;
        // Scale all drawing by DPR so coordinates remain in logical pixels
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      bgCanvas.width = newW;
      bgCanvas.height = newH;
      bgCanvas.style.width = `${INTERNAL_RES_WIDTH}px`;
      bgCanvas.style.height = `${INTERNAL_RES_HEIGHT}px`;
      const bgCtx = bgCanvas.getContext('2d')!;
      bgCtxRef.current = bgCtx;
      bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintBackground(
        bgCtx,
        INTERNAL_RES_WIDTH,
        INTERNAL_RES_HEIGHT,
        bgRef2.current
      );

      if (snapshotPromise) {
        void snapshotPromise.then((snapshot) => {
          if (!snapshot) return;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            disposeSnapshot(snapshot);
            return;
          }
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(snapshot.bitmap, 0, 0, newW, newH);
          ctx.restore();
          disposeSnapshot(snapshot);
        });
      }

      // Initial zoom to fit
      const containerW = container.clientWidth;
      const containerH = container.clientHeight;
      const fitZoom = Math.min(
        (containerW - 80) / INTERNAL_RES_WIDTH,
        (containerH - 80) / INTERNAL_RES_HEIGHT
      );
      setViewport(
        {
          x: (containerW - INTERNAL_RES_WIDTH * fitZoom) / 2,
          y: (containerH - INTERNAL_RES_HEIGHT * fitZoom) / 2,
        },
        fitZoom
      );
    }, [captureCanvasSnapshot, disposeSnapshot, setViewport]);

    useEffect(() => {
      if (!embedded && !open) return;
      initCanvas();
    }, [embedded, open, initCanvas]);

    useEffect(() => {
      const bgCanvas = bgRef.current;
      if (!bgCanvas || bgCanvas.width === 0 || bgCanvas.height === 0) return;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const bgCtx = bgCanvas.getContext('2d')!;
      bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintBackground(bgCtx, INTERNAL_RES_WIDTH, INTERNAL_RES_HEIGHT, bg);
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
          updateCursorPreviewRef.current();
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
        if (e.code === 'Space') {
          spaceDown.current = false;
          updateCursorPreviewRef.current();
        }
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
          const currentPan = panRef.current;
          setViewport({
            x: currentPan.x - e.deltaX,
            y: currentPan.y - e.deltaY,
          });
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
          isDrawingRef.current = false;
          activeDrawingPointerId.current = null;
          lastPointReal.current = null;
          hasMoved.current = false;
          shapeStart.current = null;

          const overlay = overlayRef.current;
          const overlayCtx = overlay?.getContext('2d');
          if (overlay && overlayCtx) {
            overlayCtx.clearRect(0, 0, INTERNAL_RES_WIDTH, INTERNAL_RES_HEIGHT);
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

          setViewport({ x: nextPanX, y: nextPanY }, newZoom);

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
    }, [setViewport, zoomAroundClientPoint]);

    function getCtx() {
      return mainCtxRef.current;
    }
    function getOverlayCtx() {
      return overlayCtxRef.current;
    }
    const clearOverlay = useCallback(() => {
      const canvas = overlayRef.current;
      const ctx = getOverlayCtx();
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, INTERNAL_RES_WIDTH, INTERNAL_RES_HEIGHT);
    }, []);

    const updateCursorPreview = useCallback(() => {
      const cursor = cursorPreviewRef.current;
      if (!cursor) return;

      const point = lastCursor.current;
      const container = containerRef.current;
      const containerRect = container?.getBoundingClientRect();
      const tool = activeToolRef.current;
      const shouldShow =
        !!point &&
        tool !== 'fill' &&
        tool !== 'text' &&
        tool !== 'graph' &&
        (isHoveringRef.current || !spaceDown.current);

      if (!shouldShow || !point) {
        cursor.style.display = 'none';
        return;
      }

      const settings = toolSettingsMapRef.current[tool];
      const previewDiameter = Math.max(1, settings.size * zoomRef.current);
      cursor.style.display = 'block';
      cursor.style.left = `${point.x - (containerRect?.left ?? 0)}px`;
      cursor.style.top = `${point.y - (containerRect?.top ?? 0)}px`;
      cursor.style.boxSizing = 'border-box';
      cursor.style.width = `${previewDiameter}px`;
      cursor.style.height = `${previewDiameter}px`;
      cursor.style.opacity =
        isHoveringRef.current && !spaceDown.current ? '0.7' : '1';
      cursor.style.border =
        tool === 'eraser'
          ? '1px solid rgba(0,0,0,0.5)'
          : `1px solid ${settings.color}`;
    }, []);

    useEffect(() => {
      updateCursorPreviewRef.current = updateCursorPreview;
    }, [updateCursorPreview]);

    function processPendingMove() {
      moveRaf.current = null;
      const ctx = getCtx();
      if (!ctx) return;
      const moves = lastMove.current;
      if (moves.length === 0) return;

      const tool = activeToolRef.current;
      const isShapeTool =
        tool === 'line' || tool === 'rect' || tool === 'ellipse';
      const overlayCtx = isShapeTool ? getOverlayCtx() : null;

      if (isShapeTool && shapeStart.current && overlayCtx) {
        const latest = moves[moves.length - 1];
        const latestPoint = { x: latest.x, y: latest.y };
        clearOverlay();
        applyToolStyle(overlayCtx, latest.pressure, 0);
        drawShape(overlayCtx, tool, shapeStart.current, latestPoint);
        lastMove.current = [];
        return;
      }

      let lastPoint = lastPointReal.current;
      let lastAppliedPressure = -1; // sentinel — forces style apply on first segment

      for (const m of moves) {
        const pt = { x: m.x, y: m.y };
        const pressure = m.pressure;

        if (tool === 'text') continue;
        if (!lastPoint) {
          lastPoint = { ...pt, pressure, time: m.time };
          lastPointReal.current = lastPoint;
          continue;
        }

        // Calculate velocity for dynamic stroke width
        const dx = pt.x - lastPoint.x;
        const dy = pt.y - lastPoint.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const dt = Math.max(1, m.time - lastPoint.time);
        const velocity = dist / dt;

        velocityRef.current = velocityRef.current * 0.8 + velocity * 0.2;

        // Only re-apply tool style when pressure changes meaningfully (saves ctx state writes)
        if (Math.abs(pressure - lastAppliedPressure) > 0.02) {
          applyToolStyle(ctx, pressure, velocityRef.current);
          lastAppliedPressure = pressure;
        }

        // Midpoint logic for smoothing
        const midX = (lastPoint.x + pt.x) / 2;
        const midY = (lastPoint.y + pt.y) / 2;

        ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, midX, midY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(midX, midY);

        lastPoint = { x: pt.x, y: pt.y, pressure, time: m.time };
        lastPointReal.current = lastPoint;
      }

      // Also append these sampled points to the in-progress vector stroke
      try {
        if (currentStrokeRef.current) {
          const pts = currentStrokeRef.current.points;
          for (const m of moves) {
            pts.push({
              x: m.x,
              y: m.y,
              pressure: m.pressure,
              time: m.time,
              tiltX: m.tiltX,
              tiltY: m.tiltY,
            });
          }
          // Trigger a state update with a shallow copy to re-render the SVG path
          setCurrentStroke({ ...currentStrokeRef.current, points: pts.slice() });
        }
      } catch {
        // Non-fatal; continue
      }

      lastMove.current = [];
    }

    const pushUndo = useCallback(
      (force = false) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        markCanvasDirty();
        const now = performance.now();
        // Throttle: skip expensive snapshots for rapid successive strokes.
        // 400ms gap means undo still captures each "burst" as a single step.
        if (!force && now - lastUndoPushTime.current < 400) return;
        lastUndoPushTime.current = now;

        if (redoStack.current.length) {
          clearSnapshotStack(redoStack.current);
          redoStack.current = [];
        }

        queueSnapshotCapture('undo');
      },
      [clearSnapshotStack, markCanvasDirty, queueSnapshotCapture]
    );

    const runUndo = useCallback(async () => {
      const canvas = canvasRef.current;
      const ctx = getCtx();
      if (!canvas || !ctx) return;

      await flushSnapshotQueue();
      if (!undoStack.current.length) return;

      try {
        const currentSnapshot = await captureCanvasSnapshot(canvas);
        redoStack.current.push(currentSnapshot);
        if (redoStack.current.length > MAX_UNDO_SNAPSHOTS) {
          const dropped = redoStack.current.shift();
          if (dropped) {
            disposeSnapshot(dropped);
          }
        }

        const previousSnapshot = undoStack.current.pop();
        if (!previousSnapshot) return;
        applySnapshotToCanvas(previousSnapshot, canvas, ctx);
        disposeSnapshot(previousSnapshot);
      } catch (err) {
        console.warn('Failed to run undo:', err);
      }

      forceUpdate((n) => n + 1);
    }, [
      applySnapshotToCanvas,
      captureCanvasSnapshot,
      disposeSnapshot,
      flushSnapshotQueue,
    ]);

    const runRedo = useCallback(async () => {
      const canvas = canvasRef.current;
      const ctx = getCtx();
      if (!canvas || !ctx) return;

      await flushSnapshotQueue();
      if (!redoStack.current.length) return;

      try {
        const currentSnapshot = await captureCanvasSnapshot(canvas);
        undoStack.current.push(currentSnapshot);
        if (undoStack.current.length > MAX_UNDO_SNAPSHOTS) {
          const dropped = undoStack.current.shift();
          if (dropped) {
            disposeSnapshot(dropped);
          }
        }

        const nextSnapshot = redoStack.current.pop();
        if (!nextSnapshot) return;
        applySnapshotToCanvas(nextSnapshot, canvas, ctx);
        disposeSnapshot(nextSnapshot);
      } catch (err) {
        console.warn('Failed to run redo:', err);
      }

      forceUpdate((n) => n + 1);
    }, [
      applySnapshotToCanvas,
      captureCanvasSnapshot,
      disposeSnapshot,
      flushSnapshotQueue,
    ]);

    const undo = useCallback(() => {
      void runUndo();
    }, [runUndo]);

    const redo = useCallback(() => {
      void runRedo();
    }, [runRedo]);

    const clearCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = getCtx();
      if (!canvas || !ctx) return;
      pushUndo(true);
      ctx.clearRect(0, 0, INTERNAL_RES_WIDTH, INTERNAL_RES_HEIGHT);
      clearOverlay();
      lastMove.current = [];
      lastPointReal.current = null;
      shapeStart.current = null;
      activeDrawingPointerId.current = null;
      strokesRef.current = [];
      setStrokes([]);
      currentStrokeRef.current = null;
      setCurrentStroke(null);
      setIsDrawing(false);
      isDrawingRef.current = false;
      hasMoved.current = false;
      forceUpdate((n) => n + 1);
    }, [clearOverlay, pushUndo]);

    useEffect(() => {
      undoActionRef.current = undo;
      redoActionRef.current = redo;
      clearActionRef.current = clearCanvas;
      keyboardZoomStepRef.current = zoomByKeyboardStep;
      resetViewportRef.current = resetViewport;
    }, [undo, redo, clearCanvas, zoomByKeyboardStep, resetViewport]);

    function getCanvasPoint(e: PointerEvent, bounds?: CanvasBounds | null) {
      const rect = bounds ?? readCanvasBounds();
      if (!rect) {
        return { x: 0, y: 0 };
      }
      // rect dimensions are in CSS logical pixels; canvas.width is physical pixels.
      // We want logical canvas coordinates (matching the DPR-scaled drawing context),
      // so we divide by the CSS width, not the physical width.
      return {
        x: ((e.clientX - rect.left) / rect.width) * INTERNAL_RES_WIDTH,
        y: ((e.clientY - rect.top) / rect.height) * INTERNAL_RES_HEIGHT,
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
      pressure: number,
      time: number
    ) {
      pushUndo();
      if (!isDrawingRef.current) {
        setIsDrawing(true);
        isDrawingRef.current = true;
      }
      lastPointReal.current = { ...pt, pressure, time };
      velocityRef.current = 0;
      activeDrawingPointerId.current = pointerId;
      // Create an in-memory vector stroke for SVG rendering
      try {
        const tool = activeToolRef.current;
        const settings = toolSettingsMapRef.current[tool];
        const newStroke: Stroke = {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
          tool,
          color: settings.color,
          size: settings.size,
          smoothing: settings.smoothing,
          pressureCurve: settings.pressureCurve,
          points: [{ x: pt.x, y: pt.y, pressure, time }],
          opacity: settings.opacity,
        };
        currentStrokeRef.current = newStroke;
        setCurrentStroke(newStroke);
      } catch {
        // non-fatal — continue drawing raster fallback
      }

      ctx.beginPath();
      applyToolStyle(ctx, pressure, 0);
      ctx.moveTo(pt.x, pt.y);
    }

    function handlePointerDown(e: PointerEvent) {
      const canvas = canvasRef.current;
      const ctx = getCtx();
      if (!canvas || !ctx) return;

      // Only handle drawing events that originate from the drawing surface,
      // not from UI controls (buttons, sliders, etc.) overlaid on the container.
      const target = e.target as HTMLElement;
      const container = containerRef.current;
      // Walk up to see if the click hit a UI control before reaching the container
      let el: HTMLElement | null = target;
      let isUiControl = false;
      while (el && el !== container) {
        const tag = el.tagName;
        const role = el.getAttribute('role');
        if (
          tag === 'BUTTON' ||
          tag === 'INPUT' ||
          tag === 'SELECT' ||
          tag === 'A' ||
          role === 'button' ||
          role === 'slider' ||
          role === 'combobox'
        ) {
          isUiControl = true;
          break;
        }
        el = el.parentElement;
      }
      if (isUiControl) return;

      const currentTool = activeToolRef.current;
      const penOnly = penOnlyModeRef.current;

      if (
        e.pointerType === 'touch' &&
        touchGesture.current &&
        touchGesture.current.active
      ) {
        canvasBoundsRef.current = null;
        return;
      }

      if (multiTouchActive.current && e.pointerType === 'touch') {
        canvasBoundsRef.current = null;
        return;
      }

      if (spaceDown.current || e.button === 1) {
        if (e.button === 1) middleDown.current = true;
        setIsPanning(true);
        isPanningRef.current = true;
        panPointerId.current = e.pointerId;
        panStart.current = {
          mx: e.clientX,
          my: e.clientY,
          px: panRef.current.x,
          py: panRef.current.y,
        };
        e.preventDefault();
        return;
      }

      if (penOnly && e.pointerType === 'touch') {
        setIsPanning(true);
        isPanningRef.current = true;
        panPointerId.current = e.pointerId;
        panStart.current = {
          mx: e.clientX,
          my: e.clientY,
          px: panRef.current.x,
          py: panRef.current.y,
        };
        e.preventDefault();
        canvasBoundsRef.current = null;
        return;
      }

      // For drawing operations the pointer must be over the canvas itself
      if (e.target !== canvas) return;

      canvasBoundsRef.current = readCanvasBounds();

      const pt = getCanvasPoint(e, canvasBoundsRef.current);

      if (currentTool === 'text') {
        canvasBoundsRef.current = null;
        setTextInput({ id: Date.now(), x: pt.x, y: pt.y, value: '' });
        return;
      }

      if (currentTool === 'graph') {
        pushUndo(true);
        const settings = toolSettingsMapRef.current['graph'];
        drawGraphAxes(ctx, pt.x, pt.y, settings.color, settings.size);
        canvasBoundsRef.current = null;
        return;
      }

      if (e.pointerType === 'touch' && hasActivePenPointer()) return;
      if (penOnly && e.pointerType !== 'pen' && e.pointerType !== 'mouse') {
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

      if (currentTool === 'fill') {
        pushUndo(true);
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const color = toolSettingsMapRef.current[currentTool].color;
        floodFill(
          ctx,
          Math.round(pt.x * dpr),
          Math.round(pt.y * dpr),
          color,
          1,
          32
        );
        canvasBoundsRef.current = null;
        return;
      }

      if (['line', 'rect', 'ellipse'].includes(currentTool)) {
        pushUndo(true);
        shapeStart.current = pt;
        setIsDrawing(true);
        isDrawingRef.current = true;
        activeDrawingPointerId.current = e.pointerId;
        pointerMeta.strokeStarted = true;
        return;
      }

      if (
        e.pointerType === 'touch' &&
        PALM_REJECTION.MIN_TOUCH_DURATION > 0 &&
        ['pen', 'eraser'].includes(currentTool)
      ) {
        return;
      }

      hasMoved.current = false;
      startStroke(e.pointerId, pt, ctx, pressure, getEventTimeStamp(e));
      pointerMeta.strokeStarted = true;
    }

    function handlePointerMove(e: PointerEvent) {
      const canvas = canvasRef.current;
      const ctx = getCtx();
      if (!canvas || !ctx) return;
      const currentTool = activeToolRef.current;

      if (multiTouchActive.current && e.pointerType === 'touch') return;

      lastCursor.current = { x: e.clientX, y: e.clientY };
      if (!cursorRaf.current) {
        cursorRaf.current = requestAnimationFrame(() => {
          cursorRaf.current = null;
          updateCursorPreview();
        });
      }

      if (
        isPanningRef.current &&
        panStart.current &&
        (panPointerId.current === null || panPointerId.current === e.pointerId)
      ) {
        // Update pan synchronously via refs and commit immediately — avoids
        // the extra RAF latency that setViewport (queue-based) would introduce.
        panRef.current = {
          x: panStart.current.px + (e.clientX - panStart.current.mx),
          y: panStart.current.py + (e.clientY - panStart.current.my),
        };
        // Batch the React state update into the next animation frame
        if (viewportRaf.current === null) {
          viewportRaf.current = requestAnimationFrame(flushViewportState);
        }
        return;
      }

      const pointerMeta = activePointers.current.get(e.pointerId);
      if (!pointerMeta || pointerMeta.rejected) return;

      // Only process drawing if the pointer is over the canvas (or we're
      // already mid-stroke — then we continue regardless of position)
      if (!isDrawingRef.current && e.target !== canvas) return;

      pointerMeta.tiltX = e.tiltX;
      pointerMeta.tiltY = e.tiltY;

      if (currentTool === 'text' || currentTool === 'fill') return;

      // Ghost preview for graph tool — show faint axes at cursor position
      if (currentTool === 'graph') {
        graphPreviewPointRef.current = getCanvasPoint(
          e,
          canvasBoundsRef.current
        );
        if (!graphPreviewRaf.current) {
          graphPreviewRaf.current = requestAnimationFrame(() => {
            graphPreviewRaf.current = null;
            const point = graphPreviewPointRef.current;
            const octx = getOverlayCtx();
            if (!octx || !point) return;
            clearOverlay();
            const settings = toolSettingsMapRef.current.graph;
            octx.save();
            octx.globalAlpha = 0.35;
            drawGraphAxes(
              octx,
              point.x,
              point.y,
              settings.color,
              settings.size
            );
            octx.restore();
          });
        }
        return;
      }

      const isFreehandTool = ['pen', 'eraser'].includes(currentTool);

      if (pointerMeta.type === 'touch' && !pointerMeta.strokeStarted) {
        if (!isFreehandTool) return;
        const touchDownTime = pointerMeta.touchDownTime ?? performance.now();
        const elapsed = performance.now() - touchDownTime;
        if (elapsed < PALM_REJECTION.MIN_TOUCH_DURATION) {
          return;
        }
        const pt = getCanvasPoint(e, canvasBoundsRef.current);
        const pressureForStart = e.pressure > 0 ? e.pressure : 1;
        startStroke(
          e.pointerId,
          pt,
          ctx,
          pressureForStart,
          getEventTimeStamp(e)
        );
        pointerMeta.strokeStarted = true;
        return;
      }

      if (!isDrawingRef.current) return;
      if (activeDrawingPointerId.current !== e.pointerId) return;

      hasMoved.current = true;

      const events: PointerEvent[] =
        isAndroid && typeof e.getCoalescedEvents === 'function'
          ? e.getCoalescedEvents()
          : [];

      if (events.length === 0) events.push(e);

      for (const ce of events) {
        if (lastMove.current.length >= MAX_PENDING_MOVE_POINTS) {
          lastMove.current.shift();
        }
        const pt = getCanvasPoint(ce, canvasBoundsRef.current);
        const pressure = ce.pressure > 0 ? ce.pressure : 1;
        lastMove.current.push({
          x: pt.x,
          y: pt.y,
          pressure,
          pointerId: ce.pointerId,
          tiltX: ce.tiltX,
          tiltY: ce.tiltY,
          time: getEventTimeStamp(ce),
        });
      }

      if (!moveRaf.current)
        moveRaf.current = requestAnimationFrame(processPendingMove);
    }

    function handlePointerUp(e: PointerEvent) {
      const canvas = canvasRef.current;
      const ctx = getCtx();
      if (!canvas || !ctx) return;
      const currentTool = activeToolRef.current;

      if (isPanningRef.current && panPointerId.current === e.pointerId) {
        if (e.button === 1) middleDown.current = false;
        setIsPanning(false);
        isPanningRef.current = false;
        panPointerId.current = null;
        panStart.current = null;
        updateCursorPreview();
        return;
      }

      if (graphPreviewRaf.current) {
        cancelAnimationFrame(graphPreviewRaf.current);
        graphPreviewRaf.current = null;
      }
      graphPreviewPointRef.current = null;

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

      const pt = getCanvasPoint(e, canvasBoundsRef.current);
      const pressure = e.pressure > 0 ? e.pressure : 1;

      if (
        ['line', 'rect', 'ellipse'].includes(currentTool) &&
        shapeStart.current
      ) {
        clearOverlay();
        applyToolStyle(ctx, pressure);
        drawShape(ctx, currentTool, shapeStart.current, pt);
        shapeStart.current = null;
      } else if (!hasMoved.current && ['pen', 'eraser'].includes(currentTool)) {
        applyToolStyle(ctx, pressure);
        const size = toolSettingsMapRef.current[currentTool].size;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(1, size / 2), 0, Math.PI * 2);
        ctx.fill();
      }

      setIsDrawing(false);
      isDrawingRef.current = false;
      lastPointReal.current = null;
      lastMove.current = [];
      activeDrawingPointerId.current = null;
      // Finalize vector stroke (if any)
      try {
        if (currentStrokeRef.current) {
          strokesRef.current = [...strokesRef.current, currentStrokeRef.current];
          setStrokes(strokesRef.current.slice());
          currentStrokeRef.current = null;
          setCurrentStroke(null);
        }
      } catch {
        // ignore
      }

      canvasBoundsRef.current = null;
      ctx.closePath();
    }

    useEffect(() => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const handlePointerEnter = (e: PointerEvent) => {
        if (e.target === canvas && (e.pointerType === 'pen' || e.pointerType === 'mouse')) {
          isHoveringRef.current = true;
          setIsHovering(true);
          updateCursorPreview();
        }
      };

      const handlePointerOver = (e: PointerEvent) => {
        if (e.target === canvas && e.pointerType === 'pen') {
          isHoveringRef.current = true;
          setIsHovering(true);
          updateCursorPreview();
        }
      };

      const handlePointerLeave = (e: PointerEvent) => {
        // Only clear hover state when leaving the canvas itself
        if (e.target !== canvas) return;
        isHoveringRef.current = false;
        setIsHovering(false);
        updateCursorPreview();
        if (graphPreviewRaf.current) {
          cancelAnimationFrame(graphPreviewRaf.current);
          graphPreviewRaf.current = null;
        }
        graphPreviewPointRef.current = null;
        // Clear graph ghost preview when cursor leaves canvas
        if (activeToolRef.current === 'graph') {
          clearOverlay();
        }
      };

      const handlePointerCancel = (e: PointerEvent) => {
        clearOverlay();
        if (graphPreviewRaf.current) {
          cancelAnimationFrame(graphPreviewRaf.current);
          graphPreviewRaf.current = null;
        }
        graphPreviewPointRef.current = null;
        activePointers.current.delete(e.pointerId);
        if (activeDrawingPointerId.current === e.pointerId) {
          if (moveRaf.current) {
            cancelAnimationFrame(moveRaf.current);
            moveRaf.current = null;
          }
          lastMove.current = [];
          lastPointReal.current = null;
          shapeStart.current = null;
          activeDrawingPointerId.current = null;
          hasMoved.current = false;
          setIsDrawing(false);
          isDrawingRef.current = false;
        }
        canvasBoundsRef.current = null;
      };

      // Attach pointerdown to container so space+drag and middle-click pan
      // works anywhere in the viewport, not just over the canvas element.
      container.addEventListener('pointerdown', handlePointerDown);
      // pointermove and pointerup go on window so panning continues even if the
      // pointer leaves the container bounds.
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      canvas.addEventListener('pointercancel', handlePointerCancel);
      canvas.addEventListener('pointerenter', handlePointerEnter);
      canvas.addEventListener('pointerover', handlePointerOver);
      canvas.addEventListener('pointerleave', handlePointerLeave);
      return () => {
        container.removeEventListener('pointerdown', handlePointerDown);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        canvas.removeEventListener('pointercancel', handlePointerCancel);
        canvas.removeEventListener('pointerenter', handlePointerEnter);
        canvas.removeEventListener('pointerover', handlePointerOver);
        canvas.removeEventListener('pointerleave', handlePointerLeave);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      return () => {
        clearHistoryStacks();
        if (moveRaf.current) cancelAnimationFrame(moveRaf.current);
        if (graphPreviewRaf.current)
          cancelAnimationFrame(graphPreviewRaf.current);
        if (cursorRaf.current) cancelAnimationFrame(cursorRaf.current);
        if (viewportRaf.current) cancelAnimationFrame(viewportRaf.current);
        if (autoSaveTimeoutRef.current)
          clearTimeout(autoSaveTimeoutRef.current);
      };
    }, [clearHistoryStacks]);

    useEffect(() => {
      updateCursorPreview();
    }, [
      activeTool,
      currentSize,
      currentColor,
      zoom,
      isHovering,
      updateCursorPreview,
    ]);

    useEffect(() => {
      const canvas = canvasRef.current;
      const overlay = overlayRef.current;
      const bgCanvas = bgRef.current;
      if (!canvas || !overlay || !bgCanvas) return;
      for (const c of [canvas, overlay, bgCanvas]) {
        c.style.touchAction = 'none';
        c.style.willChange = 'transform';
        // With DPR-scaled canvas buffers, the browser's default bicubic resampling
        // is ideal: smooth when zoomed out, crisp when near 1:1 or zoomed in.
        c.style.imageRendering = 'auto';
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
      const strokeBounds = getStrokeBoundingBox(strokesRef.current, 40);
      const rasterBounds = getCropBoundingBox(canvas, 40);
      const bounds = mergeBoundingBoxes(rasterBounds, strokeBounds);
      const exportW = bounds ? bounds.width : canvas.width;
      const exportH = bounds ? bounds.height : canvas.height;
      const startX = bounds ? bounds.x : 0;
      const startY = bounds ? bounds.y : 0;
      const vectorRaster =
        strokesRef.current.length > 0
          ? await rasterizeSvgString(
            strokesToSvgString(
              strokesRef.current,
              INTERNAL_RES_WIDTH,
              INTERNAL_RES_HEIGHT,
              bg
            ),
            INTERNAL_RES_WIDTH,
            INTERNAL_RES_HEIGHT
          )
          : null;

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

        if (vectorRaster) {
          tctx.drawImage(
            vectorRaster,
            startX,
            startY,
            exportW,
            exportH,
            0,
            0,
            exportW,
            exportH
          );
        }

        tmp.toBlob(
          (blob: Blob | null) => {
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
          : activeTool === 'fill' || activeTool === 'graph'
            ? 'crosshair'
            : 'none';

    // At zoom ≥ 1 the canvas buffer is upscaled by the browser transform. Use
    // 'pixelated' to prevent blurry bicubic interpolation — the canvas is
    // already crisp (DPR-scaled in initCanvas). When zoomed out, 'auto' gives
    // smooth downscaling.
    const canvasImageRendering: React.CSSProperties['imageRendering'] =
      zoom >= 1 ? 'pixelated' : 'auto';

    const canvasTransform: React.CSSProperties = {
      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
      transformOrigin: '0 0',
      imageRendering: canvasImageRendering,
    };

    const canvasArea = (
      <div
        ref={containerRef}
        className="relative flex-1 min-w-0 min-h-0 overflow-hidden bg-muted/30 touch-none"
      >
        <div
          ref={cursorPreviewRef}
          className="pointer-events-none absolute z-50 rounded-full hidden"
          style={{
            transform: 'translate(-50%, -50%)',
            background: 'transparent',
            transition: 'width 0.1s, height 0.1s',
          }}
        />

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
                  pushUndo(true);
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
                  pushUndo(true);
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

        <svg
          ref={svgRef}
          className="absolute top-0 left-0 pointer-events-none"
          style={canvasTransform}
          width={INTERNAL_RES_WIDTH}
          height={INTERNAL_RES_HEIGHT}
          viewBox={`0 0 ${INTERNAL_RES_WIDTH} ${INTERNAL_RES_HEIGHT}`}
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Render committed strokes */}
          {strokes.map((s) => (
            <path
              key={s.id}
              d={pointsToSvgPath(s.points)}
              stroke={s.tool === 'eraser' ? '#ffffff' : s.color}
              strokeWidth={Math.max(0.5, s.size)}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={s.opacity ?? 1}
            />
          ))}

          {/* In-progress stroke */}
          {currentStroke && (
            <path
              key={currentStroke.id}
              d={pointsToSvgPath(currentStroke.points)}
              stroke={currentStroke.tool === 'eraser' ? '#ffffff' : currentStroke.color}
              strokeWidth={Math.max(0.5, currentStroke.size)}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={currentStroke.opacity ?? 1}
            />
          )}
        </svg>

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
          hasDirtyCanvasRef.current = false;
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
          type="button"
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
          type="button"
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
                  hasDirtyCanvasRef.current = false;
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