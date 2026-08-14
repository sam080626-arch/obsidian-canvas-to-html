import { describe, it, expect } from "vitest";
import { escapeHtml, colorVarFor, buildHtml } from "../serialize";
import type { SerializeInput } from "../serialize";

function input(overrides: Partial<SerializeInput> = {}): SerializeInput {
  return {
    title: "My Canvas",
    bounds: { x: -80, y: -80, width: 500, height: 400 },
    nodes: [
      {
        id: "a",
        kind: "text",
        rect: { x: 0, y: 0, width: 200, height: 100 },
        colorVar: "var(--cv-color-4)",
        html: "<h1>Hi</h1>",
        scrollable: true,
      },
    ],
    edges: [
      {
        id: "e1",
        fromNode: "a",
        toNode: "a",
        path: "M 0 0 C 1 1, 2 2, 3 3",
        arrowPaths: ["M 3 3 L 2 4 L 2 2 Z"],
        colorVar: null,
      },
    ],
    css: ".card{}",
    js: "console.log(1)",
    warnings: [],
    defaultTheme: "system",
    ...overrides,
  };
}

describe("escapeHtml", () => {
  it("escapes the five significant characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
  });
});

describe("colorVarFor", () => {
  it("maps preset numbers to CSS variables", () => {
    expect(colorVarFor("1")).toBe("var(--cv-color-1)");
    expect(colorVarFor("6")).toBe("var(--cv-color-6)");
  });
  it("passes a hex colour through", () => {
    expect(colorVarFor("#ff8800")).toBe("#ff8800");
  });
  it("returns null for undefined or junk", () => {
    expect(colorVarFor(undefined)).toBeNull();
    expect(colorVarFor("chartreuse")).toBeNull();
    expect(colorVarFor("9")).toBeNull();
  });
});

describe("buildHtml", () => {
  it("produces a complete standalone document", () => {
    const html = buildHtml(input());
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("<title>My Canvas</title>");
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
  });

  it("escapes the title", () => {
    const html = buildHtml(input({ title: "A <script> canvas" }));
    expect(html).toContain("<title>A &lt;script&gt; canvas</title>");
    expect(html).not.toContain("<title>A <script>");
  });

  it("inlines the CSS and JS rather than linking them", () => {
    const html = buildHtml(input());
    expect(html).toContain("<style>.card{}</style>");
    expect(html).toContain("console.log(1)");
    expect(html).not.toContain("<link rel=\"stylesheet\"");
    expect(html).not.toContain("src=\"");
  });

  it("positions each card at its canvas coordinates", () => {
    const html = buildHtml(input());
    expect(html).toContain(
      `<div class="cv-card cv-card-text cv-scrollable" data-id="a" style="left:0px;top:0px;width:200px;height:100px;--cv-node-color:var(--cv-color-4)">`,
    );
    expect(html).toContain("<h1>Hi</h1>");
  });

  it("omits the scrollable class when a card fits", () => {
    const nodes = input().nodes.map((n) => ({ ...n, scrollable: false }));
    const html = buildHtml(input({ nodes }));
    expect(html).toContain(`class="cv-card cv-card-text" data-id="a"`);
  });

  it("emits edges as SVG paths with their arrowheads", () => {
    const html = buildHtml(input());
    expect(html).toContain(`<path class="cv-edge-line" d="M 0 0 C 1 1, 2 2, 3 3"`);
    expect(html).toContain(`<path class="cv-edge-arrow" d="M 3 3 L 2 4 L 2 2 Z"`);
    expect(html).toContain(`data-from="a" data-to="a"`);
  });

  it("embeds the world bounds and default theme as a JSON payload", () => {
    const html = buildHtml(input());
    expect(html).toContain('<script type="application/json" id="cv-meta">');
    const match = html.match(/id="cv-meta">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const meta = JSON.parse(match![1]);
    expect(meta.bounds).toEqual({ x: -80, y: -80, width: 500, height: 400 });
    expect(meta.defaultTheme).toBe("system");
    expect(meta.nodes.a).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });

  it("neutralizes a closing script tag inside the JSON payload", () => {
    const nodes = [{ ...input().nodes[0], id: "</script><script>evil()</script>" }];
    const html = buildHtml(input({ nodes }));
    expect(html).not.toContain("<script>evil()</script>");
    expect(html).toContain("\\u003c/script>");
  });

  it("writes warnings as an HTML comment at the top", () => {
    const html = buildHtml(input({ warnings: ["File not found: A.md"] }));
    expect(html).toContain("<!--");
    expect(html).toContain("File not found: A.md");
  });

  it("strips comment terminators out of warning text", () => {
    const html = buildHtml(input({ warnings: ["bad --> break"] }));
    expect(html).not.toContain("bad --> break");
    expect(html).toContain("bad --&gt; break");
  });

  it("sets the html element's data-theme when a theme is forced", () => {
    expect(buildHtml(input({ defaultTheme: "dark" }))).toContain('<html lang="en" data-theme="dark">');
    expect(buildHtml(input({ defaultTheme: "system" }))).toContain('<html lang="en">');
  });
});
