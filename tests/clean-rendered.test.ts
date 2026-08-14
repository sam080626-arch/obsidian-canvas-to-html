// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { cleanRendered, hasPendingAsyncContent } from "../clean-rendered";

function host(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

const noEmbeds = { resolveEmbed: async () => null };

describe("hasPendingAsyncContent", () => {
  it("reports an empty math span as pending", () => {
    expect(hasPendingAsyncContent(host('<span class="math math-inline"></span>'))).toBe(true);
  });

  it("reports a filled math span as settled", () => {
    expect(
      hasPendingAsyncContent(host('<span class="math"><mjx-container>x</mjx-container></span>')),
    ).toBe(false);
  });

  it("reports an image embed with no img as pending", () => {
    expect(hasPendingAsyncContent(host('<span class="internal-embed image-embed"></span>'))).toBe(true);
  });

  it("reports plain content as settled", () => {
    expect(hasPendingAsyncContent(host("<p>hello</p>"))).toBe(false);
  });
});

describe("cleanRendered — dead app UI", () => {
  it("removes the code-block copy button", async () => {
    const el = host('<pre><code>x</code><button class="copy-code-button"><svg></svg></button></pre>');
    await cleanRendered(el, noEmbeds);
    expect(el.querySelector(".copy-code-button")).toBeNull();
    expect(el.querySelector("code")?.textContent).toBe("x");
  });

  it("keeps the mermaid source and drops the vault-trust prompt", async () => {
    const el = host(
      '<div class="mermaid-wrapper is-guarded">' +
        '<div class="mermaid-guard-header"><div class="mermaid-guard-title">Display Mermaid diagrams?</div>' +
        "<button>Allow</button></div>" +
        '<div class="mermaid-guard-source"><pre class="language-mermaid"><code>graph LR</code></pre></div>' +
        "</div>",
    );
    const warnings = await cleanRendered(el, noEmbeds);
    expect(el.querySelector(".mermaid-guard-header")).toBeNull();
    expect(el.querySelector("button")).toBeNull();
    expect(el.textContent).toContain("graph LR");
    expect(warnings.join()).toMatch(/Mermaid/i);
  });

  it("removes an empty callout icon but keeps the callout", async () => {
    const el = host(
      '<div class="callout" data-callout="note"><div class="callout-title">' +
        '<div class="callout-icon"><svg height="16" width="16"></svg></div>' +
        '<div class="callout-title-inner">Title</div></div>' +
        '<div class="callout-content"><p>Body</p></div></div>',
    );
    await cleanRendered(el, noEmbeds);
    expect(el.querySelector(".callout-icon")).toBeNull();
    expect(el.querySelector(".callout-title-inner")?.textContent).toBe("Title");
    expect(el.querySelector(".callout")?.getAttribute("data-callout")).toBe("note");
  });

  it("drops any leftover button or input that is not a task checkbox", async () => {
    const el = host(
      '<p><button>Click</button><input type="text"><input type="checkbox" class="task-list-item-checkbox"></p>',
    );
    await cleanRendered(el, noEmbeds);
    expect(el.querySelector("button")).toBeNull();
    expect(el.querySelector('input[type="text"]')).toBeNull();
    expect(el.querySelector(".task-list-item-checkbox")).not.toBeNull();
  });

  it("disables task checkboxes so the export is read-only", async () => {
    const el = host('<input type="checkbox" class="task-list-item-checkbox" checked>');
    await cleanRendered(el, noEmbeds);
    const box = el.querySelector("input") as HTMLInputElement;
    expect(box.hasAttribute("disabled")).toBe(true);
    expect(box.hasAttribute("checked")).toBe(true);
  });

  it("replaces an unrendered math element with its source when available", async () => {
    const el = host('<span class="math math-inline" data-tex="e^{i\\pi}"></span>');
    const warnings = await cleanRendered(el, noEmbeds);
    expect(el.textContent).toContain("e^{i\\pi}");
    expect(warnings.join()).toMatch(/math/i);
  });

  it("removes an unrendered math element that carries no source", async () => {
    const el = host('<p>a<span class="math math-inline"></span>b</p>');
    const warnings = await cleanRendered(el, noEmbeds);
    expect(el.querySelector(".math")).toBeNull();
    expect(warnings.join()).toMatch(/math/i);
  });

  it("falls back to the TeX source for an unrendered formula", async () => {
    const el = host('<p>a<span class="math math-inline"></span>b</p>');
    await cleanRendered(el, { ...noEmbeds, mathSources: ["e^{i\\pi}"] });
    expect(el.querySelector(".cv-math-source")?.textContent).toBe("e^{i\\pi}");
  });

  it("matches fallbacks to formulas by position, skipping rendered ones", async () => {
    const el = host(
      '<span class="math"><mjx-container>ok</mjx-container></span>' +
        '<span class="math math-block"></span>',
    );
    await cleanRendered(el, { ...noEmbeds, mathSources: ["first", "second"] });
    // The first formula rendered; the fallback must be the *second* source.
    expect(el.querySelector(".cv-math-source")?.textContent).toBe("second");
  });

  it("keeps rendered math untouched", async () => {
    const el = host('<span class="math"><mjx-container>rendered</mjx-container></span>');
    await cleanRendered(el, noEmbeds);
    expect(el.textContent).toBe("rendered");
  });
});

describe("cleanRendered — links", () => {
  it("marks an internal link dead but keeps its text and target as a tooltip", async () => {
    const el = host('<a class="internal-link" data-href="Some Note" href="Some Note">Some Note</a>');
    await cleanRendered(el, noEmbeds);
    const a = el.querySelector("a") as HTMLAnchorElement;
    expect(a.hasAttribute("href")).toBe(false);
    expect(a.hasAttribute("target")).toBe(false);
    expect(a.classList.contains("cv-dead-link")).toBe(true);
    expect(a.getAttribute("title")).toBe("Some Note");
    expect(a.textContent).toBe("Some Note");
  });

  it("keeps an external link clickable and safe", async () => {
    const el = host('<a href="https://example.com">site</a>');
    await cleanRendered(el, noEmbeds);
    const a = el.querySelector("a") as HTMLAnchorElement;
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("strips a javascript: link entirely", async () => {
    const el = host('<a href="javascript:alert(1)">x</a>');
    await cleanRendered(el, noEmbeds);
    expect(el.innerHTML).not.toContain("javascript:");
    expect((el.querySelector("a") as HTMLAnchorElement).hasAttribute("href")).toBe(false);
  });
});

describe("cleanRendered — images", () => {
  it("inlines a wikilink image embed through the resolver", async () => {
    const el = host(
      '<span class="internal-embed image-embed" src="Chart.png" alt="Chart"><img src="app://abc/Chart.png"></span>',
    );
    const resolveEmbed = vi.fn().mockResolvedValue("data:image/png;base64,AAA");
    await cleanRendered(el, { resolveEmbed });
    expect(resolveEmbed).toHaveBeenCalledWith("Chart.png");
    const img = el.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("data:image/png;base64,AAA");
  });

  it("keeps an image that is already a data URI", async () => {
    const el = host('<img src="data:image/png;base64,AAA">');
    await cleanRendered(el, noEmbeds);
    expect(el.querySelector("img")).not.toBeNull();
  });

  it("removes an app:// image the resolver cannot inline, and warns", async () => {
    const el = host('<span class="internal-embed image-embed" src="Gone.png"><img src="app://abc/Gone.png"></span>');
    const warnings = await cleanRendered(el, { resolveEmbed: async () => null });
    expect(el.querySelector("img")).toBeNull();
    expect(warnings.join()).toContain("Gone.png");
  });

  it("strips inline event handlers from surviving elements", async () => {
    const el = host('<p onclick="steal()">text</p><img src="data:image/png;base64,AAA" onerror="steal()">');
    await cleanRendered(el, noEmbeds);
    expect(el.innerHTML).not.toContain("onclick");
    expect(el.innerHTML).not.toContain("onerror");
  });
});
