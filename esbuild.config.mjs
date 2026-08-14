import esbuild from "esbuild";
import process from "process";
import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";

const production = process.argv[2] === "production";

async function buildViewer() {
  const result = await esbuild.build({
    entryPoints: ["viewer/viewer.ts"],
    bundle: true,
    format: "iife",
    target: "es2018",
    minify: production,
    write: false,
    logLevel: "silent",
  });
  return result.outputFiles[0].text;
}

async function buildPlugin() {
  const viewerJs = await buildViewer();
  const viewerCss = readFileSync("viewer/viewer.css", "utf8");
  const ctx = await esbuild.context({
    entryPoints: ["main.ts"],
    bundle: true,
    external: ["obsidian", "electron", ...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
    format: "cjs",
    target: "es2018",
    logLevel: "info",
    sourcemap: production ? false : "inline",
    treeShaking: true,
    outfile: "main.js",
    define: {
      __VIEWER_JS__: JSON.stringify(viewerJs),
      __VIEWER_CSS__: JSON.stringify(viewerCss),
    },
  });
  if (production) {
    await ctx.rebuild();
    process.exit(0);
  } else {
    await ctx.watch();
  }
}

buildPlugin();
