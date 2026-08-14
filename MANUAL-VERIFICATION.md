# Manual Verification

Automated tests cover the pure pipeline and the viewer's event handling in jsdom.
These checks need real Obsidian and a real browser.

## Export in Obsidian

- [ ] Command palette shows "Export canvas to HTML" only when a canvas is active.
- [ ] Right-clicking a `.canvas` file in the file explorer offers the same command.
- [ ] The file lands next to the canvas; setting an output folder redirects it.
- [ ] Exporting the same canvas twice overwrites rather than erroring.
- [ ] A canvas containing a missing file exports, and the Notice mentions warnings.
- [ ] The warnings appear in the developer console and in a comment at the top of the file.

## Rendering fidelity

- [ ] Headings, lists, tables, blockquotes, and inline code match Obsidian closely.
- [ ] Task checkboxes render checked/unchecked correctly.
- [ ] Callouts keep their title and left border.
- [ ] A math block renders (or degrades legibly — record which).
- [ ] A Mermaid block renders (or degrades legibly — record which).
- [ ] Wikilinks to non-exported notes are dotted, non-clickable, and show the target on hover.
- [ ] An embedded image appears at the right size and is visibly compressed only if large.
- [ ] A PDF node shows the placeholder, not an embedded viewer.
- [ ] A URL card opens the site in a new tab.
- [ ] Group labels sit above their group rect, and groups render behind cards.
- [ ] All six preset node colours are distinguishable, in both themes.

## Viewer behavior

- [ ] Opens fitted to the whole canvas.
- [ ] Opening the file into a background tab, then switching to it, still shows a fitted canvas
      (the viewport measures 0 until it is laid out; the viewer must refit rather than
      collapse to minimum zoom).
- [ ] Resizing the window refits — but stops refitting once you have zoomed or panned.
- [ ] Two-finger scroll pans; ctrl/⌘+wheel zooms at the pointer.
- [ ] Trackpad pinch zooms (macOS Safari, Chrome, Firefox).
- [ ] Dragging empty space pans; dragging inside a card does not.
- [ ] `+`, `-`, `0` work; double-clicking empty space refits.
- [ ] A tall card scrolls internally; the page pans once it hits the end.
- [ ] Clicking an edge frames both endpoints with a smooth animation.
- [ ] The theme button toggles and the choice survives a reload.
- [ ] With no `data-theme` set, the file follows the OS appearance setting.

## Performance and portability

- [ ] A canvas with 200+ nodes pans and zooms without visible stutter.
- [ ] Opening the exported file with Wi-Fi off shows no missing content.
- [ ] The browser devtools Network tab shows zero requests after load.
- [ ] The file opens correctly in Safari, Chrome, and Firefox.
- [ ] The size-threshold confirmation appears for an image-heavy canvas over 25 MB.
