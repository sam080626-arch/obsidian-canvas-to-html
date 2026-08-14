import { describe, it, expect } from "vitest";
import { anchorPoint, outwardNormal, routeEdge, arrowheadPath } from "../edges";

const rect = { x: 100, y: 200, width: 200, height: 100 };

describe("anchorPoint", () => {
  it("puts the right anchor at the middle of the right edge", () => {
    expect(anchorPoint(rect, "right")).toEqual({ x: 300, y: 250 });
  });
  it("puts the top anchor at the middle of the top edge", () => {
    expect(anchorPoint(rect, "top")).toEqual({ x: 200, y: 200 });
  });
  it("puts the bottom anchor at the middle of the bottom edge", () => {
    expect(anchorPoint(rect, "bottom")).toEqual({ x: 200, y: 300 });
  });
  it("puts the left anchor at the middle of the left edge", () => {
    expect(anchorPoint(rect, "left")).toEqual({ x: 100, y: 250 });
  });
});

describe("outwardNormal", () => {
  it("points away from the shape on each side", () => {
    expect(outwardNormal("right")).toEqual({ x: 1, y: 0 });
    expect(outwardNormal("left")).toEqual({ x: -1, y: 0 });
    expect(outwardNormal("top")).toEqual({ x: 0, y: -1 });
    expect(outwardNormal("bottom")).toEqual({ x: 0, y: 1 });
  });
});

describe("routeEdge", () => {
  const a = { x: 0, y: 0, width: 100, height: 100 };
  const b = { x: 400, y: 0, width: 100, height: 100 };

  it("starts and ends at the anchor points", () => {
    const g = routeEdge(a, "right", b, "left");
    expect(g.start).toEqual({ x: 100, y: 50 });
    expect(g.end).toEqual({ x: 400, y: 50 });
  });

  it("emits a cubic Bézier path through both control points", () => {
    const g = routeEdge(a, "right", b, "left");
    // distance 300 → control offset clamp(300 * 0.4, 40, 200) = 120
    expect(g.path).toBe("M 100 50 C 220 50, 280 50, 400 50");
  });

  it("clamps the control offset to a 40px minimum for close nodes", () => {
    const near = { x: 110, y: 0, width: 100, height: 100 };
    const g = routeEdge(a, "right", near, "left");
    expect(g.path).toBe("M 100 50 C 140 50, 70 50, 110 50");
  });

  it("clamps the control offset to a 200px maximum for distant nodes", () => {
    const far = { x: 4000, y: 0, width: 100, height: 100 };
    const g = routeEdge(a, "right", far, "left");
    expect(g.path).toBe("M 100 50 C 300 50, 3800 50, 4000 50");
  });

  it("reports the incoming angle at the target so an arrowhead can be oriented", () => {
    const g = routeEdge(a, "right", b, "left");
    expect(g.endAngle).toBeCloseTo(0, 5); // travelling +x
  });

  it("orients the incoming angle downward for a top-side target below", () => {
    const below = { x: 0, y: 400, width: 100, height: 100 };
    const g = routeEdge(a, "bottom", below, "top");
    expect(g.endAngle).toBeCloseTo(Math.PI / 2, 5);
  });
});

describe("arrowheadPath", () => {
  it("draws a closed triangle pointing along the angle", () => {
    expect(arrowheadPath({ x: 100, y: 0 }, 0, 10)).toBe("M 100 0 L 90 -5 L 90 5 Z");
  });
});
