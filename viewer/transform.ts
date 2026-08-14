import { MIN_SCALE, MAX_SCALE } from "../constants";
import type { CanvasRect } from "../canvas-model";

export interface View {
  x: number;
  y: number;
  k: number;
}

export function clampScale(k: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, k));
}

export function zoomAt(view: View, px: number, py: number, factor: number): View {
  const k = clampScale(view.k * factor);
  if (k === view.k) return view;
  // Keep the world point under (px, py) fixed.
  const worldX = (px - view.x) / view.k;
  const worldY = (py - view.y) / view.k;
  return { x: px - worldX * k, y: py - worldY * k, k };
}

export function panBy(view: View, dx: number, dy: number): View {
  return { x: view.x + dx, y: view.y + dy, k: view.k };
}

export function fit(bounds: CanvasRect, vw: number, vh: number, margin = 40): View {
  if (bounds.width <= 0 || bounds.height <= 0) {
    return { x: vw / 2, y: vh / 2, k: 1 };
  }
  const availableW = Math.max(1, vw - margin * 2);
  const availableH = Math.max(1, vh - margin * 2);
  const k = clampScale(Math.min(availableW / bounds.width, availableH / bounds.height));
  const x = (vw - bounds.width * k) / 2 - bounds.x * k;
  const y = (vh - bounds.height * k) / 2 - bounds.y * k;
  return { x, y, k };
}

export function frame(rects: CanvasRect[], vw: number, vh: number, margin = 80): View {
  if (rects.length === 0) return { x: vw / 2, y: vh / 2, k: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return fit({ x: minX, y: minY, width: maxX - minX, height: maxY - minY }, vw, vh, margin);
}

export function toCss(view: View): string {
  return `translate(${view.x}px, ${view.y}px) scale(${view.k})`;
}
