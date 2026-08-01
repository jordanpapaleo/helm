# Render HTML Files

**Date:** 2026-07-31
**Status:** Draft — awaiting review

## Problem

Helm only recognises `.md` files. The vault scanner collects files whose extension is `md`
(`src-tauri/src/vault.rs`), so a `.html` file sitting in a vault folder is invisible to the app —
it does not appear in the note list, the folder tree, or search.

Customers keep HTML in their vaults and want to read it in Helm. Three sources, all of them
content the user or their own tools produced:

- exported reports and documents (Notion, Google Docs, BI dashboards, test reports)
- hand-written markup
- **Claude-generated HTML that Claude then keeps updating** — the file changes on disk and Helm
  must reflect the change without a restart

Saved web pages are explicitly out of scope. That was the one category carrying untrusted scripts,
tracking, and remote asset references, and excluding it is what makes the security model tractable.

## Decisions

| Decision | Choice |
|---|---|
| Scope | Standalone `.html` files in the vault |
| Body | Read-only — no content editing in Helm |
| Metadata | Fully editable, identical to markdown notes |
| Rendering | Sandboxed `<iframe srcdoc>`, `allow-scripts`, no same-origin, no network |
| Live update | Re-render on file change, via the existing watcher |
| Metadata home | `<meta name="helm:*">` in `<head>` — the HTML analogue of YAML frontmatter |
| Encoding | JSON-encoded values, tolerantly parsed |
| Missing `<head>` | Helm creates one and wraps the document |
| MCP | Format-aware read/write — this is what makes metadata durable |

## Core idea: one metadata model, two serializations

A note is metadata plus content. The metadata model does not change and does not fork. Only its
on-disk representation varies by file type.

```
parseNote(raw, filePath)   → .md   : gray-matter YAML frontmatter        (today)
                           → .html : <meta name="helm:*"> tags           (new)

serializeNote(note)        → .md   : matter.stringify                    (today)
                           → .html : rewrite only helm:* meta in <head>  (new)
```

Every `NoteFrontmatter` field carries over unchanged: `id`, `title`, `created`, `updated`, `tags`,
`urgent`, `important`, `state`, `blocked`, `deadline`, `team`, `links`, `locked`, `pinned`,
`unmanaged`, `kanbanOrder`, `eisenhowerOrder`, plus any unknown fields the index signature allows.

**Consequence worth stating plainly:** because an HTML note has the same fields as any other note,
it needs no special-casing in Kanban, Eisenhower, the graph, the briefing, search, or the property
panel. There is no "HTML note is a lesser thing" branch anywhere. The `unmanaged` flag remains the
escape hatch for a file the user does not want in the workflow views, exactly as for markdown.

### Metadata encoding

Values are JSON-encoded:

```html
<head>
  <meta name="helm:id"      content='"01KX6HDM2Q4WJAB7DD0JE0R68N"'>
  <meta name="helm:title"   content='"Q3 Report"'>
  <meta name="helm:tags"    content='["rfl","rfl/reports"]'>
  <meta name="helm:pinned"  content="true">
  <meta name="helm:created" content='"2026-07-31T18:23:05Z"'>
</head>
```

One uniform rule, because `NoteFrontmatter` carries unknown fields of unknown type. A
"strings raw, everything else JSON" rule would require the app and the MCP server to share a field
type table forever, and would silently corrupt any field not in it.

**Parsing is tolerant.** Attempt `JSON.parse`; on failure treat the raw attribute value as a
string. Hand-written markup is one of the stated sources, and a human writing
`content="Q3 Report"` without the inner quotes must not silently lose the title.

### Files without a `<head>`

Helm creates one and wraps the document, matching the existing behaviour for markdown files that
arrive without frontmatter (`repairVaultFrontmatter` in `src/hooks/useVault.ts` already assigns and
writes back a missing id). The experience is consistent even though the HTML rewrite is more
structural than adding a YAML block.

### Title resolution

`helm:title` → `<title>` → first `<h1>` → filename, mirroring `parseNote`'s existing
`title → H1 → filename` fallback chain for markdown.

### Search

Search indexes **extracted text**, not raw markup. Indexing tag names, attributes, and CSS would
pollute results. `content` on the in-memory `Note` remains the full document, because the renderer
needs the whole file including `<head>` styles; text extraction happens at index time.

## Rendering

`MainPanel` selects the surface by file format. Markdown gets TipTap or the raw textarea as today;
HTML gets a new `HtmlView`. `PropertyPanel` renders above it unchanged, so all metadata stays
editable.

`HtmlView` renders the document into a sandboxed iframe:

- `sandbox="allow-scripts"` — **without** `allow-same-origin`. Scripts run, so Claude-generated
  charts and interactive content work, but the document is in an opaque origin: it cannot reach
  `window.__TAURI__`, the vault, or Helm's DOM.
- A CSP blocking network requests, preserving Helm's offline guarantee. The CSP is injected into
  the copy handed to `srcdoc` at render time — **it is never written to the file on disk.** The
  rendered document and the stored document differ by exactly this one injected header.
- `srcdoc` fed from `note.content`.

**Live update** requires no new machinery: the file watcher already fires on writes, `note.content`
already flows to the component, and changing `srcdoc` re-renders the iframe.

### Reuse

- The existing editor/markdown toggle becomes **view/source** for HTML notes, giving a read-only
  source view at no cost.
- `unmanaged` already exists as the workflow-view escape hatch.

### Known limitation

Without `allow-same-origin` Helm cannot reach into the iframe, so a link inside an HTML file
navigates the iframe rather than opening the system browser. Solvable later with a `postMessage`
channel; not worth it for v1.

## MCP server

The MCP server is why metadata is durable. `update_note` does read-modify-write through `matter()`,
so frontmatter survives by construction rather than by Claude choosing to preserve it. HTML
metadata needs the same guarantee, so MCP support is part of this work, not a follow-up.

- Parse `helm:*` meta on read; rewrite surgically on write.
- Accept `.html` in the tools that currently assume `.md`.
- The HTML metadata codec is duplicated in `src/lib/` and `mcp-server/` — the server deliberately
  does not import from `src/` — so it joins the existing KEEP IN SYNC set.
- Document the convention in CLAUDE.md's Data Model section beside the YAML schema. The convention
  being written down is the mechanism by which Claude maintains it.

## Risks

**The surgical write is the dangerous part.** `serializeNote` for HTML must touch only `helm:*` meta
tags in `<head>` and leave every other byte identical — no reformatting, no re-indentation, no
round-tripping the document through a parser and back. A save path that rewrites more than it was
asked to destroyed real user data earlier today; the tag-rewrite work in `src/lib/tags.ts` is the
template to follow.

**Discovery writes to existing files.** Once the scanner accepts `.html`, every HTML file in a vault
becomes a note needing an id, so Helm writes a `<head>` into files it has never touched. This is
consistent with `repairVaultFrontmatter` and was an explicit decision, but installing the feature
modifies existing files on first load, and that should be stated in release notes.

**Rust changes.** The scanner (`vault.rs:107`) and the file watcher both filter on `md`, so
`cargo test` returns to the verification set.

## Testing

- **Pure codec tests** for the HTML metadata parser and serializer: every field type, unknown
  fields, tolerant parsing of hand-written values, missing `<head>`, missing `<html>`, malformed
  markup.
- **Byte-preservation property test:** for a corpus of real HTML files, writing metadata changes
  only the `helm:*` meta tags and nothing else.
- **Round-trip test:** `parseNote(serializeNote(note))` returns an equal note for both formats.
- **Sandbox attributes** asserted on the rendered iframe. Full isolation cannot be verified in
  jsdom; note what needs a human check.
- **Live update:** changing `note.content` updates the rendered document.
- **Search:** indexed text excludes markup, attributes, and CSS.

## Out of scope

- Editing HTML content in Helm (metadata only)
- Saved web pages, remote assets, network access
- Opening in-document links in the system browser
- HTML embedded inside markdown notes (`html: false` stays as-is)
- Converting HTML notes to markdown or vice versa

## Resolved: encoding uniformity

**Decided — every value is JSON-encoded, including plain strings**, so `helm:title` reads
`content='"Q3 Report"'`.

The alternative (raw strings, JSON for everything else) reads more naturally by hand but requires a
field type table shared identically by the app and the MCP server, and cannot round-trip the
unknown fields `NoteFrontmatter`'s index signature preserves. Hand-authoring HTML metadata is not
an anticipated workflow, so the readability advantage buys little.

Tolerant parsing is retained as a cheap safety net rather than a critical path. Note its one
wrinkle: a hand-written `content="2026"` parses as the *number* 2026, so known-string fields are
coerced to string after parsing.
