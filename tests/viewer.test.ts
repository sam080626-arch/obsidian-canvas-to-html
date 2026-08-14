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
