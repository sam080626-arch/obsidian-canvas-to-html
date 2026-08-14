import { describe, it, expect, vi } from "vitest";
import { resolveScene } from "../resolve";
import type { ResolveDeps } from "../resolve";
import type { Scene, SceneNode } from "../canvas-model";

function scene(nodes: SceneNode[]): Scene {
  return { nodes, edges: [], bounds: { x: 0, y: 0, width: 100, height: 100 } };
}

const rect = { x: 0, y: 0, width: 100, height: 100 };

function deps(overrides: Partial<ResolveDeps> = {}): ResolveDeps {
  return {
    vault: {
      getFile: (path: string) =>
        path === "missing.md" ? null : { path, extension: path.split(".").pop() ?? "" },
      readText: async () => "# From the note",
      readBinary: async () => new Uint8Array([1, 2, 3]).buffer,
    },
    renderer: { renderMarkdown: async (md: string) => `<p>${md}</p>` },
    images: { toInlineImage: async () => "data:image/png;base64,AAA" },
    maxImageDimension: 2000,
    ...overrides,
  };
}

describe("resolveScene", () => {
  it("renders a text node's markdown", async () => {
    const result = await resolveScene(
      scene([{ id: "a", kind: "text", rect, text: "hello" }]),
      deps(),
    );
    expect(result.nodes[0]).toMatchObject({ id: "a", kind: "text", html: "<p>hello</p>", scrollable: true });
    expect(result.warnings).toEqual([]);
  });

  it("renders an embedded markdown note's content", async () => {
    const result = await resolveScene(
      scene([{ id: "b", kind: "file", rect, file: "Notes/Deep.md" }]),
      deps(),
    );
    expect(result.nodes[0].html).toBe("<p># From the note</p>");
    expect(result.nodes[0].scrollable).toBe(true);
  });

  it("inlines an image file node as a data URI", async () => {
    const result = await resolveScene(
      scene([{ id: "c", kind: "file", rect, file: "Images/Shot.png" }]),
      deps(),
    );
    expect(result.nodes[0].html).toContain('src="data:image/png;base64,AAA"');
    expect(result.nodes[0].scrollable).toBe(false);
  });

  it("loads each distinct image only once", async () => {
    const toInlineImage = vi.fn().mockResolvedValue("data:image/png;base64,AAA");
    const result = await resolveScene(
      scene([
        { id: "c", kind: "file", rect, file: "Images/Shot.png" },
        { id: "d", kind: "file", rect, file: "Images/Shot.png" },
      ]),
      deps({ images: { toInlineImage } }),
    );
    expect(result.nodes).toHaveLength(2);
    expect(toInlineImage).toHaveBeenCalledTimes(1);
  });

  it("downgrades a PDF node to a placeholder without reading its bytes", async () => {
    const readBinary = vi.fn();
    const result = await resolveScene(
      scene([{ id: "e", kind: "file", rect, file: "Papers/Long.pdf" }]),
      deps({
        vault: { ...deps().vault, readBinary },
      }),
    );
    expect(result.nodes[0].html).toContain("cv-placeholder");
    expect(result.nodes[0].html).toContain("Long.pdf");
    expect(readBinary).not.toHaveBeenCalled();
  });

  it("downgrades a URL node to a clickable link card", async () => {
    const result = await resolveScene(
      scene([{ id: "f", kind: "link", rect, url: "https://example.com/a?b=1" }]),
      deps(),
    );
    expect(result.nodes[0].html).toContain('href="https://example.com/a?b=1"');
    expect(result.nodes[0].html).toContain('rel="noopener noreferrer"');
    expect(result.nodes[0].html).toContain("example.com");
  });

  it("rejects a non-http URL node rather than emitting the link", async () => {
    const result = await resolveScene(
      scene([{ id: "g", kind: "link", rect, url: "javascript:alert(1)" }]),
      deps(),
    );
    expect(result.nodes[0].html).not.toContain("javascript:");
    expect(result.warnings.join()).toContain("Unsupported URL");
  });

  it("emits a warning and a placeholder for a missing file", async () => {
    const result = await resolveScene(
      scene([{ id: "h", kind: "file", rect, file: "missing.md" }]),
      deps(),
    );
    expect(result.nodes[0].html).toContain("cv-placeholder");
    expect(result.warnings.join()).toContain("missing.md");
  });

  it("falls back to raw source when rendering throws", async () => {
    const result = await resolveScene(
      scene([{ id: "i", kind: "text", rect, text: "**oops**" }]),
      deps({ renderer: { renderMarkdown: async () => { throw new Error("render blew up"); } } }),
    );
    expect(result.nodes[0].html).toContain("<pre");
    expect(result.nodes[0].html).toContain("**oops**");
    expect(result.warnings.join()).toContain("render blew up");
  });

  it("escapes the raw source in the fallback", async () => {
    const result = await resolveScene(
      scene([{ id: "j", kind: "text", rect, text: "<img onerror=x>" }]),
      deps({ renderer: { renderMarkdown: async () => { throw new Error("nope"); } } }),
    );
    expect(result.nodes[0].html).not.toContain("<img onerror");
    expect(result.nodes[0].html).toContain("&lt;img onerror=x&gt;");
  });

  it("carries a group's label and colour through without a body", async () => {
    const result = await resolveScene(
      scene([{ id: "k", kind: "group", rect, label: "Phase 1", color: "3" }]),
      deps(),
    );
    expect(result.nodes[0]).toMatchObject({
      kind: "group",
      label: "Phase 1",
      html: "",
      colorVar: "var(--cv-color-3)",
      scrollable: false,
    });
  });

  it("marks media bodies flush and markdown bodies padded", async () => {
    const result = await resolveScene(
      scene([
        { id: "text", kind: "text", rect, text: "hi" },
        { id: "note", kind: "file", rect, file: "Notes/Deep.md" },
        { id: "image", kind: "file", rect, file: "Images/Shot.png" },
        { id: "pdf", kind: "file", rect, file: "Papers/Long.pdf" },
        { id: "link", kind: "link", rect, url: "https://example.com" },
        { id: "group", kind: "group", rect },
      ]),
      deps(),
    );
    const flush = Object.fromEntries(result.nodes.map((n) => [n.id, n.flush]));
    // Markdown must keep the card's own padding; media supplies its own.
    expect(flush.text).toBe(false);
    expect(flush.note).toBe(false);
    expect(flush.image).toBe(true);
    expect(flush.pdf).toBe(true);
    expect(flush.link).toBe(true);
    expect(flush.group).toBe(true);
  });

  it("marks a failed markdown render padded so the fallback stays readable", async () => {
    const result = await resolveScene(
      scene([{ id: "x", kind: "text", rect, text: "**oops**" }]),
      deps({ renderer: { renderMarkdown: async () => { throw new Error("nope"); } } }),
    );
    expect(result.nodes[0].flush).toBe(false);
  });

  it("keeps node order stable", async () => {
    const result = await resolveScene(
      scene([
        { id: "1", kind: "text", rect, text: "one" },
        { id: "2", kind: "text", rect, text: "two" },
        { id: "3", kind: "text", rect, text: "three" },
      ]),
      deps(),
    );
    expect(result.nodes.map((n) => n.id)).toEqual(["1", "2", "3"]);
  });
});
