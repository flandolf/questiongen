import type { BgType, Point, Stroke } from '../types/sketchpad';

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

  const paths = (strokes || [])
    .map((s) => {
      const d = pointsToSvgPath(s.points || []);
      // Use black for eraser strokes when rasterizing so they can be
      // composited with `destination-out` on export. White made eraser
      // appear as an opaque white pen when drawn over the raster canvas.
      const stroke = s.tool === 'eraser' ? '#000000' : s.color;
      const strokeWidth = Math.max(0.5, s.size || 1);
      const opacity = s.opacity ?? 1;
      const metadata = includeMetadata
        ? ` data-sketchpad-stroke="${encodeURIComponent(JSON.stringify(s))}"`
        : '';
      return `<path${metadata} d="${d}" fill="none" stroke="${stroke}" stroke-linecap="round" stroke-linejoin="round" stroke-width="${strokeWidth}" opacity="${opacity}" />`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${bgRect}\n${paths}\n</svg>`;
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
    value === 'fill' ||
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
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas context unavailable'));
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas);
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(
          err instanceof Error ? err : new Error('Failed to rasterize SVG')
        );
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load SVG image'));
    };
    img.src = url;
  });
}
