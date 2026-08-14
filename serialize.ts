import type { CanvasRect, NodeKind } from "./canvas-model";

export interface RenderedNode {
  id: string;
  kind: NodeKind;
  rect: CanvasRect;
  colorVar: string | null;
  html: string;
  scrollable: boolean;
  /** The body supplies its own padding (image, placeholder, link card). */
  flush: boolean;
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
  if (node.flush) classes.push("cv-flush");
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
