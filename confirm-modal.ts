import { Modal, Setting } from "obsidian";
import type { App } from "obsidian";

interface ConfirmOptions {
  title: string;
  body: string;
  confirmText: string;
}

/**
 * A yes/no dialog. Obsidian plugins should not use window.confirm: it blocks the
 * renderer and looks nothing like the rest of the app.
 *
 * Dismissing the modal any other way (Escape, clicking outside) counts as "no".
 */
class ConfirmModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private readonly options: ConfirmOptions,
    private readonly onResult: (confirmed: boolean) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.options.title);
    this.contentEl.createEl("p", { text: this.options.body });

    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.settle(false)))
      .addButton((button) =>
        button
          .setButtonText(this.options.confirmText)
          .setCta()
          .onClick(() => this.settle(true)),
      );
  }

  onClose(): void {
    this.contentEl.empty();
    // Covers Escape and click-outside, which never reach a button.
    this.settle(false);
  }

  private settle(confirmed: boolean): void {
    if (this.settled) return;
    this.settled = true;
    this.onResult(confirmed);
    this.close();
  }
}

export function confirmAction(app: App, options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    new ConfirmModal(app, options, resolve).open();
  });
}
