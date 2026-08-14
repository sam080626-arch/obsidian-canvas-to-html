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
    // x spans -50..750 (the group is widest), y spans -50..350, padded by 80
    expect(scene.bounds).toEqual({ x: -130, y: -130, width: 960, height: 560 });
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
