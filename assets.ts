export interface Size {
  width: number;
  height: number;
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const IMAGE_MIMES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  avif: "image/avif",
};

export const DEFAULT_JPEG_QUALITY = 0.85;

export function fitWithin(size: Size, max: number): Size {
  const largest = Math.max(size.width, size.height);
  if (largest <= max) return { width: size.width, height: size.height };
  const ratio = max / largest;
  return {
    width: Math.max(1, Math.round(size.width * ratio)),
    height: Math.max(1, Math.round(size.height * ratio)),
  };
}

export function mimeForExtension(ext: string): string | null {
  return IMAGE_MIMES[ext.toLowerCase()] ?? null;
}

export function pickEncoding(mime: string): { mime: string; quality: number } {
  if (mime === "image/jpeg" || mime === "image/webp" || mime === "image/avif") {
    return { mime: "image/jpeg", quality: DEFAULT_JPEG_QUALITY };
  }
  return { mime, quality: 1 };
}

export function toDataUri(bytes: ArrayBuffer, mime: string): string {
  const view = new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < view.length; i += 3) {
    const b0 = view[i];
    const b1 = view[i + 1];
    const b2 = view[i + 2];
    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? "=" : BASE64_ALPHABET[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? "=" : BASE64_ALPHABET[b2 & 63];
  }
  return `data:${mime};base64,${out}`;
}

export class AssetCache {
  private readonly entries = new Map<string, Promise<string>>();

  get(key: string, load: () => Promise<string>): Promise<string> {
    const existing = this.entries.get(key);
    if (existing) return existing;
    const pending = load().catch((error: unknown) => {
      this.entries.delete(key);
      throw error;
    });
    this.entries.set(key, pending);
    return pending;
  }
}
