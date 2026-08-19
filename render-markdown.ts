import {
  Component,
  MarkdownRenderer,
  finishRenderMath,
  loadMathJax,
  sanitizeHTMLToDom,
} from "obsidian";
import type { App } from "obsidian";
import { cleanRendered, hasPendingAsyncContent, reattachRenderedMath } from "./clean-rendered";
import { extractMathSources, sanitizeMathJaxCss } from "./math";
import type { RendererLike } from "./resolve";

/**
 * Obsidian fills math, image embeds, and diagrams in asynchronously, after
 * `MarkdownRenderer.render` resolves. Snapshotting `innerHTML` immediately
 * therefore captures empty placeholders, so wait for them to settle first.
 */
const SETTLE_POLL_MS = 25;
const SETTLE_TIMEOUT_MS = 750;

/** MathJax's generated stylesheet, injected into the app document on first use. */
const MATHJAX_STYLE_IDS = ["MJX-CHTML-styles", "MJX-SVG-styles"];

async function waitForAsyncContent(host: HTMLElement): Promise<void> {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  while (hasPendingAsyncContent(host) && Date.now() < deadline) {
    await new Promise((resolve) => window.setTimeout(resolve, SETTLE_POLL_MS));
  }
}

function collectMathJaxCss(): string {
  for (const id of MATHJAX_STYLE_IDS) {
    const style = document.getElementById(id);
    const css = style?.textContent?.trim();
    if (css) return sanitizeMathJaxCss(css);
  }
  return "";
}

export interface EmbedResolver {
  /** Vault link text (e.g. "Chart.png") → data URI, or null when unavailable. */
  resolveEmbed(linktext: string, sourcePath: string): Promise<string | null>;
}

export interface RendererCollectors {
  warnings: string[];
  /** MathJax CSS is appended here once, and folded into the export's stylesheet. */
  css: string[];
}

export function createObsidianRenderer(
  app: App,
  component: Component,
  embeds: EmbedResolver,
  collect: RendererCollectors,
): RendererLike {
  return {
    async renderMarkdown(markdown: string, sourcePath: string): Promise<string> {
      const mathSources = extractMathSources(markdown);

      // MathJax is loaded lazily. Without this, the first card containing math
      // is snapshotted before MathJax exists and the formula exports empty.
      if (mathSources.length > 0) {
        try {
          await loadMathJax();
        } catch {
          /* fall through: the TeX source fallback covers this */
        }
      }

      // The host must be in the document: Obsidian skips async sub-rendering for
      // detached nodes. It is kept invisible and removed in the finally block.
      const host = createDiv({ cls: ["markdown-rendered", "canvas-to-html-render-host"] });
      document.body.appendChild(host);
      try {
        await MarkdownRenderer.render(app, markdown, host, sourcePath, component);
        if (mathSources.length > 0) {
          try {
            await finishRenderMath();
          } catch {
            /* as above */
          }
        }
        await waitForAsyncContent(host);

        const mathCss = collectMathJaxCss();
        if (mathCss && !collect.css.includes(mathCss)) collect.css.push(mathCss);

        const safe = sanitizeHTMLToDom(host.innerHTML);
        const wrapper = createDiv();
        wrapper.appendChild(safe);

        // Obsidian's sanitizer drops MathJax's custom elements, so rendered math
        // is carried over from the host separately, under its own allowlist.
        reattachRenderedMath(host, wrapper);
        collect.warnings.push(
          ...(await cleanRendered(wrapper, {
            resolveEmbed: (linktext) => embeds.resolveEmbed(linktext, sourcePath),
            mathSources,
          })),
        );
        return wrapper.innerHTML;
      } finally {
        host.remove();
      }
    },
  };
}
