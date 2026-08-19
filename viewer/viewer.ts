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

/**
 * The card body under `target` that can still absorb `deltaY`, or null when the
 * wheel should pan the canvas instead.
 */
function scrollableAncestor(target: EventTarget | null, deltaY: number): HTMLElement | null {
  const start = target as HTMLElement | null;
  const card = start?.closest?.(".cv-scrollable");
  if (!card) return null;
  const body = card.querySelector<HTMLElement>(".cv-card-body");
  if (!body) return null;
  const max = body.scrollHeight - body.clientHeight;
  if (max <= 0) return null;
  if (deltaY > 0 && body.scrollTop >= max - 0.5) return null;
  if (deltaY < 0 && body.scrollTop <= 0.5) return null;
  return body;
}

export function initViewer(root: Document): { getView: () => View; destroy: () => void } {
  const metaEl = root.getElementById("cv-meta");
  const meta = JSON.parse(metaEl?.textContent ?? "{}") as Meta;
  const viewport = root.getElementById("cv-viewport") as HTMLElement;
  const world = root.getElementById("cv-world") as HTMLElement;
  const win = root.defaultView as Window;

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  // While false, a resize refits. The reader's own zoom/pan wins over that.
  let userAdjusted = false;

  /**
   * The viewport's laid-out box, falling back to the window. Reading the element
   * matters because the window can still report 0 when the document is laid out
   * after load (background tab, restored session), and fitting against 0 would
   * collapse the canvas to the minimum scale.
   */
  function viewportSize(): { w: number; h: number } {
    return {
      w: viewport.clientWidth || win.innerWidth || 0,
      h: viewport.clientHeight || win.innerHeight || 0,
    };
  }

  let view: View = fit(meta.bounds, viewportSize().w, viewportSize().h);

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

  /** A view the reader chose; resizing must not throw it away. */
  function setUserView(next: View, animate = false): void {
    userAdjusted = true;
    setView(next, animate);
  }

  function doFit(animate = false): void {
    const { w, h } = viewportSize();
    userAdjusted = false;
    setView(fit(meta.bounds, w, h), animate);
  }

  function zoomCentre(factor: number): void {
    const { w, h } = viewportSize();
    setUserView(zoomAt(view, w / 2, h / 2, factor));
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      setUserView(zoomAt(view, event.clientX, event.clientY, Math.exp(-event.deltaY * WHEEL_ZOOM_RATE)));
      return;
    }
    const scrollable = scrollableAncestor(event.target, event.deltaY);
    if (scrollable) {
      scrollable.scrollTop += event.deltaY;
      return;
    }
    setUserView(panBy(view, -event.deltaX, -event.deltaY));
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
    setUserView(panBy(view, event.clientX - lastX, event.clientY - lastY));
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
    const { w, h } = viewportSize();
    setUserView(frame([from, to], w, h), true);
  }

  function onResize(): void {
    if (userAdjusted) {
      apply();
      return;
    }
    doFit();
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

  // Browsers restore per-element scroll offsets on reload and bfcache restore, so
  // a card can open part-way down its content. Every card starts at the top.
  root.querySelectorAll(".cv-card-body").forEach((body) => {
    (body as HTMLElement).scrollTop = 0;
  });

  const controls = root.getElementById("cv-controls");
  viewport.addEventListener("wheel", onWheel as EventListener, { passive: false });
  viewport.addEventListener("pointerdown", onPointerDown as EventListener);
  viewport.addEventListener("dblclick", onDoubleClick as EventListener);
  world.addEventListener("click", onEdgeClick as EventListener);
  controls?.addEventListener("click", onControlClick as EventListener);
  win.addEventListener("pointermove", onPointerMove as EventListener);
  win.addEventListener("pointerup", onPointerUp as EventListener);
  win.addEventListener("keydown", onKeyDown as EventListener);
  win.addEventListener("resize", onResize as EventListener);

  apply();

  return {
    getView: () => view,
    destroy(): void {
      viewport.removeEventListener("wheel", onWheel as EventListener);
      viewport.removeEventListener("pointerdown", onPointerDown as EventListener);
      viewport.removeEventListener("dblclick", onDoubleClick as EventListener);
      world.removeEventListener("click", onEdgeClick as EventListener);
      controls?.removeEventListener("click", onControlClick as EventListener);
      win.removeEventListener("pointermove", onPointerMove as EventListener);
      win.removeEventListener("pointerup", onPointerUp as EventListener);
      win.removeEventListener("keydown", onKeyDown as EventListener);
      win.removeEventListener("resize", onResize as EventListener);
    },
  };
}

if (typeof document !== "undefined" && document.getElementById("cv-meta")) {
  initViewer(document);
}
