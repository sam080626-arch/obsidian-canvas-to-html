export interface CanvasToHtmlSettings {
  outputFolder: string;
  maxImageDimension: number;
  imageQuality: number;
  sizeWarnThresholdMB: number;
  defaultTheme: "system" | "light" | "dark";
  openAfterExport: boolean;
}

export const DEFAULT_SETTINGS: CanvasToHtmlSettings = {
  outputFolder: "",
  maxImageDimension: 2000,
  imageQuality: 0.85,
  sizeWarnThresholdMB: 25,
  defaultTheme: "system",
  openAfterExport: false,
};
