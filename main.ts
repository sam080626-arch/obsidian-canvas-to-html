import { Component, Menu, Notice, Plugin, TFile, normalizePath } from "obsidian";
import { CanvasParseError } from "./canvas-model";
import { AssetCache, fitWithin, mimeForExtension, pickEncoding, toDataUri } from "./assets";
import { exportCanvas } from "./export-canvas";
import { createObsidianRenderer } from "./render-markdown";
import { DEFAULT_SETTINGS } from "./settings";
import type { CanvasToHtmlSettings } from "./settings";
import { CanvasToHtmlSettingTab } from "./settings-tab";
import type { ImageProcessor, VaultLike } from "./resolve";
import type { EmbedResolver } from "./render-markdown";

declare const __VIEWER_JS__: string;
declare const __VIEWER_CSS__: string;

export default class CanvasToHtmlPlugin extends Plugin {
  settings: CanvasToHtmlSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new CanvasToHtmlSettingTab(this.app, this));

    this.addCommand({
      id: "export-canvas-to-html",
      name: "Export canvas to HTML",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "canvas") return false;
        if (!checking) void this.exportFile(file);
        return true;
      },
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file) => {
        if (!(file instanceof TFile) || file.extension !== "canvas") return;
        menu.addItem((item) =>
          item
            .setTitle("Export canvas to HTML")
            .setIcon("file-code")
            .onClick(() => void this.exportFile(file)),
        );
      }),
    );
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private buildVaultAdapter(): VaultLike {
    const vault = this.app.vault;
    return {
      getFile(path: string) {
        const file = vault.getAbstractFileByPath(path);
        return file instanceof TFile ? { path: file.path, extension: file.extension } : null;
      },
      async readText(path: string) {
        const file = vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) throw new Error(`Not a file: ${path}`);
        return vault.cachedRead(file);
      },
      async readBinary(path: string) {
        const file = vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) throw new Error(`Not a file: ${path}`);
        return vault.readBinary(file);
      },
    };
  }

  private buildImageProcessor(): ImageProcessor {
    const quality = this.settings.imageQuality;
    return {
      async toInlineImage(bytes: ArrayBuffer, mime: string, maxDim: number): Promise<string> {
        if (mime === "image/svg+xml" || mime === "image/gif") return toDataUri(bytes, mime);

        const blob = new Blob([bytes], { type: mime });
        const bitmap = await createImageBitmap(blob);
        const target = fitWithin({ width: bitmap.width, height: bitmap.height }, maxDim);
        const encoding = pickEncoding(mime);
        if (target.width === bitmap.width && target.height === bitmap.height && encoding.mime === mime) {
          bitmap.close();
          return toDataUri(bytes, mime);
        }
        const canvas = document.createElement("canvas");
        canvas.width = target.width;
        canvas.height = target.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          bitmap.close();
          return toDataUri(bytes, mime);
        }
        ctx.drawImage(bitmap, 0, 0, target.width, target.height);
        bitmap.close();
        return canvas.toDataURL(encoding.mime, quality);
      },
    };
  }

  /**
   * Resolves an embedded image's link text against the vault and inlines it, so
   * images inside embedded notes survive the export instead of being dropped.
   */
  private buildEmbedResolver(sourceFile: TFile, images: ImageProcessor, cache: AssetCache): EmbedResolver {
    const app = this.app;
    const maxDim = this.settings.maxImageDimension;
    return {
      resolveEmbed: async (linktext: string, sourcePath: string): Promise<string | null> => {
        const target = app.metadataCache.getFirstLinkpathDest(
          linktext.split("#")[0],
          sourcePath || sourceFile.path,
        );
        if (!target) return null;
        const mime = mimeForExtension(target.extension);
        if (!mime) return null;
        try {
          return await cache.get(target.path, async () => {
            const bytes = await app.vault.readBinary(target);
            return images.toInlineImage(bytes, mime, maxDim);
          });
        } catch {
          return null;
        }
      },
    };
  }

  private async exportFile(file: TFile): Promise<void> {
    const component = new Component();
    component.load();
    try {
      const json = await this.app.vault.read(file);
      const images = this.buildImageProcessor();
      const assetCache = new AssetCache();
      // Warnings raised while rendering markdown are collected here and merged
      // with the ones exportCanvas returns.
      const renderWarnings: string[] = [];
      const { html, warnings } = await exportCanvas(
        json,
        file.basename,
        {
          vault: this.buildVaultAdapter(),
          renderer: createObsidianRenderer(
            this.app,
            component,
            this.buildEmbedResolver(file, images, assetCache),
            renderWarnings,
          ),
          images,
          maxImageDimension: this.settings.maxImageDimension,
        },
        {
          css: __VIEWER_CSS__,
          js: __VIEWER_JS__,
          defaultTheme: this.settings.defaultTheme,
          collectedWarnings: renderWarnings,
        },
      );

      const sizeMB = new Blob([html]).size / (1024 * 1024);
      if (sizeMB > this.settings.sizeWarnThresholdMB) {
        const proceed = window.confirm(
          `This export is ${sizeMB.toFixed(1)} MB, over the ${this.settings.sizeWarnThresholdMB} MB ` +
            `threshold. Write it anyway?`,
        );
        if (!proceed) {
          new Notice("Export cancelled.");
          return;
        }
      }

      const folder = this.settings.outputFolder || (file.parent?.path ?? "");
      const outPath = normalizePath(`${folder ? `${folder}/` : ""}${file.basename}.html`);
      const existing = this.app.vault.getAbstractFileByPath(outPath);
      if (existing instanceof TFile) {
        await this.app.vault.modify(existing, html);
      } else {
        await this.app.vault.create(outPath, html);
      }

      if (warnings.length > 0) {
        console.warn(`[canvas-to-html] ${warnings.length} warning(s):`, warnings);
      }
      new Notice(
        `Exported ${outPath}` + (warnings.length > 0 ? ` — ${warnings.length} warning(s), see console` : ""),
      );

      if (this.settings.openAfterExport) {
        const created = this.app.vault.getAbstractFileByPath(outPath);
        if (created instanceof TFile) await this.app.workspace.getLeaf(true).openFile(created);
      }
    } catch (error) {
      const message =
        error instanceof CanvasParseError
          ? error.message
          : `Export failed: ${(error as Error).message}`;
      console.error("[canvas-to-html]", error);
      new Notice(message);
    } finally {
      component.unload();
    }
  }
}
