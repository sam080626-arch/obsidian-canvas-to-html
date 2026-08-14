import { PluginSettingTab, Setting } from "obsidian";
import type { App } from "obsidian";
import type CanvasToHtmlPlugin from "./main";

export class CanvasToHtmlSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: CanvasToHtmlPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Output folder")
      .setDesc("Vault-relative folder for exported files. Leave empty to write next to the canvas.")
      .addText((text) =>
        text
          .setPlaceholder("Exports")
          .setValue(this.plugin.settings.outputFolder)
          .onChange(async (value) => {
            this.plugin.settings.outputFolder = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Maximum image dimension")
      .setDesc("Images larger than this on their longest side are downscaled before inlining.")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.maxImageDimension)).onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          if (Number.isFinite(parsed) && parsed > 0) {
            this.plugin.settings.maxImageDimension = parsed;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl)
      .setName("Size warning threshold (MB)")
      .setDesc("Ask for confirmation before writing a file larger than this.")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.sizeWarnThresholdMB)).onChange(async (value) => {
          const parsed = Number.parseFloat(value);
          if (Number.isFinite(parsed) && parsed > 0) {
            this.plugin.settings.sizeWarnThresholdMB = parsed;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl)
      .setName("Default theme in the export")
      .addDropdown((drop) =>
        drop
          .addOption("system", "Follow the reader's system")
          .addOption("light", "Light")
          .addOption("dark", "Dark")
          .setValue(this.plugin.settings.defaultTheme)
          .onChange(async (value) => {
            this.plugin.settings.defaultTheme = value as "system" | "light" | "dark";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Open the file after exporting")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.openAfterExport).onChange(async (value) => {
          this.plugin.settings.openAfterExport = value;
          await this.plugin.saveSettings();
        }),
      );
  }
}
