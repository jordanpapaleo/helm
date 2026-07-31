/**
 * Tag rewriting utilities for bulk tag rename/delete.
 *
 * Tags live in two places and the two must agree: `frontmatter.tags` and the
 * inline `#tag` occurrences in the markdown body. The editor's save path
 * (`MainPanel.handleSave`) recomputes `frontmatter.tags` from the body with
 * `extractInlineTags` on every save, so rewriting only the frontmatter would be
 * silently reverted the next time the note is edited. Every operation here
 * therefore rewrites the body as well.
 *
 * All operations are **descendant-aware**, matching how the sidebar groups
 * tags: acting on `work` also acts on `work/project` and `work/ops`, but never
 * on `workflow`.
 *
 * KEEP IN SYNC with `extractInlineTags` in `./note-parser.ts` — the matching
 * rules (tag grammar, code-block exclusion, hex-color exclusion) must agree, or
 * a rewritten body will disagree with the tag list derived from it.
 */

import type { Note } from "../types/note";
import { extractInlineTags } from "./note-parser";

/** Body of a tag after the leading letter. Mirrors extractInlineTags. */
const TAG_BODY = "[a-zA-Z0-9/_-]";

/** Matches an inline `#tag`, capturing the preceding delimiter and the tag. */
const INLINE_TAG_RE = new RegExp(`(^|[^a-zA-Z0-9])#([a-zA-Z]${TAG_BODY}*)`, "g");

/** A whole tag name: letter-led segments joined by single slashes. */
const TAG_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]*(?:\/[a-zA-Z0-9_-]+)*$/;

/** Matches 3- or 6-digit hex color values. Mirrors note-parser.ts. */
const HEX_COLOR_RE = /^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/;

/** Fenced code blocks and inline code, in the same precedence extractInlineTags uses. */
const CODE_RE = /```[\s\S]*?```|`[^`]*`/g;

/**
 * True when `tag` is `target` itself or a descendant of it.
 * `tagMatches("work/project", "work")` → true; `tagMatches("workflow", "work")` → false.
 */
export function tagMatches(tag: string, target: string): boolean {
  return tag === target || tag.startsWith(`${target}/`);
}

/** The renamed form of `tag`, or `tag` unchanged when it doesn't match `oldTag`. */
function renamedTag(tag: string, oldTag: string, newTag: string): string {
  return tagMatches(tag, oldTag) ? newTag + tag.slice(oldTag.length) : tag;
}

/**
 * Rename `oldTag` and all its descendants inside a frontmatter tag list.
 * Order is stable and the result is deduplicated (a rename can collide with a
 * tag the note already carries).
 */
export function renameTagInList(tags: string[], oldTag: string, newTag: string): string[] {
  return [...new Set(tags.map((t) => renamedTag(t, oldTag, newTag)))];
}

/** Remove `target` and all its descendants from a frontmatter tag list. */
export function removeTagFromList(tags: string[], target: string): string[] {
  return tags.filter((t) => !tagMatches(t, target));
}

/**
 * Normalize user input for a tag name: trim surrounding whitespace and drop a
 * single leading `#` (users naturally type the sigil).
 */
export function normalizeTagName(input: string): string {
  return input.trim().replace(/^#/, "").trim();
}

/**
 * True when `name` is a tag the inline grammar can represent, i.e. one that
 * `extractInlineTags` would read back out of a body after we write it.
 * Rejects empty names, names not starting with a letter, characters outside
 * `[a-zA-Z0-9/_-]`, empty path segments, and bare hex-color strings (which
 * extractInlineTags deliberately ignores).
 */
export function isValidTagName(name: string): boolean {
  return TAG_NAME_RE.test(name) && !HEX_COLOR_RE.test(name);
}

/**
 * True when a note carries `target` (or a descendant of it) either in its
 * frontmatter tag list or as an inline tag in its body. Both are checked
 * because the two can disagree until the note is next saved.
 */
export function noteMatchesTag(
  note: Pick<Note, "content" | "frontmatter">,
  target: string,
): boolean {
  const inFrontmatter = (note.frontmatter.tags ?? []).some((t) => tagMatches(t, target));
  return inFrontmatter || extractInlineTags(note.content).some((t) => tagMatches(t, target));
}

/** Byte ranges of the content that must never be rewritten. */
function codeRanges(content: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  CODE_RE.lastIndex = 0;
  let m = CODE_RE.exec(content);
  while (m) {
    ranges.push([m.index, m.index + m[0].length]);
    m = CODE_RE.exec(content);
  }
  return ranges;
}

function inRanges(ranges: Array<[number, number]>, index: number): boolean {
  return ranges.some(([start, end]) => index >= start && index < end);
}

/**
 * Rewrite every inline `#oldTag` (and `#oldTag/descendant`) in a markdown body
 * to `#newTag`. Fenced code blocks and inline code are left untouched, matching
 * extractInlineTags, which strips them before looking for tags.
 */
export function renameInlineTag(content: string, oldTag: string, newTag: string): string {
  const skip = codeRanges(content);
  let out = "";
  let last = 0;

  INLINE_TAG_RE.lastIndex = 0;
  let m = INLINE_TAG_RE.exec(content);
  while (m) {
    const [full, prefix, tag] = m;
    const hashAt = m.index + prefix.length;
    const tagEnd = m.index + full.length;
    if (!inRanges(skip, hashAt) && !HEX_COLOR_RE.test(tag) && tagMatches(tag, oldTag)) {
      out += content.slice(last, hashAt);
      out += `#${renamedTag(tag, oldTag, newTag)}`;
      last = tagEnd;
    }
    // Resume at the end of the tag, never past it: the character after a tag is
    // the delimiter the *next* tag needs in order to match.
    INLINE_TAG_RE.lastIndex = tagEnd;
    m = INLINE_TAG_RE.exec(content);
  }

  return out + content.slice(last);
}

/**
 * Remove every inline `#target` (and `#target/descendant`) from a markdown body.
 * Fenced code blocks and inline code are left untouched.
 *
 * Whitespace rules, so removal never leaves debris:
 * - mid-line with spaces on both sides → collapses to a single space
 *   (`"Plan #work today"` → `"Plan today"`)
 * - space before, punctuation or end-of-line after → the space goes too
 *   (`"Plan the #work."` → `"Plan the."`)
 * - first thing on a line → the following spaces go, the newline before stays
 *   (`"#work is first"` → `"is first"`)
 * - alone on its line → the whole line, including its newline, is removed
 * - blank lines are never collapsed
 */
export function removeInlineTag(content: string, target: string): string {
  const skip = codeRanges(content);
  let out = "";
  let last = 0;

  INLINE_TAG_RE.lastIndex = 0;
  let m = INLINE_TAG_RE.exec(content);
  while (m) {
    const [full, prefix, tag] = m;
    const hashAt = m.index + prefix.length;
    const tagEnd = m.index + full.length;

    if (!inRanges(skip, hashAt) && !HEX_COLOR_RE.test(tag) && tagMatches(tag, target)) {
      // Swallow horizontal whitespace after the tag; the decision below is what
      // (if anything) gets emitted in place of the removed run.
      let cut = tagEnd;
      while (content[cut] === " " || content[cut] === "\t") cut++;
      const hadTrailing = cut > tagEnd;
      const next = content[cut] ?? "";
      const endsLine = next === "" || next === "\n" || next === "\r";
      const atLineStart = prefix === "" || prefix === "\n" || prefix === "\r";
      const prefixIsSpace = prefix === " " || prefix === "\t";
      // A prefix already consumed by a previous removal must not be re-emitted.
      const prefixConsumed = m.index < last;

      out += content.slice(last, Math.max(last, m.index));
      if (prefixConsumed) {
        // nothing: the delimiter was already handled
      } else if (atLineStart) {
        out += prefix;
      } else if (prefixIsSpace) {
        out += hadTrailing && !endsLine ? prefix : "";
      } else {
        out += prefix + (hadTrailing && !endsLine ? " " : "");
      }

      // The tag was the only thing on its line — take the line's newline too.
      if (atLineStart && endsLine) {
        if (content.startsWith("\r\n", cut)) cut += 2;
        else if (next === "\n" || next === "\r") cut += 1;
      }
      last = cut;
    }

    INLINE_TAG_RE.lastIndex = tagEnd;
    m = INLINE_TAG_RE.exec(content);
  }

  return out + content.slice(last);
}
