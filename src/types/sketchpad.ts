export type ToolType =
  | 'pen'
  | 'eraser'
  | 'fill'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'text'
  | 'graph';

export type BgType = 'white-grid' | 'black-grid' | 'lined' | 'dot-grid';

export type PressureCurve = 'linear' | 'exponential' | 'smooth' | 'heavy-ink';

export type Point = {
  x: number;
  y: number;
  pressure: number;
  time: number;
  tiltX?: number;
  tiltY?: number;
};

export type Stroke = {
  id: string;
  tool: ToolType;
  color: string;
  size: number;
  smoothing: number;
  pressureCurve: PressureCurve;
  points: Point[];
  opacity?: number;
  text?: string;
  smoothedPoints?: Point[]; // Cache for performance
};

export type StrokeList = Stroke[];
