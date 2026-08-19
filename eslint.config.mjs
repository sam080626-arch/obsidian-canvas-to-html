import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

/**
 * Mirrors the linting Obsidian's community-plugin validator runs, so its
 * findings can be reproduced with `npm run lint` before submitting.
 *
 * Only shipped plugin code is in scope. Tests and build scripts are not part of
 * the plugin and are excluded, as they are in the validator's own report.
 */
export default tseslint.config(
  {
    ignores: [
      "main.js",
      "node_modules/**",
      "docs/**",
      "tests/**",
      "esbuild.config.mjs",
      "version-bump.mjs",
      "eslint.config.mjs",
      "vitest.config.ts",
    ],
  },
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // viewer/ is the runtime shipped inside an exported HTML file. It runs in a
    // plain browser, must never import the Obsidian API, and cannot use
    // Obsidian's DOM helpers or its localStorage wrappers.
    files: ["viewer/**/*.ts"],
    rules: {
      "obsidianmd/prefer-create-el": "off",
      "obsidianmd/no-static-styles-assignment": "off",
      "obsidianmd/no-global-this": "off",
      "no-restricted-globals": "off",
    },
  },
);
