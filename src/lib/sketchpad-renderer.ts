import {
  applyPressureCurve,
  drawGraphAxes,
  drawShape,
  getCatmullRomPoints,
  simplifyPoints,
} from '@/components/sketchpadUtils';
import type { BgType, Point, Stroke } from '@/types/sketchpad';

// Cache for smoothed points to avoid mutating Stroke objects
const smoothedPointsCache = new Map<
  string,
  { pointsLength: number; points: Point[] }
>();

export function pointsToSvgPath(points: Point[]): string {
  /**
   * Convert an array of points into an SVG path string using quadratic
   * segments between midpoints to create a smooth stroke.
   */
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

function escapeXmlText(value: string): string {
  /**
   * Escape text for safe inclusion inside XML/SVG text nodes.
   */
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function strokeToSvgElement(
  stroke: Stroke,
  metadata: string,
  opacity: number,
  strokeWidth: number,
): string {
  /**
   * Serialize a `Stroke` object into an SVG element string snippet.
   */
  if (stroke.tool === 'line' && stroke.points.length >= 2) {
    const start = stroke.points[0];
    const end = stroke.points[stroke.points.length - 1];
    return `<line${metadata} x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" fill="none" stroke="${stroke.color}" stroke-linecap="round" stroke-linejoin="round" stroke-width="${strokeWidth}" opacity="${opacity}" />\n`;
  }

  if (stroke.tool === 'rect' && stroke.points.length >= 2) {
    const start = stroke.points[0];
    const end = stroke.points[stroke.points.length - 1];
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);
    return `<rect${metadata} x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${stroke.color}" stroke-linecap="round" stroke-linejoin="round" stroke-width="${strokeWidth}" opacity="${opacity}" />\n`;
  }

  if (stroke.tool === 'ellipse' && stroke.points.length >= 2) {
    const start = stroke.points[0];
    const end = stroke.points[stroke.points.length - 1];
    const rx = Math.abs(end.x - start.x) / 2;
    const ry = Math.abs(end.y - start.y) / 2;
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    return `<ellipse${metadata} cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${stroke.color}" stroke-linecap="round" stroke-linejoin="round" stroke-width="${strokeWidth}" opacity="${opacity}" />\n`;
  }

  if (stroke.tool === 'text') {
    const anchor = stroke.points[0];
    if (anchor && stroke.text) {
      const text = escapeXmlText(stroke.text);
      return `<text${metadata} x="${anchor.x}" y="${anchor.y}" fill="${stroke.color}" font-size="${Math.max(1, stroke.size)}" text-anchor="start" dominant-baseline="alphabetic" opacity="${opacity}">${text}</text>\n`;
    }
    return '';
  }

  if (stroke.tool === 'graph') {
    const p1 = stroke.points[0];
    const p2 = stroke.points[1];
    if (p1) {
      let halfW = 320;
      let halfH = 240;
      let cx = p1.x;
      let cy = p1.y;

      if (p2) {
        halfW = Math.max(40, Math.abs(p2.x - p1.x) / 2);
        halfH = Math.max(40, Math.abs(p2.y - p1.y) / 2);
        cx = (p1.x + p2.x) / 2;
        cy = (p1.y + p2.y) / 2;
      }
      return `${graphAxesToSvg(cx, cy, halfW, halfH, stroke.color, strokeWidth, opacity, metadata)}\n`;
    }
    return '';
  }

  const d = pointsToSvgPath(stroke.points || []);
  return `<path${metadata} d="${d}" fill="none" stroke="${stroke.color}" stroke-linecap="round" stroke-linejoin="round" stroke-width="${strokeWidth}" opacity="${opacity}" />\n`;
}

function graphAxesToSvg(
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  color: string,
  strokeWidth: number,
  opacity: number,
  metadata: string,
): string {
  /**
   * Render graph axes and gridlines as an SVG group string centered at (cx,cy).
   */
  const tickSpacing = 20;
  const tickLen = 4;
  const arrowSize = 10;
  const base = arrowSize * 0.4;
  const graphStroke = Math.max(1, strokeWidth);
  const gridOpacity = Math.max(0, Math.min(1, opacity * 0.08));
  const tickStroke = Math.max(0.5, graphStroke * 0.8);
  const axisOpacity = Math.max(0, Math.min(1, opacity));
  const fontSize = 12;

  const gridLines: string[] = [];
  for (let tx = tickSpacing; tx < halfW; tx += tickSpacing) {
    gridLines.push(
      `<line x1="${cx + tx}" y1="${cy - halfH}" x2="${cx + tx}" y2="${cy + halfH}" />`,
    );
    gridLines.push(
      `<line x1="${cx - tx}" y1="${cy - halfH}" x2="${cx - tx}" y2="${cy + halfH}" />`,
    );
  }
  for (let ty = tickSpacing; ty < halfH; ty += tickSpacing) {
    gridLines.push(
      `<line x1="${cx - halfW}" y1="${cy + ty}" x2="${cx + halfW}" y2="${cy + ty}" />`,
    );
    gridLines.push(
      `<line x1="${cx - halfW}" y1="${cy - ty}" x2="${cx + halfW}" y2="${cy - ty}" />`,
    );
  }

  const xArrowRight = `${cx + halfW},${cy} ${cx + halfW - arrowSize},${cy + base} ${cx + halfW - arrowSize},${cy - base}`;
  const xArrowLeft = `${cx - halfW},${cy} ${cx - halfW + arrowSize},${cy + base} ${cx - halfW + arrowSize},${cy - base}`;
  const yArrowTop = `${cx},${cy - halfH} ${cx + base},${cy - halfH + arrowSize} ${cx - base},${cy - halfH + arrowSize}`;
  const yArrowBottom = `${cx},${cy + halfH} ${cx + base},${cy + halfH - arrowSize} ${cx - base},${cy + halfH - arrowSize}`;

  const ticks: string[] = [];
  for (let tx = tickSpacing; tx < halfW - arrowSize; tx += tickSpacing) {
    ticks.push(
      `<line x1="${cx + tx}" y1="${cy - tickLen}" x2="${cx + tx}" y2="${cy + tickLen}" />`,
    );
    ticks.push(
      `<line x1="${cx - tx}" y1="${cy - tickLen}" x2="${cx - tx}" y2="${cy + tickLen}" />`,
    );
  }
  for (let ty = tickSpacing; ty < halfH - arrowSize; ty += tickSpacing) {
    ticks.push(
      `<line x1="${cx - tickLen}" y1="${cy - ty}" x2="${cx + tickLen}" y2="${cy - ty}" />`,
    );
    ticks.push(
      `<line x1="${cx - tickLen}" y1="${cy + ty}" x2="${cx + tickLen}" y2="${cy + ty}" />`,
    );
  }

  return [
    `<g${metadata} fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round" opacity="${axisOpacity}">`,
    `  <g stroke-width="1" opacity="${gridOpacity}">${gridLines.join('')}</g>`,
    `  <g stroke-width="${graphStroke}">`,
    `    <line x1="${cx - halfW}" y1="${cy}" x2="${cx + halfW}" y2="${cy}" />`,
    `    <line x1="${cx}" y1="${cy - halfH}" x2="${cx}" y2="${cy + halfH}" />`,
    `  </g>`,
    `  <g fill="${color}" stroke="none">`,
    `    <polygon points="${xArrowRight}" />`,
    `    <polygon points="${xArrowLeft}" />`,
    `    <polygon points="${yArrowTop}" />`,
    `    <polygon points="${yArrowBottom}" />`,
    `  </g>`,
    `  <g stroke-width="${tickStroke}">${ticks.join('')}</g>`,
    `  <g fill="${color}" stroke="none">`,
    `    <text x="${cx + halfW + 6}" y="${cy - fontSize * 0.6}" font-size="${fontSize}" font-style="italic" text-anchor="start" dominant-baseline="hanging">x</text>`,
    `    <text x="${cx + fontSize * 0.5}" y="${cy - halfH - 4}" font-size="${fontSize}" font-style="italic" text-anchor="end" dominant-baseline="text-after-edge">y</text>`,
    `    <text x="${cx - 5}" y="${cy + 5}" font-size="${fontSize * 0.85}" text-anchor="end" dominant-baseline="hanging">O</text>`,
    `  </g>`,
    `</g>`,
  ].join('\n');
}

export function strokesToSvgString(
  strokes: Stroke[],
  width: number,
  height: number,
  bg?: BgType,
  includeMetadata: boolean = false,
): string {
  /**
   * Serialize an array of strokes into a full SVG document string.
   * If `includeMetadata` is true, per-stroke JSON is embedded as a data
   * attribute to allow precise round-tripping.
   */
  const bgFill = bg === 'black-grid' ? '#ffffff' : 'transparent';
  const bgRect = `<rect width="100%" height="100%" fill="${bgFill}"/>`;

  let content = '';
  let maskDefs = '';
  let maskIndex = 0;

  for (const s of strokes || []) {
    const d = pointsToSvgPath(s.points || []);
    const opacity = s.opacity ?? 1;
    const strokeWidth = Math.max(0.5, s.size || 1);
    const metadata = includeMetadata
      ? ` data-sketchpad-stroke="${encodeURIComponent(JSON.stringify(s))}"`
      : '';

    if (s.tool === 'eraser') {
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
      continue;
    }

    content += strokeToSvgElement(s, metadata, opacity, strokeWidth);
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
  /**
   * Validate and normalize an arbitrary object into a `Stroke` or null.
   */
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
  /**
   * Parse strokes previously embedded into an SVG string via
   * `data-sketchpad-stroke` attributes and return normalized strokes.
   */
  if (typeof DOMParser === 'undefined') return [];

  try {
    const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    const elements = Array.from(
      doc.querySelectorAll('[data-sketchpad-stroke]'),
    );

    return elements
      .map((element) => {
        const encoded = element.getAttribute('data-sketchpad-stroke');
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
  } = {},
) {
  /**
   * Render strokes to a 2D canvas context. Supports smoothing, pressure
   * curves, eraser masks, basic shapes and text rendering.
   */
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

    if (stroke.tool === 'text') {
      const anchor = stroke.points[0];
      if (stroke.text && anchor) {
        ctx.font = `${Math.max(1, stroke.size)}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(stroke.text, anchor.x, anchor.y);
      }
      ctx.restore();
      continue;
    }

    if (stroke.tool === 'graph') {
      const p1 = stroke.points[0];
      const p2 = stroke.points[1];
      if (p1) {
        let halfW = 320;
        let halfH = 240;
        let cx = p1.x;
        let cy = p1.y;

        if (p2) {
          halfW = Math.max(40, Math.abs(p2.x - p1.x) / 2);
          halfH = Math.max(40, Math.abs(p2.y - p1.y) / 2);
          cx = (p1.x + p2.x) / 2;
          cy = (p1.y + p2.y) / 2;
        }

        drawGraphAxes(
          ctx,
          cx,
          cy,
          stroke.color,
          Math.max(1, stroke.size),
          halfW,
          halfH,
        );
      }
      ctx.restore();
      continue;
    }

    if (
      (stroke.tool === 'line' ||
        stroke.tool === 'rect' ||
        stroke.tool === 'ellipse') &&
      stroke.points.length >= 2
    ) {
      const start = stroke.points[0];
      const end = stroke.points[stroke.points.length - 1];
      ctx.lineWidth = Math.max(0.5, stroke.size);
      drawShape(ctx, stroke.tool, start, end);
      ctx.restore();
      continue;
    }

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
          Math.ceil(stroke.smoothing * 8),
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
          stroke.pressureCurve,
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
  height: number,
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
