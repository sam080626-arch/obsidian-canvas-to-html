# Canvas to HTML Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Obsidian plugin that exports a Canvas to one self-contained HTML file whose viewer zooms and pans like the Obsidian canvas.

**Architecture:** Pure modules (`canvas-model`, `edges`, `assets`, `serialize`, `viewer/transform`) hold all logic and are unit-tested in Node. Obsidian-coupled modules (`resolve`, `render-markdown`, `main`) are thin and receive their Obsidian dependencies through injected interfaces so they can be tested with fakes. The exported file is static DOM positioned in raw canvas coordinates inside a single `#world` element; the shipped viewer runtime only mutates one CSS transform.

**Tech Stack:** TypeScript 5.4 (strict), esbuild 0.20 (two entry points), vitest 1.4 (node + jsdom environments), Obsidian API. No runtime dependencies.

## Global Constraints

- Plugin author: `朱劭恩`. Plugin id: `canvas-to-html`. `minAppVersion`: `1.4.0`. `isDesktopOnly`: `false`.
- TypeScript `strict: true`. No `any` in exported signatures.
- **No network requests anywhere**, in the plugin or in the exported file.
- The viewer bundle has **zero dependencies** and must not import from `obsidian`.
- All markdown-rendered HTML passes through sanitization before serialization; `app://` and `obsidian://` URLs are stripped.
- Obsidian's npm package pins CodeMirror peers to exact versions — if a `@codemirror/*` dependency is ever added, pin it exactly or `npm install` fails with ERESOLVE.
- Never symlink the built plugin into the iCloud vault (`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Iykyk`) — copy files.
- Zoom clamp: `[0.05, 4]`. Default max image dimension: `2000`. Default image quality: `0.85`. Default size warning threshold: `25` MB.

## File Structure

| File | Responsibility |
|---|---|
| `canvas-model.ts` | Parse `.canvas` JSON → `Scene`; compute world bounds |
| `edges.ts` | Anchor points, Bézier routing, arrowhead geometry |
| `assets.ts` | Downscale math, encoding choice, data-URI, per-path cache |
| `serialize.ts` | HTML escaping and final document assembly |
| `resolve.ts` | Scene nodes → renderable nodes, via injected vault/renderer/image deps |
| `render-markdown.ts` | Obsidian `MarkdownRenderer` + sanitize wrapper |
| `settings.ts` / `settings-tab.ts` | Settings model + UI |
| `main.ts` | Plugin entry, commands, menus, orchestration, size guard |
| `viewer/transform.ts` | Pure view math: clamp, zoom-at-point, pan, fit, frame |
| `viewer/viewer.ts` | Event binding: wheel, drag, keys, scroll handoff, edge follow, theme |
| `viewer/viewer.css` | Exported stylesheet: cards, groups, edges, light + dark palettes |
| `tests/*.test.ts` | Vitest suites, one per pure module + viewer integration + golden file |

---

### Task 1: Project scaffold and dual-bundle build

**Files:**
- Create: `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `vitest.config.ts`, `manifest.json`, `versions.json`, `.gitignore`
- Create: `viewer/viewer.ts`, `viewer/viewer.css`, `constants.ts`
- Test: `tests/constants.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `constants.ts` exporting `MIN_SCALE = 0.05`, `MAX_SCALE = 4`, `BOUNDS_PADDING = 80`; a build that emits `main.js` and inlines the viewer bundle as a string.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "obsidian-canvas-to-html",
  "version": "0.1.0",
  "description": "Export an Obsidian Canvas to a single self-contained, zoomable HTML file.",
  "main": "main.js",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "tsc --noEmit --skipLibCheck && node esbuild.config.mjs production",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "author": "朱劭恩",
  "license": "MIT",
  "devDependencies": {
    "@types/node": "^20.11.0",
    "esbuild": "^0.20.0",
    "jsdom": "^24.0.0",
    "obsidian": "latest",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "target": "ES2018",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "importHelpers": true,
    "isolatedModules": true,
    "lib": ["DOM", "ES2018"]
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `vitest.config.ts` and `.gitignore`**

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

`.gitignore`:

```
node_modules
main.js
*.js.map
```

- [ ] **Step 4: Create `manifest.json` and `versions.json`**

`manifest.json`:

```json
{
  "id": "canvas-to-html",
  "name": "Canvas to HTML",
  "version": "0.1.0",
  "minAppVersion": "1.4.0",
  "description": "Export a Canvas to a single self-contained HTML file you can share.",
  "author": "朱劭恩",
  "isDesktopOnly": false
}
```

`versions.json`:

```json
{ "0.1.0": "1.4.0" }
```

- [ ] **Step 5: Create the viewer entry stubs**

`viewer/viewer.ts`:

```ts
export const VIEWER_READY = "canvas-to-html viewer";
console.debug(VIEWER_READY);
```

`viewer/viewer.css`:

```css
:root { --cv-bg: #ffffff; }
```

- [ ] **Step 6: Create `esbuild.config.mjs` with two bundles**

The viewer is built first, in memory, then injected into the plugin bundle as the
string constants `__VIEWER_JS__` and `__VIEWER_CSS__`.

```js
import esbuild from "esbuild";
import process from "process";
import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";

const production = process.argv[2] === "production";

async function buildViewer() {
  const result = await esbuild.build({
    entryPoints: ["viewer/viewer.ts"],
    bundle: true,
    format: "iife",
    target: "es2018",
    minify: production,
    write: false,
    logLevel: "silent",
  });
  return result.outputFiles[0].text;
}

async function buildPlugin() {
  const viewerJs = await buildViewer();
  const viewerCss = readFileSync("viewer/viewer.css", "utf8");
  const ctx = await esbuild.context({
    entryPoints: ["main.ts"],
    bundle: true,
    external: ["obsidian", "electron", ...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
    format: "cjs",
    target: "es2018",
    logLevel: "info",
    sourcemap: production ? false : "inline",
    treeShaking: true,
    outfile: "main.js",
    define: {
      __VIEWER_JS__: JSON.stringify(viewerJs),
      __VIEWER_CSS__: JSON.stringify(viewerCss),
    },
  });
  if (production) {
    await ctx.rebuild();
    process.exit(0);
  } else {
    await ctx.watch();
  }
}

buildPlugin();
```

- [ ] **Step 7: Write the failing test**

`tests/constants.test.ts`:

```ts
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
```

- [ ] **Step 8: Run test to verify it fails**

Run: `npm install && npx vitest run tests/constants.test.ts`
Expected: FAIL — cannot resolve `../constants`.

- [ ] **Step 9: Write minimal implementation**

`constants.ts`:

```ts
export const MIN_SCALE = 0.05;
export const MAX_SCALE = 4;
export const BOUNDS_PADDING = 80;
```

- [ ] **Step 10: Create a placeholder `main.ts` so the build compiles**

```ts
import { Plugin } from "obsidian";

declare const __VIEWER_JS__: string;
declare const __VIEWER_CSS__: string;

export const VIEWER_JS = __VIEWER_JS__;
export const VIEWER_CSS = __VIEWER_CSS__;

export default class CanvasToHtmlPlugin extends Plugin {
  async onload(): Promise<void> {
    console.debug("canvas-to-html loaded");
  }
}
```

- [ ] **Step 11: Verify tests and build both pass**

Run: `npm test && npm run build`
Expected: tests PASS; `main.js` is written and contains the viewer string.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "chore: scaffold plugin with dual-bundle esbuild and vitest"
```

---

### Task 2: Canvas model parsing

**Files:**
- Create: `canvas-model.ts`
- Test: `tests/canvas-model.test.ts`

**Interfaces:**
- Consumes: `BOUNDS_PADDING` from `constants.ts`
- Produces:
  - `interface CanvasRect { x: number; y: number; width: number; height: number }`
  - `type NodeKind = "text" | "file" | "link" | "group"`
  - `type EdgeSide = "top" | "right" | "bottom" | "left"`
  - `interface SceneNode { id: string; kind: NodeKind; rect: CanvasRect; color?: string; text?: string; file?: string; subpath?: string; url?: string; label?: string }`
  - `interface SceneEdge { id: string; fromNode: string; fromSide: EdgeSide; toNode: string; toSide: EdgeSide; color?: string; label?: string; fromEnd: "arrow" | "none"; toEnd: "arrow" | "none" }`
  - `interface Scene { nodes: SceneNode[]; edges: SceneEdge[]; bounds: CanvasRect }`
  - `class CanvasParseError extends Error`
  - `function parseCanvas(json: string): Scene`

- [ ] **Step 1: Write the failing test**

`tests/canvas-model.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseCanvas, CanvasParseError } from "../canvas-model";

const minimal = JSON.stringify({
  nodes: [
    { id: "a", type: "text", x: 0, y: 0, width: 200, height: 100, text: "# Hi", color: "4" },
    { id: "b", type: "file", x: 400, y: 50, width: 300, height: 200, file: "Notes/Deep.md" },
    { id: "g", type: "group", x: -50, y: -50, width: 800, height: 400, label: "Section" },
  ],
  edges: [{ id: "e1", fromNode: "a", fromSide: "right", toNode: "b", toSide: "left" }],
});

describe("parseCanvas", () => {
  it("maps nodes with their kind, rect, and payload", () => {
    const scene = parseCanvas(minimal);
    expect(scene.nodes).toHaveLength(3);
    expect(scene.nodes[0]).toMatchObject({
      id: "a",
      kind: "text",
      rect: { x: 0, y: 0, width: 200, height: 100 },
      text: "# Hi",
      color: "4",
    });
    expect(scene.nodes[1]).toMatchObject({ kind: "file", file: "Notes/Deep.md" });
    expect(scene.nodes[2]).toMatchObject({ kind: "group", label: "Section" });
  });

  it("defaults edge ends to a single arrow at the target", () => {
    const scene = parseCanvas(minimal);
    expect(scene.edges[0]).toMatchObject({ fromEnd: "none", toEnd: "arrow" });
  });

  it("defaults missing edge sides to right→left", () => {
    const scene = parseCanvas(
      JSON.stringify({
        nodes: [
          { id: "a", type: "text", x: 0, y: 0, width: 10, height: 10, text: "" },
          { id: "b", type: "text", x: 50, y: 0, width: 10, height: 10, text: "" },
        ],
        edges: [{ id: "e", fromNode: "a", toNode: "b" }],
      }),
    );
    expect(scene.edges[0].fromSide).toBe("right");
    expect(scene.edges[0].toSide).toBe("left");
  });

  it("computes padded world bounds over every node", () => {
    const scene = parseCanvas(minimal);
    // x spans -50..700, y spans -50..350, padded by 80
    expect(scene.bounds).toEqual({ x: -130, y: -130, width: 910, height: 560 });
  });

  it("returns empty bounds of zero size for a canvas with no nodes", () => {
    const scene = parseCanvas(JSON.stringify({ nodes: [], edges: [] }));
    expect(scene.bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("drops edges that reference a missing node", () => {
    const scene = parseCanvas(
      JSON.stringify({
        nodes: [{ id: "a", type: "text", x: 0, y: 0, width: 10, height: 10, text: "" }],
        edges: [{ id: "e", fromNode: "a", toNode: "ghost" }],
      }),
    );
    expect(scene.edges).toEqual([]);
  });

  it("skips nodes of an unknown type rather than throwing", () => {
    const scene = parseCanvas(
      JSON.stringify({
        nodes: [{ id: "x", type: "hologram", x: 0, y: 0, width: 10, height: 10 }],
        edges: [],
      }),
    );
    expect(scene.nodes).toEqual([]);
  });

  it("throws CanvasParseError on malformed JSON", () => {
    expect(() => parseCanvas("{not json")).toThrow(CanvasParseError);
  });

  it("throws CanvasParseError when nodes is not an array", () => {
    expect(() => parseCanvas(JSON.stringify({ nodes: {} }))).toThrow(CanvasParseError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/canvas-model.test.ts`
Expected: FAIL — cannot resolve `../canvas-model`.

- [ ] **Step 3: Write the implementation**

`canvas-model.ts`:

```ts
import { BOUNDS_PADDING } from "./constants";

export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type NodeKind = "text" | "file" | "link" | "group";
export type EdgeSide = "top" | "right" | "bottom" | "left";

export interface SceneNode {
  id: string;
  kind: NodeKind;
  rect: CanvasRect;
  color?: string;
  text?: string;
  file?: string;
  subpath?: string;
  url?: string;
  label?: string;
}

export interface SceneEdge {
  id: string;
  fromNode: string;
  fromSide: EdgeSide;
  toNode: string;
  toSide: EdgeSide;
  color?: string;
  label?: string;
  fromEnd: "arrow" | "none";
  toEnd: "arrow" | "none";
}

export interface Scene {
  nodes: SceneNode[];
  edges: SceneEdge[];
  bounds: CanvasRect;
}

export class CanvasParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanvasParseError";
  }
}

const KINDS: NodeKind[] = ["text", "file", "link", "group"];
const SIDES: EdgeSide[] = ["top", "right", "bottom", "left"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function side(value: unknown, fallback: EdgeSide): EdgeSide {
  return SIDES.includes(value as EdgeSide) ? (value as EdgeSide) : fallback;
}

function parseNode(raw: unknown): SceneNode | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const kind = raw.type as NodeKind;
  if (!id || !KINDS.includes(kind)) return null;
  return {
    id,
    kind,
    rect: { x: num(raw.x), y: num(raw.y), width: num(raw.width), height: num(raw.height) },
    color: str(raw.color),
    text: str(raw.text),
    file: str(raw.file),
    subpath: str(raw.subpath),
    url: str(raw.url),
    label: str(raw.label),
  };
}

function parseEdge(raw: unknown, ids: Set<string>): SceneEdge | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const fromNode = str(raw.fromNode);
  const toNode = str(raw.toNode);
  if (!id || !fromNode || !toNode) return null;
  if (!ids.has(fromNode) || !ids.has(toNode)) return null;
  return {
    id,
    fromNode,
    toNode,
    fromSide: side(raw.fromSide, "right"),
    toSide: side(raw.toSide, "left"),
    color: str(raw.color),
    label: str(raw.label),
    fromEnd: raw.fromEnd === "arrow" ? "arrow" : "none",
    toEnd: raw.toEnd === "none" ? "none" : "arrow",
  };
}

export function computeBounds(nodes: SceneNode[]): CanvasRect {
  if (nodes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.rect.x);
    minY = Math.min(minY, node.rect.y);
    maxX = Math.max(maxX, node.rect.x + node.rect.width);
    maxY = Math.max(maxY, node.rect.y + node.rect.height);
  }
  return {
    x: minX - BOUNDS_PADDING,
    y: minY - BOUNDS_PADDING,
    width: maxX - minX + BOUNDS_PADDING * 2,
    height: maxY - minY + BOUNDS_PADDING * 2,
  };
}

export function parseCanvas(json: string): Scene {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (error) {
    throw new CanvasParseError(`Canvas file is not valid JSON: ${(error as Error).message}`);
  }
  if (!isRecord(data)) throw new CanvasParseError("Canvas file is not an object.");

  const rawNodes = data.nodes ?? [];
  const rawEdges = data.edges ?? [];
  if (!Array.isArray(rawNodes)) throw new CanvasParseError("Canvas 'nodes' is not an array.");
  if (!Array.isArray(rawEdges)) throw new CanvasParseError("Canvas 'edges' is not an array.");

  const nodes = rawNodes.map(parseNode).filter((n): n is SceneNode => n !== null);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = rawEdges.map((e) => parseEdge(e, ids)).filter((e): e is SceneEdge => e !== null);

  return { nodes, edges, bounds: computeBounds(nodes) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/canvas-model.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add canvas-model.ts tests/canvas-model.test.ts
git commit -m "feat: parse .canvas JSON into a normalized Scene"
```

---

### Task 3: Edge geometry

**Files:**
- Create: `edges.ts`
- Test: `tests/edges.test.ts`

**Interfaces:**
- Consumes: `CanvasRect`, `EdgeSide` from `canvas-model.ts`
- Produces:
  - `interface Point { x: number; y: number }`
  - `interface EdgeGeometry { start: Point; end: Point; path: string; startAngle: number; endAngle: number }`
  - `function anchorPoint(rect: CanvasRect, s: EdgeSide): Point`
  - `function outwardNormal(s: EdgeSide): Point`
  - `function routeEdge(from: CanvasRect, fromSide: EdgeSide, to: CanvasRect, toSide: EdgeSide): EdgeGeometry`
  - `function arrowheadPath(at: Point, angleRad: number, size?: number): string`

- [ ] **Step 1: Write the failing test**

`tests/edges.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/edges.test.ts`
Expected: FAIL — cannot resolve `../edges`.

- [ ] **Step 3: Write the implementation**

`edges.ts`:

```ts
import type { CanvasRect, EdgeSide } from "./canvas-model";

export interface Point {
  x: number;
  y: number;
}

export interface EdgeGeometry {
  start: Point;
  end: Point;
  path: string;
  startAngle: number;
  endAngle: number;
}

const MIN_CONTROL_OFFSET = 40;
const MAX_CONTROL_OFFSET = 200;
const CONTROL_RATIO = 0.4;

export function anchorPoint(rect: CanvasRect, s: EdgeSide): Point {
  switch (s) {
    case "top":
      return { x: rect.x + rect.width / 2, y: rect.y };
    case "bottom":
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
    case "left":
      return { x: rect.x, y: rect.y + rect.height / 2 };
    case "right":
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
  }
}

export function outwardNormal(s: EdgeSide): Point {
  switch (s) {
    case "top":
      return { x: 0, y: -1 };
    case "bottom":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function routeEdge(
  from: CanvasRect,
  fromSide: EdgeSide,
  to: CanvasRect,
  toSide: EdgeSide,
): EdgeGeometry {
  const start = anchorPoint(from, fromSide);
  const end = anchorPoint(to, toSide);
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const offset = Math.min(
    MAX_CONTROL_OFFSET,
    Math.max(MIN_CONTROL_OFFSET, distance * CONTROL_RATIO),
  );
  const n1 = outwardNormal(fromSide);
  const n2 = outwardNormal(toSide);
  const c1 = { x: start.x + n1.x * offset, y: start.y + n1.y * offset };
  const c2 = { x: end.x + n2.x * offset, y: end.y + n2.y * offset };

  const path =
    `M ${round(start.x)} ${round(start.y)} C ` +
    `${round(c1.x)} ${round(c1.y)}, ${round(c2.x)} ${round(c2.y)}, ` +
    `${round(end.x)} ${round(end.y)}`;

  return {
    start,
    end,
    path,
    startAngle: Math.atan2(c1.y - start.y, c1.x - start.x),
    // The curve arrives at `end` travelling from c2 toward end.
    endAngle: Math.atan2(end.y - c2.y, end.x - c2.x),
  };
}

export function arrowheadPath(at: Point, angleRad: number, size = 10): string {
  const back = size;
  const half = size / 2;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const bx = at.x - cos * back;
  const by = at.y - sin * back;
  const left = { x: bx - sin * -half, y: by + cos * -half };
  const right = { x: bx - sin * half, y: by + cos * half };
  return (
    `M ${round(at.x)} ${round(at.y)} L ${round(left.x)} ${round(left.y)} ` +
    `L ${round(right.x)} ${round(right.y)} Z`
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/edges.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add edges.ts tests/edges.test.ts
git commit -m "feat: add Bézier edge routing and arrowhead geometry"
```

---

### Task 4: Viewer transform math

**Files:**
- Create: `viewer/transform.ts`
- Test: `tests/transform.test.ts`

**Interfaces:**
- Consumes: `MIN_SCALE`, `MAX_SCALE` from `constants.ts`; `CanvasRect` from `canvas-model.ts`
- Produces:
  - `interface View { x: number; y: number; k: number }`
  - `function clampScale(k: number): number`
  - `function zoomAt(view: View, px: number, py: number, factor: number): View`
  - `function panBy(view: View, dx: number, dy: number): View`
  - `function fit(bounds: CanvasRect, vw: number, vh: number, margin?: number): View`
  - `function frame(rects: CanvasRect[], vw: number, vh: number, margin?: number): View`
  - `function toCss(view: View): string`

The transform maps world → screen as `screen = world * k + (x, y)`, applied as
`translate(x px, y px) scale(k)` with `transform-origin: 0 0`.

**Note on imports:** `viewer/transform.ts` must import only types from
`canvas-model.ts` (`import type`) so no plugin code is pulled into the viewer bundle.

- [ ] **Step 1: Write the failing test**

`tests/transform.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/transform.test.ts`
Expected: FAIL — cannot resolve `../viewer/transform`.

- [ ] **Step 3: Write the implementation**

`viewer/transform.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/transform.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add viewer/transform.ts tests/transform.test.ts
git commit -m "feat: add pure zoom/pan/fit transform math for the viewer"
```

---

### Task 5: Asset downscaling and data URIs

**Files:**
- Create: `assets.ts`
- Test: `tests/assets.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface Size { width: number; height: number }`
  - `function fitWithin(size: Size, max: number): Size`
  - `function mimeForExtension(ext: string): string | null`
  - `function pickEncoding(mime: string): { mime: string; quality: number }`
  - `function toDataUri(bytes: ArrayBuffer, mime: string): string`
  - `class AssetCache { get(key: string, load: () => Promise<string>): Promise<string> }`

- [ ] **Step 1: Write the failing test**

`tests/assets.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/assets.test.ts`
Expected: FAIL — cannot resolve `../assets`.

- [ ] **Step 3: Write the implementation**

`assets.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/assets.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add assets.ts tests/assets.test.ts
git commit -m "feat: add image sizing, encoding, and data-URI helpers"
```

---

### Task 6: HTML serialization

**Files:**
- Create: `serialize.ts`
- Test: `tests/serialize.test.ts`

**Interfaces:**
- Consumes: `CanvasRect`, `NodeKind` from `canvas-model.ts`
- Produces:
  - `interface RenderedNode { id: string; kind: NodeKind; rect: CanvasRect; colorVar: string | null; html: string; scrollable: boolean; label?: string }`
  - `interface RenderedEdge { id: string; fromNode: string; toNode: string; path: string; arrowPaths: string[]; colorVar: string | null; label?: string }`
  - `interface SerializeInput { title: string; bounds: CanvasRect; nodes: RenderedNode[]; edges: RenderedEdge[]; css: string; js: string; warnings: string[]; defaultTheme: "system" | "light" | "dark" }`
  - `function escapeHtml(value: string): string`
  - `function colorVarFor(color: string | undefined): string | null`
  - `function buildHtml(input: SerializeInput): string`

Node colors: Obsidian's presets `"1"`–`"6"` map to `var(--cv-color-1)`…`var(--cv-color-6)`; a `#rrggbb` string is passed through as a literal color; anything else is `null` (default card border).

- [ ] **Step 1: Write the failing test**

`tests/serialize.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/serialize.test.ts`
Expected: FAIL — cannot resolve `../serialize`.

- [ ] **Step 3: Write the implementation**

`serialize.ts`:

```ts
import type { CanvasRect, NodeKind } from "./canvas-model";

export interface RenderedNode {
  id: string;
  kind: NodeKind;
  rect: CanvasRect;
  colorVar: string | null;
  html: string;
  scrollable: boolean;
  label?: string;
}

export interface RenderedEdge {
  id: string;
  fromNode: string;
  toNode: string;
  path: string;
  arrowPaths: string[];
  colorVar: string | null;
  label?: string;
}

export interface SerializeInput {
  title: string;
  bounds: CanvasRect;
  nodes: RenderedNode[];
  edges: RenderedEdge[];
  css: string;
  js: string;
  warnings: string[];
  defaultTheme: "system" | "light" | "dark";
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function colorVarFor(color: string | undefined): string | null {
  if (!color) return null;
  if (/^[1-6]$/.test(color)) return `var(--cv-color-${color})`;
  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) return color;
  return null;
}

function jsonScriptSafe(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function nodeHtml(node: RenderedNode): string {
  const classes = ["cv-card", `cv-card-${node.kind}`];
  if (node.scrollable) classes.push("cv-scrollable");
  const style =
    `left:${node.rect.x}px;top:${node.rect.y}px;` +
    `width:${node.rect.width}px;height:${node.rect.height}px` +
    (node.colorVar ? `;--cv-node-color:${node.colorVar}` : "");
  const label = node.label
    ? `<div class="cv-card-label">${escapeHtml(node.label)}</div>`
    : "";
  return (
    `<div class="${classes.join(" ")}" data-id="${escapeHtml(node.id)}" style="${style}">` +
    label +
    `<div class="cv-card-body">${node.html}</div>` +
    `</div>`
  );
}

function edgeHtml(edge: RenderedEdge): string {
  const stroke = edge.colorVar ? ` style="--cv-edge-color:${edge.colorVar}"` : "";
  const arrows = edge.arrowPaths
    .map((d) => `<path class="cv-edge-arrow" d="${d}" />`)
    .join("");
  return (
    `<g class="cv-edge" data-id="${escapeHtml(edge.id)}" ` +
    `data-from="${escapeHtml(edge.fromNode)}" data-to="${escapeHtml(edge.toNode)}"${stroke}>` +
    `<path class="cv-edge-hit" d="${edge.path}" />` +
    `<path class="cv-edge-line" d="${edge.path}" />` +
    arrows +
    `</g>`
  );
}

export function buildHtml(input: SerializeInput): string {
  const groups = input.nodes.filter((n) => n.kind === "group");
  const cards = input.nodes.filter((n) => n.kind !== "group");

  const meta = {
    bounds: input.bounds,
    defaultTheme: input.defaultTheme,
    nodes: Object.fromEntries(input.nodes.map((n) => [n.id, n.rect])),
  };

  const warningsComment =
    input.warnings.length > 0
      ? `<!--\nExport warnings:\n${input.warnings.map((w) => `- ${escapeHtml(w)}`).join("\n")}\n-->\n`
      : "";

  const themeAttr = input.defaultTheme === "system" ? "" : ` data-theme="${input.defaultTheme}"`;

  return `<!DOCTYPE html>
${warningsComment}<html lang="en"${themeAttr}>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(input.title)}</title>
<style>${input.css}</style>
</head>
<body>
<div id="cv-viewport">
  <div id="cv-world">
    <svg id="cv-edges" xmlns="http://www.w3.org/2000/svg">${input.edges.map(edgeHtml).join("")}</svg>
    ${groups.map(nodeHtml).join("\n    ")}
    ${cards.map(nodeHtml).join("\n    ")}
  </div>
</div>
<div id="cv-controls">
  <button type="button" data-action="zoom-in" title="Zoom in" aria-label="Zoom in">+</button>
  <button type="button" data-action="zoom-out" title="Zoom out" aria-label="Zoom out">−</button>
  <button type="button" data-action="fit" title="Fit to screen" aria-label="Fit to screen">⤢</button>
  <button type="button" data-action="theme" title="Toggle theme" aria-label="Toggle theme">◐</button>
</div>
<script type="application/json" id="cv-meta">${jsonScriptSafe(meta)}</script>
<script>${input.js}</script>
</body>
</html>
`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/serialize.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add serialize.ts tests/serialize.test.ts
git commit -m "feat: assemble the exported HTML document"
```

---

### Task 7: Node resolution with injected dependencies

**Files:**
- Create: `resolve.ts`
- Test: `tests/resolve.test.ts`

**Interfaces:**
- Consumes: `Scene`, `SceneNode` from `canvas-model.ts`; `RenderedNode` and `colorVarFor` from `serialize.ts`; `mimeForExtension`, `AssetCache` from `assets.ts`
- Produces:
  - `interface VaultLike { getFile(path: string): { path: string; extension: string } | null; readText(path: string): Promise<string>; readBinary(path: string): Promise<ArrayBuffer> }`
  - `interface RendererLike { renderMarkdown(markdown: string, sourcePath: string): Promise<string> }`
  - `interface ImageProcessor { toInlineImage(bytes: ArrayBuffer, mime: string, maxDim: number): Promise<string> }`
  - `interface ResolveDeps { vault: VaultLike; renderer: RendererLike; images: ImageProcessor; maxImageDimension: number }`
  - `interface ResolveResult { nodes: RenderedNode[]; warnings: string[] }`
  - `function resolveScene(scene: Scene, deps: ResolveDeps): Promise<ResolveResult>`

Rules encoded here:
- `text` → render markdown; `scrollable: true`.
- `file` with `.md` → render the note's content; `scrollable: true`.
- `file` with an image extension → `<img>` with an inline data URI; `scrollable: false`.
- `file` with `.pdf` or any other extension → placeholder card; `scrollable: false`.
- `link` → placeholder link card; `scrollable: false`.
- `group` → empty body carrying its label; `scrollable: false`.
- Any failure yields a placeholder card and a warning; nothing throws.

- [ ] **Step 1: Write the failing test**

`tests/resolve.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/resolve.test.ts`
Expected: FAIL — cannot resolve `../resolve`.

- [ ] **Step 3: Write the implementation**

`resolve.ts`:

```ts
import type { Scene, SceneNode } from "./canvas-model";
import { AssetCache, mimeForExtension } from "./assets";
import { colorVarFor, escapeHtml } from "./serialize";
import type { RenderedNode } from "./serialize";

export interface VaultLike {
  getFile(path: string): { path: string; extension: string } | null;
  readText(path: string): Promise<string>;
  readBinary(path: string): Promise<ArrayBuffer>;
}

export interface RendererLike {
  renderMarkdown(markdown: string, sourcePath: string): Promise<string>;
}

export interface ImageProcessor {
  toInlineImage(bytes: ArrayBuffer, mime: string, maxDim: number): Promise<string>;
}

export interface ResolveDeps {
  vault: VaultLike;
  renderer: RendererLike;
  images: ImageProcessor;
  maxImageDimension: number;
}

export interface ResolveResult {
  nodes: RenderedNode[];
  warnings: string[];
}

function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1];
}

function placeholder(icon: string, title: string, subtitle?: string): string {
  const sub = subtitle ? `<div class="cv-placeholder-sub">${escapeHtml(subtitle)}</div>` : "";
  return (
    `<div class="cv-placeholder"><div class="cv-placeholder-icon">${escapeHtml(icon)}</div>` +
    `<div class="cv-placeholder-title">${escapeHtml(title)}</div>${sub}</div>`
  );
}

function sourceFallback(text: string): string {
  return `<pre class="cv-raw">${escapeHtml(text)}</pre>`;
}

function hostnameOf(url: string): string {
  const match = url.match(/^https?:\/\/([^/?#]+)/i);
  return match ? match[1] : url;
}

export async function resolveScene(scene: Scene, deps: ResolveDeps): Promise<ResolveResult> {
  const warnings: string[] = [];
  const cache = new AssetCache();
  const nodes: RenderedNode[] = [];

  for (const node of scene.nodes) {
    nodes.push(await resolveNode(node, deps, cache, warnings));
  }
  return { nodes, warnings };
}

async function resolveNode(
  node: SceneNode,
  deps: ResolveDeps,
  cache: AssetCache,
  warnings: string[],
): Promise<RenderedNode> {
  const base = {
    id: node.id,
    kind: node.kind,
    rect: node.rect,
    colorVar: colorVarFor(node.color),
    label: node.label,
  };

  if (node.kind === "group") {
    return { ...base, html: "", scrollable: false };
  }

  if (node.kind === "link") {
    const url = node.url ?? "";
    if (!/^https?:\/\//i.test(url)) {
      warnings.push(`Unsupported URL on node ${node.id}: ${url}`);
      return { ...base, html: placeholder("🔗", "Unsupported link"), scrollable: false };
    }
    const html =
      `<a class="cv-link-card" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">` +
      `<div class="cv-link-host">${escapeHtml(hostnameOf(url))}</div>` +
      `<div class="cv-link-url">${escapeHtml(url)}</div></a>`;
    return { ...base, html, scrollable: false };
  }

  if (node.kind === "text") {
    const text = node.text ?? "";
    try {
      return { ...base, html: await deps.renderer.renderMarkdown(text, ""), scrollable: true };
    } catch (error) {
      warnings.push(`Could not render node ${node.id}: ${(error as Error).message}`);
      return { ...base, html: sourceFallback(text), scrollable: true };
    }
  }

  // kind === "file"
  const path = node.file ?? "";
  const file = deps.vault.getFile(path);
  if (!file) {
    warnings.push(`File not found: ${path}`);
    return { ...base, html: placeholder("⚠", "File not found", path), scrollable: false };
  }

  const ext = file.extension.toLowerCase();

  if (ext === "md") {
    try {
      const source = await deps.vault.readText(file.path);
      return { ...base, html: await deps.renderer.renderMarkdown(source, file.path), scrollable: true };
    } catch (error) {
      warnings.push(`Could not render ${path}: ${(error as Error).message}`);
      return { ...base, html: placeholder("⚠", "Could not render note", path), scrollable: false };
    }
  }

  const mime = mimeForExtension(ext);
  if (mime) {
    try {
      const uri = await cache.get(file.path, async () => {
        const bytes = await deps.vault.readBinary(file.path);
        return deps.images.toInlineImage(bytes, mime, deps.maxImageDimension);
      });
      const html = `<img class="cv-image" src="${escapeHtml(uri)}" alt="${escapeHtml(basename(path))}" />`;
      return { ...base, html, scrollable: false };
    } catch (error) {
      warnings.push(`Could not inline image ${path}: ${(error as Error).message}`);
      return { ...base, html: placeholder("🖼", "Image unavailable", basename(path)), scrollable: false };
    }
  }

  const icon = ext === "pdf" ? "📄" : "📎";
  return { ...base, html: placeholder(icon, basename(path), ext.toUpperCase()), scrollable: false };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/resolve.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add resolve.ts tests/resolve.test.ts
git commit -m "feat: resolve canvas nodes to renderable HTML with injected deps"
```

---

### Task 8: Viewer stylesheet

**Files:**
- Modify: `viewer/viewer.css` (replace the Task 1 stub entirely)
- Test: none — this is presentation; it is covered by the manual checklist in Task 12.

**Interfaces:**
- Consumes: the class names emitted by `serialize.ts` — `#cv-viewport`, `#cv-world`, `#cv-edges`, `#cv-controls`, `.cv-card`, `.cv-card-text|file|link|group`, `.cv-scrollable`, `.cv-card-label`, `.cv-card-body`, `.cv-edge`, `.cv-edge-hit`, `.cv-edge-line`, `.cv-edge-arrow`, `.cv-placeholder`, `.cv-placeholder-icon`, `.cv-placeholder-title`, `.cv-placeholder-sub`, `.cv-link-card`, `.cv-link-host`, `.cv-link-url`, `.cv-image`, `.cv-raw`, `--cv-node-color`, `--cv-edge-color`
- Produces: a stylesheet defining `--cv-color-1` … `--cv-color-6` and the surface/text tokens in both themes.

- [ ] **Step 1: Write the stylesheet**

`viewer/viewer.css`:

```css
:root {
  --cv-bg: #ffffff;
  --cv-surface: #ffffff;
  --cv-text: #222222;
  --cv-muted: #6b6b6b;
  --cv-border: #d4d4d4;
  --cv-edge: #8a8a8a;
  --cv-grid: rgba(0, 0, 0, 0.06);
  --cv-code-bg: #f4f4f4;
  --cv-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  --cv-color-1: #e35555;
  --cv-color-2: #e08c46;
  --cv-color-3: #e0c341;
  --cv-color-4: #59b359;
  --cv-color-5: #4aa8c9;
  --cv-color-6: #9a6bd6;
}

:root[data-theme="dark"],
html:not([data-theme="light"]) {
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  html:not([data-theme="light"]) {
    --cv-bg: #1e1e1e;
    --cv-surface: #262626;
    --cv-text: #dcdcdc;
    --cv-muted: #9a9a9a;
    --cv-border: #3d3d3d;
    --cv-edge: #7d7d7d;
    --cv-grid: rgba(255, 255, 255, 0.05);
    --cv-code-bg: #2f2f2f;
    --cv-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
    color-scheme: dark;
  }
}

html[data-theme="dark"] {
  --cv-bg: #1e1e1e;
  --cv-surface: #262626;
  --cv-text: #dcdcdc;
  --cv-muted: #9a9a9a;
  --cv-border: #3d3d3d;
  --cv-edge: #7d7d7d;
  --cv-grid: rgba(255, 255, 255, 0.05);
  --cv-code-bg: #2f2f2f;
  --cv-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
  color-scheme: dark;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  height: 100%;
  overflow: hidden;
  background: var(--cv-bg);
  color: var(--cv-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue",
    "PingFang TC", "Noto Sans TC", sans-serif;
  font-size: 16px;
  line-height: 1.5;
}

#cv-viewport {
  position: fixed;
  inset: 0;
  overflow: hidden;
  cursor: grab;
  background-image: radial-gradient(var(--cv-grid) 1px, transparent 1px);
  background-size: 24px 24px;
  touch-action: none;
}

#cv-viewport.cv-grabbing { cursor: grabbing; }

#cv-world {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  will-change: transform;
}

#cv-world.cv-animating { transition: transform 320ms cubic-bezier(0.22, 0.61, 0.36, 1); }

#cv-edges {
  position: absolute;
  overflow: visible;
  pointer-events: none;
  width: 1px;
  height: 1px;
}

.cv-edge { pointer-events: auto; cursor: pointer; }
.cv-edge-hit { fill: none; stroke: transparent; stroke-width: 14; }
.cv-edge-line {
  fill: none;
  stroke: var(--cv-edge-color, var(--cv-edge));
  stroke-width: 2.5;
}
.cv-edge-arrow { fill: var(--cv-edge-color, var(--cv-edge)); stroke: none; }
.cv-edge:hover .cv-edge-line { stroke-width: 4; }

.cv-card {
  position: absolute;
  background: var(--cv-surface);
  border: 1.5px solid var(--cv-node-color, var(--cv-border));
  border-radius: 8px;
  box-shadow: var(--cv-shadow);
  overflow: hidden;
}

.cv-card-body { padding: 10px 14px; height: 100%; overflow: hidden; }
.cv-scrollable > .cv-card-body { overflow-y: auto; overscroll-behavior: contain; }

.cv-card-group {
  background: color-mix(in srgb, var(--cv-node-color, var(--cv-border)) 12%, transparent);
  border-style: solid;
  border-radius: 12px;
  box-shadow: none;
  overflow: visible;
}

.cv-card-group > .cv-card-label {
  position: absolute;
  top: -1.9em;
  left: 2px;
  font-size: 0.95em;
  font-weight: 600;
  color: var(--cv-muted);
  white-space: nowrap;
}

.cv-card-file > .cv-card-body,
.cv-card-link > .cv-card-body { padding: 0; }

.cv-image { display: block; width: 100%; height: 100%; object-fit: contain; }

.cv-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 6px;
  padding: 12px;
  text-align: center;
}
.cv-placeholder-icon { font-size: 2em; }
.cv-placeholder-title { font-weight: 600; word-break: break-word; }
.cv-placeholder-sub { color: var(--cv-muted); font-size: 0.85em; word-break: break-all; }

.cv-link-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  height: 100%;
  padding: 14px;
  color: inherit;
  text-decoration: none;
}
.cv-link-host { font-weight: 600; }
.cv-link-url { color: var(--cv-muted); font-size: 0.85em; word-break: break-all; }
.cv-link-card:hover .cv-link-host { text-decoration: underline; }

.cv-raw {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85em;
}

/* Rendered markdown */
.cv-card-body h1, .cv-card-body h2, .cv-card-body h3,
.cv-card-body h4, .cv-card-body h5, .cv-card-body h6 {
  margin: 0.4em 0 0.3em;
  line-height: 1.25;
}
.cv-card-body h1 { font-size: 1.5em; }
.cv-card-body h2 { font-size: 1.3em; }
.cv-card-body h3 { font-size: 1.15em; }
.cv-card-body p { margin: 0.4em 0; }
.cv-card-body ul, .cv-card-body ol { margin: 0.4em 0; padding-left: 1.4em; }
.cv-card-body li { margin: 0.15em 0; }
.cv-card-body code {
  background: var(--cv-code-bg);
  border-radius: 4px;
  padding: 0.1em 0.35em;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.88em;
}
.cv-card-body pre {
  background: var(--cv-code-bg);
  border-radius: 6px;
  padding: 10px 12px;
  overflow-x: auto;
}
.cv-card-body pre code { background: none; padding: 0; }
.cv-card-body blockquote {
  margin: 0.5em 0;
  padding-left: 0.9em;
  border-left: 3px solid var(--cv-border);
  color: var(--cv-muted);
}
.cv-card-body table { border-collapse: collapse; font-size: 0.92em; }
.cv-card-body th, .cv-card-body td { border: 1px solid var(--cv-border); padding: 4px 8px; }
.cv-card-body img { max-width: 100%; height: auto; }
.cv-card-body hr { border: none; border-top: 1px solid var(--cv-border); margin: 0.8em 0; }
.cv-card-body a { color: var(--cv-color-5); }
.cv-card-body .cv-dead-link {
  color: inherit;
  text-decoration: underline dotted;
  cursor: help;
}
.cv-card-body .callout {
  border: 1px solid var(--cv-border);
  border-left-width: 4px;
  border-radius: 6px;
  padding: 8px 12px;
  margin: 0.5em 0;
  background: var(--cv-code-bg);
}
.cv-card-body .callout-title { font-weight: 600; margin-bottom: 0.2em; }
.cv-card-body .task-list-item { list-style: none; margin-left: -1.2em; }
.cv-card-body input[type="checkbox"] { margin-right: 0.4em; }

#cv-controls {
  position: fixed;
  right: 14px;
  bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 10;
}
#cv-controls button {
  width: 34px;
  height: 34px;
  border: 1px solid var(--cv-border);
  border-radius: 8px;
  background: var(--cv-surface);
  color: var(--cv-text);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  box-shadow: var(--cv-shadow);
}
#cv-controls button:hover { border-color: var(--cv-muted); }
#cv-controls button:focus-visible { outline: 2px solid var(--cv-color-5); outline-offset: 2px; }

@media print {
  html, body { overflow: visible; }
  #cv-controls { display: none; }
}
```

- [ ] **Step 2: Verify the build still succeeds**

Run: `npm run build`
Expected: PASS — `main.js` written, and the CSS string is embedded in it.

- [ ] **Step 3: Commit**

```bash
git add viewer/viewer.css
git commit -m "feat: add the exported viewer stylesheet with light and dark themes"
```

---

### Task 9: Viewer runtime — zoom, pan, keyboard, theme

**Files:**
- Modify: `viewer/viewer.ts` (replace the Task 1 stub entirely)
- Test: `tests/viewer.test.ts`

**Interfaces:**
- Consumes: `View`, `clampScale`, `zoomAt`, `panBy`, `fit`, `frame`, `toCss` from `viewer/transform.ts`
- Produces: `function initViewer(root: Document): { getView(): View; destroy(): void }`, exported for tests and auto-invoked on `DOMContentLoaded` when a `#cv-meta` element exists.

Wheel semantics, matching Obsidian: a plain wheel/two-finger scroll pans; `ctrlKey`
or `metaKey` plus wheel zooms at the pointer. Browsers report a trackpad pinch as
a wheel event with `ctrlKey: true`, so pinch is covered by the same branch.

**Note:** this test file runs in jsdom. Add `// @vitest-environment jsdom` as the
first line of `tests/viewer.test.ts`; the rest of the suites stay in the node
environment.

- [ ] **Step 1: Write the failing test**

`tests/viewer.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initViewer } from "../viewer/viewer";

let handle: { getView: () => { x: number; y: number; k: number }; destroy: () => void };

function setupDom(): void {
  document.documentElement.innerHTML = `
    <head></head>
    <body>
      <div id="cv-viewport">
        <div id="cv-world">
          <svg id="cv-edges">
            <g class="cv-edge" data-id="e1" data-from="a" data-to="b">
              <path class="cv-edge-hit" d="M 0 0" />
            </g>
          </svg>
          <div class="cv-card cv-card-text cv-scrollable" data-id="a"
               style="left:0px;top:0px;width:100px;height:100px">
            <div class="cv-card-body">tall content</div>
          </div>
          <div class="cv-card cv-card-text" data-id="b"
               style="left:400px;top:0px;width:100px;height:100px">
            <div class="cv-card-body">b</div>
          </div>
        </div>
      </div>
      <div id="cv-controls">
        <button data-action="zoom-in"></button>
        <button data-action="zoom-out"></button>
        <button data-action="fit"></button>
        <button data-action="theme"></button>
      </div>
      <script type="application/json" id="cv-meta">
        {"bounds":{"x":0,"y":0,"width":500,"height":500},"defaultTheme":"system",
         "nodes":{"a":{"x":0,"y":0,"width":100,"height":100},
                  "b":{"x":400,"y":0,"width":100,"height":100}}}
      </script>
    </body>`;
  Object.defineProperty(window, "innerWidth", { value: 1000, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 1000, configurable: true });
}

function world(): HTMLElement {
  return document.getElementById("cv-world") as HTMLElement;
}

function wheel(init: WheelEventInit): void {
  document.getElementById("cv-viewport")!.dispatchEvent(
    new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init }),
  );
}

beforeEach(() => {
  setupDom();
  localStorage.clear();
  handle = initViewer(document);
});

afterEach(() => handle.destroy());

describe("initial view", () => {
  it("fits the canvas bounds on load", () => {
    // 500x500 bounds in a 1000x1000 viewport with 40px margin → k = 920/500 = 1.84
    expect(handle.getView().k).toBeCloseTo(1.84, 5);
  });

  it("writes the transform onto #cv-world", () => {
    expect(world().style.transform).toContain("scale(1.84)");
  });
});

describe("wheel", () => {
  it("pans on a plain wheel and does not change scale", () => {
    const before = handle.getView();
    wheel({ deltaX: 30, deltaY: 50, clientX: 500, clientY: 500 });
    const after = handle.getView();
    expect(after.k).toBe(before.k);
    expect(after.x).toBe(before.x - 30);
    expect(after.y).toBe(before.y - 50);
  });

  it("zooms in at the pointer when ctrl is held", () => {
    const before = handle.getView();
    wheel({ deltaY: -100, ctrlKey: true, clientX: 400, clientY: 300 });
    const after = handle.getView();
    expect(after.k).toBeGreaterThan(before.k);
    const worldX = (400 - before.x) / before.k;
    expect(worldX * after.k + after.x).toBeCloseTo(400, 4);
  });

  it("zooms out on a positive delta with meta held", () => {
    const before = handle.getView();
    wheel({ deltaY: 100, metaKey: true, clientX: 500, clientY: 500 });
    expect(handle.getView().k).toBeLessThan(before.k);
  });

  it("prevents the browser's default page zoom", () => {
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: -100,
      ctrlKey: true,
    });
    document.getElementById("cv-viewport")!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe("drag to pan", () => {
  it("moves the view by the pointer delta", () => {
    const viewport = document.getElementById("cv-viewport")!;
    const before = handle.getView();
    viewport.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 100, clientY: 100 }));
    window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 140, clientY: 90 }));
    window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    const after = handle.getView();
    expect(after.x).toBe(before.x + 40);
    expect(after.y).toBe(before.y - 10);
  });

  it("stops panning after pointerup", () => {
    const viewport = document.getElementById("cv-viewport")!;
    viewport.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 0, clientY: 0 }));
    window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    const parked = handle.getView();
    window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 500, clientY: 500 }));
    expect(handle.getView()).toEqual(parked);
  });

  it("does not start a pan when the drag begins inside a card", () => {
    const card = document.querySelector('[data-id="a"]')!;
    const before = handle.getView();
    card.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 10 }));
    window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 200, clientY: 200 }));
    window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    expect(handle.getView()).toEqual(before);
  });
});

describe("keyboard", () => {
  it("zooms in on +", () => {
    const before = handle.getView();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true }));
    expect(handle.getView().k).toBeGreaterThan(before.k);
  });

  it("zooms out on -", () => {
    const before = handle.getView();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "-", bubbles: true }));
    expect(handle.getView().k).toBeLessThan(before.k);
  });

  it("refits on 0", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "-", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "0", bubbles: true }));
    expect(handle.getView().k).toBeCloseTo(1.84, 5);
  });
});

describe("controls", () => {
  it("fits when the fit button is clicked", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "-", bubbles: true }));
    (document.querySelector('[data-action="fit"]') as HTMLElement).click();
    expect(handle.getView().k).toBeCloseTo(1.84, 5);
  });

  it("toggles the theme attribute and persists the choice", () => {
    (document.querySelector('[data-action="theme"]') as HTMLElement).click();
    const first = document.documentElement.getAttribute("data-theme");
    expect(first === "dark" || first === "light").toBe(true);
    expect(localStorage.getItem("cv-theme")).toBe(first);
    (document.querySelector('[data-action="theme"]') as HTMLElement).click();
    expect(document.documentElement.getAttribute("data-theme")).not.toBe(first);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/viewer.test.ts`
Expected: FAIL — `initViewer` is not exported from `viewer/viewer.ts`.

- [ ] **Step 3: Write the implementation**

`viewer/viewer.ts` — replace the stub:

```ts
import { fit, frame, panBy, toCss, zoomAt } from "./transform";
import type { View } from "./transform";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Meta {
  bounds: Rect;
  defaultTheme: "system" | "light" | "dark";
  nodes: Record<string, Rect>;
}

const WHEEL_ZOOM_RATE = 0.0015;
const BUTTON_ZOOM_STEP = 1.25;
const THEME_KEY = "cv-theme";

export function initViewer(root: Document): { getView: () => View; destroy: () => void } {
  const metaEl = root.getElementById("cv-meta");
  const meta: Meta = JSON.parse(metaEl?.textContent ?? "{}");
  const viewport = root.getElementById("cv-viewport") as HTMLElement;
  const world = root.getElementById("cv-world") as HTMLElement;
  const win = root.defaultView as Window;

  let view: View = fit(meta.bounds, win.innerWidth, win.innerHeight);
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function apply(): void {
    world.style.transform = toCss(view);
  }

  function setView(next: View, animate = false): void {
    view = next;
    world.classList.toggle("cv-animating", animate);
    apply();
    if (animate) {
      win.setTimeout(() => world.classList.remove("cv-animating"), 360);
    }
  }

  function doFit(animate = false): void {
    setView(fit(meta.bounds, win.innerWidth, win.innerHeight), animate);
  }

  function zoomCentre(factor: number): void {
    setView(zoomAt(view, win.innerWidth / 2, win.innerHeight / 2, factor));
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      setView(zoomAt(view, event.clientX, event.clientY, Math.exp(-event.deltaY * WHEEL_ZOOM_RATE)));
    } else {
      setView(panBy(view, -event.deltaX, -event.deltaY));
    }
  }

  function onPointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && target.closest(".cv-card")) return;
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    viewport.classList.add("cv-grabbing");
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging) return;
    setView(panBy(view, event.clientX - lastX, event.clientY - lastY));
    lastX = event.clientX;
    lastY = event.clientY;
  }

  function onPointerUp(): void {
    dragging = false;
    viewport.classList.remove("cv-grabbing");
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "+" || event.key === "=") zoomCentre(BUTTON_ZOOM_STEP);
    else if (event.key === "-" || event.key === "_") zoomCentre(1 / BUTTON_ZOOM_STEP);
    else if (event.key === "0") doFit(true);
  }

  function onDoubleClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && target.closest(".cv-card")) return;
    doFit(true);
  }

  function currentTheme(): "light" | "dark" {
    const attr = root.documentElement.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") return attr;
    return win.matchMedia && win.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function toggleTheme(): void {
    const next = currentTheme() === "dark" ? "light" : "dark";
    root.documentElement.setAttribute("data-theme", next);
    try {
      win.localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage may be unavailable in a sandboxed file:// context */
    }
  }

  function onControlClick(event: MouseEvent): void {
    const button = (event.target as HTMLElement | null)?.closest("[data-action]");
    const action = button?.getAttribute("data-action");
    if (action === "zoom-in") zoomCentre(BUTTON_ZOOM_STEP);
    else if (action === "zoom-out") zoomCentre(1 / BUTTON_ZOOM_STEP);
    else if (action === "fit") doFit(true);
    else if (action === "theme") toggleTheme();
  }

  function onEdgeClick(event: MouseEvent): void {
    const group = (event.target as HTMLElement | null)?.closest(".cv-edge");
    if (!group) return;
    const from = meta.nodes[group.getAttribute("data-from") ?? ""];
    const to = meta.nodes[group.getAttribute("data-to") ?? ""];
    if (!from || !to) return;
    setView(frame([from, to], win.innerWidth, win.innerHeight), true);
  }

  function onResize(): void {
    apply();
  }

  const stored = (() => {
    try {
      return win.localStorage.getItem(THEME_KEY);
    } catch {
      return null;
    }
  })();
  if (stored === "light" || stored === "dark") {
    root.documentElement.setAttribute("data-theme", stored);
  }

  const controls = root.getElementById("cv-controls");
  viewport.addEventListener("wheel", onWheel, { passive: false });
  viewport.addEventListener("pointerdown", onPointerDown);
  viewport.addEventListener("dblclick", onDoubleClick);
  world.addEventListener("click", onEdgeClick);
  controls?.addEventListener("click", onControlClick);
  win.addEventListener("pointermove", onPointerMove);
  win.addEventListener("pointerup", onPointerUp);
  win.addEventListener("keydown", onKeyDown);
  win.addEventListener("resize", onResize);

  apply();

  return {
    getView: () => view,
    destroy(): void {
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("dblclick", onDoubleClick);
      world.removeEventListener("click", onEdgeClick);
      controls?.removeEventListener("click", onControlClick);
      win.removeEventListener("pointermove", onPointerMove);
      win.removeEventListener("pointerup", onPointerUp);
      win.removeEventListener("keydown", onKeyDown);
      win.removeEventListener("resize", onResize);
    },
  };
}

if (typeof document !== "undefined" && document.getElementById("cv-meta")) {
  initViewer(document);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/viewer.test.ts`
Expected: PASS, 14 tests. jsdom does not implement `PointerEvent`; the test
dispatches `MouseEvent` with the pointer event names, which is why the handlers
read only `clientX`/`clientY`/`target`. If TypeScript complains about the handler
signatures, keep the `PointerEvent` types and cast at the `addEventListener` call
site — do not loosen the test.

- [ ] **Step 5: Commit**

```bash
git add viewer/viewer.ts tests/viewer.test.ts
git commit -m "feat: add viewer runtime for zoom, pan, keyboard, and theme"
```

---

### Task 10: Viewer scroll handoff inside tall cards

**Files:**
- Modify: `viewer/viewer.ts` (extend `onWheel`)
- Test: `tests/viewer-scroll.test.ts`

**Interfaces:**
- Consumes: `initViewer` from `viewer/viewer.ts`
- Produces: no new exports. Behavior: a plain wheel over a `.cv-scrollable` card
  whose body can still scroll in the wheel's direction scrolls the card and does
  not pan; once the body is at its limit, the wheel pans instead.

- [ ] **Step 1: Write the failing test**

`tests/viewer-scroll.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initViewer } from "../viewer/viewer";

let handle: { getView: () => { x: number; y: number; k: number }; destroy: () => void };

function body(): HTMLElement {
  return document.querySelector('[data-id="a"] .cv-card-body') as HTMLElement;
}

/** jsdom reports 0 for all layout metrics, so scroll geometry is stubbed. */
function stubScroll(el: HTMLElement, scrollHeight: number, clientHeight: number): void {
  Object.defineProperty(el, "scrollHeight", { value: scrollHeight, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: clientHeight, configurable: true });
  let top = 0;
  Object.defineProperty(el, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (v: number) => {
      top = Math.max(0, Math.min(v, scrollHeight - clientHeight));
    },
  });
}

function wheelOn(el: Element, deltaY: number): void {
  el.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY }));
}

beforeEach(() => {
  document.documentElement.innerHTML = `
    <body>
      <div id="cv-viewport"><div id="cv-world">
        <div class="cv-card cv-card-text cv-scrollable" data-id="a"
             style="left:0px;top:0px;width:100px;height:100px">
          <div class="cv-card-body">tall</div>
        </div>
        <div class="cv-card cv-card-text" data-id="b"
             style="left:0px;top:0px;width:100px;height:100px">
          <div class="cv-card-body">short</div>
        </div>
      </div></div>
      <script type="application/json" id="cv-meta">
        {"bounds":{"x":0,"y":0,"width":100,"height":100},"defaultTheme":"system","nodes":{}}
      </script>
    </body>`;
  Object.defineProperty(window, "innerWidth", { value: 1000, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 1000, configurable: true });
  handle = initViewer(document);
});

afterEach(() => handle.destroy());

describe("scroll handoff", () => {
  it("scrolls a tall card instead of panning", () => {
    stubScroll(body(), 500, 100);
    const before = handle.getView();
    wheelOn(body(), 60);
    expect(body().scrollTop).toBe(60);
    expect(handle.getView()).toEqual(before);
  });

  it("pans once the card is scrolled to the bottom", () => {
    stubScroll(body(), 500, 100);
    body().scrollTop = 400; // at the limit
    const before = handle.getView();
    wheelOn(body(), 60);
    expect(handle.getView().y).toBe(before.y - 60);
  });

  it("pans when scrolling up at the top of the card", () => {
    stubScroll(body(), 500, 100);
    const before = handle.getView();
    wheelOn(body(), -60);
    expect(body().scrollTop).toBe(0);
    expect(handle.getView().y).toBe(before.y + 60);
  });

  it("pans over a card that is not scrollable", () => {
    const shortBody = document.querySelector('[data-id="b"] .cv-card-body') as HTMLElement;
    stubScroll(shortBody, 40, 100);
    const before = handle.getView();
    wheelOn(shortBody, 60);
    expect(handle.getView().y).toBe(before.y - 60);
  });

  it("zooms rather than scrolling when ctrl is held over a card", () => {
    stubScroll(body(), 500, 100);
    body().dispatchEvent(
      new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100, ctrlKey: true }),
    );
    expect(body().scrollTop).toBe(0);
    expect(handle.getView().k).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/viewer-scroll.test.ts`
Expected: FAIL — the wheel over the card pans instead of scrolling it.

- [ ] **Step 3: Write the implementation**

In `viewer/viewer.ts`, add this helper above `initViewer`:

```ts
function scrollableAncestor(target: EventTarget | null, deltaY: number): HTMLElement | null {
  const start = target as HTMLElement | null;
  const card = start?.closest?.(".cv-scrollable");
  if (!card) return null;
  const body = card.querySelector(".cv-card-body") as HTMLElement | null;
  if (!body) return null;
  const max = body.scrollHeight - body.clientHeight;
  if (max <= 0) return null;
  if (deltaY > 0 && body.scrollTop >= max - 0.5) return null;
  if (deltaY < 0 && body.scrollTop <= 0.5) return null;
  return body;
}
```

Then replace the `else` branch of `onWheel`:

```ts
  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      setView(zoomAt(view, event.clientX, event.clientY, Math.exp(-event.deltaY * WHEEL_ZOOM_RATE)));
      return;
    }
    const scrollable = scrollableAncestor(event.target, event.deltaY);
    if (scrollable) {
      scrollable.scrollTop += event.deltaY;
      return;
    }
    setView(panBy(view, -event.deltaX, -event.deltaY));
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run`
Expected: PASS — every suite, including the Task 9 viewer tests, still green.

- [ ] **Step 5: Commit**

```bash
git add viewer/viewer.ts tests/viewer-scroll.test.ts
git commit -m "feat: hand off wheel events between card scrolling and panning"
```

---

### Task 11: Obsidian adapters, settings, and the export command

**Files:**
- Create: `render-markdown.ts`, `settings.ts`, `settings-tab.ts`, `export-canvas.ts`
- Modify: `main.ts` (replace the Task 1 placeholder entirely)
- Test: `tests/export-canvas.test.ts`

**Interfaces:**
- Consumes: `parseCanvas`, `CanvasParseError` from `canvas-model.ts`; `resolveScene`, `ResolveDeps` from `resolve.ts`; `routeEdge`, `arrowheadPath` from `edges.ts`; `buildHtml`, `colorVarFor` from `serialize.ts`
- Produces:
  - `settings.ts`: `interface CanvasToHtmlSettings { outputFolder: string; maxImageDimension: number; imageQuality: number; sizeWarnThresholdMB: number; defaultTheme: "system" | "light" | "dark"; openAfterExport: boolean }` and `const DEFAULT_SETTINGS: CanvasToHtmlSettings`
  - `export-canvas.ts`: `function exportCanvas(json: string, title: string, deps: ResolveDeps, options: ExportOptions): Promise<{ html: string; warnings: string[] }>` where `interface ExportOptions { css: string; js: string; defaultTheme: "system" | "light" | "dark" }`
  - `render-markdown.ts`: `function createObsidianRenderer(app: App, component: Component): RendererLike`
  - `main.ts`: the plugin class wiring commands, menus, the size guard, and the Notice

`export-canvas.ts` holds the whole pure pipeline (parse → resolve → route edges →
serialize) so it is testable without Obsidian; `main.ts` only supplies the adapters.

- [ ] **Step 1: Write the failing test**

`tests/export-canvas.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/export-canvas.test.ts`
Expected: FAIL — cannot resolve `../export-canvas`.

- [ ] **Step 3: Write `export-canvas.ts`**

```ts
import { parseCanvas } from "./canvas-model";
import type { SceneEdge, SceneNode } from "./canvas-model";
import { arrowheadPath, routeEdge } from "./edges";
import { resolveScene } from "./resolve";
import type { ResolveDeps } from "./resolve";
import { buildHtml, colorVarFor } from "./serialize";
import type { RenderedEdge } from "./serialize";

export interface ExportOptions {
  css: string;
  js: string;
  defaultTheme: "system" | "light" | "dark";
}

export interface ExportResult {
  html: string;
  warnings: string[];
}

function renderEdge(edge: SceneEdge, byId: Map<string, SceneNode>): RenderedEdge | null {
  const from = byId.get(edge.fromNode);
  const to = byId.get(edge.toNode);
  if (!from || !to) return null;
  const geometry = routeEdge(from.rect, edge.fromSide, to.rect, edge.toSide);
  const arrows: string[] = [];
  if (edge.toEnd === "arrow") arrows.push(arrowheadPath(geometry.end, geometry.endAngle));
  if (edge.fromEnd === "arrow") {
    arrows.push(arrowheadPath(geometry.start, geometry.startAngle + Math.PI));
  }
  return {
    id: edge.id,
    fromNode: edge.fromNode,
    toNode: edge.toNode,
    path: geometry.path,
    arrowPaths: arrows,
    colorVar: colorVarFor(edge.color),
    label: edge.label,
  };
}

export async function exportCanvas(
  json: string,
  title: string,
  deps: ResolveDeps,
  options: ExportOptions,
): Promise<ExportResult> {
  const scene = parseCanvas(json);
  const { nodes, warnings } = await resolveScene(scene, deps);
  const byId = new Map(scene.nodes.map((n) => [n.id, n]));
  const edges = scene.edges
    .map((edge) => renderEdge(edge, byId))
    .filter((e): e is RenderedEdge => e !== null);

  const html = buildHtml({
    title,
    bounds: scene.bounds,
    nodes,
    edges,
    css: options.css,
    js: options.js,
    warnings,
    defaultTheme: options.defaultTheme,
  });

  return { html, warnings };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/export-canvas.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Write `settings.ts`**

```ts
export interface CanvasToHtmlSettings {
  outputFolder: string;
  maxImageDimension: number;
  imageQuality: number;
  sizeWarnThresholdMB: number;
  defaultTheme: "system" | "light" | "dark";
  openAfterExport: boolean;
}

export const DEFAULT_SETTINGS: CanvasToHtmlSettings = {
  outputFolder: "",
  maxImageDimension: 2000,
  imageQuality: 0.85,
  sizeWarnThresholdMB: 25,
  defaultTheme: "system",
  openAfterExport: false,
};
```

- [ ] **Step 6: Write `render-markdown.ts`**

Two things matter here: `MarkdownRenderer.render` needs a live `Component` to own
the rendered children, and the output must be sanitized before it leaves the app.

```ts
import { Component, MarkdownRenderer, sanitizeHTMLToDom } from "obsidian";
import type { App } from "obsidian";
import type { RendererLike } from "./resolve";

const STRIPPED_PROTOCOLS = /^(app|obsidian|javascript|data:text\/html):/i;

function scrubLinks(fragment: DocumentFragment): void {
  fragment.querySelectorAll("a").forEach((anchor) => {
    const href = anchor.getAttribute("href") ?? "";
    if (/^https?:\/\//i.test(href)) {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
      return;
    }
    // Internal or unsafe link: keep the text, drop the destination.
    anchor.removeAttribute("href");
    anchor.classList.add("cv-dead-link");
    if (href && !STRIPPED_PROTOCOLS.test(href)) anchor.setAttribute("title", href);
  });
  fragment.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") ?? "";
    if (!src.startsWith("data:image/")) img.remove();
  });
}

export function createObsidianRenderer(app: App, component: Component): RendererLike {
  return {
    async renderMarkdown(markdown: string, sourcePath: string): Promise<string> {
      const host = document.createElement("div");
      await MarkdownRenderer.render(app, markdown, host, sourcePath, component);
      const safe = sanitizeHTMLToDom(host.innerHTML);
      scrubLinks(safe);
      const wrapper = document.createElement("div");
      wrapper.appendChild(safe);
      return wrapper.innerHTML;
    },
  };
}
```

- [ ] **Step 7: Write `settings-tab.ts`**

```ts
import { PluginSettingTab, Setting } from "obsidian";
import type { App } from "obsidian";
import type CanvasToHtmlPlugin from "./main";

export class CanvasToHtmlSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: CanvasToHtmlPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Output folder")
      .setDesc("Vault-relative folder for exported files. Leave empty to write next to the canvas.")
      .addText((text) =>
        text
          .setPlaceholder("Exports")
          .setValue(this.plugin.settings.outputFolder)
          .onChange(async (value) => {
            this.plugin.settings.outputFolder = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Maximum image dimension")
      .setDesc("Images larger than this on their longest side are downscaled before inlining.")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.maxImageDimension)).onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          if (Number.isFinite(parsed) && parsed > 0) {
            this.plugin.settings.maxImageDimension = parsed;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl)
      .setName("Size warning threshold (MB)")
      .setDesc("Ask for confirmation before writing a file larger than this.")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.sizeWarnThresholdMB)).onChange(async (value) => {
          const parsed = Number.parseFloat(value);
          if (Number.isFinite(parsed) && parsed > 0) {
            this.plugin.settings.sizeWarnThresholdMB = parsed;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl)
      .setName("Default theme in the export")
      .addDropdown((drop) =>
        drop
          .addOption("system", "Follow the reader's system")
          .addOption("light", "Light")
          .addOption("dark", "Dark")
          .setValue(this.plugin.settings.defaultTheme)
          .onChange(async (value) => {
            this.plugin.settings.defaultTheme = value as "system" | "light" | "dark";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Open the file after exporting")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.openAfterExport).onChange(async (value) => {
          this.plugin.settings.openAfterExport = value;
          await this.plugin.saveSettings();
        }),
      );
  }
}
```

- [ ] **Step 8: Write `main.ts`**

```ts
import { Component, Menu, Notice, Plugin, TFile, normalizePath } from "obsidian";
import { CanvasParseError } from "./canvas-model";
import { fitWithin, pickEncoding, toDataUri } from "./assets";
import { exportCanvas } from "./export-canvas";
import { createObsidianRenderer } from "./render-markdown";
import { DEFAULT_SETTINGS } from "./settings";
import type { CanvasToHtmlSettings } from "./settings";
import { CanvasToHtmlSettingTab } from "./settings-tab";
import type { ImageProcessor, VaultLike } from "./resolve";

declare const __VIEWER_JS__: string;
declare const __VIEWER_CSS__: string;

export default class CanvasToHtmlPlugin extends Plugin {
  settings: CanvasToHtmlSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new CanvasToHtmlSettingTab(this.app, this));

    this.addCommand({
      id: "export-canvas-to-html",
      name: "Export canvas to HTML",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "canvas") return false;
        if (!checking) void this.exportFile(file);
        return true;
      },
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file) => {
        if (!(file instanceof TFile) || file.extension !== "canvas") return;
        menu.addItem((item) =>
          item
            .setTitle("Export canvas to HTML")
            .setIcon("file-code")
            .onClick(() => void this.exportFile(file)),
        );
      }),
    );
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private buildVaultAdapter(): VaultLike {
    const vault = this.app.vault;
    return {
      getFile(path: string) {
        const file = vault.getAbstractFileByPath(path);
        return file instanceof TFile ? { path: file.path, extension: file.extension } : null;
      },
      async readText(path: string) {
        const file = vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) throw new Error(`Not a file: ${path}`);
        return vault.cachedRead(file);
      },
      async readBinary(path: string) {
        const file = vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) throw new Error(`Not a file: ${path}`);
        return vault.readBinary(file);
      },
    };
  }

  private buildImageProcessor(): ImageProcessor {
    const quality = this.settings.imageQuality;
    return {
      async toInlineImage(bytes: ArrayBuffer, mime: string, maxDim: number): Promise<string> {
        if (mime === "image/svg+xml" || mime === "image/gif") return toDataUri(bytes, mime);

        const blob = new Blob([bytes], { type: mime });
        const bitmap = await createImageBitmap(blob);
        const target = fitWithin({ width: bitmap.width, height: bitmap.height }, maxDim);
        const encoding = pickEncoding(mime);
        if (target.width === bitmap.width && target.height === bitmap.height && encoding.mime === mime) {
          bitmap.close();
          return toDataUri(bytes, mime);
        }
        const canvas = document.createElement("canvas");
        canvas.width = target.width;
        canvas.height = target.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          bitmap.close();
          return toDataUri(bytes, mime);
        }
        ctx.drawImage(bitmap, 0, 0, target.width, target.height);
        bitmap.close();
        return canvas.toDataURL(encoding.mime, quality);
      },
    };
  }

  private async exportFile(file: TFile): Promise<void> {
    const component = new Component();
    component.load();
    try {
      const json = await this.app.vault.read(file);
      const { html, warnings } = await exportCanvas(
        json,
        file.basename,
        {
          vault: this.buildVaultAdapter(),
          renderer: createObsidianRenderer(this.app, component),
          images: this.buildImageProcessor(),
          maxImageDimension: this.settings.maxImageDimension,
        },
        {
          css: __VIEWER_CSS__,
          js: __VIEWER_JS__,
          defaultTheme: this.settings.defaultTheme,
        },
      );

      const sizeMB = new Blob([html]).size / (1024 * 1024);
      if (sizeMB > this.settings.sizeWarnThresholdMB) {
        const proceed = window.confirm(
          `This export is ${sizeMB.toFixed(1)} MB, over the ${this.settings.sizeWarnThresholdMB} MB ` +
            `threshold. Write it anyway?`,
        );
        if (!proceed) {
          new Notice("Export cancelled.");
          return;
        }
      }

      const folder = this.settings.outputFolder || (file.parent?.path ?? "");
      const outPath = normalizePath(`${folder ? `${folder}/` : ""}${file.basename}.html`);
      const existing = this.app.vault.getAbstractFileByPath(outPath);
      if (existing instanceof TFile) {
        await this.app.vault.modify(existing, html);
      } else {
        await this.app.vault.create(outPath, html);
      }

      if (warnings.length > 0) {
        console.warn(`[canvas-to-html] ${warnings.length} warning(s):`, warnings);
      }
      new Notice(
        `Exported ${outPath}` + (warnings.length > 0 ? ` — ${warnings.length} warning(s), see console` : ""),
      );

      if (this.settings.openAfterExport) {
        const created = this.app.vault.getAbstractFileByPath(outPath);
        if (created instanceof TFile) await this.app.workspace.getLeaf(true).openFile(created);
      }
    } catch (error) {
      const message =
        error instanceof CanvasParseError
          ? error.message
          : `Export failed: ${(error as Error).message}`;
      console.error("[canvas-to-html]", error);
      new Notice(message);
    } finally {
      component.unload();
    }
  }
}
```

- [ ] **Step 9: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: all suites PASS; `tsc --noEmit` reports no errors; `main.js` is written.

- [ ] **Step 10: Commit**

```bash
git add render-markdown.ts settings.ts settings-tab.ts export-canvas.ts main.ts tests/export-canvas.test.ts
git commit -m "feat: wire the export command, settings, and Obsidian adapters"
```

---

### Task 12: Golden-file test, docs, and the manual checklist

**Files:**
- Create: `tests/fixtures/sample.canvas`, `tests/golden.test.ts`, `README.md`, `MANUAL-VERIFICATION.md`, `LICENSE`
- Test: `tests/golden.test.ts`

**Interfaces:**
- Consumes: `exportCanvas` from `export-canvas.ts`
- Produces: a committed snapshot at `tests/__snapshots__/golden.test.ts.snap`

- [ ] **Step 1: Create the fixture**

`tests/fixtures/sample.canvas`:

```json
{
  "nodes": [
    { "id": "grp", "type": "group", "x": -60, "y": -80, "width": 700, "height": 400, "label": "Phase 1", "color": "5" },
    { "id": "t1", "type": "text", "x": 0, "y": 0, "width": 220, "height": 120, "text": "# Kickoff\n\n- [ ] scope\n- [x] budget", "color": "4" },
    { "id": "f1", "type": "file", "x": 400, "y": 0, "width": 240, "height": 160, "file": "Notes/Brief.md" },
    { "id": "img", "type": "file", "x": 0, "y": 200, "width": 200, "height": 120, "file": "Assets/Chart.png" },
    { "id": "pdf", "type": "file", "x": 400, "y": 200, "width": 200, "height": 120, "file": "Papers/Study.pdf" },
    { "id": "url", "type": "link", "x": 700, "y": 0, "width": 240, "height": 120, "url": "https://obsidian.md/canvas" },
    { "id": "gone", "type": "file", "x": 700, "y": 200, "width": 200, "height": 120, "file": "Nowhere/Lost.md" }
  ],
  "edges": [
    { "id": "e1", "fromNode": "t1", "fromSide": "right", "toNode": "f1", "toSide": "left" },
    { "id": "e2", "fromNode": "t1", "fromSide": "bottom", "toNode": "img", "toSide": "top", "color": "1" },
    { "id": "e3", "fromNode": "f1", "fromSide": "right", "toNode": "url", "toSide": "left", "fromEnd": "arrow" }
  ]
}
```

- [ ] **Step 2: Write the golden test**

`tests/golden.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test to generate and inspect the snapshot**

Run: `npx vitest run tests/golden.test.ts`
Expected: PASS with `1 snapshot written`. **Read the generated
`tests/__snapshots__/golden.test.ts.snap` before committing it.** Confirm: the
group card appears before the content cards, the PDF and missing-file nodes are
placeholders, the image carries the stub data URI, the URL card has
`rel="noopener noreferrer"`, and all three edges have paths.

- [ ] **Step 4: Write `README.md`**

````markdown
# Canvas to HTML

Export an Obsidian Canvas to a single self-contained HTML file you can email, drop
in a folder, or open on any machine. The exported file zooms and pans the way the
canvas does inside Obsidian. No server, no network requests, no dependencies.

## Usage

Open a canvas and run **Export canvas to HTML** from the command palette, or
right-click a `.canvas` file in the file explorer. The `.html` file is written
next to the canvas unless you set an output folder in settings.

## In the exported file

| Input | Action |
|---|---|
| Two-finger scroll / wheel | Pan |
| Ctrl/⌘ + wheel, trackpad pinch | Zoom at the pointer |
| Drag empty space | Pan |
| `+` / `-` | Zoom in / out |
| `0`, double-click empty space | Fit to screen |
| Click an edge | Frame both of its endpoints |

Cards taller than their frame scroll internally. The corner buttons zoom, fit, and
toggle light/dark.

## What gets exported

Text cards and embedded Markdown notes are rendered to real HTML, one level deep.
Images are downscaled and inlined as data URIs. PDFs and web-link cards become
labeled placeholder cards — PDF bytes are never inlined and no iframes are
embedded, which keeps the file portable and safe to open offline.

## Development

```bash
npm install
npm run dev     # watch build
npm test        # vitest
npm run build   # typecheck + production bundle
```

Two bundles are produced: the plugin (`main.js`) and the viewer runtime, which is
inlined into the plugin as a string at build time.

To test in a vault, copy `main.js`, `manifest.json`, and `styles.css` (if present)
into `<vault>/.obsidian/plugins/canvas-to-html/`. Do not symlink into an iCloud
vault — iCloud does not sync symlinks reliably.
````

- [ ] **Step 5: Write `MANUAL-VERIFICATION.md`**

```markdown
# Manual Verification

Automated tests cover the pure pipeline and the viewer's event handling in jsdom.
These checks need real Obsidian and a real browser.

## Export in Obsidian

- [ ] Command palette shows "Export canvas to HTML" only when a canvas is active.
- [ ] Right-clicking a `.canvas` file in the file explorer offers the same command.
- [ ] The file lands next to the canvas; setting an output folder redirects it.
- [ ] Exporting the same canvas twice overwrites rather than erroring.
- [ ] A canvas containing a missing file exports, and the Notice mentions warnings.
- [ ] The warnings appear in the developer console and in a comment at the top of the file.

## Rendering fidelity

- [ ] Headings, lists, tables, blockquotes, and inline code match Obsidian closely.
- [ ] Task checkboxes render checked/unchecked correctly.
- [ ] Callouts keep their title and left border.
- [ ] A math block renders (or degrades legibly — record which).
- [ ] A Mermaid block renders (or degrades legibly — record which).
- [ ] Wikilinks to non-exported notes are dotted, non-clickable, and show the target on hover.
- [ ] An embedded image appears at the right size and is visibly compressed only if large.
- [ ] A PDF node shows the placeholder, not an embedded viewer.
- [ ] A URL card opens the site in a new tab.
- [ ] Group labels sit above their group rect, and groups render behind cards.
- [ ] All six preset node colours are distinguishable, in both themes.

## Viewer behavior

- [ ] Opens fitted to the whole canvas.
- [ ] Two-finger scroll pans; ctrl/⌘+wheel zooms at the pointer.
- [ ] Trackpad pinch zooms (macOS Safari, Chrome, Firefox).
- [ ] Dragging empty space pans; dragging inside a card does not.
- [ ] `+`, `-`, `0` work; double-clicking empty space refits.
- [ ] A tall card scrolls internally; the page pans once it hits the end.
- [ ] Clicking an edge frames both endpoints with a smooth animation.
- [ ] The theme button toggles and the choice survives a reload.
- [ ] With no `data-theme` set, the file follows the OS appearance setting.

## Performance and portability

- [ ] A canvas with 200+ nodes pans and zooms without visible stutter.
- [ ] Opening the exported file with Wi-Fi off shows no missing content.
- [ ] The browser devtools Network tab shows zero requests after load.
- [ ] The file opens correctly in Safari, Chrome, and Firefox.
- [ ] The size-threshold confirmation appears for an image-heavy canvas over 25 MB.
```

- [ ] **Step 6: Add `LICENSE`**

Copy an MIT license text with `Copyright (c) 2026 朱劭恩`.

- [ ] **Step 7: Run the full suite and build one final time**

Run: `npm test && npm run build`
Expected: all suites PASS, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add tests/fixtures tests/golden.test.ts tests/__snapshots__ README.md MANUAL-VERIFICATION.md LICENSE
git commit -m "test: add golden-file export snapshot; docs: README and manual checklist"
```

---

## Self-Review Notes

**Spec coverage:** command in three places (T11); one self-contained file (T6, T11);
text/file/image/PDF/URL/group node rules (T7); wikilink and external-link handling
(T11 `scrubLinks`); image downscale and dedupe (T5, T7); sanitization (T11);
static DOM in canvas coordinates with one transform (T6, T9); the full input table
(T9, T10); card scroll handoff (T10); edge framing (T9); both themes with a toggle
(T8, T9); per-node failure degradation and the warnings path (T7, T11); parse error
as the only abort (T2, T11); size guard (T11); every setting (T11); unit, golden,
jsdom, and manual test layers (T2–T12).

**One deviation from the spec, deliberate:** the spec listed a `--cv-edge-color`
and colour mapping but not an edge hit area; `.cv-edge-hit` (a 14px transparent
stroke) is added in T6/T8 because clicking a 2.5px curve to frame its endpoints is
otherwise impractical.
