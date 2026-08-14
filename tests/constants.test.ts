import { describe, it, expect } from "vitest";
import { MIN_SCALE, MAX_SCALE, BOUNDS_PADDING } from "../constants";

describe("constants", () => {
  it("clamps zoom between 0.05 and 4", () => {
    expect(MIN_SCALE).toBe(0.05);
    expect(MAX_SCALE).toBe(4);
  });

  it("pads world bounds by 80px", () => {
    expect(BOUNDS_PADDING).toBe(80);
  });
});
