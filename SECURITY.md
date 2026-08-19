# Security

## Reporting a vulnerability

Please report privately through
[GitHub's private vulnerability reporting](https://github.com/YOUR_GH_USERNAME/obsidian-canvas-to-html/security/advisories/new)
rather than opening a public issue.

## Threat model

An exported file is meant to be shared, so it is treated as something that leaves
the author's machine and is opened by someone else, possibly offline.

Two properties are enforced, and both have tests:

1. **No network access.** Nothing in an export fetches anything. Images are
   inlined, remote images are dropped rather than linked, MathJax font URLs are
   stripped, and web-link cards are plain links rather than iframes.
2. **No executable content.** Markdown rendered by Obsidian passes through
   `sanitizeHTMLToDom`; interactive chrome, `<script>`, `<iframe>`, `<object>`,
   `<embed>`, and every `on*` attribute are removed. MathJax output is the single
   subtree carried across the sanitizer, under a strict element and attribute
   allowlist that permits no URLs.

Vault content is only ever read from the vault and written to the export the user
asked for. The plugin makes no outbound connections of its own.

## Scope

Reports about the exported file executing script, reaching the network, or
leaking vault content beyond what the exported canvas references are in scope.
Note that an export intentionally contains the full text of the notes on that
canvas — that is the feature, not a leak.
