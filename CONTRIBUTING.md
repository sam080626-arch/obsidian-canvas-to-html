# Contributing

Thanks for taking a look. This is a small plugin with a deliberate structure, so
a short read here will save you time.

## Getting set up

```bash
npm install
npm test
npm run build
```

Node 20 or newer. To try changes in Obsidian, build and copy `main.js`,
`manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/canvas-to-html/`, then use
**Reload app without saving**. A scratch vault is strongly preferred over a real
one. Do not symlink into an iCloud-synced vault — iCloud does not sync symlinks
reliably.

## The two rules that shape this codebase

1. **An export makes no network requests.** Everything is inlined or stripped.
   Any change that could cause the exported file to fetch something — a remote
   image, a webfont, a CDN script — will be rejected. There are tests guarding
   this; do not weaken them.
2. **An export carries no executable content.** Rendered HTML passes through
   Obsidian's sanitizer, interactive chrome is removed, and event handlers are
   stripped. The one deliberate exception is MathJax's output, which is carried
   across sanitization under its own strict allowlist in `clean-rendered.ts`. If
   you touch that allowlist, add tests for what it must keep out.

## Linting

`npm run lint` runs the same rules Obsidian's community-plugin validator applies,
so its findings can be reproduced before submitting. It is part of `npm run build`
and of CI. Disabling an `obsidianmd/*` rule inline is itself an error under that
config — fix the code instead.

There are two stylesheets, and they are not interchangeable. `styles.css` is the
plugin's own, loaded by Obsidian. `viewer/viewer.css` is inlined into every export
and only ever runs in a browser.

## Structure

Keep logic in the pure modules and the Obsidian-coupled modules thin. `resolve.ts`
takes its vault, renderer, and image processor through injected interfaces
precisely so the pipeline can be tested with fakes; please preserve that.

Anything that runs inside the exported file lives in `viewer/` and must not import
from `obsidian`.

## Tests

Write the failing test first. In particular:

- Pure modules get plain unit tests.
- Anything touching the DOM of an export gets a jsdom test (`// @vitest-environment jsdom`).
- Changes to the exported document's shape will move the golden snapshot in
  `tests/__snapshots__/`. **Read the diff before accepting it** — that snapshot
  exists to make output changes visible, and `-u` without reading defeats it.

A green suite is not sufficient for rendering changes. The renderer, sanitizer,
and image pipeline only exist inside Obsidian, so re-run the relevant parts of
`MANUAL-VERIFICATION.md` and say in your PR what you checked.

## Debugging rendering problems

The useful evidence is almost always the exported file itself. Obsidian's renderer
emits app-specific markup, and most bugs so far have been a mismatch between that
markup and the exporter's assumptions. Open the `.html`, find the card, and read
what Obsidian actually produced before changing any CSS.

Obsidian's own default-theme values can be read out of the installed app rather
than guessed:

```bash
grep -ao -- "--h1-size:[^;]*;" ~/Library/Application\ Support/obsidian/obsidian-*.asar | head -1
```

## Commits and PRs

Explain the root cause, not only the symptom. Small, focused commits. Fill in the
PR template, including what you verified by hand.
