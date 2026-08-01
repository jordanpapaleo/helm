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
