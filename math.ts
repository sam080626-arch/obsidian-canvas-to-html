/**
 * Math support for the export.
 *
 * Obsidian typesets math with MathJax in CHTML mode, loaded lazily. Two things
 * follow: the renderer must be told to wait for it (see render-markdown.ts), and
 * when it still does not render, the TeX source has to come from somewhere — so
 * it is recovered from the markdown here and used as a fallback, rather than
 * letting a formula silently vanish.
 *
 * Pure and free of any `obsidian` import, so it is unit-tested directly.
 */

/** Regions where a `$` is not a math delimiter. */
function blankOutCode(markdown: string): string {
  // Replace code spans and fences with same-length filler so that every index in
  // the returned string still lines up with the original.
  const blank = (match: string): string => " ".repeat(match.length);
  return markdown
    .replace(/```[\s\S]*?```/g, blank)
    .replace(/~~~[\s\S]*?~~~/g, blank)
    .replace(/`[^`\n]*`/g, blank);
}

export function extractMathSources(markdown: string): string[] {
  const scannable = blankOutCode(markdown);
  const found: { index: number; source: string }[] = [];

  // Block math first, so its delimiters are not re-read as two inline spans.
  const blockRe = /\$\$([\s\S]+?)\$\$/g;
  const consumed = new Set<number>();
  for (let m = blockRe.exec(scannable); m !== null; m = blockRe.exec(scannable)) {
    found.push({ index: m.index, source: m[1].trim() });
    for (let i = m.index; i < m.index + m[0].length; i += 1) consumed.add(i);
  }

  // Inline math: no whitespace directly after the opening delimiter, and the
  // delimiter must not be escaped.
  const inlineRe = /(^|[^\\$])\$(?!\s)([^\n$]+?)(?<!\\)\$/g;
  for (let m = inlineRe.exec(scannable); m !== null; m = inlineRe.exec(scannable)) {
    const start = m.index + m[1].length;
    if (consumed.has(start)) continue;
    found.push({ index: start, source: m[2].trim() });
  }

  return found.sort((a, b) => a.index - b.index).map((entry) => entry.source);
}

/**
 * MathJax's generated stylesheet references font files that live inside the
 * Obsidian app. Those URLs are dead in an exported file, and a remote one would
 * make the page phone home, so every url() and @font-face is removed. Math then
 * renders with the reader's fallback fonts: metrics shift slightly, but nothing
 * is lost and the file stays self-contained.
 */
export function sanitizeMathJaxCss(css: string): string {
  return css
    .replace(/@font-face\s*\{[^}]*\}/gi, "")
    .replace(/url\((['"]?)[^)]*\1\)/gi, "none")
    .trim();
}
