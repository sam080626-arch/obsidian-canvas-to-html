import type { Scene, SceneNode } from "./canvas-model";
import { AssetCache, mimeForExtension } from "./assets";
import { colorVarFor, escapeHtml } from "./serialize";
import type { RenderedNode } from "./serialize";

export interface VaultLike {
  getFile(path: string): { path: string; extension: string } | null;
  readText(path: string): Promise<string>;
  readBinary(path: string): Promise<ArrayBuffer>;
}

export interface RendererLike {
  renderMarkdown(markdown: string, sourcePath: string): Promise<string>;
}

export interface ImageProcessor {
  toInlineImage(bytes: ArrayBuffer, mime: string, maxDim: number): Promise<string>;
}

export interface ResolveDeps {
  vault: VaultLike;
  renderer: RendererLike;
  images: ImageProcessor;
  maxImageDimension: number;
}

export interface ResolveResult {
  nodes: RenderedNode[];
  warnings: string[];
}

function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1];
}

function placeholder(icon: string, title: string, subtitle?: string): string {
  const sub = subtitle ? `<div class="cv-placeholder-sub">${escapeHtml(subtitle)}</div>` : "";
  return (
    `<div class="cv-placeholder"><div class="cv-placeholder-icon">${escapeHtml(icon)}</div>` +
    `<div class="cv-placeholder-title">${escapeHtml(title)}</div>${sub}</div>`
  );
}

function sourceFallback(text: string): string {
  return `<pre class="cv-raw">${escapeHtml(text)}</pre>`;
}

function hostnameOf(url: string): string {
  const match = url.match(/^https?:\/\/([^/?#]+)/i);
  return match ? match[1] : url;
}

export async function resolveScene(scene: Scene, deps: ResolveDeps): Promise<ResolveResult> {
  const warnings: string[] = [];
  const cache = new AssetCache();
  const nodes: RenderedNode[] = [];

  for (const node of scene.nodes) {
    nodes.push(await resolveNode(node, deps, cache, warnings));
  }
  return { nodes, warnings };
}

async function resolveNode(
  node: SceneNode,
  deps: ResolveDeps,
  cache: AssetCache,
  warnings: string[],
): Promise<RenderedNode> {
  const base = {
    id: node.id,
    kind: node.kind,
    rect: node.rect,
    colorVar: colorVarFor(node.color),
    label: node.label,
  };

  if (node.kind === "group") {
    return { ...base, html: "", scrollable: false };
  }

  if (node.kind === "link") {
    const url = node.url ?? "";
    if (!/^https?:\/\//i.test(url)) {
      warnings.push(`Unsupported URL on node ${node.id}: ${url}`);
      return { ...base, html: placeholder("🔗", "Unsupported link"), scrollable: false };
    }
    const html =
      `<a class="cv-link-card" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">` +
      `<div class="cv-link-host">${escapeHtml(hostnameOf(url))}</div>` +
      `<div class="cv-link-url">${escapeHtml(url)}</div></a>`;
    return { ...base, html, scrollable: false };
  }

  if (node.kind === "text") {
    const text = node.text ?? "";
    try {
      return { ...base, html: await deps.renderer.renderMarkdown(text, ""), scrollable: true };
    } catch (error) {
      warnings.push(`Could not render node ${node.id}: ${(error as Error).message}`);
      return { ...base, html: sourceFallback(text), scrollable: true };
    }
  }

  // kind === "file"
  const path = node.file ?? "";
  const file = deps.vault.getFile(path);
  if (!file) {
    warnings.push(`File not found: ${path}`);
    return { ...base, html: placeholder("⚠", "File not found", path), scrollable: false };
  }

  const ext = file.extension.toLowerCase();

  if (ext === "md") {
    try {
      const source = await deps.vault.readText(file.path);
      return { ...base, html: await deps.renderer.renderMarkdown(source, file.path), scrollable: true };
    } catch (error) {
      warnings.push(`Could not render ${path}: ${(error as Error).message}`);
      return { ...base, html: placeholder("⚠", "Could not render note", path), scrollable: false };
    }
  }

  const mime = mimeForExtension(ext);
  if (mime) {
    try {
      const uri = await cache.get(file.path, async () => {
        const bytes = await deps.vault.readBinary(file.path);
        return deps.images.toInlineImage(bytes, mime, deps.maxImageDimension);
      });
      const html = `<img class="cv-image" src="${escapeHtml(uri)}" alt="${escapeHtml(basename(path))}" />`;
      return { ...base, html, scrollable: false };
    } catch (error) {
      warnings.push(`Could not inline image ${path}: ${(error as Error).message}`);
      return { ...base, html: placeholder("🖼", "Image unavailable", basename(path)), scrollable: false };
    }
  }

  const icon = ext === "pdf" ? "📄" : "📎";
  return { ...base, html: placeholder(icon, basename(path), ext.toUpperCase()), scrollable: false };
}
