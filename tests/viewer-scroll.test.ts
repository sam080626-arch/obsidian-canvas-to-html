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
