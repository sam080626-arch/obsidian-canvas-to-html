# Canvas to HTML

Export an Obsidian Canvas to a single self-contained HTML file you can email, drop
in a folder, or open on any machine. The exported file zooms and pans the way the
canvas does inside Obsidian. No server, no network requests, no dependencies.

## Usage

Open a canvas and run **Export canvas to HTML** from the command palette, or
right-click a `.canvas` file in the file explorer. The `.html` file is written
next to the canvas unless you set an output folder in settings.

## In the exported file

| Input | Action |
|---|---|
| Two-finger scroll / wheel | Pan |
| Ctrl/⌘ + wheel, trackpad pinch | Zoom at the pointer |
| Drag empty space | Pan |
| `+` / `-` | Zoom in / out |
| `0`, double-click empty space | Fit to screen |
| Click an edge | Frame both of its endpoints |

Cards taller than their frame scroll internally. The corner buttons zoom, fit, and
toggle light/dark.

## What gets exported

Text cards and embedded Markdown notes are rendered to real HTML, one level deep.
Images are downscaled and inlined as data URIs. PDFs and web-link cards become
labeled placeholder cards — PDF bytes are never inlined and no iframes are
embedded, which keeps the file portable and safe to open offline.

## Development

```bash
npm install
npm run dev     # watch build
npm test        # vitest
npm run build   # typecheck + production bundle
```

Two bundles are produced: the plugin (`main.js`) and the viewer runtime, which is
inlined into the plugin as a string at build time.

To test in a vault, copy `main.js` and `manifest.json` into
`<vault>/.obsidian/plugins/canvas-to-html/`. Do not symlink into an iCloud vault —
iCloud does not sync symlinks reliably.

## License

MIT © 朱劭恩
