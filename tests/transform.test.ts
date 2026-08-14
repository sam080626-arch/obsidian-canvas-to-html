import { describe, it, expect } from "vitest";
import { clampScale, zoomAt, panBy, fit, frame, toCss } from "../viewer/transform";

describe("clampScale", () => {
  it("keeps a scale inside the allowed range", () => {
    expect(clampScale(1)).toBe(1);
  });
  it("clamps below the minimum", () => {
    expect(clampScale(0.001)).toBe(0.05);
  });
  it("clamps above the maximum", () => {
    expect(clampScale(99)).toBe(4);
  });
});

describe("zoomAt", () => {
  it("keeps the world point under the pointer fixed", () => {
    const before = { x: 0, y: 0, k: 1 };
    const after = zoomAt(before, 300, 200, 2);
    expect(after.k).toBe(2);
    // world point under (300,200) was (300,200); it must still map there
    expect(300 * after.k + after.x).toBeCloseTo(300, 6);
    expect(200 * after.k + after.y).toBeCloseTo(200, 6);
  });

  it("keeps the pointed world point fixed when already panned and scaled", () => {
    const before = { x: -120, y: 40, k: 0.5 };
    const px = 250;
    const py = 310;
    const world = { x: (px - before.x) / before.k, y: (py - before.y) / before.k };
    const after = zoomAt(before, px, py, 1.25);
    expect(world.x * after.k + after.x).toBeCloseTo(px, 6);
    expect(world.y * after.k + after.y).toBeCloseTo(py, 6);
  });

  it("does not move the view when the clamp rejects the zoom", () => {
    const before = { x: 10, y: 20, k: 4 };
    expect(zoomAt(before, 100, 100, 2)).toEqual(before);
  });
});

describe("panBy", () => {
  it("adds the delta in screen pixels and leaves scale alone", () => {
    expect(panBy({ x: 5, y: 5, k: 0.5 }, 10, -20)).toEqual({ x: 15, y: -15, k: 0.5 });
  });
});

describe("fit", () => {
  it("scales bounds to the viewport and centres them", () => {
    const view = fit({ x: 0, y: 0, width: 1000, height: 500 }, 500, 500, 0);
    expect(view.k).toBe(0.5);
    expect(view.x).toBe(0);
    expect(view.y).toBeCloseTo(125, 6);
  });

  it("respects a margin on each side", () => {
    const view = fit({ x: 0, y: 0, width: 1000, height: 1000 }, 600, 600, 50);
    expect(view.k).toBeCloseTo(0.5, 6);
  });

  it("never zooms past the maximum for a tiny canvas", () => {
    const view = fit({ x: 0, y: 0, width: 10, height: 10 }, 1000, 1000, 0);
    expect(view.k).toBe(4);
  });

  it("returns an identity-centred view for empty bounds", () => {
    expect(fit({ x: 0, y: 0, width: 0, height: 0 }, 800, 600, 0)).toEqual({ x: 400, y: 300, k: 1 });
  });
});

describe("frame", () => {
  it("fits the union of the given rects", () => {
    const view = frame(
      [
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 300, y: 0, width: 100, height: 100 },
      ],
      400,
      400,
      0,
    );
    expect(view.k).toBe(1);
    expect(view.x).toBe(0);
    expect(view.y).toBeCloseTo(150, 6);
  });
});

describe("toCss", () => {
  it("emits a translate+scale transform", () => {
    expect(toCss({ x: 12.345, y: -6, k: 1.5 })).toBe("translate(12.345px, -6px) scale(1.5)");
  });
});
