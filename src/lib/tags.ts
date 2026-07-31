/**
 * Tag rewriting utilities for bulk tag rename/delete.
 *
 * Tags live in two places and the two must agree: `frontmatter.tags` and the
 * inline `#tag` occurrences in the markdown body. The editor's save path
 * (`MainPanel.handleSave`) reconciles the two through `mergeTagsOnSave` below,
 * which drops a tag once it disappears from the body — so rewriting only the
 * frontmatter would be silently reverted the next time the note is edited.
 * Every operation here therefore rewrites the body as well.
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

/** Fenced code blocks and inline code — stripped, in this order, by extractInlineTags. */
const FENCE_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`[^`]*`/g;

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
 * Three-way merge of a note's tag list across a content save.
 *
 * Reading a note is generous — `parseNote` unions the frontmatter list with the
 * body's inline tags — so a save that simply recomputed the list from the body
 * would silently delete every tag that lives *only* in the frontmatter (set
 * from the property panel, never typed as `#tag`). That asymmetry destroyed
 * real tags in the wild; this is the fix.
 *
 * The rule: a tag is only dropped if it *was* an inline tag and has stopped
 * being one.
 *
 *     next = (previousTags − (previousInline − nextInline)) ∪ nextInline
 *
 * - frontmatter-only tag, body edited → kept (the bug being fixed)
 * - `#work` deleted from the body → `work` dropped
 * - `#work` typed into the body → `work` added
 * - tag in *both* places, then deleted from the body → dropped. Deliberate: it
 *   was inline, and it stopped being inline. Frontmatter alone cannot record
 *   that the user also meant to pin it independently.
 *
 * Order is stable — `previousTags` keep their positions and genuinely new
 * inline tags are appended — so the YAML diff stays minimal. Result is
 * deduplicated, and every argument is optional.
 *
 * @param previousTags - `frontmatter.tags` as it stood before this save
 * @param previousInline - inline tags of the *pre-save* body
 * @param nextInline - inline tags of the body being saved
 */
export function mergeTagsOnSave(
  previousTags: string[] | undefined,
  previousInline: string[] | undefined,
  nextInline: string[] | undefined,
): string[] {
  const next = new Set(nextInline ?? []);
  const removed = new Set((previousInline ?? []).filter((t) => !next.has(t)));
  const merged = (previousTags ?? []).filter((t) => !removed.has(t));
  merged.push(...next);
  return [...new Set(merged)];
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

/**
 * Character ranges of the content that must never be rewritten.
 *
 * Two passes in the same order extractInlineTags strips them — fenced blocks
 * first, inline code second. The fenced blocks are blanked out (same length, so
 * offsets stay valid) rather than deleted, which reproduces the one thing the
 * ordering buys: a backtick inside a fence can never pair with one outside it.
 * Deleting is not an option here, since the code has to survive into the output.
 */
function codeRanges(content: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let masked = content;
  for (const m of content.matchAll(FENCE_RE)) {
    const start = m.index;
    const end = start + m[0].length;
    ranges.push([start, end]);
    masked = masked.slice(0, start) + " ".repeat(m[0].length) + masked.slice(end);
  }
  for (const m of masked.matchAll(INLINE_CODE_RE)) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

function inRanges(ranges: Array<[number, number]>, index: number): boolean {
  return ranges.some(([start, end]) => index >= start && index < end);
}

/**
 * A line with nothing left on it but whitespace, a list marker (`-`, `*`, `+`,
 * `1.`) and/or a task checkbox — i.e. debris left behind by removing a tag that
 * was the only content on the line.
 */
const DEBRIS_LINE_RE = /^[ \t]*(?:[-*+]|\d+[.)])?[ \t]*(?:\[[ xX]\])?[ \t]*\r?$/;

/**
 * Drop lines that a removal emptied out. `marks` holds offsets *into `text`* at
 * the points where a tag was removed, so lines that were already blank (or an
 * already-empty bullet) are left alone — only debris we created is cleaned up.
 */
function dropEmptiedLines(text: string, marks: number[]): string {
  if (marks.length === 0) return text;
  const lines = text.split("\n");
  const drop = new Set<number>();
  let start = 0;
  for (const [i, line] of lines.entries()) {
    // `end` is the offset of this line's newline (or the end of the text); a
    // removal at exactly that offset still belongs to this line.
    const end = start + line.length;
    if (DEBRIS_LINE_RE.test(line) && marks.some((p) => p >= start && p <= end)) drop.add(i);
    start = end + 1;
  }
  if (drop.size === 0) return text;
  // Joining the survivors with "\n" removes each dropped line's newline too.
  return lines.filter((_, i) => !drop.has(i)).join("\n");
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
 * - nothing left on the line but whitespace, a list marker and/or a task
 *   checkbox → the whole line, including its newline, is removed
 *   (`"- #work\n- keep"` → `"- keep"`)
 * - blank lines and empty bullets that were already there are left alone
 */
export function removeInlineTag(content: string, target: string): string {
  const skip = codeRanges(content);
  let out = "";
  let last = 0;
  // Offsets in `out` where a tag was removed, used to find emptied lines.
  const marks: number[] = [];

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

      marks.push(out.length);
      last = cut;
    }

    INLINE_TAG_RE.lastIndex = tagEnd;
    m = INLINE_TAG_RE.exec(content);
  }

  return dropEmptiedLines(out + content.slice(last), marks);
}
