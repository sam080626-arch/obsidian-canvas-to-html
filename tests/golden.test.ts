import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { exportCanvas } from "../export-canvas";
import type { ResolveDeps } from "../resolve";

const FILES: Record<string, string> = {
  "Notes/Brief.md": "## Brief\n\nThe short version.",
};

const deps: ResolveDeps = {
  vault: {
    getFile: (path) =>
      path.startsWith("Nowhere/") ? null : { path, extension: path.split(".").pop() ?? "" },
    readText: async (path) => FILES[path] ?? "",
    readBinary: async () => new Uint8Array([137, 80, 78, 71]).buffer,
  },
  // Deterministic stand-in for Obsidian's renderer: markdown in, tagged HTML out.
  renderer: {
    async renderMarkdown(markdown) {
      return `<div class="md">${markdown.replace(/</g, "&lt;").replace(/\n/g, "<br>")}</div>`;
    },
  },
  images: { toInlineImage: async () => "data:image/png;base64,STUBBED" },
  maxImageDimension: 2000,
};

describe("golden export", () => {
  it("matches the committed snapshot", async () => {
    const json = readFileSync(join(__dirname, "fixtures/sample.canvas"), "utf8");
    const { html } = await exportCanvas(json, "Sample", deps, {
      css: "/* css omitted from the snapshot */",
      js: "/* js omitted from the snapshot */",
      defaultTheme: "system",
    });
    expect(html).toMatchSnapshot();
  });

  it("reports exactly the expected warnings", async () => {
    const json = readFileSync(join(__dirname, "fixtures/sample.canvas"), "utf8");
    const { warnings } = await exportCanvas(json, "Sample", deps, {
      css: "",
      js: "",
      defaultTheme: "system",
    });
    expect(warnings).toEqual(["File not found: Nowhere/Lost.md"]);
  });
});
