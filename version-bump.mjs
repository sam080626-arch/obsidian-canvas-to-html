/**
 * Keeps manifest.json and versions.json in step with package.json.
 *
 * Run indirectly: `npm version patch|minor|major` triggers this through the
 * "version" script, so the three files can never drift apart. Obsidian reads the
 * version from manifest.json and requires the git tag to match it exactly.
 */
import { readFileSync, writeFileSync } from "node:fs";

const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
  console.error("Run this through `npm version`, not directly.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = targetVersion;
writeFileSync("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = manifest.minAppVersion;
writeFileSync("versions.json", `${JSON.stringify(versions, null, 2)}\n`);

console.log(`Set version ${targetVersion} (minAppVersion ${manifest.minAppVersion})`);
