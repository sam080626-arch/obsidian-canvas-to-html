import { describe, it, expect } from "vitest";
import { exportCanvas } from "../export-canvas";
import type { ResolveDeps } from "../resolve";

const deps: ResolveDeps = {
  vault: {
    getFile: (path: string) => ({ path, extension: path.split(".").pop() ?? "" }),
    readText: async () => "note body",
    readBinary: async () => new ArrayBuffer(0),
  },
  renderer: { renderMarkdown: async (md: string) => `<p>${md}</p>` },
  images: { toInlineImage: async () => "data:image/png;base64,AAA" },
  maxImageDimension: 2000,
};

const options = { css: "/*css*/", js: "/*js*/", defaultTheme: "system" as const };

const canvasJson = JSON.stringify({
  nodes: [
    { id: "a", type: "text", x: 0, y: 0, width: 100, height: 100, text: "one", color: "2" },
    { id: "b", type: "text", x: 400, y: 0, width: 100, height: 100, text: "two" },
  ],
  edges: [{ id: "e", fromNode: "a", fromSide: "right", toNode: "b", toSide: "left" }],
});

describe("exportCanvas", () => {
  it("produces a complete document containing both cards", async () => {
    const { html } = await exportCanvas(canvasJson, "Plan", deps, options);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<p>one</p>");
    expect(html).toContain("<p>two</p>");
    expect(html).toContain("<title>Plan</title>");
  });

  it("routes edges between the two node rects", async () => {
    const { html } = await exportCanvas(canvasJson, "Plan", deps, options);
    expect(html).toContain('d="M 100 50 C 220 50, 280 50, 400 50"');
    expect(html).toContain('class="cv-edge-arrow"');
  });

  it("carries node colours into the card style", async () => {
    const { html } = await exportCanvas(canvasJson, "Plan", deps, options);
    expect(html).toContain("--cv-node-color:var(--cv-color-2)");
  });

  it("omits the arrowhead when the edge has no end marker", async () => {
    const json = JSON.stringify({
      nodes: [
        { id: "a", type: "text", x: 0, y: 0, width: 100, height: 100, text: "" },
        { id: "b", type: "text", x: 400, y: 0, width: 100, height: 100, text: "" },
      ],
      edges: [{ id: "e", fromNode: "a", toNode: "b", toEnd: "none" }],
    });
    const { html } = await exportCanvas(json, "T", deps, options);
    expect(html).not.toContain('class="cv-edge-arrow"');
  });

  it("draws two arrowheads for a double-ended edge", async () => {
    const json = JSON.stringify({
      nodes: [
        { id: "a", type: "text", x: 0, y: 0, width: 100, height: 100, text: "" },
        { id: "b", type: "text", x: 400, y: 0, width: 100, height: 100, text: "" },
      ],
      edges: [{ id: "e", fromNode: "a", toNode: "b", fromEnd: "arrow" }],
    });
    const { html } = await exportCanvas(json, "T", deps, options);
    expect(html.match(/class="cv-edge-arrow"/g)).toHaveLength(2);
  });

  it("surfaces resolution warnings", async () => {
    const json = JSON.stringify({
      nodes: [{ id: "a", type: "file", x: 0, y: 0, width: 10, height: 10, file: "gone.md" }],
      edges: [],
    });
    const missing: ResolveDeps = { ...deps, vault: { ...deps.vault, getFile: () => null } };
    const { warnings, html } = await exportCanvas(json, "T", missing, options);
    expect(warnings.join()).toContain("gone.md");
    expect(html).toContain("File not found");
  });

  it("folds collected render warnings into the result and the file comment", async () => {
    const collected: string[] = [];
    const chatty: ResolveDeps = {
      ...deps,
      renderer: {
        async renderMarkdown(md: string) {
          collected.push("math did not render");
          return `<p>${md}</p>`;
        },
      },
    };
    const { html, warnings } = await exportCanvas(canvasJson, "Plan", chatty, {
      ...options,
      collectedWarnings: collected,
    });
    // Both cards push the same warning; the reader should see it once.
    expect(warnings).toEqual(["math did not render"]);
    expect(html).toContain("math did not render");
  });

  it("propagates a parse error", async () => {
    await expect(exportCanvas("{broken", "T", deps, options)).rejects.toThrow(
      /not valid JSON/,
    );
  });

  it("exports an empty canvas without throwing", async () => {
    const { html } = await exportCanvas(JSON.stringify({ nodes: [], edges: [] }), "Empty", deps, options);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("cv-world");
  });
});
