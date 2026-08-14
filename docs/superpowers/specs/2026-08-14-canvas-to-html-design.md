# Canvas to HTML — Design

**Date:** 2026-08-14
**Status:** Approved
**Author:** 朱劭恩 (shaoenzhu0626@gmail.com)

## Purpose

An Obsidian plugin that exports a Canvas to a single self-contained HTML file that
anyone can open in a browser — no Obsidian, no server, no network. The viewer zooms
and pans the way the canvas does inside Obsidian.

The plugin never makes a network request. Every byte in the output comes from the
vault.

## Scope

### In scope

- One command, **Export canvas to HTML**, reachable three ways: the command palette,
  the canvas view's ⋯ menu, and the file-explorer context menu on a `.canvas` file.
- Output: one `.html` file written next to the source canvas (folder configurable).
- Node kinds handled: text cards, embedded `.md` notes (one level deep), images,
  PDFs, URL cards, and groups.
- Viewer interactions: zoom, pan, fit-to-view, internal scrolling of tall cards,
  click-an-edge-to-frame-its-endpoints, light/dark toggle.

### Out of scope (YAGNI)

- Editing anything in the exported file.
- Search, minimap, node filtering.
- Recursive embeds: `![[...]]` *inside* an embedded note is not followed.
- Live iframes for URL cards.
- Exporting a whole vault or multiple canvases into a linked site.
- Matching third-party community themes.

## Content Rules

| Canvas node | Exported as |
|---|---|
| Text card | Markdown rendered to HTML via Obsidian's renderer |
| `.md` file node | The note's content rendered the same way, one level deep |
| Image file node | `<img>` with a data-URI source, downscaled past a max dimension |
| PDF file node | Placeholder card: file icon and filename only — the PDF bytes are never inlined |
| URL card | Placeholder link card: title text + hostname, `target="_blank" rel="noopener noreferrer"` |
| Group | Background rect with its label at top-left, z-ordered behind cards |
| Edge | SVG Bézier with arrowhead(s) and optional label, in canvas coordinates |

Additional rules:

- **Wikilinks** inside rendered cards point at notes that were not exported. They
  render as styled non-link text (dotted underline, `title` attribute showing the
  target) rather than dead `href`s.
- **External links** (`http`/`https`) stay clickable and open in a new tab.
- **Images** are downscaled so neither dimension exceeds `maxImageDimension`
  (default 2000px), re-encoded (JPEG for photos, PNG preserved when the source has
  alpha), deduplicated by vault path, and inlined as data URIs.
- **Sanitization:** every fragment of rendered HTML passes through Obsidian's
  `sanitizeHTMLToDom` before serialization. Scripts, inline event handlers, and
  `app://` / `obsidian://` URLs are stripped. The file leaves the user's machine;
  it must not carry executable content out of the vault.

## Architecture

Pure modules hold the logic; Obsidian-touching modules stay thin. This mirrors the
structure that worked in Format Bubble, where the untested part was precisely the
part coupled to the app.

| Module | Responsibility | Touches Obsidian API |
|---|---|---|
| `main.ts` | Plugin entry: command, menu items, settings tab, orchestration | yes |
| `canvas-model.ts` | Parse `.canvas` JSON into a normalized `Scene`; compute world bounds | no |
| `edges.ts` | Bézier control points, arrowhead geometry, anchor-side resolution | no |
| `assets.ts` | Image decode, downscale, re-encode, data-URI, dedupe cache | no (Canvas/OffscreenCanvas only) |
| `serialize.ts` | Assemble shell HTML + CSS + viewer JS + node DOM into the final string | no |
| `resolve.ts` | Resolve file nodes via `vault`/`metadataCache`, classify kinds, apply placeholder policy | yes, thin |
| `render-markdown.ts` | `MarkdownRenderer.render()` into a detached container; sanitize; return HTML string | yes, thin |
| `viewer/viewer.ts` | The runtime shipped *inside* the export (~8KB, no dependencies) | no |
| `viewer/viewer.css` | The stylesheet shipped inside the export (~400 lines, light + dark) | no |
| `settings.ts`, `settings-tab.ts` | Settings model and UI | yes |

`viewer/` is a **separate esbuild entry point** built to a string and imported by
`serialize.ts`, so the viewer is written as normal TypeScript and CSS rather than
as a template literal.

### Data flow

```
.canvas file
  → canvas-model.parse()          → Scene { nodes, edges, groups, bounds }
  → resolve.resolveNodes(scene)   → ResolvedNode[]  (content + kind + warnings)
  → render-markdown / assets      → HTML fragments + inlined data URIs
  → edges.route(scene)            → SVG path data
  → serialize.build()             → single HTML string
  → vault.create()                → <canvas name>.html
```

## The Exported File

### Structure

Static DOM, not client-side rendering. The layout exists before any JavaScript
runs, which makes the output inspectable and degrades gracefully.

```html
<div id="viewport">
  <div id="world" style="transform: translate(Xpx, Ypx) scale(K)">
    <svg id="edges">...</svg>          <!-- canvas coordinates -->
    <div class="group" style="left:..;top:..;width:..;height:..">
    <div class="card"  style="left:..;top:..;width:..;height:..">
      <div class="card-body">rendered HTML</div>
```

All positions are the raw canvas coordinates from the `.canvas` file. Nothing is
recomputed at load time.

### Zoom and pan

A **single CSS transform on `#world`** with `transform-origin: 0 0`. Zoom and pan
are therefore compositor-only — no layout, no reflow — which is what keeps a
several-hundred-node canvas smooth.

| Input | Action |
|---|---|
| Two-finger scroll / wheel | Pan |
| Ctrl/⌘ + wheel, trackpad pinch | Zoom at the pointer |
| Drag on empty space | Pan |
| `+` / `-` | Zoom in / out about the viewport center |
| `0` | Fit canvas to screen |
| Double-click empty space | Fit canvas to screen |
| Buttons in the corner | Zoom in, zoom out, fit, theme toggle |

Zoom is clamped to `[0.05, 4]`. Initial view is fit-to-screen.

### Card scrolling and edge following

Cards whose content is taller than their canvas-defined frame get
`overflow-y: auto`. A wheel event over such a card scrolls the card; only once the
card reaches its scroll limit does the event propagate to the viewport and pan.
This is the same handoff Obsidian uses and it is the fiddliest part of the viewer —
it gets dedicated tests.

Clicking an edge animates the transform so both endpoints are framed, with a short
eased tween.

### Theming

Both palettes ship in the file as CSS custom properties. Default follows
`prefers-color-scheme`; a corner button toggles and persists the choice in
`localStorage`. Colors approximate Obsidian's default theme — the Obsidian node
color palette (`"1"`–`"6"` plus custom hex) is mapped to matching card border and
group tint values in both modes.

## Error Handling

No single failure aborts an export. Each failure degrades the affected node and
records a warning:

| Failure | Behavior |
|---|---|
| File node points at a missing file | Placeholder card: "⚠ File not found: `path`" |
| Image fails to decode | Placeholder card with the filename |
| Markdown render throws | Card falls back to `<pre>` of the raw source |
| `.canvas` JSON is malformed | Export aborts with a Notice naming the parse error — the only abort |

At the end of an export the user gets a Notice
(`Exported 42 nodes, 2 warnings`), the full warning list in the developer console,
and the same list as an HTML comment at the top of the output file.

If the assembled HTML exceeds `sizeWarnThresholdMB` (default 25), the user is shown
the size and asked to confirm before the file is written.

## Settings

| Setting | Default |
|---|---|
| Output folder | Same folder as the source canvas |
| Max image dimension | 2000 px |
| Image re-encode quality | 0.85 |
| Size warning threshold | 25 MB |
| Default viewer theme | Follow system |
| Open export after writing | Off |

## Testing

**Unit (vitest, matching the Format Bubble setup):**
`canvas-model` parsing including malformed input, `edges` geometry across all
anchor-side combinations, `assets` downscale math and dedupe, `serialize` escaping
and structure.

**Golden file:** a fixture `.canvas` plus a fake vault renders to a snapshotted
HTML string with asset bytes stubbed, so any change to output structure is visible
in review.

**Viewer runtime (jsdom):** load the emitted HTML into jsdom, dispatch real
`wheel`, `pointerdown`/`pointermove`, and keyboard events, and assert the resulting
transform matrix and scroll handoff behavior. This is deliberately in scope from
day one: in Format Bubble the app-coupled layer had zero automated tests, and two
bugs that completely broke the plugin shipped while all 54 unit tests stayed green.

**Manual (`MANUAL-VERIFICATION.md`):** real-Obsidian checks that cannot be
automated — a canvas using a custom community theme, math and Mermaid blocks,
a 200+ node canvas for pan/zoom smoothness, and opening the export in Safari,
Chrome, and Firefox.

## Build and Environment Notes

- Obsidian's npm package pins its CodeMirror peers to exact versions. If any
  CodeMirror dependency is added, pin it exactly or `npm install` fails with
  ERESOLVE.
- The user's real vault is
  `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Iykyk`. iCloud does not
  sync symlinks reliably — copy built files into the vault's plugin folder rather
  than symlinking. A scratch vault should be used for development.
- esbuild produces two bundles: `main.js` (the plugin) and the viewer bundle, which
  is inlined into `main.js` as a string at build time.
