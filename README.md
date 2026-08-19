# Canvas to HTML

[![CI](https://github.com/sam080626-arch/obsidian-canvas-to-html/actions/workflows/ci.yml/badge.svg)](https://github.com/sam080626-arch/obsidian-canvas-to-html/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/sam080626-arch/obsidian-canvas-to-html?sort=semver)](https://github.com/sam080626-arch/obsidian-canvas-to-html/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Export an Obsidian Canvas to **one self-contained HTML file** you can email, drop
in a folder, or open on any machine. The exported file zooms and pans the way the
canvas does inside Obsidian.

No server. No build step for the reader. **No network requests at all** — every
image is inlined, every font reference is stripped, and nothing phones home when
the file is opened.

<!-- Add a screenshot here once you have one:
     ![A canvas exported to HTML](docs/screenshot.png)
-->

## Install

### From a release

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/sam080626-arch/obsidian-canvas-to-html/releases/latest).
2. Put all three in `<your vault>/.obsidian/plugins/canvas-to-html/`.
3. Reload Obsidian, then enable **Canvas to HTML** in Settings → Community plugins.

> If your vault syncs through iCloud, copy the files in. Do not symlink them —
> iCloud does not sync symlinks reliably.

### With BRAT

Add `sam080626-arch/obsidian-canvas-to-html` as a beta plugin in
[BRAT](https://github.com/TfTHacker/obsidian42-brat).

## Usage

Open a canvas and run **Export canvas to HTML** from the command palette, or
right-click a `.canvas` file in the file explorer. The `.html` lands next to the
canvas unless you set an output folder in settings.

### In the exported file

| Input | Action |
|---|---|
| Two-finger scroll / wheel | Pan |
| Ctrl/⌘ + wheel, trackpad pinch | Zoom at the pointer |
| Drag empty space | Pan |
| `+` / `-` | Zoom in / out |
| `0`, double-click empty space | Fit to screen |
| Click an edge | Frame both of its endpoints |

Cards taller than their frame scroll internally. Corner buttons zoom, fit, and
toggle light/dark; the theme choice persists.

## What gets exported

| Canvas node | Becomes |
|---|---|
| Text card | Rendered Markdown |
| Embedded `.md` note | The note's rendered content, one level deep |
| Image | An `<img>` with an inlined data URI, downscaled past a size limit |
| PDF | A labelled placeholder card — the bytes are never inlined |
| Web link | A clickable link card, not a live iframe |
| Group | A tinted rect with its label, behind the cards |
| Edge | An SVG Bézier with arrowheads, in canvas coordinates |

Callouts, tables, task lists, code blocks with syntax colouring, math, and images
embedded inside notes all survive. The stylesheet mirrors Obsidian's own default
theme values — the type scale, spacing, and the canvas colour palette — so an
export reads like the canvas it came from.

## Settings

| Setting | Default |
|---|---|
| Output folder | Next to the source canvas |
| Maximum image dimension | 2000 px |
| Image re-encode quality | 0.85 |
| Size warning threshold | 25 MB |
| Default theme in the export | Follow the reader's system |
| Open the file after exporting | Off |

## Known limitations

- **Mermaid diagrams** export as a source code block until you trust the vault in
  Obsidian, because Obsidian itself will not render them before that.
- **Math** renders, but MathJax's web fonts are deliberately not embedded (they
  would add megabytes), so glyph metrics differ slightly from Obsidian. If a
  formula fails to render at all, its TeX source is exported instead of a blank.
- **Embeds are followed one level only.** An `![[embed]]` inside an embedded note
  is not expanded.
- **Community themes are not reproduced.** The export matches Obsidian's default
  theme.
- Wikilinks to notes that were not exported render as dotted, unclickable text
  with the target in the tooltip.

## Development

```bash
npm install
npm run dev     # watch build
npm test        # vitest
npm run lint    # the same rules Obsidian's plugin validator applies
npm run build   # lint + typecheck + production bundle
```

Two bundles are produced: the plugin (`main.js`) and the viewer runtime, which is
inlined into the plugin as a string at build time and written into every export.

### Architecture

Logic lives in pure modules; the Obsidian-coupled modules are thin and take their
dependencies through injected interfaces, so the whole pipeline is testable
without the app.

| Module | Responsibility | Obsidian API |
|---|---|---|
| `canvas-model.ts` | Parse `.canvas` JSON into a `Scene`, compute world bounds | no |
| `edges.ts` | Bézier routing and arrowhead geometry | no |
| `assets.ts` | Image sizing, encoding, data URIs, caching | no |
| `math.ts` | TeX source extraction, MathJax CSS sanitation | no |
| `clean-rendered.ts` | Strip app-only chrome, scrub links, carry math across sanitization | no |
| `serialize.ts` | Assemble the exported document | no |
| `viewer/transform.ts` | Zoom/pan/fit maths | no |
| `viewer/viewer.ts` | The runtime shipped inside each export | no |
| `resolve.ts` | Canvas nodes → renderable HTML | injected |
| `render-markdown.ts` | `MarkdownRenderer` + sanitization + math | yes |
| `main.ts` | Commands, menus, settings, orchestration | yes |

### Testing

159 tests across unit, golden-file, and jsdom suites:

```bash
npm test
```

The jsdom suites drive the exported viewer with real `wheel`, pointer, and
keyboard events and assert the resulting transform, because that layer cannot be
covered by unit tests alone. `MANUAL-VERIFICATION.md` lists what still needs a
human in real Obsidian — renderer fidelity, performance, and cross-browser checks.

Design notes and the implementation plan live in [`docs/superpowers/`](docs/superpowers/).

### Releasing

```bash
npm version patch    # bumps package.json, manifest.json, versions.json together
git push --follow-tags
```

Pushing the tag runs the release workflow, which verifies the tag matches
`manifest.json`, builds, and attaches `main.js` and `manifest.json` to a GitHub
release — the layout Obsidian expects.

## License

MIT © 朱劭恩
