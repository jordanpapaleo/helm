# Render HTML Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make standalone `.html` files in a vault first-class Helm notes — read-only body rendered in a sandboxed iframe, full metadata parity with markdown, updating live as Claude rewrites them.

**Architecture:** One metadata model, two serializations. `NoteFrontmatter` is unchanged; `parseNote`/`serializeNote` dispatch on file extension. Markdown keeps YAML frontmatter; HTML stores the identical fields as JSON-encoded `<meta name="helm:*">` tags in `<head>`. The body renders in a sandboxed iframe and is never written back. Live update reuses the existing file-watcher path.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest, Rust (Tauri 2), gray-matter, MiniSearch.

**Design doc:** `docs/superpowers/specs/2026-07-31-render-html-design.md`

## Global Constraints

- Metadata values are **JSON-encoded uniformly**, including plain strings: `content='"Q3 Report"'`.
- Parsing is **tolerant**: attempt `JSON.parse`, fall back to the raw attribute string. Known-string fields are coerced to string after parsing.
- The HTML writer is **surgical**: it may touch only `helm:*` meta tags inside `<head>`. Every other byte of the document must be identical. No reformatting, no re-indentation, no parse-and-re-serialize.
- The body of an HTML note is **read-only**. Helm writes metadata only.
- The CSP that blocks network access is injected into the **`srcdoc` copy at render time** and is never written to disk.
- `deadline` stays a date; timestamps are UTC seconds-precision (`nowTimestamp()` from `src/lib/timestamps.ts`).
- All four gates must pass before any commit that ends a task: `npm test`, `npm run test:types`, `npm run lint`, and — for tasks touching `src-tauri` — `(cd src-tauri && cargo test)`.
- The HTML metadata codec is duplicated into `mcp-server/` (which never imports from `src/`) and joins the existing KEEP IN SYNC set.

## File Structure

**Phase 1 — codec (inert)**
- Create `src/lib/html-metadata.ts` — parse/serialize `helm:*` meta, attribute escaping, tolerant decode.
- Create `src/lib/html-metadata.test.ts`
- Create `src/lib/html-text.ts` — title resolution and text extraction for search.
- Create `src/lib/html-text.test.ts`

**Phase 2 — turn it on**
- Modify `src/lib/note-parser.ts` — extension dispatch in `parseNote` / `serializeNote`.
- Modify `src-tauri/src/vault.rs` — scanner and write guards accept `html`.
- Modify `src-tauri/src/lib.rs` — watcher emits for `.html` (if it filters).
- Create `src/components/editor/HtmlView.tsx` — sandboxed iframe renderer.
- Create `src/components/editor/HtmlView.test.tsx`
- Modify `src/components/layout/MainPanel.tsx` — route by format; view/source toggle.
- Modify `src/lib/search.ts` — index extracted text for HTML notes.

**Phase 3 — MCP and docs**
- Create `mcp-server/html-metadata.ts` (mirror of the codec)
- Create `mcp-server/html-metadata.test.ts`
- Modify `mcp-server/index.ts` — format-aware read/write, accept `.html`.
- Modify `CLAUDE.md` — document the `helm:*` convention beside the YAML schema.

---

# PHASE 1 — The codec (no behavior change)

### Task 1: Parse `helm:*` meta tags

**Files:**
- Create: `src/lib/html-metadata.ts`
- Test: `src/lib/html-metadata.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `parseHtmlMetadata(html: string): Record<string, unknown>`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { parseHtmlMetadata } from "./html-metadata";

describe("parseHtmlMetadata", () => {
  it("reads JSON-encoded values of every type", () => {
    const html = `<html><head>
      <meta name="helm:title" content='"Q3 Report"'>
      <meta name="helm:tags" content='["rfl","rfl/reports"]'>
      <meta name="helm:pinned" content="true">
      <meta name="helm:kanbanOrder" content="3">
    </head><body>x</body></html>`;
    expect(parseHtmlMetadata(html)).toEqual({
      title: "Q3 Report",
      tags: ["rfl", "rfl/reports"],
      pinned: true,
      kanbanOrder: 3,
    });
  });

  it("ignores non-helm meta tags", () => {
    const html = `<meta name="viewport" content="width=device-width">
                  <meta name="helm:title" content='"Kept"'>`;
    expect(parseHtmlMetadata(html)).toEqual({ title: "Kept" });
  });

  it("falls back to the raw string when the value is not valid JSON", () => {
    const html = `<meta name="helm:title" content="Hand Written">`;
    expect(parseHtmlMetadata(html)).toEqual({ title: "Hand Written" });
  });

  it("handles attributes in either order and single or double quotes", () => {
    const html = `<meta content='"A"' name="helm:title">
                  <meta name='helm:state' content='"Doing"'>`;
    expect(parseHtmlMetadata(html)).toEqual({ title: "A", state: "Doing" });
  });

  it("unescapes HTML entities in the attribute value", () => {
    const html = `<meta name="helm:title" content='&quot;A &amp; B&quot;'>`;
    expect(parseHtmlMetadata(html)).toEqual({ title: "A & B" });
  });

  it("returns an empty object for a document with no helm meta", () => {
    expect(parseHtmlMetadata("<html><body>nothing</body></html>")).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/html-metadata.test.ts`
Expected: FAIL — cannot find module `./html-metadata`

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Read and write Helm note metadata stored as `<meta name="helm:*">` tags.
 *
 * This is the HTML analogue of YAML frontmatter: the same NoteFrontmatter
 * fields, serialized differently. Values are JSON-encoded uniformly so each
 * one carries its own type — a meta attribute is always a string, so without
 * that the reader could not tell the number 3 from the string "3", and
 * unknown frontmatter fields (NoteFrontmatter has an index signature) would
 * have no type at all.
 *
 * KEEP IN SYNC with mcp-server/html-metadata.ts — the app and the MCP server
 * must agree exactly or metadata written by one is misread by the other.
 */

const META_TAG_RE = /<meta\b[^>]*>/gi;
const NAME_ATTR_RE = /\bname\s*=\s*["']helm:([^"']+)["']/i;
const CONTENT_ATTR_RE = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

/** Reverse of `escapeAttr`. Handles the five entities we emit plus &apos;. */
function unescapeAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * Decode one attribute value. Tolerant by design: machine writes are always
 * valid JSON, but a hand-written `content="Q3 Report"` must not silently
 * vanish, so an unparseable value is taken as a literal string.
 */
export function decodeMetaValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Extract every `helm:*` meta tag from an HTML document.
 *
 * @param html - Full HTML source
 * @returns Field name (without the `helm:` prefix) to decoded value
 */
export function parseHtmlMetadata(html: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [tag] of html.matchAll(META_TAG_RE)) {
    const name = NAME_ATTR_RE.exec(tag)?.[1];
    if (!name) continue;
    const m = CONTENT_ATTR_RE.exec(tag);
    const raw = m ? (m[1] ?? m[2] ?? "") : "";
    out[name] = decodeMetaValue(unescapeAttr(raw));
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/html-metadata.test.ts`
Expected: PASS — 6 tests

- [ ] **Step 5: Run the full gates**

Run: `npm test && npm run test:types && npm run lint`
Expected: all green

- [ ] **Step 6: Commit**

```bash
git add src/lib/html-metadata.ts src/lib/html-metadata.test.ts
git commit -m "Add helm:* meta tag parser for HTML notes"
```

---

### Task 2: Write `helm:*` meta tags surgically

**Files:**
- Modify: `src/lib/html-metadata.ts`
- Test: `src/lib/html-metadata.test.ts`

**Interfaces:**
- Consumes: `parseHtmlMetadata` from Task 1
- Produces: `writeHtmlMetadata(html: string, fields: Record<string, unknown>): string`

This is the highest-risk code in the feature. A save path that rewrites more than it was asked to destroyed real user data in this repo on 2026-07-31. The only permitted edits are removing existing `helm:*` meta tags and inserting the new block.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { parseHtmlMetadata, writeHtmlMetadata } from "./html-metadata";

describe("writeHtmlMetadata", () => {
  it("inserts a helm block into an existing head", () => {
    const html = `<html>\n<head>\n<title>Q3</title>\n</head>\n<body>\n<p>x</p>\n</body>\n</html>`;
    const out = writeHtmlMetadata(html, { title: "Q3 Report", pinned: true });
    expect(out).toContain(`<meta name="helm:title" content='"Q3 Report"'>`);
    expect(out).toContain(`<meta name="helm:pinned" content='true'>`);
    // everything else survives byte for byte
    expect(out).toContain(`<title>Q3</title>`);
    expect(out).toContain(`<body>\n<p>x</p>\n</body>`);
  });

  it("replaces existing helm tags rather than duplicating them", () => {
    const first = writeHtmlMetadata(`<html><head></head><body>b</body></html>`, { title: "A" });
    const second = writeHtmlMetadata(first, { title: "B" });
    expect(second.match(/name="helm:title"/g)).toHaveLength(1);
    expect(parseHtmlMetadata(second).title).toBe("B");
  });

  it("round-trips every value type", () => {
    const fields = {
      id: "01KX6HDM2Q4WJAB7DD0JE0R68N",
      title: "A & B's <report>",
      tags: ["rfl", "rfl/reports"],
      pinned: true,
      kanbanOrder: 3,
      links: [],
    };
    const out = writeHtmlMetadata(`<html><head></head><body></body></html>`, fields);
    expect(parseHtmlMetadata(out)).toEqual(fields);
  });

  it("creates a head when the document has none", () => {
    const out = writeHtmlMetadata(`<html>\n<body>\n<p>x</p>\n</body>\n</html>`, { title: "A" });
    expect(out).toMatch(/<head>[\s\S]*helm:title[\s\S]*<\/head>/);
    expect(out).toContain(`<body>\n<p>x</p>\n</body>`);
  });

  it("wraps a bare fragment that has no html element", () => {
    const out = writeHtmlMetadata(`<div class="c">hi</div>`, { title: "A" });
    expect(out).toMatch(/<html>[\s\S]*<head>[\s\S]*helm:title/);
    expect(out).toContain(`<div class="c">hi</div>`);
  });

  it("changes nothing but the helm block on rewrite", () => {
    const original = `<html>\n<head>\n  <meta charset="utf-8">\n  <style>body{color:red}</style>\n</head>\n<body>\n  <h1>Title</h1>\n</body>\n</html>`;
    const withMeta = writeHtmlMetadata(original, { title: "A" });
    const stripped = withMeta.replace(/\s*<meta name="helm:[^>]*>/g, "");
    expect(stripped).toBe(original);
  });

  it("omits undefined fields", () => {
    const out = writeHtmlMetadata(`<html><head></head><body></body></html>`, {
      title: "A",
      deadline: undefined,
    });
    expect(out).not.toContain("helm:deadline");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/html-metadata.test.ts`
Expected: FAIL — `writeHtmlMetadata is not a function`

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/html-metadata.ts`:

```ts
/** Escape a value for a single-quoted HTML attribute. */
function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/'/g, "&#39;").replace(/</g, "&lt;");
}

/** A helm meta tag and any whitespace that precedes it on its own line. */
const HELM_TAG_RE = /[ \t]*<meta\b[^>]*\bname\s*=\s*["']helm:[^"']+["'][^>]*>\n?/gi;

const HEAD_OPEN_RE = /<head\b[^>]*>/i;
const HTML_OPEN_RE = /<html\b[^>]*>/i;

/**
 * Rewrite the `helm:*` metadata of an HTML document, touching nothing else.
 *
 * Only two edits are ever made: existing `helm:*` meta tags are removed, and a
 * fresh block is inserted immediately after the opening `<head>` tag. The rest
 * of the document — formatting, indentation, comments, scripts, styles — is
 * preserved byte for byte. Do not "improve" this by parsing the document and
 * re-serializing it; that is precisely the failure mode this avoids.
 *
 * A document with no `<head>` gains one, and a bare fragment is wrapped, which
 * matches how a markdown file without frontmatter gains frontmatter.
 *
 * @param html - Full HTML source
 * @param fields - Field names without the `helm:` prefix; undefined values are omitted
 * @returns The document with its helm metadata block replaced
 */
export function writeHtmlMetadata(html: string, fields: Record<string, unknown>): string {
  const block = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `<meta name="helm:${k}" content='${escapeAttr(JSON.stringify(v))}'>`)
    .join("\n");

  const cleaned = html.replace(HELM_TAG_RE, "");

  const headMatch = HEAD_OPEN_RE.exec(cleaned);
  if (headMatch) {
    const at = headMatch.index + headMatch[0].length;
    return `${cleaned.slice(0, at)}\n${block}${cleaned.slice(at)}`;
  }

  const htmlMatch = HTML_OPEN_RE.exec(cleaned);
  if (htmlMatch) {
    const at = htmlMatch.index + htmlMatch[0].length;
    return `${cleaned.slice(0, at)}\n<head>\n${block}\n</head>${cleaned.slice(at)}`;
  }

  return `<html>\n<head>\n${block}\n</head>\n<body>\n${cleaned}\n</body>\n</html>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/html-metadata.test.ts`
Expected: PASS — 13 tests total

- [ ] **Step 5: Run the full gates**

Run: `npm test && npm run test:types && npm run lint`
Expected: all green

- [ ] **Step 6: Commit**

```bash
git add src/lib/html-metadata.ts src/lib/html-metadata.test.ts
git commit -m "Write helm:* meta tags without disturbing the rest of the document"
```

---

### Task 3: Title resolution and text extraction

**Files:**
- Create: `src/lib/html-text.ts`
- Test: `src/lib/html-text.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `htmlDocumentTitle(html: string): string`, `htmlToText(html: string): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { htmlDocumentTitle, htmlToText } from "./html-text";

describe("htmlDocumentTitle", () => {
  it("prefers the title element", () => {
    expect(htmlDocumentTitle("<head><title>From Title</title></head><body><h1>From H1</h1></body>"))
      .toBe("From Title");
  });

  it("falls back to the first h1", () => {
    expect(htmlDocumentTitle("<body><h1>From H1</h1><h1>Second</h1></body>")).toBe("From H1");
  });

  it("returns an empty string when neither is present", () => {
    expect(htmlDocumentTitle("<body><p>nothing</p></body>")).toBe("");
  });

  it("strips inner markup and collapses whitespace", () => {
    expect(htmlDocumentTitle("<h1>A <em>styled</em>\n  title</h1>")).toBe("A styled title");
  });
});

describe("htmlToText", () => {
  it("drops script and style content", () => {
    const html = `<style>body{color:red}</style><script>alert(1)</script><p>Real text</p>`;
    expect(htmlToText(html)).toBe("Real text");
  });

  it("drops tags and attributes but keeps their text", () => {
    expect(htmlToText(`<div class="card"><p>Hello</p><p>World</p></div>`)).toBe("Hello World");
  });

  it("decodes entities", () => {
    expect(htmlToText("<p>A &amp; B &lt;3</p>")).toBe("A & B <3");
  });

  it("drops comments, including helm metadata", () => {
    expect(htmlToText(`<!-- a comment --><meta name="helm:title" content='"X"'><p>Body</p>`))
      .toBe("Body");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/html-text.test.ts`
Expected: FAIL — cannot find module `./html-text`

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Text extraction for HTML notes.
 *
 * Search indexes what a reader sees, not the markup. Indexing raw HTML would
 * fill the index with tag names, class names, and CSS declarations, so every
 * note containing a stylesheet would match a search for "color".
 */

const SCRIPT_STYLE_RE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
const COMMENT_RE = /<!--[\s\S]*?-->/g;
const TAG_RE = /<[^>]+>/g;

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * The document's own title: `<title>` first, then the first `<h1>`.
 * Callers layer their own fallbacks (helm:title above, filename below).
 *
 * @param html - Full HTML source
 * @returns The title with markup stripped, or "" if the document has neither
 */
export function htmlDocumentTitle(html: string): string {
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  const raw = title ?? h1 ?? "";
  return collapse(decodeEntities(raw.replace(TAG_RE, " ")));
}

/**
 * Reader-visible text, for the search index.
 *
 * @param html - Full HTML source
 * @returns Whitespace-collapsed text with markup, scripts, styles and comments removed
 */
export function htmlToText(html: string): string {
  const withoutCode = html.replace(SCRIPT_STYLE_RE, " ").replace(COMMENT_RE, " ");
  return collapse(decodeEntities(withoutCode.replace(TAG_RE, " ")));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/html-text.test.ts`
Expected: PASS — 8 tests

- [ ] **Step 5: Run the full gates**

Run: `npm test && npm run test:types && npm run lint`
Expected: all green

- [ ] **Step 6: Commit**

```bash
git add src/lib/html-text.ts src/lib/html-text.test.ts
git commit -m "Add HTML title resolution and text extraction"
```

**Phase 1 ends here. Open a PR containing Tasks 1–3. It changes no behavior: nothing imports these modules yet.**

---

# PHASE 2 — Turn the feature on

### Task 4: Extension dispatch in the note parser

**Files:**
- Modify: `src/lib/note-parser.ts`
- Test: `src/lib/note-parser.test.ts`

**Interfaces:**
- Consumes: `parseHtmlMetadata`, `writeHtmlMetadata` (Task 1–2); `htmlDocumentTitle` (Task 3)
- Produces: `isHtmlPath(filePath: string): boolean`; `parseNote` and `serializeNote` handle both formats with unchanged signatures

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { parseNote, serializeNote } from "./note-parser";

describe("parseNote — HTML notes", () => {
  it("reads metadata from helm meta tags", () => {
    const html = `<html><head>
      <meta name="helm:id" content='"01KX6HDM2Q4WJAB7DD0JE0R68N"'>
      <meta name="helm:title" content='"Q3 Report"'>
      <meta name="helm:tags" content='["rfl"]'>
      <meta name="helm:state" content='"Doing"'>
    </head><body><p>x</p></body></html>`;
    const note = parseNote(html, "/v/report.html");
    expect(note.id).toBe("01KX6HDM2Q4WJAB7DD0JE0R68N");
    expect(note.frontmatter.title).toBe("Q3 Report");
    expect(note.frontmatter.tags).toEqual(["rfl"]);
    expect(note.frontmatter.state).toBe("Doing");
  });

  it("keeps the whole document as content", () => {
    const html = `<html><head><style>b{}</style></head><body><p>x</p></body></html>`;
    expect(parseNote(html, "/v/a.html").content).toBe(html);
  });

  it("falls back title to <title>, then <h1>, then filename", () => {
    expect(parseNote("<title>T</title>", "/v/a.html").frontmatter.title).toBe("T");
    expect(parseNote("<h1>H</h1>", "/v/a.html").frontmatter.title).toBe("H");
    expect(parseNote("<p>none</p>", "/v/my-report.html").frontmatter.title).toBe("My Report");
  });

  it("applies the same defaults markdown notes get", () => {
    const note = parseNote("<p>x</p>", "/v/a.html");
    expect(note.frontmatter.state).toBe("Prepare");
    expect(note.frontmatter.urgent).toBe(false);
    expect(note.frontmatter.tags).toEqual([]);
  });
});

describe("serializeNote — HTML notes", () => {
  it("writes metadata back and round-trips", () => {
    const note = parseNote(`<html><head></head><body><p>x</p></body></html>`, "/v/a.html");
    note.frontmatter.title = "Renamed";
    note.frontmatter.tags = ["a", "b"];
    const round = parseNote(serializeNote(note), "/v/a.html");
    expect(round.frontmatter.title).toBe("Renamed");
    expect(round.frontmatter.tags).toEqual(["a", "b"]);
  });

  it("leaves the body untouched", () => {
    const body = `<body>\n  <h1>Keep</h1>\n  <p>me</p>\n</body>`;
    const note = parseNote(`<html><head></head>${body}</html>`, "/v/a.html");
    expect(serializeNote(note)).toContain(body);
  });

  it("still writes YAML for markdown notes", () => {
    const note = parseNote("---\ntitle: A\n---\nbody", "/v/a.md");
    expect(serializeNote(note)).toMatch(/^---\n/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/note-parser.test.ts`
Expected: FAIL — HTML is parsed as markdown, so `frontmatter.title` falls back to the filename

- [ ] **Step 3: Write minimal implementation**

In `src/lib/note-parser.ts`, add the import and the dispatch. Keep the existing markdown bodies exactly as they are; extract them into `parseMarkdownNote` / `serializeMarkdownNote` only if that keeps the file readable.

```ts
import { parseHtmlMetadata, writeHtmlMetadata } from "./html-metadata";
import { htmlDocumentTitle } from "./html-text";

/** True when a path is an HTML note rather than a markdown one. */
export function isHtmlPath(filePath: string): boolean {
  return /\.html?$/i.test(filePath);
}

/** Fields Helm owns; anything else in the document's meta is preserved as-is. */
const STRING_FIELDS = new Set(["id", "title", "created", "updated", "state", "deadline"]);

function parseHtmlNote(raw: string, filePath: string): Note {
  const fileName = filePath.split("/").pop() ?? "";
  const data = parseHtmlMetadata(raw);

  // Tolerant parsing can hand back a number for a hand-written value like
  // content="2026"; coerce the fields the app treats as strings.
  for (const key of STRING_FIELDS) {
    if (data[key] !== undefined && typeof data[key] !== "string") data[key] = String(data[key]);
  }

  const frontmatter: NoteFrontmatter = {
    id: (data.id as string) ?? "",
    title: (data.title as string) || htmlDocumentTitle(raw) || derivetitleFromFilename(fileName),
    created: normalizeTimestamp(data.created) ?? nowTimestamp(),
    updated: normalizeTimestamp(data.updated) ?? nowTimestamp(),
    urgent: (data.urgent as boolean) ?? false,
    important: (data.important as boolean) ?? false,
    state: (data.state as NoteState) ?? "Prepare",
    blocked: (data.blocked as boolean) ?? false,
    locked: (data.locked as boolean) ?? false,
    pinned: (data.pinned as boolean) ?? false,
    deadline: data.deadline as string | undefined,
    team: data.team as string[] | undefined,
    links: (data.links as string[]) ?? [],
    ...data,
    tags: (data.tags as string[]) ?? [],
  };

  return { id: frontmatter.id, frontmatter, content: raw, filePath, fileName, vaultId: "" };
}
```

Then at the top of `parseNote`:

```ts
export function parseNote(raw: string, filePath: string): Note {
  if (isHtmlPath(filePath)) return parseHtmlNote(raw, filePath);
  // …existing markdown path unchanged…
}
```

And in `serializeNote`:

```ts
export function serializeNote(note: Note): string {
  const data = Object.fromEntries(
    Object.entries(note.frontmatter).filter(([, v]) => v !== undefined),
  );
  if (isHtmlPath(note.filePath)) return writeHtmlMetadata(note.content, data);
  return matter.stringify(note.content, data);
}
```

Note: HTML notes derive `tags` from metadata only. There are no inline `#tags` in an HTML body, so the merge rule in `mergeTagsOnSave` does not apply — and `handleSave` never runs for an HTML note, because the body is read-only.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/note-parser.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full gates**

Run: `npm test && npm run test:types && npm run lint`
Expected: all green

- [ ] **Step 6: Commit**

```bash
git add src/lib/note-parser.ts src/lib/note-parser.test.ts
git commit -m "Parse and serialize HTML notes through the same note model"
```

---

### Task 5: Let the Rust side see `.html`

**Files:**
- Modify: `src-tauri/src/vault.rs` (scanner at ~line 107; extension guards at ~232 and ~312)
- Modify: `src-tauri/src/lib.rs` (watcher filter, if present)
- Test: `src-tauri/src/vault.rs` `#[cfg(test)]` block

**Interfaces:**
- Consumes: nothing
- Produces: `list_notes` returns `.html` files; `write_note` and `rename_note` accept them; the watcher emits change events for them

- [ ] **Step 1: Write the failing test**

Add to the `#[cfg(test)]` module in `vault.rs`:

```rust
#[test]
fn list_notes_impl_collects_html_files() {
    let dir = temp_dir("list-html");
    fs::write(dir.join("note.md"), "# md").unwrap();
    fs::write(dir.join("report.html"), "<html></html>").unwrap();
    fs::write(dir.join("ignore.txt"), "nope").unwrap();

    let mut notes = list_notes_impl(dir.to_str().unwrap()).unwrap();
    notes.sort_by(|a, b| a.file_name.cmp(&b.file_name));

    assert_eq!(notes.len(), 2);
    assert_eq!(notes[0].file_name, "note.md");
    assert_eq!(notes[1].file_name, "report.html");
}

#[test]
fn list_notes_impl_still_skips_history_for_html() {
    let dir = temp_dir("skip-hidden-html");
    fs::write(dir.join("real.html"), "<html></html>").unwrap();
    let hidden = dir.join(".helm-history").join("01ABC");
    fs::create_dir_all(&hidden).unwrap();
    fs::write(hidden.join("123.html"), "<html>old</html>").unwrap();

    let notes = list_notes_impl(dir.to_str().unwrap()).unwrap();
    assert_eq!(notes.len(), 1);
    assert_eq!(notes[0].file_name, "real.html");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test list_notes_impl_collects_html_files`
Expected: FAIL — `assertion failed: left: 1, right: 2`

- [ ] **Step 3: Write minimal implementation**

Add a shared predicate near the top of `vault.rs` and use it everywhere an extension is checked:

```rust
/// True for files Helm treats as notes. Markdown and HTML are both note
/// formats — they differ only in where their metadata lives.
fn is_note_file(path: &std::path::Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()),
        Some("md") | Some("html") | Some("htm")
    )
}
```

Then replace the three extension checks:
- the scanner's `else if file_path.extension()… == Some("md")` becomes `else if is_note_file(&file_path)`
- the guard at ~line 232 becomes `if !is_note_file(&path) { … }`
- the `delete_asset_impl` guard at ~line 312 becomes `if is_note_file(&path) { return Err(…) }` so an HTML note can never be deleted as an asset

Check `src-tauri/src/lib.rs`'s `watch_vault` for a `.md` filter and widen it the same way. If it emits for every path, no change is needed — verify rather than assume.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src-tauri && cargo test`
Expected: PASS — all tests including the two new ones

- [ ] **Step 5: Run the full gates**

Run: `npm test && npm run test:types && npm run lint && (cd src-tauri && cargo test)`
Expected: all green

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/vault.rs src-tauri/src/lib.rs
git commit -m "Treat .html files as notes in the scanner and watcher"
```

---

### Task 6: Assign ids to HTML notes on discovery

**Files:**
- Modify: `src/hooks/useVault.ts` (`repairVaultFrontmatter`, ~lines 25–50)
- Test: `src/hooks/useVault.test.ts` (create if absent)

**Interfaces:**
- Consumes: `serializeNote` (Task 4)
- Produces: every HTML note in a vault has a persisted ULID after first load

`parseHtmlNote` sets `id: data.id ?? ""`, so a freshly discovered HTML file has no identity until something assigns one. Markdown solves this in `repairVaultFrontmatter`, which mints a ULID and writes it back. That function must cover HTML too, or HTML notes cannot be selected, linked, or given history.

This is the step that makes installing the feature modify existing files — deliberate, and the reason it appears in the release notes in Task 11.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { repairVaultFrontmatter } from "./useVault";
import { parseNote } from "../lib/note-parser";

describe("repairVaultFrontmatter", () => {
  it("mints and persists an id for an HTML note that lacks one", async () => {
    const writes: Array<[string, string]> = [];
    const note = parseNote("<html><head></head><body><p>x</p></body></html>", "/v/a.html");
    expect(note.id).toBe("");

    const repaired = await repairVaultFrontmatter([note], async (p, c) => {
      writes.push([p, c]);
    });

    expect(repaired[0].id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(writes).toHaveLength(1);
    expect(writes[0][1]).toContain("helm:id");
    // the body is untouched
    expect(writes[0][1]).toContain("<p>x</p>");
  });

  it("leaves a note that already has an id alone", async () => {
    const writes: string[] = [];
    const note = parseNote(
      `<html><head><meta name="helm:id" content='"01KX6HDM2Q4WJAB7DD0JE0R68N"'></head><body></body></html>`,
      "/v/a.html",
    );
    await repairVaultFrontmatter([note], async (_p, c) => {
      writes.push(c);
    });
    expect(writes).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useVault.test.ts`
Expected: FAIL — `repairVaultFrontmatter` is not exported, or does not accept an injected writer

- [ ] **Step 3: Write minimal implementation**

Export `repairVaultFrontmatter` and take the writer as a parameter so it is testable without Tauri. It is already format-agnostic in principle — it calls `serializeNote`, which now branches on extension — so the change is mostly making it reachable and making sure the id branch runs for HTML:

```ts
/**
 * Give every note a stable id, persisting any that are missing one.
 *
 * Works for both formats: `serializeNote` writes YAML for `.md` and `helm:*`
 * meta tags for `.html`, so the repair is identical either way. This is why
 * first load writes to HTML files the user has never opened — they arrive
 * without an id and cannot be selected, linked, or given history until they
 * have one.
 *
 * @param notes - Notes as parsed from disk
 * @param write - Persists a note; injected so tests need no Tauri runtime
 * @returns The notes, with ids filled in
 */
export async function repairVaultFrontmatter(
  notes: Note[],
  write: (filePath: string, content: string) => Promise<void>,
): Promise<Note[]> {
  const out: Note[] = [];
  for (const note of notes) {
    if (note.id) {
      out.push(note);
      continue;
    }
    const id = ulid();
    const repaired: Note = { ...note, id, frontmatter: { ...note.frontmatter, id } };
    try {
      await write(repaired.filePath, serializeNote(repaired));
    } catch (e) {
      reportError("Failed to assign an id", e);
    }
    out.push(repaired);
  }
  return out;
}
```

Update the existing call site to pass `tauriCommands.writeNote`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useVault.test.ts`
Expected: PASS — 2 tests

- [ ] **Step 5: Run the full gates**

Run: `npm test && npm run test:types && npm run lint`
Expected: all green

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useVault.ts src/hooks/useVault.test.ts
git commit -m "Assign ids to HTML notes on first load"
```

---

### Task 7: The sandboxed renderer

**Files:**
- Create: `src/components/editor/HtmlView.tsx`
- Test: `src/components/editor/HtmlView.test.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: `<HtmlView html={string} />`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HtmlView } from "./HtmlView";

describe("HtmlView", () => {
  it("renders the document in a sandboxed iframe", () => {
    render(<HtmlView html="<p>hello</p>" />);
    const frame = screen.getByTitle("Rendered HTML") as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.srcdoc).toContain("<p>hello</p>");
  });

  it("never grants same-origin, which would expose the Tauri bridge", () => {
    render(<HtmlView html="<p>x</p>" />);
    const frame = screen.getByTitle("Rendered HTML");
    expect(frame.getAttribute("sandbox")).not.toContain("allow-same-origin");
  });

  it("injects a network-blocking CSP into the rendered copy only", () => {
    const html = "<html><head></head><body>x</body></html>";
    render(<HtmlView html={html} />);
    const frame = screen.getByTitle("Rendered HTML") as HTMLIFrameElement;
    expect(frame.srcdoc).toContain("Content-Security-Policy");
    expect(frame.srcdoc).toContain("default-src 'none'");
    // the source document is not mutated
    expect(html).not.toContain("Content-Security-Policy");
  });

  it("re-renders when the document changes underneath it", () => {
    const { rerender } = render(<HtmlView html="<p>first</p>" />);
    rerender(<HtmlView html="<p>second</p>" />);
    const frame = screen.getByTitle("Rendered HTML") as HTMLIFrameElement;
    expect(frame.srcdoc).toContain("<p>second</p>");
    expect(frame.srcdoc).not.toContain("<p>first</p>");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/editor/HtmlView.test.tsx`
Expected: FAIL — cannot find module `./HtmlView`

- [ ] **Step 3: Write minimal implementation**

```tsx
import { useMemo } from "react";

/**
 * Content-Security-Policy injected into the rendered copy of the document.
 *
 * Helm is offline-first: opening a note must never become a network event.
 * Inline styles and scripts are allowed because that is how self-contained
 * exports and Claude-generated documents are written; everything remote is
 * refused. This is injected into the srcdoc copy at render time and is never
 * written to the file on disk.
 */
const CSP =
  "<meta http-equiv=\"Content-Security-Policy\" content=\"" +
  "default-src 'none'; " +
  "style-src 'unsafe-inline'; " +
  "script-src 'unsafe-inline'; " +
  "img-src data:; " +
  "font-src data:\">";

function withCsp(html: string): string {
  const head = /<head\b[^>]*>/i.exec(html);
  if (head) {
    const at = head.index + head[0].length;
    return `${html.slice(0, at)}${CSP}${html.slice(at)}`;
  }
  return `<head>${CSP}</head>${html}`;
}

/**
 * Render an HTML note's body.
 *
 * The document runs inside a sandboxed iframe with scripts enabled but
 * same-origin denied, so charts and interactivity work while the content sits
 * in an opaque origin: it cannot reach `window.__TAURI__`, the vault, or
 * Helm's DOM. Never add `allow-same-origin` — it defeats the entire boundary.
 */
export function HtmlView({ html }: { html: string }) {
  const srcDoc = useMemo(() => withCsp(html), [html]);
  return (
    <iframe
      title="Rendered HTML"
      sandbox="allow-scripts"
      srcDoc={srcDoc}
      className="flex-1 w-full border-0 bg-white"
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/editor/HtmlView.test.tsx`
Expected: PASS — 4 tests

- [ ] **Step 5: Run the full gates**

Run: `npm test && npm run test:types && npm run lint`
Expected: all green

- [ ] **Step 6: Commit**

```bash
git add src/components/editor/HtmlView.tsx src/components/editor/HtmlView.test.tsx
git commit -m "Render HTML notes in a sandboxed iframe"
```

---

### Task 8: Route HTML notes in MainPanel

**Files:**
- Modify: `src/components/layout/MainPanel.tsx`
- Test: `src/components/layout/MainPanel.test.tsx`

**Interfaces:**
- Consumes: `HtmlView` (Task 7), `isHtmlPath` (Task 4)
- Produces: nothing further

- [ ] **Step 1: Write the failing test**

```tsx
it("renders an HTML note in the sandboxed view, not the editor", () => {
  setup(makeNote({ filePath: "/vault/report.html", content: "<p>hi</p>" }), false);
  expect(screen.getByTitle("Rendered HTML")).toBeTruthy();
  expect(document.querySelector(".ProseMirror")).toBeNull();
});

it("shows source instead of the rich editor when toggled", () => {
  setup(makeNote({ filePath: "/vault/report.html", content: "<p>hi</p>" }), false);
  act(() => {
    fireEvent.click(screen.getByTitle("Switch to Markdown"));
  });
  const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
  expect(textarea.value).toContain("<p>hi</p>");
  expect(textarea.readOnly).toBe(true);
});

it("never writes an HTML note's body", async () => {
  setup(makeNote({ filePath: "/vault/report.html", content: "<p>hi</p>" }), false);
  act(() => {
    fireEvent.blur(screen.getByTitle("Rendered HTML"));
  });
  expect(tauriCommands.writeNote).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/layout/MainPanel.test.tsx`
Expected: FAIL — no element with title "Rendered HTML"

- [ ] **Step 3: Write minimal implementation**

In `MainPanel`, replace the markdown/editor ternary with a three-way branch:

```tsx
const isHtml = isHtmlPath(selectedNote.filePath);

{isHtml ? (
  markdownMode ? (
    <textarea
      readOnly
      value={selectedNote.content}
      spellCheck={false}
      className="flex-1 resize-none bg-transparent px-12 py-6 outline-none opacity-75"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--editor-font-size)",
        lineHeight: "var(--editor-line-height)",
        color: "var(--color-text)",
      }}
    />
  ) : (
    <HtmlView html={selectedNote.content} />
  )
) : markdownMode ? (
  <MarkdownTextarea … />
) : (
  <NoteEditor … />
)}
```

`handleFrontmatterChange` is untouched and keeps working — it calls `serializeNote`, which now writes meta tags for HTML notes. `handleSave` is simply never reached, because neither HTML surface calls `onSave`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/layout/MainPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full gates**

Run: `npm test && npm run test:types && npm run lint`
Expected: all green

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/MainPanel.tsx src/components/layout/MainPanel.test.tsx
git commit -m "Route HTML notes to the sandboxed view with a read-only source toggle"
```

---

### Task 9: Index extracted text, not markup

**Files:**
- Modify: `src/lib/search.ts`
- Test: `src/lib/search.test.ts`

**Interfaces:**
- Consumes: `htmlToText` (Task 3), `isHtmlPath` (Task 4)
- Produces: nothing further

- [ ] **Step 1: Write the failing test**

```ts
it("indexes an HTML note's text, not its markup", () => {
  const notes = [
    makeNote({ filePath: "/v/a.html", content: `<style>p{color:red}</style><p>quarterly revenue</p>` }),
  ];
  const index = buildIndex(notes);
  expect(searchNotes(index, notes, "revenue")).toHaveLength(1);
  expect(searchNotes(index, notes, "color")).toHaveLength(0);
  expect(searchNotes(index, notes, "style")).toHaveLength(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/search.test.ts`
Expected: FAIL — searching "color" returns 1 result

- [ ] **Step 3: Write minimal implementation**

In `buildIndex`, replace the raw `content` field with:

```ts
content: isHtmlPath(note.filePath) ? htmlToText(note.content) : note.content,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/search.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full gates**

Run: `npm test && npm run test:types && npm run lint`
Expected: all green

- [ ] **Step 6: Commit**

```bash
git add src/lib/search.ts src/lib/search.test.ts
git commit -m "Index HTML notes by their text rather than their markup"
```

**Phase 2 ends here. Open a PR containing Tasks 4–9 — this is the one that needs real scrutiny, and it should be exercised in the running app before merging: add a vault containing an HTML file, confirm it lists, renders, tags, pins, and updates live when the file is rewritten on disk.**

---

# PHASE 3 — MCP and the documented convention

### Task 10: Format-aware MCP read and write

**Files:**
- Create: `mcp-server/html-metadata.ts`
- Create: `mcp-server/html-metadata.test.ts`
- Modify: `mcp-server/index.ts`

**Interfaces:**
- Consumes: nothing from `src/` — the MCP server deliberately does not import from the app
- Produces: MCP tools that read and write `.html` notes

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { parseHtmlMetadata, writeHtmlMetadata } from "./html-metadata";

describe("mcp html-metadata mirrors the app codec", () => {
  it("round-trips the same shapes", () => {
    const fields = { id: "01K", title: "A & B", tags: ["x"], pinned: true, kanbanOrder: 2 };
    const out = writeHtmlMetadata("<html><head></head><body>b</body></html>", fields);
    expect(parseHtmlMetadata(out)).toEqual(fields);
  });

  it("tolerates hand-written values", () => {
    expect(parseHtmlMetadata(`<meta name="helm:title" content="Plain">`)).toEqual({
      title: "Plain",
    });
  });

  it("leaves the body untouched", () => {
    const body = "<body>\n  <p>keep</p>\n</body>";
    const out = writeHtmlMetadata(`<html><head></head>${body}</html>`, { title: "A" });
    expect(out).toContain(body);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run mcp-server/html-metadata.test.ts`
Expected: FAIL — cannot find module `./html-metadata`

- [ ] **Step 3: Write minimal implementation**

Copy `src/lib/html-metadata.ts` to `mcp-server/html-metadata.ts` verbatim, changing only the header comment to point back:

```ts
/**
 * KEEP IN SYNC with src/lib/html-metadata.ts — this is a deliberate copy. The
 * MCP server never imports from src/, so the two must be changed together or
 * metadata written by one is misread by the other.
 */
```

Then in `mcp-server/index.ts` there are exactly two choke points — the loader and the writer.

**Loader** (~line 87). Widen the filter and branch the parse. For an HTML note `content` is the
whole document, matching how the app represents it:

```ts
const isHtmlPath = (p: string) => /\.html?$/i.test(p);

const files = fs.readdirSync(vault.path).filter((f) => f.endsWith(".md") || isHtmlPath(f));
for (const file of files) {
  const filePath = path.join(vault.path, file);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const { data, content } = isHtmlPath(filePath)
      ? { data: parseHtmlMetadata(raw), content: raw }
      : matter(raw);
    notes.push({
      frontmatter: normalizeNoteData(data),
      content,
      filePath,
      fileName: file,
      vaultName: vault.name,
    });
  } catch {
    // Skip unreadable files
  }
}
```

**Writer** (~line 112):

```ts
function writeNote(filePath: string, frontmatter: NoteData, content: string): void {
  const data = Object.fromEntries(Object.entries(frontmatter).filter(([, v]) => v !== undefined));
  fs.writeFileSync(
    filePath,
    isHtmlPath(filePath) ? writeHtmlMetadata(content, data) : matter.stringify(content, data),
  );
}
```

**`update_note` must refuse to change an HTML note's body.** The body is read-only in the app, and
the MCP server must not become a back door around that. Early in the handler, once the note is
resolved:

```ts
if (isHtmlPath(note.filePath) && args?.content !== undefined) {
  return {
    content: [
      {
        type: "text",
        text:
          "Cannot edit the body of an HTML note — Helm renders it read-only. " +
          "Metadata (title, tags, state, …) can still be updated. " +
          "To change the body, write the file directly.",
      },
    ],
  };
}
```

Finally, update the `update_note`, `create_note`, and `list_notes` tool descriptions to state that
`.html` notes keep metadata in `helm:*` meta tags and that their body is read-only.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run mcp-server/html-metadata.test.ts`
Expected: PASS — 3 tests

- [ ] **Step 5: Smoke-test the server over stdio**

Run the server against a scratch vault containing one HTML note; call `list_notes`, `read_note`, and `update_note` (metadata only) and confirm the file's body is byte-identical afterward.

- [ ] **Step 6: Run the full gates**

Run: `npm test && npm run test:types && npm run lint`
Expected: all green

- [ ] **Step 7: Commit**

```bash
git add mcp-server/html-metadata.ts mcp-server/html-metadata.test.ts mcp-server/index.ts
git commit -m "Teach the MCP server to read and write HTML note metadata"
```

---

### Task 11: Document the convention

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything above
- Produces: the written convention that makes the metadata durable

This is not paperwork. Frontmatter survives Claude's edits because the MCP server preserves it *and* the schema is documented where Claude reads it. HTML metadata needs the same.

- [ ] **Step 1: Add an HTML section to the Data Model**

In `CLAUDE.md`, directly after the YAML frontmatter example, add:

````markdown
HTML notes (`.html`) carry the **same fields** in `<meta>` tags, JSON-encoded:

```html
<head>
  <meta name="helm:id" content='"01JPMXYZ123"'>
  <meta name="helm:title" content='"My Report"'>
  <meta name="helm:tags" content='["work","work/project"]'>
  <meta name="helm:state" content='"Doing"'>
  <meta name="helm:pinned" content="false">
</head>
```

The body of an HTML note is **read-only** — Helm renders it in a sandboxed iframe and never
writes it. Only the `helm:*` meta tags are ever modified. Preserve them when editing these
files, exactly as you would preserve YAML frontmatter in a `.md` note.
````

- [ ] **Step 2: Add the codec to the KEEP IN SYNC list**

In the Key Conventions section, extend the parser-sync bullet to name `src/lib/html-metadata.ts` and `mcp-server/html-metadata.ts`.

- [ ] **Step 3: Note the first-load write in the release notes section**

Record that enabling this feature causes Helm to write a `<head>` into HTML files it has never opened, in order to assign ids — consistent with `repairVaultFrontmatter` for markdown.

- [ ] **Step 4: Run the full gates**

Run: `npm test && npm run test:types && npm run lint`
Expected: all green

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "Document the helm:* meta convention for HTML notes"
```

**Phase 3 ends here. Open a PR containing Tasks 10–11.**

---

## Verification before calling this done

- [ ] All four gates green on `main` after every PR merges
- [ ] In the running app: an HTML file in a vault appears in the note list, renders, and can be tagged, pinned, renamed, and moved
- [ ] Rewriting that file on disk updates the rendered view without a restart
- [ ] A chart or script inside an HTML note runs
- [ ] The same document cannot reach `window.__TAURI__` — check the devtools console inside the frame
- [ ] Searching for a word in an HTML note's text finds it; searching for a CSS property name does not
- [ ] `git diff` on a real HTML file after a metadata change shows only `helm:*` meta lines
