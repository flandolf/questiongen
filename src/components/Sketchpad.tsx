/* eslint-disable complexity */
import {
  ChevronLeft,
  Circle,
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

import { ColorPicker } from '@/components/color-picker';
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
  renderStrokesToCanvas,
  strokesToSvgString,
} from '../lib/sketchpad-renderer';
import type {
  BgType,
  PressureCurve,
  Stroke,
  ToolType,
} from '../types/sketchpad';
import {
  applyPressureCurve,
  CANVAS_STORAGE_KEY_PREFIX,
  cloneStrokes,
  DEFAULT_TOOL_SETTINGS,
  drawGraphAxes,
  drawShape,
  getStrokeBoundingBox,
  INTERNAL_RES_HEIGHT,
  INTERNAL_RES_WIDTH,
  KEYBOARD_ZOOM_STEP,
  MAX_PENDING_MOVE_POINTS,
  MAX_UNDO_SNAPSHOTS,
  MAX_ZOOM,
  MIN_ZOOM,
  paintBackground,
  PALM_REJECTION,
  PEN_ONLY_STORAGE_KEY,
  STORAGE_KEY,
} from './sketchpadUtils';

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
  strokes: Stroke[];
};

type SketchpadStoragePayload = {
  version: 2;
  strokeSvg?: string;
  lastModified?: number;
};

const TOOL_KEYS: Record<string, ToolType> = {
  p: 'pen',
  e: 'eraser',
  l: 'line',
  r: 'rect',
  c: 'ellipse',
  t: 'text',
  g: 'graph',
};

const TOOL_ICONS: Record<ToolType, React.ReactNode> = {
  pen: <Pencil className='w-5 h-5' />,
  eraser: <Eraser className='w-5 h-5' />,
  line: <Minus className='w-5 h-5' />,
  rect: <Square className='w-5 h-5' />,
  ellipse: <Circle className='w-5 h-5' />,
  text: <Type className='w-5 h-5' />,
  graph: <LineChart className='w-5 h-5' />,
};

const TOOL_LABELS: Record<ToolType, string> = {
  pen: 'Pen',
  eraser: 'Eraser',
  line: 'Line',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  text: 'Text',
  graph: 'Graph Axes (G)',
};

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
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const overlayRef = useRef<HTMLCanvasElement | null>(null);
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
      },
    );
    const [, forceUpdate] = useState(0);
    const hasExplicitlySaved = useRef(false);
    const recentColorsRef = useRef(recentColors);

    // Vector stroke state (Source of Truth)
    const [strokes, setStrokes] = useState<Stroke[]>([]);
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
      typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent),
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
    const undoActionRef = useRef<() => void>(() => {});
    const redoActionRef = useRef<() => void>(() => {});
    const clearActionRef = useRef<() => void>(() => {});
    const keyboardZoomStepRef = useRef<(direction: 1 | -1) => void>(() => {});
    const resetViewportRef = useRef<() => void>(() => {});
    const updateCursorPreviewRef = useRef<() => void>(() => {});
    const mainCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const overlayCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const bgCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const canvasBoundsRef = useRef<CanvasBounds | null>(null);

    // ─── Persistence helpers ───────────────────────────────────────────────────
    const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );
    const hasDirtyCanvasRef = useRef(false);

    const markCanvasDirty = useCallback(() => {
      hasDirtyCanvasRef.current = true;
      hasExplicitlySaved.current = false;
    }, []);

    const clearHistoryStacks = useCallback(() => {
      historyGenerationRef.current += 1;
      undoStack.current = [];
      redoStack.current = [];
      forceUpdate((n) => n + 1);
    }, []);

    const captureCanvasSnapshot = useCallback((): CanvasSnapshot => {
      return {
        strokes: cloneStrokes(strokesRef.current),
      };
    }, []);

    const applySnapshotToCanvas = useCallback((snapshot: CanvasSnapshot) => {
      const restoredStrokes = cloneStrokes(snapshot.strokes);
      strokesRef.current = restoredStrokes;
      setStrokes(restoredStrokes);
      currentStrokeRef.current = null;
    }, []);

    const queueSnapshotCapture = useCallback(
      (target: 'undo' | 'redo') => {
        const generationAtQueue = historyGenerationRef.current;
        const task = () => {
          const snapshot = captureCanvasSnapshot();
          if (historyGenerationRef.current !== generationAtQueue) {
            return;
          }

          const stack =
            target === 'undo' ? undoStack.current : redoStack.current;
          stack.push(snapshot);
          if (stack.length > MAX_UNDO_SNAPSHOTS) {
            stack.shift();
          }
          forceUpdate((n) => n + 1);
        };

        snapshotQueueRef.current = snapshotQueueRef.current.then(task, task);
      },
      [captureCanvasSnapshot],
    );

    const flushSnapshotQueue = useCallback(async () => {
      await snapshotQueueRef.current;
    }, []);

    const getCanvasStorageKey = useCallback(
      (key?: string): string =>
        key ? `${CANVAS_STORAGE_KEY_PREFIX}-${key}` : '',
      [],
    );

    const bgRef2 = useRef<BgType>(bg);

    const saveCanvasToStorage = useCallback(
      (key?: string) => {
        if (!key) return;
        try {
          const payload: SketchpadStoragePayload = {
            version: 2,
            strokeSvg: strokesToSvgString(
              strokesRef.current,
              INTERNAL_RES_WIDTH,
              INTERNAL_RES_HEIGHT,
              bgRef2.current,
              true,
            ),
            lastModified: Date.now(),
          };
          localStorage.setItem(
            getCanvasStorageKey(key),
            JSON.stringify(payload),
          );
          hasDirtyCanvasRef.current = false;
          window.dispatchEvent(
            new CustomEvent('sketchpad-saved', {
              detail: {
                sessionKey: key,
                hasStrokes: strokesRef.current.length > 0,
              },
            }),
          );
        } catch (err) {
          console.warn('Failed to save canvas to localStorage:', err);
        }
      },
      [getCanvasStorageKey],
    );

    const requestRedraw = useRef<number | null>(null);

    const redraw = useCallback(() => {
      const canvas = canvasRef.current;
      const bgCanvas = bgRef.current;
      const container = containerRef.current;
      const mctx = mainCtxRef.current;
      const bctx = bgCtxRef.current;

      if (!canvas || !bgCanvas || !container || !mctx || !bctx) return;

      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const width = container.clientWidth;
      const height = container.clientHeight;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        for (const c of [canvas, bgCanvas, overlayRef.current]) {
          if (c) {
            c.width = width * dpr;
            c.height = height * dpr;
            c.style.width = `${width}px`;
            c.style.height = `${height}px`;
          }
        }
      }

      paintBackground(
        bctx,
        width * dpr,
        height * dpr,
        bgRef2.current,
        zoomRef.current,
        panRef.current,
        dpr,
      );

      const inProgressStroke = currentStrokeRef.current;
      const strokesToRender =
        inProgressStroke && inProgressStroke.tool === 'pen'
          ? [...strokesRef.current, inProgressStroke]
          : strokesRef.current;

      renderStrokesToCanvas(mctx, strokesToRender, {
        dpr,
        zoom: zoomRef.current,
        pan: panRef.current,
        clear: true,
        width: width * dpr,
        height: height * dpr,
        quality: 'high',
      });
    }, []);

    const scheduleRedraw = useCallback(() => {
      if (requestRedraw.current !== null) return;
      requestRedraw.current = requestAnimationFrame(() => {
        requestRedraw.current = null;
        redraw();
      });
    }, [redraw]);

    const restoreCanvasFromStorage = useCallback(
      (key?: string) => {
        if (!key) return;
        try {
          clearHistoryStacks();
          hasMoved.current = false;
          lastPointReal.current = null;
          hasDirtyCanvasRef.current = false;
          currentStrokeRef.current = null;
          strokesRef.current = [];
          setStrokes([]);

          const storedValue = localStorage.getItem(getCanvasStorageKey(key));
          if (!storedValue) {
            scheduleRedraw();
            return;
          }

          if (storedValue.trim().startsWith('{')) {
            try {
              const payload = JSON.parse(
                storedValue,
              ) as Partial<SketchpadStoragePayload>;
              if (typeof payload.strokeSvg === 'string' && payload.strokeSvg) {
                const restoredStrokes = parseStrokesFromSvgString(
                  payload.strokeSvg,
                );
                strokesRef.current = restoredStrokes;
                setStrokes(restoredStrokes);
              }
            } catch (parseErr) {
              console.warn('Failed to parse saved sketch payload:', parseErr);
            }
          }
          scheduleRedraw();
          window.dispatchEvent(
            new CustomEvent('sketchpad-saved', {
              detail: {
                sessionKey: key,
                hasStrokes: strokesRef.current.length > 0,
              },
            }),
          );
        } catch (err) {
          console.warn('Failed to restore canvas from localStorage:', err);
        }
      },
      [clearHistoryStacks, getCanvasStorageKey, scheduleRedraw],
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
      [saveCanvasToStorage],
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

    const clampZoom = useCallback(
      (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)),
      [],
    );

    const flushViewportState = useCallback(() => {
      viewportRaf.current = null;
      setZoom(zoomRef.current);
      setPan(panRef.current);
      scheduleRedraw();
    }, [scheduleRedraw]);

    const commitViewportState = useCallback(() => {
      setZoom(zoomRef.current);
      setPan(panRef.current);
      scheduleRedraw();
    }, [scheduleRedraw]);

    const queueViewportState = useCallback(() => {
      if (viewportRaf.current !== null) return;
      viewportRaf.current = requestAnimationFrame(flushViewportState);
    }, [flushViewportState]);

    const setViewport = useCallback(
      (
        nextPan: { x: number; y: number },
        nextZoom: number = zoomRef.current,
      ) => {
        zoomRef.current = clampZoom(nextZoom);
        panRef.current = nextPan;
        queueViewportState();
      },
      [clampZoom, queueViewportState],
    );

    const setViewportImmediate = useCallback(
      (
        nextPan: { x: number; y: number },
        nextZoom: number = zoomRef.current,
      ) => {
        zoomRef.current = clampZoom(nextZoom);
        panRef.current = nextPan;
        commitViewportState();
      },
      [clampZoom, commitViewportState],
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
          targetZoom,
        );
      },
      [clampZoom, setViewport],
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
            targetZoom,
          );
          return;
        }

        zoomAroundClientPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
          nextZoom,
        );
      },
      [clampZoom, setViewport, setViewportImmediate, zoomAroundClientPoint],
    );

    const zoomByKeyboardStep = useCallback(
      (direction: 1 | -1) => {
        zoomAroundCenter(
          zoomRef.current + direction * KEYBOARD_ZOOM_STEP,
          true,
        );
      },
      [zoomAroundCenter],
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
        nextZoom,
      );
    }, [setViewportImmediate]);

    const initCanvas = useCallback(
      (fitViewport: boolean = false) => {
        const container = containerRef.current;
        if (!container) return;

        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const width = container.clientWidth;
        const height = container.clientHeight;

        for (const c of [
          canvasRef.current,
          overlayRef.current,
          bgRef.current,
        ]) {
          if (c) {
            c.width = width * dpr;
            c.height = height * dpr;
            c.style.width = `${width}px`;
            c.style.height = `${height}px`;
            const ctx = c.getContext('2d')!;
            if (c === canvasRef.current) mainCtxRef.current = ctx;
            if (c === overlayRef.current) overlayCtxRef.current = ctx;
            if (c === bgRef.current) bgCtxRef.current = ctx;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          }
        }

        if (fitViewport) {
          const fitZoom = Math.min(
            (width - 80) / INTERNAL_RES_WIDTH,
            (height - 80) / INTERNAL_RES_HEIGHT,
          );
          setViewportImmediate(
            {
              x: (width - INTERNAL_RES_WIDTH * fitZoom) / 2,
              y: (height - INTERNAL_RES_HEIGHT * fitZoom) / 2,
            },
            fitZoom,
          );
        }

        scheduleRedraw();
      },
      [setViewportImmediate, scheduleRedraw],
    );

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
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toolSettingsMap));
      } catch (err) {
        console.warn('Failed to save tool settings to localStorage:', err);
      }
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
        }
        // Persist pending changes even when there is no active timeout
        // (for example, during fast route transitions).
        if (
          !hasExplicitlySaved.current &&
          hasDirtyCanvasRef.current &&
          sessionKey
        ) {
          saveCanvasToStorage(sessionKey);
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
        setActiveTool(newTool);
      },
      [activeTool],
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
      [activeTool],
    );

    const setSize = useCallback(
      (size: number) => {
        updateCurrentTool({ size });
      },
      [updateCurrentTool],
    );

    const setSmoothing = useCallback(
      (smoothing: number) => {
        updateCurrentTool({ smoothing });
      },
      [updateCurrentTool],
    );

    const setColor = useCallback(
      (color: string) => {
        updateCurrentTool({ color });
      },
      [updateCurrentTool],
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
      if (!embedded && !open) return;
      // On mount/open we should fit the canvas to the container.
      initCanvas(true);
    }, [embedded, open, initCanvas]);

    useEffect(() => {
      scheduleRedraw();
    }, [bg, scheduleRedraw]);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      // When the container resizes during user-driven layout animations we
      // want to resize internal canvas buffers etc but avoid changing the
      // user's current zoom/pan. Pass `false` to `initCanvas` to skip the
      // zoom-to-fit behavior on resize.
      const handler = () => requestAnimationFrame(() => initCanvas(false));
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
          zoomRef.current * zoomFactor,
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

    function getOverlayCtx() {
      return overlayCtxRef.current;
    }
    const clearOverlay = useCallback(() => {
      const canvas = overlayRef.current;
      const ctx = getOverlayCtx();
      if (!canvas || !ctx) return;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
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

    function applyToolStyle(ctx: CanvasRenderingContext2D, pressure: number) {
      const tool = activeToolRef.current;
      const settings = toolSettingsMapRef.current[tool];
      const adjustedPressure = applyPressureCurve(
        pressure,
        settings.pressureCurve,
      );
      const isPressureSensitive =
        !settings.disablePressure && (tool === 'pen' || tool === 'eraser');

      let size = settings.size;
      if (isPressureSensitive) {
        size = settings.size * adjustedPressure;
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

    function processPendingMove() {
      moveRaf.current = null;
      const overlayCtx = getOverlayCtx();
      if (!overlayCtx) return;
      const moves = lastMove.current;
      if (moves.length === 0) return;

      const tool = activeToolRef.current;
      const isShapeTool =
        tool === 'line' || tool === 'rect' || tool === 'ellipse';

      if (isShapeTool && shapeStart.current) {
        const latest = moves[moves.length - 1];
        const latestPoint = { x: latest.x, y: latest.y };
        clearOverlay();

        overlayCtx.save();
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        overlayCtx.setTransform(
          zoomRef.current * dpr,
          0,
          0,
          zoomRef.current * dpr,
          panRef.current.x * dpr,
          panRef.current.y * dpr,
        );

        applyToolStyle(overlayCtx, latest.pressure);
        drawShape(overlayCtx, tool, shapeStart.current, latestPoint);
        overlayCtx.restore();

        lastMove.current = [];
        return;
      }

      const drawCtx =
        tool === 'eraser' ? (mainCtxRef.current ?? overlayCtx) : overlayCtx;

      const dpr = Math.max(1, window.devicePixelRatio || 1);
      drawCtx.save();
      drawCtx.setTransform(
        zoomRef.current * dpr,
        0,
        0,
        zoomRef.current * dpr,
        panRef.current.x * dpr,
        panRef.current.y * dpr,
      );

      let lastPoint = lastPointReal.current;

      for (const m of moves) {
        const pt = { x: m.x, y: m.y };
        const pressure = m.pressure;

        if (tool === 'text') continue;
        if (!lastPoint) {
          lastPoint = { ...pt, pressure, time: m.time };
          lastPointReal.current = lastPoint;
          continue;
        }

        const dx = pt.x - lastPoint.x;
        const dy = pt.y - lastPoint.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const dt = Math.max(1, m.time - lastPoint.time);
        if (tool === 'eraser') {
          const velocity = dist / dt;
          velocityRef.current = velocityRef.current * 0.8 + velocity * 0.2;

          const segmentPressure = (lastPoint.pressure + pressure) / 2;
          applyToolStyle(drawCtx, segmentPressure);

          drawCtx.beginPath();
          drawCtx.moveTo(lastPoint.x, lastPoint.y);
          drawCtx.lineTo(pt.x, pt.y);
          drawCtx.stroke();
        }

        lastPoint = { x: pt.x, y: pt.y, pressure, time: m.time };
        lastPointReal.current = lastPoint;
      }
      drawCtx.restore();

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

        if (tool === 'pen') scheduleRedraw();
      }

      lastMove.current = [];
    }

    const pushUndo = useCallback(
      (force = false) => {
        markCanvasDirty();
        const now = performance.now();
        if (!force && now - lastUndoPushTime.current < 400) return;
        lastUndoPushTime.current = now;

        if (redoStack.current.length) {
          redoStack.current = [];
        }

        queueSnapshotCapture('undo');
      },
      [markCanvasDirty, queueSnapshotCapture],
    );

    const runUndo = useCallback(async () => {
      await flushSnapshotQueue();
      if (!undoStack.current.length) return;

      try {
        const currentSnapshot = captureCanvasSnapshot();
        redoStack.current.push(currentSnapshot);
        if (redoStack.current.length > MAX_UNDO_SNAPSHOTS) {
          redoStack.current.shift();
        }

        const previousSnapshot = undoStack.current.pop();
        if (!previousSnapshot) return;
        applySnapshotToCanvas(previousSnapshot);
      } catch (err) {
        console.warn('Failed to run undo:', err);
      }

      forceUpdate((n) => n + 1);
    }, [applySnapshotToCanvas, captureCanvasSnapshot, flushSnapshotQueue]);

    const runRedo = useCallback(async () => {
      await flushSnapshotQueue();
      if (!redoStack.current.length) return;

      try {
        const currentSnapshot = captureCanvasSnapshot();
        undoStack.current.push(currentSnapshot);
        if (undoStack.current.length > MAX_UNDO_SNAPSHOTS) {
          undoStack.current.shift();
        }

        const nextSnapshot = redoStack.current.pop();
        if (!nextSnapshot) return;
        applySnapshotToCanvas(nextSnapshot);
      } catch (err) {
        console.warn('Failed to run redo:', err);
      }

      forceUpdate((n) => n + 1);
    }, [applySnapshotToCanvas, captureCanvasSnapshot, flushSnapshotQueue]);

    const undo = useCallback(() => {
      void runUndo().then(() => scheduleRedraw());
    }, [runUndo, scheduleRedraw]);

    const redo = useCallback(() => {
      void runRedo().then(() => scheduleRedraw());
    }, [runRedo, scheduleRedraw]);

    const clearCanvas = useCallback(() => {
      pushUndo(true);
      clearOverlay();
      lastMove.current = [];
      lastPointReal.current = null;
      shapeStart.current = null;
      activeDrawingPointerId.current = null;
      strokesRef.current = [];
      setStrokes([]);
      currentStrokeRef.current = null;
      setIsDrawing(false);
      isDrawingRef.current = false;
      hasMoved.current = false;
      scheduleRedraw();
      forceUpdate((n) => n + 1);
    }, [clearOverlay, pushUndo, scheduleRedraw]);

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

      // Convert client coordinates to container-local coordinates
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;

      // Map container coordinates to logical world coordinates (accounting for zoom and pan)
      return {
        x: (localX - panRef.current.x) / zoomRef.current,
        y: (localY - panRef.current.y) / zoomRef.current,
      };
    }

    function hasActivePenPointer() {
      return Array.from(activePointers.current.values()).some(
        (pointer) => pointer.type === 'pen',
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
      time: number,
    ) {
      pushUndo();
      if (!isDrawingRef.current) {
        setIsDrawing(true);
        isDrawingRef.current = true;
      }
      lastPointReal.current = { ...pt, pressure, time };
      velocityRef.current = 0;
      activeDrawingPointerId.current = pointerId;
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
      } catch {
        // ignore
      }

      const stroke = currentStrokeRef.current;
      const tool = activeToolRef.current;
      if (stroke && tool === 'pen') {
        scheduleRedraw();
        return;
      }

      ctx.save();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      ctx.setTransform(
        zoomRef.current * dpr,
        0,
        0,
        zoomRef.current * dpr,
        panRef.current.x * dpr,
        panRef.current.y * dpr,
      );
      ctx.beginPath();
      applyToolStyle(ctx, pressure);
      ctx.moveTo(pt.x, pt.y);
      ctx.lineTo(pt.x, pt.y + 0.1);
      ctx.stroke();
      ctx.restore();
    }

    function handlePointerDown(e: PointerEvent) {
      const canvas = canvasRef.current;
      const overlayCtx = getOverlayCtx();
      if (!canvas || !overlayCtx) return;

      const target = e.target as HTMLElement;
      const container = containerRef.current;
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
      const mainCtx = mainCtxRef.current;

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

      canvasBoundsRef.current = readCanvasBounds();
      const pt = getCanvasPoint(e, canvasBoundsRef.current);

      if (e.pointerType === 'touch') {
        const isPalm = e.pressure > 0.95 || e.width > 30 || e.height > 30;
        if (isPalm) return;
      }

      if (currentTool === 'text') {
        canvasBoundsRef.current = null;
        setTextInput({ id: Date.now(), x: pt.x, y: pt.y, value: '' });
        return;
      }

      if (currentTool === 'graph') {
        pushUndo(true);
        const settings = toolSettingsMapRef.current['graph'];
        const newStroke: Stroke = {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
          tool: 'graph',
          color: settings.color,
          size: settings.size,
          smoothing: 0,
          pressureCurve: 'linear',
          points: [{ x: pt.x, y: pt.y, pressure: 1, time: Date.now() }],
        };
        strokesRef.current = [...strokesRef.current, newStroke];
        setStrokes(strokesRef.current.slice());
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

      const disablePres =
        toolSettingsMapRef.current[currentTool].disablePressure;
      const pressure =
        e.pointerType === 'mouse' || disablePres
          ? 1
          : e.pressure > 0
            ? e.pressure
            : 1;

      if (['line', 'rect', 'ellipse'].includes(currentTool)) {
        pushUndo(true);
        shapeStart.current = pt;
        setIsDrawing(true);
        isDrawingRef.current = true;
        activeDrawingPointerId.current = e.pointerId;
        pointerMeta.strokeStarted = true;
        const tool = activeToolRef.current;
        const settings = toolSettingsMapRef.current[tool];
        const newStroke: Stroke = {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
          tool,
          color: settings.color,
          size: settings.size,
          smoothing: settings.smoothing,
          pressureCurve: settings.pressureCurve,
          points: [{ x: pt.x, y: pt.y, pressure, time: Date.now() }],
          opacity: settings.opacity,
        };
        currentStrokeRef.current = newStroke;
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
      const strokeCtx =
        currentTool === 'eraser' && mainCtx ? mainCtx : overlayCtx;
      startStroke(e.pointerId, pt, strokeCtx, pressure, getEventTimeStamp(e));
      pointerMeta.strokeStarted = true;
    }

    function handlePointerMove(e: PointerEvent) {
      const canvas = canvasRef.current;
      if (!canvas) return;
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
        panRef.current = {
          x: panStart.current.px + (e.clientX - panStart.current.mx),
          y: panStart.current.py + (e.clientY - panStart.current.my),
        };
        if (viewportRaf.current === null) {
          viewportRaf.current = requestAnimationFrame(flushViewportState);
        }
        return;
      }

      const pointerMeta = activePointers.current.get(e.pointerId);
      if (!pointerMeta || pointerMeta.rejected) return;

      if (!isDrawingRef.current && e.target !== canvas) return;

      pointerMeta.tiltX = e.tiltX;
      pointerMeta.tiltY = e.tiltY;

      if (currentTool === 'text') return;

      if (currentTool === 'graph') {
        graphPreviewPointRef.current = getCanvasPoint(
          e,
          canvasBoundsRef.current,
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
            const dpr = Math.max(1, window.devicePixelRatio || 1);
            octx.setTransform(
              zoomRef.current * dpr,
              0,
              0,
              zoomRef.current * dpr,
              panRef.current.x * dpr,
              panRef.current.y * dpr,
            );
            octx.globalAlpha = 0.35;
            drawGraphAxes(
              octx,
              point.x,
              point.y,
              settings.color,
              settings.size,
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
        const disablePres =
          toolSettingsMapRef.current[currentTool].disablePressure;
        const pressureForStart =
          e.pointerType === 'mouse' || disablePres
            ? 1
            : e.pressure > 0
              ? e.pressure
              : 1;
        const octx = getOverlayCtx();
        if (octx) {
          startStroke(
            e.pointerId,
            pt,
            octx,
            pressureForStart,
            getEventTimeStamp(e),
          );
          pointerMeta.strokeStarted = true;
        }
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
        const disablePres =
          toolSettingsMapRef.current[currentTool].disablePressure;
        const pressure =
          ce.pointerType === 'mouse' || disablePres
            ? 1
            : ce.pressure > 0
              ? ce.pressure
              : 1;
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
        // ignore
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
      const upTime = getEventTimeStamp(e);

      if (currentStrokeRef.current) {
        const stroke = currentStrokeRef.current;
        const disablePres =
          toolSettingsMapRef.current[stroke.tool].disablePressure;
        if (
          ['line', 'rect', 'ellipse'].includes(activeToolRef.current) &&
          shapeStart.current
        ) {
          stroke.points = [
            { ...shapeStart.current, pressure: 1, time: Date.now() },
            { ...pt, pressure: 1, time: Date.now() },
          ];
        }

        if (
          (stroke.tool === 'pen' || stroke.tool === 'eraser') &&
          stroke.points.length > 0
        ) {
          const lastPoint = stroke.points[stroke.points.length - 1];
          const dx = pt.x - lastPoint.x;
          const dy = pt.y - lastPoint.y;
          const moved = dx * dx + dy * dy > 0.01;
          if (moved) {
            // Replace releasePressure with this updated logic:
            const releasePressure =
              e.pointerType === 'mouse' || disablePres
                ? 1
                : e.pressure > 0
                  ? e.pressure
                  : Math.max(0.05, lastPoint.pressure);

            stroke.points.push({
              x: pt.x,
              y: pt.y,
              pressure: releasePressure,
              time: upTime,
            });
          }
        }

        strokesRef.current = [...strokesRef.current, stroke];
        setStrokes(strokesRef.current.slice());
        currentStrokeRef.current = null;
        clearOverlay();
        scheduleRedraw();
      }

      setIsDrawing(false);
      isDrawingRef.current = false;
      lastPointReal.current = null;
      lastMove.current = [];
      activeDrawingPointerId.current = null;
      shapeStart.current = null;
      canvasBoundsRef.current = null;
    }

    useEffect(() => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const handlePointerEnter = (e: PointerEvent) => {
        if (
          e.target === canvas &&
          (e.pointerType === 'pen' || e.pointerType === 'mouse')
        ) {
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
        if (e.target !== canvas) return;
        isHoveringRef.current = false;
        setIsHovering(false);
        updateCursorPreview();
        if (graphPreviewRaf.current) {
          cancelAnimationFrame(graphPreviewRaf.current);
          graphPreviewRaf.current = null;
        }
        graphPreviewPointRef.current = null;
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

      container.addEventListener('pointerdown', handlePointerDown);
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
      scheduleRedraw();
    }, [strokes, scheduleRedraw]);

    useEffect(() => {
      const canvas = canvasRef.current;
      const overlay = overlayRef.current;
      const bgCanvas = bgRef.current;
      if (!canvas || !overlay || !bgCanvas) return;
      for (const c of [canvas, overlay, bgCanvas]) {
        c.style.touchAction = 'none';
        c.style.willChange = 'transform';
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
      const PAD_LOGICAL = 40;
      const exportDpr = 2; // Export at high resolution

      const bounds = getStrokeBoundingBox(strokesRef.current, PAD_LOGICAL) || {
        x: 0,
        y: 0,
        width: INTERNAL_RES_WIDTH,
        height: INTERNAL_RES_HEIGHT,
      };

      const exportW = bounds.width * exportDpr;
      const exportH = bounds.height * exportDpr;

      return new Promise((resolve, reject) => {
        const tmp = document.createElement('canvas');
        tmp.width = exportW;
        tmp.height = exportH;
        const tctx = tmp.getContext('2d');
        if (!tctx) return reject(new Error('Unable to export'));

        const strokeLayer = document.createElement('canvas');
        strokeLayer.width = exportW;
        strokeLayer.height = exportH;
        const strokeCtx = strokeLayer.getContext('2d');
        if (!strokeCtx) return reject(new Error('Unable to export'));

        paintBackground(
          tctx,
          exportW,
          exportH,
          bgRef2.current,
          1,
          { x: -bounds.x, y: -bounds.y },
          exportDpr,
        );

        // Render strokes on a transparent layer so eraser only removes ink,
        // then composite that layer over the painted background.
        renderStrokesToCanvas(strokeCtx, strokesRef.current, {
          dpr: exportDpr,
          zoom: 1,
          pan: { x: -bounds.x, y: -bounds.y },
          clear: true,
          width: exportW,
          height: exportH,
          quality: 'high',
        });

        tctx.drawImage(strokeLayer, 0, 0);

        tmp.toBlob(
          (blob: Blob | null) => {
            if (!blob) return reject(new Error('Unable to export'));
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('Read error'));
            reader.readAsDataURL(blob);
          },
          'image/webp',
          0.92,
        );
      });
    }, []);

    // Force save when TutorPanel requests it
    useEffect(() => {
      const handleForceSave = () => {
        if (sessionKey && hasDirtyCanvasRef.current) {
          if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
          }
          saveCanvasToStorage(sessionKey);
        }

        // Generate a direct link for TutorPanel
        void (async () => {
          try {
            // Only generate dataUrl if we actually have strokes
            if (strokesRef.current.length === 0) {
              window.dispatchEvent(
                new CustomEvent('tutor-sketch-response', {
                  detail: { dataUrl: undefined },
                }),
              );
              return;
            }
            const dataUrl = await saveAsDataUrl();
            window.dispatchEvent(
              new CustomEvent('tutor-sketch-response', {
                detail: { dataUrl },
              }),
            );
          } catch (e) {
            console.error('Failed to generate direct sketchpad data url:', e);
            window.dispatchEvent(
              new CustomEvent('tutor-sketch-response', {
                detail: { dataUrl: undefined },
              }),
            );
          }
        })();
      };

      window.addEventListener('tutor-request-sketch-save', handleForceSave);
      return () => {
        window.removeEventListener(
          'tutor-request-sketch-save',
          handleForceSave,
        );
      };
    }, [sessionKey, saveCanvasToStorage, saveAsDataUrl]);

    const isGrabMode = spaceDown.current || middleDown.current;
    const cursorStyle = isGrabMode
      ? isPanning
        ? 'grabbing'
        : 'grab'
      : activeTool === 'eraser'
        ? 'cell'
        : activeTool === 'text'
          ? 'text'
          : activeTool === 'graph'
            ? 'crosshair'
            : 'none';

    const canvasArea = (
      <div
        ref={containerRef}
        className='relative flex-1 min-w-0 min-h-0 overflow-hidden bg-muted/30 touch-none'
      >
        <div
          ref={cursorPreviewRef}
          className='pointer-events-none absolute z-50 rounded-full hidden'
          style={{
            transform: 'translate(-50%, -50%)',
            background: 'transparent',
            transition: 'width 0.1s, height 0.1s',
          }}
        />

        {textInput && (
          <input
            ref={textInputRef}
            type='text'
            autoFocus
            value={textInput.value}
            onChange={(e) =>
              setTextInput({ ...textInput, value: e.target.value })
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' && textInput.value) {
                const newStroke: Stroke = {
                  id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
                  tool: 'text',
                  color: currentColor,
                  size: currentSize,
                  smoothing: 0,
                  pressureCurve: 'linear',
                  points: [
                    {
                      x: textInput.x,
                      y: textInput.y,
                      pressure: 1,
                      time: Date.now(),
                    },
                  ],
                  text: textInput.value,
                };
                pushUndo(true);
                strokesRef.current = [...strokesRef.current, newStroke];
                setStrokes(strokesRef.current.slice());
                scheduleRedraw();
                setTextInput(null);
              } else if (e.key === 'Escape') {
                setTextInput(null);
              }
            }}
            className='absolute z-50 px-2 py-1 text-sm border-2 border-primary rounded-md bg-background/90 shadow-lg outline-none'
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
          className='absolute top-0 left-0 pointer-events-none'
        />

        <canvas ref={canvasRef} className='absolute top-0 left-0' />

        <canvas
          ref={overlayRef}
          className='absolute top-0 left-0 pointer-events-none'
          style={{ cursor: cursorStyle }}
        />

        {/* Subtle Paper Texture Overlay */}
        <div
          className='absolute top-0 left-0 pointer-events-none opacity-[0.03]'
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            width: INTERNAL_RES_WIDTH,
            height: INTERNAL_RES_HEIGHT,
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>
    );

    const settingsFooter = (
      <Card className='flex flex-row items-center gap-1 bg-card/80 backdrop-blur-md border border-border/50 rounded-2xl p-1.5 shadow-xl transition-all hover:bg-card pointer-events-auto'>
        <Select onValueChange={(val) => setBg(val as BgType)} value={bg}>
          <SelectTrigger className='h-9 w-32 border-none rounded-xl transition-all'>
            <SelectValue placeholder='Background' />
          </SelectTrigger>
          <SelectContent className='rounded-xl'>
            <SelectGroup>
              <SelectItem value='lined'>Lined Paper</SelectItem>
              <SelectItem value='white-grid'>Grid Paper</SelectItem>
              <SelectItem value='dot-grid'>Dotted Paper</SelectItem>
              <SelectItem value='black-grid'>Dark Canvas</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>

        <Button
          variant={penOnlyMode ? 'default' : 'secondary'}
          size='sm'
          onClick={() => setPenOnlyMode(!penOnlyMode)}
          className='rounded-xl h-9'
        >
          {penOnlyMode ? 'Stylus Only' : 'Touch + Stylus'}
        </Button>

        <Separator orientation='vertical' className='h-6 mx-1' />

        <Label className='text-[10px] uppercase tracking-wider font-bold text-muted-foreground'>
          Size
        </Label>

        <Slider
          min={1}
          max={100}
          step={1}
          value={[currentSize]}
          onValueChange={([val]) => setSize(val)}
          className='w-20 ml-1'
        />

        <Separator orientation='vertical' className='h-6 mx-1' />

        <div className='flex items-center gap-3 px-2'>
          <Label className='text-[10px] uppercase tracking-wider font-bold text-muted-foreground'>
            Smooth
          </Label>
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={[currentSmoothing]}
            onValueChange={([val]) => setSmoothing(val)}
            className='w-24'
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
        },
      }),
      [onSave, saveAsDataUrl],
    );

    const topNavigationBar = (
      <TooltipProvider>
        <Card className='absolute top-4 left-1/2 -translate-x-1/2 flex flex-row items-center gap-1 bg-card/80 backdrop-blur-md border border-border/50 rounded-2xl p-1.5 shadow-xl z-50 transition-all hover:bg-card'>
          <div className='flex items-center gap-0.5 px-1 pr-2'>
            {!embedded && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant='ghost'
                    size='icon'
                    onClick={onClose}
                    className='rounded-xl'
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
                  variant='ghost'
                  size='icon'
                  onClick={undo}
                  disabled={undoStack.current.length === 0}
                  className='rounded-xl disabled:opacity-20'
                >
                  <Undo2 size={20} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Undo</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant='ghost'
                  size='icon'
                  onClick={redo}
                  disabled={redoStack.current.length === 0}
                  className='rounded-xl disabled:opacity-20'
                >
                  <Redo2 size={20} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Redo</TooltipContent>
            </Tooltip>
          </div>

          <Separator orientation='vertical' className='h-8 mx-1' />

          <div className='flex items-center gap-1 px-1'>
            {(Object.keys(TOOL_ICONS) as ToolType[]).map((tool) => {
              const isActive = activeTool === tool;
              return (
                <Tooltip key={tool}>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isActive ? 'default' : 'ghost'}
                      size='icon'
                      onClick={() => switchTool(tool)}
                      className={cn(
                        'rounded-xl transition-all',
                        isActive && 'shadow-lg shadow-primary/20 scale-105',
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

          <Separator orientation='vertical' className='h-8 mx-1' />

          <div className='flex items-center gap-3 px-2'>
            <div className='flex items-center gap-1'>
              {[0.5, 1, 2].map((m) => {
                const baseSize = activeTool === 'eraser' ? 40 : 4;
                const size = baseSize * m;
                const isActive = currentSize === size;
                return (
                  <Button
                    key={size}
                    variant={isActive ? 'default' : 'ghost'}
                    size='icon-sm'
                    onClick={() => setSize(size)}
                    className='size-6 rounded-lg'
                  >
                    <div
                      className={cn(
                        'rounded-full',
                        isActive ? 'bg-primary-foreground' : 'bg-foreground/50',
                      )}
                      style={{ width: 6 * m, height: 6 * m }}
                    />
                  </Button>
                );
              })}
            </div>
          </div>

          <Separator orientation='vertical' className='h-8 mx-1' />

          <div className='flex items-center gap-3 px-2'>
            <ColorPicker
              value={currentColor}
              onChange={(nextColor) => {
                setColor(nextColor);
                addRecentColor(nextColor);
              }}
              swatches={Array.from(new Set([currentColor, ...recentColors]))}
              label='Sketch color'
              triggerClassName='h-9 w-44 rounded-xl'
              contentClassName='w-80'
            />
            <Separator orientation='vertical' className='h-8 mx-1' />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant='ghost'
                  size='icon'
                  onClick={clearCanvas}
                  className='p-2 text-destructive hover:bg-destructive/10 hover:text-destructive rounded-xl'
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
      <Card className='absolute bottom-6 right-6 flex flex-row items-center gap-1 bg-card/80 backdrop-blur-md border border-border/50 rounded-2xl p-1.5 shadow-xl z-50'>
        <Button
          variant='ghost'
          size='icon-sm'
          type='button'
          onClick={() => zoomByKeyboardStep(-1)}
          className='rounded-xl'
        >
          <ZoomOut size={12} />
        </Button>
        <Badge
          variant='secondary'
          className='bg-muted px-2 py-0.5 text-[10px] font-bold tabular-nums rounded-lg'
        >
          {Math.round(zoom * 100)}%
        </Badge>
        <Button
          variant='ghost'
          size='icon-sm'
          type='button'
          onClick={() => zoomByKeyboardStep(1)}
          className='rounded-xl'
        >
          <ZoomIn size={12} />
        </Button>
      </Card>
    );

    if (!embedded && !open) return null;

    if (embedded) {
      return (
        <div className='flex flex-col flex-1 min-h-[70vh] bg-muted/20 relative overflow-hidden font-sans border border-border rounded-2xl shadow-inner'>
          {topNavigationBar}
          {canvasArea}
          {zoomIndicator}
          <div className='absolute bottom-6 left-6 z-50'>{settingsFooter}</div>
        </div>
      );
    }
    return (
      <div className='fixed inset-0 z-50 flex items-center justify-center font-sans overflow-hidden'>
        <div
          className='absolute inset-0 bg-background/60 backdrop-blur-xl'
          onClick={
            void (async () => {
              if (!hasExplicitlySaved.current) {
                try {
                  const dataUrl = await saveAsDataUrl();
                  onSave(dataUrl);
                  hasExplicitlySaved.current = true;
                  hasDirtyCanvasRef.current = false;
                } catch (err) {
                  console.error('Save failed', err);
                }
              }
              onClose?.();
            })
          }
        />
        <div className='relative w-full h-full flex flex-col items-center justify-center pointer-events-none'>
          <div className='pointer-events-auto h-full w-full relative flex flex-col'>
            {topNavigationBar}
            {canvasArea}
            {zoomIndicator}
            <div className='absolute bottom-6 left-6 z-50 pointer-events-auto'>
              {settingsFooter}
            </div>
          </div>
        </div>
      </div>
    );
  },
);

Sketchpad.displayName = 'Sketchpad';

export default Sketchpad;
