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
