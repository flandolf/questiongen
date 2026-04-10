import {
  applyPressureCurve,
  getCatmullRomPoints,
  simplifyPoints,
} from '@/components/sketchpadUtils';

import type { BgType, Point, Stroke } from '../types/sketchpad';

// Cache for smoothed points to avoid mutating Stroke objects
const smoothedPointsCache = new Map<
  string,
  { pointsLength: number; points: Point[] }
>();

export function pointsToSvgPath(points: Point[]): string {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const midX = (prev.x + cur.x) / 2;
    const midY = (prev.y + cur.y) / 2;
    d += ` Q ${prev.x} ${prev.y} ${midX} ${midY}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

export function strokesToSvgString(
  strokes: Stroke[],
  width: number,
  height: number,
  bg?: BgType,
  includeMetadata: boolean = false
): string {
  const bgFill = bg === 'black-grid' ? '#ffffff' : 'transparent';
  const bgRect = `<rect width="100%" height="100%" fill="${bgFill}"/>`;

  let content = '';
  let maskDefs = '';
  let maskIndex = 0;

  for (const s of strokes || []) {
    const d = pointsToSvgPath(s.points || []);
    const metadata = includeMetadata
      ? ` data-sketchpad-stroke="${encodeURIComponent(JSON.stringify(s))}"`
      : '';

    if (s.tool === 'eraser') {
      const strokeWidth = Math.max(0.5, s.size || 1);

      // When an eraser is encountered, we create a mask to hide parts of previous content
      if (content) {
        maskIndex++;
        const maskId = `eraser-mask-${maskIndex}`;
        // In SVG masks, White = Visible, Black = Transparent
        maskDefs += `  <mask id="${maskId}">\n    <rect x="0" y="0" width="100%" height="100%" fill="white" />\n    <path d="${d}" fill="none" stroke="black" stroke-linecap="round" stroke-linejoin="round" stroke-width="${strokeWidth}" />\n  </mask>\n`;
        content = `<g mask="url(#${maskId})">\n${content}</g>\n`;
      }

      // Keep hidden metadata for the eraser so it can be re-parsed later
      if (includeMetadata) {
        content += `<path${metadata} d="${d}" fill="none" stroke="none" visibility="hidden" />\n`;
      }
    } else {
      const strokeWidth = Math.max(0.5, s.size || 1);
      const opacity = s.opacity ?? 1;
      content += `<path${metadata} d="${d}" fill="none" stroke="${s.color}" stroke-linecap="round" stroke-linejoin="round" stroke-width="${strokeWidth}" opacity="${opacity}" />\n`;
    }
  }

  const defsStr = maskDefs ? `<defs>\n${maskDefs}</defs>\n` : '';

  return `<?xml version="1.0" encoding="utf-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${defsStr}${bgRect}\n${content}</svg>`;
}

function isPressureCurve(value: unknown): value is Stroke['pressureCurve'] {
  return (
    value === 'linear' ||
    value === 'exponential' ||
    value === 'smooth' ||
    value === 'heavy-ink'
  );
}

function isToolType(value: unknown): value is Stroke['tool'] {
  return (
    value === 'pen' ||
    value === 'eraser' ||
    value === 'line' ||
    value === 'rect' ||
    value === 'ellipse' ||
    value === 'text' ||
    value === 'graph'
  );
}

function normalizePoint(value: unknown): Point | null {
  if (!value || typeof value !== 'object') return null;
  const point = value as Partial<Point>;
  if (
    typeof point.x !== 'number' ||
    typeof point.y !== 'number' ||
    typeof point.pressure !== 'number' ||
    typeof point.time !== 'number'
  ) {
    return null;
  }

  return {
    x: point.x,
    y: point.y,
    pressure: point.pressure,
    time: point.time,
    tiltX: typeof point.tiltX === 'number' ? point.tiltX : undefined,
    tiltY: typeof point.tiltY === 'number' ? point.tiltY : undefined,
  };
}

function normalizeStroke(value: unknown): Stroke | null {
  if (!value || typeof value !== 'object') return null;
  const stroke = value as Partial<Stroke>;
  if (
    typeof stroke.id !== 'string' ||
    !isToolType(stroke.tool) ||
    typeof stroke.color !== 'string' ||
    typeof stroke.size !== 'number' ||
    typeof stroke.smoothing !== 'number' ||
    !isPressureCurve(stroke.pressureCurve) ||
    !Array.isArray(stroke.points)
  ) {
    return null;
  }

  const points = stroke.points
    .map((point) => normalizePoint(point))
    .filter((point): point is Point => point !== null);

  if (points.length === 0) return null;

  return {
    id: stroke.id,
    tool: stroke.tool,
    color: stroke.color,
    size: stroke.size,
    smoothing: stroke.smoothing,
    pressureCurve: stroke.pressureCurve,
    points,
    opacity: typeof stroke.opacity === 'number' ? stroke.opacity : 1,
    text: typeof stroke.text === 'string' ? stroke.text : undefined,
  };
}

export function parseStrokesFromSvgString(svgString: string): Stroke[] {
  if (typeof DOMParser === 'undefined') return [];

  try {
    const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    const paths = Array.from(
      doc.querySelectorAll('path[data-sketchpad-stroke]')
    );

    return paths
      .map((path) => {
        const encoded = path.getAttribute('data-sketchpad-stroke');
        if (!encoded) return null;

        try {
          return normalizeStroke(JSON.parse(decodeURIComponent(encoded)));
        } catch {
          return null;
        }
      })
      .filter((stroke): stroke is Stroke => stroke !== null);
  } catch {
    return [];
  }
}

/**
 * Renders an array of strokes to a canvas context.
 */
/* eslint-disable complexity */
export function renderStrokesToCanvas(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  options: {
    dpr?: number;
    clear?: boolean;
    width?: number;
    height?: number;
    zoom?: number;
    pan?: { x: number; y: number };
    quality?: 'low' | 'high';
  } = {}
) {
  const {
    dpr = 1,
    clear = true,
    width,
    height,
    zoom = 1,
    pan = { x: 0, y: 0 },
    quality = 'high',
  } = options;

  if (clear) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width ?? ctx.canvas.width, height ?? ctx.canvas.height);
    ctx.restore();
  }

  ctx.save();
  ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, pan.x * dpr, pan.y * dpr);

  for (const stroke of strokes) {
    if (!stroke.points || stroke.points.length === 0) continue;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (stroke.tool === 'eraser') {
      // Use destination-out to effectively "cut" holes in the canvas
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.fillStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
    }

    ctx.globalAlpha = stroke.opacity ?? 1;

    let points = stroke.points;
    if (quality === 'high' && stroke.smoothing > 0 && points.length > 3) {
      const cached = smoothedPointsCache.get(stroke.id);
      let cachedPoints =
        cached && cached.pointsLength === points.length
          ? cached.points
          : undefined;
      if (!cachedPoints) {
        const simplified = simplifyPoints(points, 0.3);
        cachedPoints = getCatmullRomPoints(
          simplified,
          Math.ceil(stroke.smoothing * 8)
        );
        smoothedPointsCache.set(stroke.id, {
          pointsLength: points.length,
          points: cachedPoints,
        });
      }
      points = cachedPoints;
    }

    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, stroke.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      for (let i = 1; i < points.length; i++) {
        const p1 = points[i - 1];
        const p2 = points[i];
        const pressure = (p1.pressure + p2.pressure) / 2;
        const adjustedPressure = applyPressureCurve(
          pressure,
          stroke.pressureCurve
        );
        ctx.lineWidth = Math.max(0.5, stroke.size * adjustedPressure);

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  ctx.restore();
}

export async function rasterizeSvgString(
  svgString: string,
  width: number,
  height: number
): Promise<HTMLCanvasElement> {
  const img = new Image();
  const svgBlob = new Blob([svgString], {
    type: 'image/svg+xml;charset=utf-8',
  });
  const url = URL.createObjectURL(svgBlob);

  return new Promise((resolve, reject) => {
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas context unavailable'));
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load SVG image'));
    };
    img.src = url;
  });
}
