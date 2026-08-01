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

/**
 * Escape a value for a single-quoted HTML attribute. Exact inverse of
 * `unescapeAttr`. `&` is escaped first so entities introduced by the later
 * replacements are not themselves re-escaped. `>` must be escaped (not just
 * `<`): `parseHtmlMetadata`'s tag matcher stops at the first raw `>`, so an
 * unescaped `>` inside a value truncates the tag and silently drops content.
 */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * A helm meta tag and the newline (+ indentation) immediately preceding it.
 *
 * The leading part matches *before* the tag, not after, because insertion
 * always prepends a newline to the block (see `writeHtmlMetadata`). Matching
 * on the same side as insertion is what makes removal the exact inverse of
 * insertion: `write(write(doc, f), f) === write(doc, f)`. An earlier version
 * consumed a trailing `\n` instead, which is *not* the inverse of a leading
 * insertion — on a `<head>` with no pre-existing whitespace, that left a
 * stray `\n` behind on every write after the first (see html-impl task-2
 * review, finding 2). `\r?` makes the match CRLF-aware so the same tag is
 * removed cleanly regardless of the document's line-ending style.
 */
const HELM_TAG_RE = /(?:\r?\n)?[ \t]*<meta\b[^>]*\bname\s*=\s*["']helm:[^"']+["'][^>]*>/gi;

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
 * The document's own line-ending style (CRLF vs LF) is detected and reused
 * for every newline this function inserts, so a CRLF document never gains a
 * stray bare `\n`.
 *
 * @warning `fields` is treated as the **complete** metadata set, not a patch.
 * Every existing `helm:*` tag is removed before the new block is written, and
 * only the keys present in `fields` are written back — a `helm:*` field that
 * exists on disk but is missing from `fields` is silently deleted, with no
 * warning. This mirrors `serializeNote`'s YAML frontmatter contract
 * (`src/lib/note-parser.ts`), which likewise always serializes the complete
 * frontmatter object rather than patching it. Callers must read-merge-write:
 * load the current metadata (`parseHtmlMetadata`), merge in only the changed
 * fields, and pass the full merged result here. Passing a partial field set
 * (e.g. `{ title: "New" }` meant as an update to just one field) reproduces
 * the exact shape of the frontmatter data-loss bug this module exists to
 * avoid — it does not raise or warn, it just erases the omitted fields.
 *
 * @param html - Full HTML source
 * @param fields - The complete field set to write, without the `helm:`
 *   prefix; undefined values are omitted. Not merged with what's on disk —
 *   see the warning above.
 * @returns The document with its helm metadata block replaced
 */
export function writeHtmlMetadata(html: string, fields: Record<string, unknown>): string {
  const cleaned = html.replace(HELM_TAG_RE, "");
  const nl = cleaned.includes("\r\n") ? "\r\n" : "\n";

  const block = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `<meta name="helm:${k}" content='${escapeAttr(JSON.stringify(v))}'>`)
    .join(nl);

  const headMatch = HEAD_OPEN_RE.exec(cleaned);
  if (headMatch) {
    const at = headMatch.index + headMatch[0].length;
    return `${cleaned.slice(0, at)}${nl}${block}${cleaned.slice(at)}`;
  }

  const htmlMatch = HTML_OPEN_RE.exec(cleaned);
  if (htmlMatch) {
    const at = htmlMatch.index + htmlMatch[0].length;
    return `${cleaned.slice(0, at)}${nl}<head>${nl}${block}${nl}</head>${cleaned.slice(at)}`;
  }

  return `<html>${nl}<head>${nl}${block}${nl}</head>${nl}<body>${nl}${cleaned}${nl}</body>${nl}</html>`;
}
