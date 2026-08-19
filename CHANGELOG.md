# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-08-14

First working version.

### Added

- **Export canvas to HTML** command, on the command palette and the file
  explorer's context menu for `.canvas` files.
- Single self-contained export: images inlined as data URIs, no network requests,
  no iframes, PDF bytes never inlined.
- Viewer inside every export: zoom at the pointer, pan, fit-to-screen, keyboard
  shortcuts, internal scrolling for tall cards, click an edge to frame its
  endpoints, and a light/dark toggle that persists.
- Node kinds: text cards, embedded notes one level deep, images, PDF and web-link
  placeholder cards, groups, and edges with arrowheads.
- Rendering fidelity against Obsidian's default theme: its type scale, spacing,
  base colour ramp, and the red/orange/yellow/green/cyan/purple canvas palette.
- Callouts tinted by type, task lists, tables, and code blocks with syntax
  colouring.
- Math: MathJax output is carried across Obsidian's sanitizer, its stylesheet is
  inlined with font URLs stripped, and the TeX source is exported as a fallback so
  a formula can never silently vanish.
- Images embedded inside notes are resolved through the metadata cache and
  inlined.
- Per-node failures degrade to placeholder cards and are reported in a Notice, the
  console, and a comment at the top of the exported file.
- Settings for output folder, maximum image dimension, re-encode quality, size
  warning threshold, default theme, and opening the file after export.

[Unreleased]: https://github.com/YOUR_GH_USERNAME/obsidian-canvas-to-html/compare/0.1.0...HEAD
[0.1.0]: https://github.com/YOUR_GH_USERNAME/obsidian-canvas-to-html/releases/tag/0.1.0
