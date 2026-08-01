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
 * Markup-strip and whitespace-collapse a captured title/h1 group. Returns ""
 * for an absent match, an empty element, a whitespace-only element, or an
 * element containing only markup — any of which should fall through to the
 * next candidate in `htmlDocumentTitle`'s resolution chain.
 */
function cleanCandidate(raw: string | undefined): string {
  if (raw === undefined) return "";
  return collapse(decodeEntities(raw.replace(TAG_RE, " ")));
}

/**
 * The document's own title: `<title>` first, then the first `<h1>`.
 * Callers layer their own fallbacks (helm:title above, filename below).
 *
 * A candidate is used only if it has actual text after markup is stripped
 * and whitespace collapsed — an empty, whitespace-only, or markup-only
 * `<title>` (all common in exported HTML) falls through to `<h1>` rather
 * than winning by mere presence of the element.
 *
 * @param html - Full HTML source
 * @returns The title with markup stripped, or "" if the document has neither
 */
export function htmlDocumentTitle(html: string): string {
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  return cleanCandidate(title) || cleanCandidate(h1);
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
