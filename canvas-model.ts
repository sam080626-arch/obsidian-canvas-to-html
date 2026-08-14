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
