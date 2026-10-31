/**
 * Which notes a note links to.
 *
 * The graph, the note footer, and the properties Links field all call
 * `resolveOutgoingLinks`. Loading a note does not write the result back.
 *
 * KEEP IN SYNC with mcp-server/links.ts — the app and the MCP server must
 * agree on which ids count as a note's links, and on how a rename rewrites
 * [[Old Title]] in other notes.
 */
import { extractWikiLinks } from "./note-parser";

/** Enough of a note to resolve links. Full `Note` objects satisfy this. */
export interface LinkNote {
  id: string;
  content: string;
  frontmatter: {
    title: string;
    links?: string[];
  };
}

export interface ResolvedLink {
  id: string;
  /** True when this id is stored in frontmatter.links. The graph can delete those. */
  fromFrontmatter: boolean;
}

/**
 * Outbound links for one note: saved frontmatter ids that still exist, plus
 * [[wiki link]] titles that match a loaded note's title, case-insensitive.
 * The note itself is excluded. Titles that match nothing are ignored.
 *
 * When two loaded notes share a title, the later one in `notes` is the target.
 */
export function resolveOutgoingLinks(note: LinkNote, notes: readonly LinkNote[]): ResolvedLink[] {
  const ids = new Set(notes.map((item) => item.id));
  const titleToId = new Map<string, string>();
  for (const item of notes) {
    const key = item.frontmatter.title.trim().toLowerCase();
    if (key) titleToId.set(key, item.id);
  }

  const resolved: ResolvedLink[] = [];
  const seen = new Set<string>();

  for (const id of note.frontmatter.links ?? []) {
    if (!id || id === note.id || seen.has(id) || !ids.has(id)) continue;
    seen.add(id);
    resolved.push({ id, fromFrontmatter: true });
  }

  for (const title of extractWikiLinks(note.content)) {
    const id = titleToId.get(title.trim().toLowerCase());
    if (!id || id === note.id || seen.has(id)) continue;
    seen.add(id);
    resolved.push({ id, fromFrontmatter: false });
  }

  return resolved;
}

/**
 * Replace [[Old Title]] with [[New Title]] in a note body.
 *
 * The match is case-insensitive and ignores space inside the brackets, same
 * as `extractWikiLinks`. Escaped brackets (`\[\[Old Title\]\]`) are included
 * so a link written by an older save is not dropped. The replacement is
 * always the unescaped form `[[New Title]]`.
 *
 * Returns the same string when nothing matches, so callers can skip a write.
 */
export function replaceWikiLinkTitle(content: string, oldTitle: string, newTitle: string): string {
  const target = oldTitle.trim().toLowerCase();
  if (!target) return content;

  const { text, origin } = unescapeBrackets(content);
  const matches = [...text.matchAll(/\[\[([^\]]+)\]\]/g)];
  if (matches.length === 0) return content;

  const replacement = `[[${newTitle}]]`;
  let result = content;
  let changed = false;
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];
    if (match[1]?.trim().toLowerCase() !== target) continue;
    const start = match.index;
    if (start === undefined) continue;
    const range = originalRange(content, origin, start, start + match[0].length);
    if (content.slice(range.start, range.end) === replacement) continue;
    result = `${result.slice(0, range.start)}${replacement}${result.slice(range.end)}`;
    changed = true;
  }
  return changed ? result : content;
}

/**
 * Same unescape as `extractWikiLinks`: `\[` and `\]` become brackets.
 * `origin[i]` is the index in `content` of unescaped character `i`.
 */
function unescapeBrackets(content: string): { text: string; origin: number[] } {
  let text = "";
  const origin: number[] = [];
  for (let i = 0; i < content.length; i += 1) {
    const next = content[i + 1];
    if (content[i] === "\\" && (next === "[" || next === "]")) {
      text += next;
      origin.push(i + 1);
      i += 1;
      continue;
    }
    text += content[i];
    origin.push(i);
  }
  return { text, origin };
}

function originalRange(
  content: string,
  origin: number[],
  start: number,
  end: number,
): { start: number; end: number } {
  let from = origin[start] ?? start;
  const to = origin[end - 1] ?? end - 1;
  if (from > 0 && content[from - 1] === "\\" && (content[from] === "[" || content[from] === "]")) {
    from -= 1;
  }
  return { start: from, end: to + 1 };
}
