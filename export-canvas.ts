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
  /**
   * A live array the renderer appends to while nodes are resolved. It is read
   * after resolution and before serialization, so late warnings still reach the
   * exported file. Duplicates are collapsed — one warning per distinct message,
   * not per card.
   */
  collectedWarnings?: string[];
  /**
   * CSS the renderer appends while nodes are resolved (currently MathJax's
   * generated stylesheet), folded into the exported document's <style>.
   */
  collectedCss?: string[];
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
  const { nodes, warnings: resolveWarnings } = await resolveScene(scene, deps);
  const warnings = [...resolveWarnings, ...new Set(options.collectedWarnings ?? [])];
  const byId = new Map(scene.nodes.map((n) => [n.id, n]));
  const edges = scene.edges
    .map((edge) => renderEdge(edge, byId))
    .filter((e): e is RenderedEdge => e !== null);

  const html = buildHtml({
    title,
    bounds: scene.bounds,
    nodes,
    edges,
    css: [options.css, ...new Set(options.collectedCss ?? [])].join("\n"),
    js: options.js,
    warnings,
    defaultTheme: options.defaultTheme,
  });

  return { html, warnings };
}
