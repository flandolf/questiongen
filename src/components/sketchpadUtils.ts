import type {
  BgType,
  Point,
  PressureCurve,
  Stroke,
  ToolType,
} from '../types/sketchpad';

export const A4_ASPECT = 210 / 297;
export const INTERNAL_RES_WIDTH = 1240; // Logical canvas width in CSS pixels (≈150 DPI for A4)
export const INTERNAL_RES_HEIGHT = Math.round(INTERNAL_RES_WIDTH / A4_ASPECT);

export type ToolSettings = {
  size: number;
  opacity: number;
  smoothing: number;
  pressureCurve: PressureCurve;
  disablePressure: boolean;
  color: string;
};
export type ToolSettingsMap = Record<ToolType, ToolSettings>;

export const DEFAULT_TOOL_SETTINGS: ToolSettingsMap = {
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

export const STORAGE_KEY = 'sketchpad-tool-settings';
export const PEN_ONLY_STORAGE_KEY = 'sketchpad-pen-only-mode';
export const CANVAS_STORAGE_KEY_PREFIX = 'sketchpad-canvas';
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 10;
export const KEYBOARD_ZOOM_STEP = 0.25;
export const MAX_UNDO_SNAPSHOTS = 40;
export const MAX_PENDING_MOVE_POINTS = 240;

export const PALETTE = [
  '#2D3436', // Obsidian
  '#D63031', // Crimson
  '#0984E3', // Royal Blue
  '#00B894', // Mint
  '#F1C40F', // Sunflower
  '#6C5CE7', // Lavender
];

export const PALM_REJECTION = {
  WIDTH_THRESHOLD: 25,
  HEIGHT_THRESHOLD: 25,
  MIN_PRESSURE: 0.02,
  MIN_TOUCH_DURATION: 30, // ms
  EDGE_MARGIN: 10,
};

export function applyPressureCurve(
  pressure: number,
  curve: PressureCurve
): number {
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

export function hexToRgba(
  hex: string,
  alpha: number
): [number, number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b, Math.round(alpha * 255)];
}

export function floodFill(
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

export function getCropBoundingBox(
  canvas: HTMLCanvasElement,
  padding: number = 20
) {
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

export function getStrokeBoundingBox(strokes: Stroke[], padding: number = 20) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let found = false;

  for (const stroke of strokes) {
    if (stroke.tool === 'graph') {
      // Graph axes have fixed dimensions: halfW = 320, halfH = 240
      const p = stroke.points[0];
      if (p) {
        found = true;
        const halfW = 320;
        const halfH = 240;
        minX = Math.min(minX, p.x - halfW);
        minY = Math.min(minY, p.y - halfH);
        maxX = Math.max(maxX, p.x + halfW);
        maxY = Math.max(maxY, p.y + halfH);
      }
    } else if (stroke.tool === 'text' && stroke.text) {
      // Estimate text bounds based on font size and text length
      // Font size is stroke.size (as used in renderer)
      const p = stroke.points[0];
      if (p) {
        found = true;
        const fontSize = stroke.size;
        const textWidth = stroke.text.length * fontSize * 0.6; // Approximate width
        const textHeight = fontSize * 1.2; // Approximate height with descenders
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y - fontSize); // Text is drawn from baseline
        maxX = Math.max(maxX, p.x + textWidth);
        maxY = Math.max(maxY, p.y + textHeight * 0.3);
      }
    } else {
      const halfSize = Math.max(1, stroke.size) / 2;
      for (const point of stroke.points) {
        found = true;
        minX = Math.min(minX, point.x - halfSize);
        minY = Math.min(minY, point.y - halfSize);
        maxX = Math.max(maxX, point.x + halfSize);
        maxY = Math.max(maxY, point.y + halfSize);
      }
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

export function mergeBoundingBoxes(
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

export function cloneStrokes(strokeList: Stroke[]): Stroke[] {
  return strokeList.map((stroke) => ({
    ...stroke,
    points: stroke.points.map((point) => ({ ...point })),
  }));
}

/**
 * Simplifies a set of points using the Ramer-Douglas-Peucker algorithm.
 */
export function simplifyPoints(
  points: Point[],
  tolerance: number = 0.5
): Point[] {
  if (points.length <= 2) return points;

  const sqTolerance = tolerance * tolerance;

  function getSqSegDist(p: Point, p1: Point, p2: Point) {
    let x = p1.x,
      y = p1.y,
      dx = p2.x - x,
      dy = p2.y - y;

    if (dx !== 0 || dy !== 0) {
      const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);

      if (t > 1) {
        x = p2.x;
        y = p2.y;
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }

    dx = p.x - x;
    dy = p.y - y;

    return dx * dx + dy * dy;
  }

  function simplifyDPStep(
    points: Point[],
    first: number,
    last: number,
    sqTolerance: number,
    simplified: Point[]
  ) {
    let maxSqDist = sqTolerance,
      index = -1;

    for (let i = first + 1; i < last; i++) {
      const sqDist = getSqSegDist(points[i], points[first], points[last]);

      if (sqDist > maxSqDist) {
        index = i;
        maxSqDist = sqDist;
      }
    }

    if (index !== -1) {
      if (index - first > 1)
        simplifyDPStep(points, first, index, sqTolerance, simplified);
      simplified.push(points[index]);
      if (last - index > 1)
        simplifyDPStep(points, index, last, sqTolerance, simplified);
    }
  }

  const simplified = [points[0]];
  simplifyDPStep(points, 0, points.length - 1, sqTolerance, simplified);
  simplified.push(points[points.length - 1]);

  return simplified;
}

/**
 * Generates points for a Catmull-Rom spline.
 */
export function getCatmullRomPoints(
  points: Point[],
  segments: number = 4
): Point[] {
  if (points.length < 3) return points;

  const result: Point[] = [];
  result.push(points[0]);

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 >= points.length ? i + 1 : i + 2];

    for (let j = 1; j <= segments; j++) {
      const t = j / segments;
      const t2 = t * t;
      const t3 = t2 * t;

      const x =
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);

      const y =
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);

      const pressure = p1.pressure + (p2.pressure - p1.pressure) * t;
      const time = p1.time + (p2.time - p1.time) * t;

      result.push({ x, y, pressure, time });
    }
  }

  return result;
}

export function drawShape(
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

export function drawGraphAxes(
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

/* eslint-disable complexity */
export function paintBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  bg: BgType,
  zoom: number = 1,
  pan: { x: number; y: number } = { x: 0, y: 0 },
  dpr: number = 1
) {
  const isDark = bg === 'black-grid';
  const darkBg = 'oklch(27.4% 0.006 286.033)';
  const lightBg = 'oklch(98.5% 0 0)';
  const darkStroke = 'oklch(20% 0.1 0)';
  const lightStroke = 'oklch(87% 0 0)';

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = isDark ? 'oklch(20% 0 0)' : 'oklch(95% 0 0)';
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  ctx.save();
  ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, pan.x * dpr, pan.y * dpr);

  ctx.shadowColor = 'rgba(0,0,0,0.1)';
  ctx.shadowBlur = 20 / zoom;
  ctx.shadowOffsetY = 10 / zoom;

  ctx.fillStyle = isDark ? darkBg : lightBg;
  ctx.fillRect(0, 0, INTERNAL_RES_WIDTH, INTERNAL_RES_HEIGHT);

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.lineWidth = 1 / zoom;

  if (bg === 'lined') {
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    const lineSpacing = 30;
    ctx.beginPath();
    for (let y = lineSpacing; y < INTERNAL_RES_HEIGHT; y += lineSpacing) {
      ctx.moveTo(0, y);
      ctx.lineTo(INTERNAL_RES_WIDTH, y);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(239, 68, 68, 0.2)';
    ctx.lineWidth = 2 / zoom;
    ctx.beginPath();
    ctx.moveTo(100, 0);
    ctx.lineTo(100, INTERNAL_RES_HEIGHT);
    ctx.stroke();
  } else if (bg === 'dot-grid') {
    ctx.fillStyle = isDark ? lightStroke : darkStroke;
    const dotSpacing = 20;
    const dotRadius = 1 / zoom;
    for (let x = dotSpacing; x < INTERNAL_RES_WIDTH; x += dotSpacing) {
      for (let y = dotSpacing; y < INTERNAL_RES_HEIGHT; y += dotSpacing) {
        ctx.beginPath();
        ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    ctx.beginPath();
    for (let x = 0; x <= INTERNAL_RES_WIDTH; x += 40) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, INTERNAL_RES_HEIGHT);
    }
    for (let y = 0; y <= INTERNAL_RES_HEIGHT; y += 40) {
      ctx.moveTo(0, y);
      ctx.lineTo(INTERNAL_RES_WIDTH, y);
    }
    ctx.stroke();

    ctx.lineWidth = 0.5 / zoom;
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)';
    ctx.beginPath();
    for (let x = 20; x < INTERNAL_RES_WIDTH; x += 40) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, INTERNAL_RES_HEIGHT);
    }
    for (let y = 20; y < INTERNAL_RES_HEIGHT; y += 40) {
      ctx.moveTo(0, y);
      ctx.lineTo(INTERNAL_RES_WIDTH, y);
    }
    ctx.stroke();
  }

  ctx.restore();
}
