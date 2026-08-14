import { Component, MarkdownRenderer, sanitizeHTMLToDom } from "obsidian";
import type { App } from "obsidian";
import { cleanRendered, hasPendingAsyncContent } from "./clean-rendered";
import type { RendererLike } from "./resolve";

/**
 * Obsidian fills math, image embeds, and diagrams in asynchronously, after
 * `MarkdownRenderer.render` resolves. Snapshotting `innerHTML` immediately
 * therefore captures empty placeholders, so wait for them to settle first.
 */
const SETTLE_POLL_MS = 25;
const SETTLE_TIMEOUT_MS = 750;

async function waitForAsyncContent(host: HTMLElement): Promise<void> {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  while (hasPendingAsyncContent(host) && Date.now() < deadline) {
    await new Promise((resolve) => window.setTimeout(resolve, SETTLE_POLL_MS));
  }
}

export interface EmbedResolver {
  /** Vault link text (e.g. "Chart.png") → data URI, or null when unavailable. */
  resolveEmbed(linktext: string, sourcePath: string): Promise<string | null>;
}

export function createObsidianRenderer(
  app: App,
  component: Component,
  embeds: EmbedResolver,
  warnings: string[],
): RendererLike {
  return {
    async renderMarkdown(markdown: string, sourcePath: string): Promise<string> {
      // The host must be in the document: Obsidian skips async sub-rendering for
      // detached nodes. It is kept invisible and removed in the finally block.
      const host = document.createElement("div");
      host.addClass("markdown-rendered");
      host.style.cssText = "position:absolute;left:-9999px;top:0;width:700px;visibility:hidden";
      document.body.appendChild(host);
      try {
        await MarkdownRenderer.render(app, markdown, host, sourcePath, component);
        await waitForAsyncContent(host);

        const safe = sanitizeHTMLToDom(host.innerHTML);
        const wrapper = document.createElement("div");
        wrapper.appendChild(safe);
        warnings.push(
          ...(await cleanRendered(wrapper, {
            resolveEmbed: (linktext) => embeds.resolveEmbed(linktext, sourcePath),
          })),
        );
        return wrapper.innerHTML;
      } finally {
        host.remove();
      }
    },
  };
}
