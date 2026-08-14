import { Component, MarkdownRenderer, sanitizeHTMLToDom } from "obsidian";
import type { App } from "obsidian";
import type { RendererLike } from "./resolve";

const STRIPPED_PROTOCOLS = /^(app|obsidian|javascript|data:text\/html):/i;

function scrubLinks(fragment: DocumentFragment): void {
  fragment.querySelectorAll("a").forEach((anchor) => {
    const href = anchor.getAttribute("href") ?? "";
    if (/^https?:\/\//i.test(href)) {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
      return;
    }
    // Internal or unsafe link: keep the text, drop the destination.
    anchor.removeAttribute("href");
    anchor.classList.add("cv-dead-link");
    if (href && !STRIPPED_PROTOCOLS.test(href)) anchor.setAttribute("title", href);
  });
  fragment.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") ?? "";
    if (!src.startsWith("data:image/")) img.remove();
  });
}

export function createObsidianRenderer(app: App, component: Component): RendererLike {
  return {
    async renderMarkdown(markdown: string, sourcePath: string): Promise<string> {
      const host = document.createElement("div");
      await MarkdownRenderer.render(app, markdown, host, sourcePath, component);
      const safe = sanitizeHTMLToDom(host.innerHTML);
      scrubLinks(safe);
      const wrapper = document.createElement("div");
      wrapper.appendChild(safe);
      return wrapper.innerHTML;
    },
  };
}
