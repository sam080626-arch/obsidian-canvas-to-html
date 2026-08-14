/**
 * Post-processing for HTML that came out of Obsidian's markdown renderer.
 *
 * The renderer emits markup meant for the running app: interactive chrome
 * (copy-code buttons, the Mermaid vault-trust prompt), icon slots the app fills
 * from its own sprite sheet, `app://` image URLs that mean nothing elsewhere, and
 * elements whose contents arrive asynchronously. None of that survives a trip out
 * of the vault, so it is stripped or resolved here.
 *
 * Kept free of any `obsidian` import so it can be tested in jsdom.
 */

export interface CleanOptions {
  /** Resolve an embed's link text (e.g. "Chart.png") to a data URI, or null. */
  resolveEmbed(linktext: string): Promise<string | null>;
}

/** Selectors whose emptiness means an async sub-renderer has not finished. */
const PENDING_SELECTORS = [".math", ".internal-embed.image-embed"];

const EXTERNAL = /^https?:\/\//i;

export function hasPendingAsyncContent(root: ParentNode): boolean {
  for (const selector of PENDING_SELECTORS) {
    for (const el of Array.from(root.querySelectorAll(selector))) {
      if (el.children.length === 0 && !el.textContent?.trim()) return true;
    }
  }
  return false;
}

function stripEventHandlers(root: ParentNode): void {
  for (const el of Array.from(root.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
    }
  }
}

function removeDeadChrome(root: ParentNode, warnings: string[]): void {
  root.querySelectorAll(".copy-code-button").forEach((el) => el.remove());
  root.querySelectorAll(".callout-icon").forEach((el) => el.remove());
  root.querySelectorAll(".collapse-indicator, .heading-collapse-indicator").forEach((el) => el.remove());

  // Mermaid renders only after the reader trusts the vault, so an untrusted vault
  // produces a prompt wrapped around the source. Keep the source, drop the prompt.
  const guards = root.querySelectorAll(".mermaid-wrapper.is-guarded, .mermaid-guard-header");
  if (guards.length > 0) {
    warnings.push(
      "Mermaid diagrams were not rendered (the vault is not trusted in Obsidian); " +
        "their source is exported as a code block instead.",
    );
  }
  root.querySelectorAll(".mermaid-guard-header").forEach((el) => el.remove());
  root.querySelectorAll(".mermaid-guard-source").forEach((el) => {
    const parent = el.parentElement;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    el.remove();
  });

  // Anything still interactive is inert in the export; task checkboxes are the
  // one exception and are disabled rather than removed.
  root.querySelectorAll("button").forEach((el) => el.remove());
  root.querySelectorAll("input").forEach((el) => {
    if (el.classList.contains("task-list-item-checkbox")) {
      el.setAttribute("disabled", "");
      return;
    }
    el.remove();
  });
  root.querySelectorAll("script, style, iframe, object, embed").forEach((el) => el.remove());
}

function resolveMath(root: ParentNode, warnings: string[]): void {
  let unrendered = 0;
  for (const el of Array.from(root.querySelectorAll(".math"))) {
    if (el.children.length > 0 || el.textContent?.trim()) continue;
    unrendered += 1;
    const tex = el.getAttribute("data-tex") ?? el.getAttribute("data-expr");
    if (tex) {
      const code = el.ownerDocument.createElement("code");
      code.className = "cv-math-source";
      code.textContent = tex;
      el.replaceWith(code);
    } else {
      el.remove();
    }
  }
  if (unrendered > 0) {
    warnings.push(`${unrendered} math element(s) had not rendered when the canvas was exported.`);
  }
}

function scrubLinks(root: ParentNode): void {
  for (const anchor of Array.from(root.querySelectorAll("a"))) {
    const href = anchor.getAttribute("href") ?? "";
    const dataHref = anchor.getAttribute("data-href") ?? "";
    if (EXTERNAL.test(href)) {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
      continue;
    }
    // Internal, or a scheme that means nothing outside the app: keep the text,
    // drop the destination.
    const label = dataHref || (EXTERNAL.test(href) ? "" : href);
    anchor.removeAttribute("href");
    anchor.removeAttribute("target");
    anchor.removeAttribute("data-href");
    anchor.classList.add("cv-dead-link");
    if (label && !/^[a-z]+:/i.test(label)) anchor.setAttribute("title", label);
  }
}

async function resolveImages(root: ParentNode, opts: CleanOptions, warnings: string[]): Promise<void> {
  // Wikilink embeds carry the vault-relative target on the wrapper, which is far
  // more reliable to resolve than the app:// URL on the <img> itself.
  for (const embed of Array.from(root.querySelectorAll(".internal-embed.image-embed"))) {
    const linktext = embed.getAttribute("src") ?? "";
    const img = embed.querySelector("img");
    const uri = linktext ? await opts.resolveEmbed(linktext) : null;
    if (uri) {
      const target = img ?? embed.ownerDocument.createElement("img");
      target.setAttribute("src", uri);
      if (!target.getAttribute("alt")) target.setAttribute("alt", embed.getAttribute("alt") ?? linktext);
      if (!img) embed.appendChild(target);
      continue;
    }
    warnings.push(`Could not inline embedded image: ${linktext || "(unknown)"}`);
    img?.remove();
  }

  for (const img of Array.from(root.querySelectorAll("img"))) {
    const src = img.getAttribute("src") ?? "";
    if (src.startsWith("data:image/")) continue;
    if (EXTERNAL.test(src)) {
      // A remote image would make the export phone home when opened.
      warnings.push(`Removed a remote image so the export stays self-contained: ${src}`);
    }
    img.remove();
  }
}

export async function cleanRendered(root: HTMLElement, opts: CleanOptions): Promise<string[]> {
  const warnings: string[] = [];
  removeDeadChrome(root, warnings);
  resolveMath(root, warnings);
  scrubLinks(root);
  await resolveImages(root, opts, warnings);
  stripEventHandlers(root);
  return warnings;
}
