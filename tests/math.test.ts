import { describe, it, expect } from "vitest";
import { extractMathSources, sanitizeMathJaxCss } from "../math";

describe("extractMathSources", () => {
  it("finds inline math", () => {
    expect(extractMathSources("Euler: $e^{i\\pi} + 1 = 0$ is neat")).toEqual(["e^{i\\pi} + 1 = 0"]);
  });

  it("finds block math spanning lines", () => {
    const md = "Before\n\n$$\n\\int_0^\\infty e^{-x^2}\\,dx\n$$\n\nAfter";
    expect(extractMathSources(md)).toEqual(["\\int_0^\\infty e^{-x^2}\\,dx"]);
  });

  it("returns inline and block math in document order", () => {
    const md = "$a$ then\n\n$$b$$\n\nand $c$";
    expect(extractMathSources(md)).toEqual(["a", "b", "c"]);
  });

  it("ignores dollars inside a fenced code block", () => {
    const md = "```bash\necho $HOME\n```\n\n$x$";
    expect(extractMathSources(md)).toEqual(["x"]);
  });

  it("ignores dollars inside an inline code span", () => {
    expect(extractMathSources("`$5` costs $y$")).toEqual(["y"]);
  });

  it("ignores an escaped dollar sign", () => {
    expect(extractMathSources("\\$100 and \\$200")).toEqual([]);
  });

  it("does not treat a currency pair as math", () => {
    // Obsidian requires no whitespace immediately after the opening delimiter.
    expect(extractMathSources("It costs $ 5 and $ 10 total")).toEqual([]);
  });

  it("returns an empty array when there is no math", () => {
    expect(extractMathSources("plain text")).toEqual([]);
  });
});

describe("sanitizeMathJaxCss", () => {
  it("removes @font-face blocks so the export needs no font files", () => {
    const css = "@font-face {font-family: MJXZERO; src: url(mathjax/output/woff/x.woff);}\nmjx-c {color: red}";
    const out = sanitizeMathJaxCss(css);
    expect(out).not.toContain("@font-face");
    expect(out).toContain("mjx-c {color: red}");
  });

  it("strips any remaining remote url() so the page cannot phone home", () => {
    const css = "mjx-x {background: url(https://cdn.example.com/a.png)}";
    expect(sanitizeMathJaxCss(css)).not.toContain("https://cdn.example.com");
  });

  it("strips app:// urls, which are meaningless outside Obsidian", () => {
    expect(sanitizeMathJaxCss("mjx-x{background:url(app://abc/f.woff)}")).not.toContain("app://");
  });

  it("leaves plain rules untouched", () => {
    const css = "mjx-container[jax=CHTML] {line-height: 0}";
    expect(sanitizeMathJaxCss(css)).toBe(css);
  });

  it("returns an empty string for empty input", () => {
    expect(sanitizeMathJaxCss("")).toBe("");
  });
});
