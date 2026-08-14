import type { CanvasRect, EdgeSide } from "./canvas-model";

export interface Point {
  x: number;
  y: number;
}

export interface EdgeGeometry {
  start: Point;
  end: Point;
  path: string;
  startAngle: number;
  endAngle: number;
}

const MIN_CONTROL_OFFSET = 40;
const MAX_CONTROL_OFFSET = 200;
const CONTROL_RATIO = 0.4;

export function anchorPoint(rect: CanvasRect, s: EdgeSide): Point {
  switch (s) {
    case "top":
      return { x: rect.x + rect.width / 2, y: rect.y };
    case "bottom":
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
    case "left":
      return { x: rect.x, y: rect.y + rect.height / 2 };
    case "right":
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
  }
}

export function outwardNormal(s: EdgeSide): Point {
  switch (s) {
    case "top":
      return { x: 0, y: -1 };
    case "bottom":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function routeEdge(
  from: CanvasRect,
  fromSide: EdgeSide,
  to: CanvasRect,
  toSide: EdgeSide,
): EdgeGeometry {
  const start = anchorPoint(from, fromSide);
  const end = anchorPoint(to, toSide);
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const offset = Math.min(
    MAX_CONTROL_OFFSET,
    Math.max(MIN_CONTROL_OFFSET, distance * CONTROL_RATIO),
  );
  const n1 = outwardNormal(fromSide);
  const n2 = outwardNormal(toSide);
  const c1 = { x: start.x + n1.x * offset, y: start.y + n1.y * offset };
  const c2 = { x: end.x + n2.x * offset, y: end.y + n2.y * offset };

  const path =
    `M ${round(start.x)} ${round(start.y)} C ` +
    `${round(c1.x)} ${round(c1.y)}, ${round(c2.x)} ${round(c2.y)}, ` +
    `${round(end.x)} ${round(end.y)}`;

  return {
    start,
    end,
    path,
    startAngle: Math.atan2(c1.y - start.y, c1.x - start.x),
    // The curve arrives at `end` travelling from c2 toward end.
    endAngle: Math.atan2(end.y - c2.y, end.x - c2.x),
  };
}

export function arrowheadPath(at: Point, angleRad: number, size = 10): string {
  const back = size;
  const half = size / 2;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const bx = at.x - cos * back;
  const by = at.y - sin * back;
  const left = { x: bx - sin * -half, y: by + cos * -half };
  const right = { x: bx - sin * half, y: by + cos * half };
  return (
    `M ${round(at.x)} ${round(at.y)} L ${round(left.x)} ${round(left.y)} ` +
    `L ${round(right.x)} ${round(right.y)} Z`
  );
}
