import { Plugin } from "obsidian";

declare const __VIEWER_JS__: string;
declare const __VIEWER_CSS__: string;

export const VIEWER_JS = __VIEWER_JS__;
export const VIEWER_CSS = __VIEWER_CSS__;

export default class CanvasToHtmlPlugin extends Plugin {
  async onload(): Promise<void> {
    console.debug("canvas-to-html loaded");
  }
}
