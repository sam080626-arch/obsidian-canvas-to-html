import { describe, it, expect, vi } from "vitest";
import { fitWithin, mimeForExtension, pickEncoding, toDataUri, AssetCache } from "../assets";

describe("fitWithin", () => {
  it("leaves a small image untouched", () => {
    expect(fitWithin({ width: 800, height: 600 }, 2000)).toEqual({ width: 800, height: 600 });
  });
  it("scales a wide image by its width and rounds", () => {
    expect(fitWithin({ width: 4000, height: 3000 }, 2000)).toEqual({ width: 2000, height: 1500 });
  });
  it("scales a tall image by its height", () => {
    expect(fitWithin({ width: 1000, height: 5000 }, 2000)).toEqual({ width: 400, height: 2000 });
  });
  it("never returns a zero dimension", () => {
    expect(fitWithin({ width: 10000, height: 1 }, 100)).toEqual({ width: 100, height: 1 });
  });
});

describe("mimeForExtension", () => {
  it("maps common raster extensions", () => {
    expect(mimeForExtension("png")).toBe("image/png");
    expect(mimeForExtension("JPG")).toBe("image/jpeg");
    expect(mimeForExtension("webp")).toBe("image/webp");
    expect(mimeForExtension("svg")).toBe("image/svg+xml");
  });
  it("returns null for a non-image extension", () => {
    expect(mimeForExtension("md")).toBeNull();
  });
});

describe("pickEncoding", () => {
  it("keeps PNG as PNG so alpha survives", () => {
    expect(pickEncoding("image/png")).toEqual({ mime: "image/png", quality: 1 });
  });
  it("keeps SVG untouched", () => {
    expect(pickEncoding("image/svg+xml")).toEqual({ mime: "image/svg+xml", quality: 1 });
  });
  it("re-encodes JPEG at the default quality", () => {
    expect(pickEncoding("image/jpeg")).toEqual({ mime: "image/jpeg", quality: 0.85 });
  });
});

describe("toDataUri", () => {
  it("base64-encodes the bytes with the given mime", () => {
    const bytes = new Uint8Array([72, 105]).buffer; // "Hi"
    expect(toDataUri(bytes, "image/png")).toBe("data:image/png;base64,SGk=");
  });
  it("handles byte values above 127", () => {
    const bytes = new Uint8Array([255, 254, 0]).buffer;
    expect(toDataUri(bytes, "image/jpeg")).toBe("data:image/jpeg;base64,//4A");
  });
});

describe("AssetCache", () => {
  it("loads a key once and reuses the result", async () => {
    const cache = new AssetCache();
    const load = vi.fn().mockResolvedValue("data:image/png;base64,AAA");
    const first = await cache.get("a.png", load);
    const second = await cache.get("a.png", load);
    expect(first).toBe(second);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed load", async () => {
    const cache = new AssetCache();
    const load = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue("ok");
    await expect(cache.get("b.png", load)).rejects.toThrow("boom");
    await expect(cache.get("b.png", load)).resolves.toBe("ok");
  });
});
