import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/**
 * Cursor mapping between the rich-text editor and the raw markdown textarea.
 *
 * The two surfaces have incompatible position spaces: a ProseMirror document
 * position counts node boundaries, a textarea caret counts string characters of
 * markdown source. Neither survives the other's mount tree.
 *
 * The shared currency is a **text offset**: the number of characters a *reader*
 * sees before the caret. Markdown syntax (`#`, `**`, list markers, fences,
 * backslash escapes, …) contributes nothing; block boundaries contribute exactly
 * one character, matching ProseMirror's `textBetween(…, "\n", "")`.
 *
 * Both directions clamp, never throw, and degrade to the nearest sensible spot.
 *
 * Exact fidelity is impossible at the margins — a caret between the asterisks of
 * `**bold**` has no rich-text counterpart. `src/test/cursor-position-editor.test.ts`
 * pins agreement with the real editor across a wide corpus; the scanner is known to
 * drift only on:
 *   - an image *inside* a paragraph (the parser splits the paragraph around it,
 *     costing one character);
 *   - link reference definitions / `[^1]`-style labels (markdown-it resolves them,
 *     we treat them as literal text);
 *   - ragged tables whose rows are shorter than the header (each missing cell is
 *     one character).
 * None of these are shapes the editor itself produces.
 *
 * Nothing here may import React or Tauri — this module is pure and unit tested.
 */

/** Separator ProseMirror inserts between text blocks when flattening to text. */
export const BLOCK_SEPARATOR = "\n";
/** Leaf nodes (images, hard breaks) contribute no characters. */
export const LEAF_TEXT = "";

/** Character kinds produced by the markdown scanner. */
const SYNTAX = 0; // markdown punctuation — invisible in the editor
const CONTENT = 1; // a character the reader actually sees
const SEPARATOR = 2; // a block boundary — one text character, but not "real" text

type Kind = typeof SYNTAX | typeof CONTENT | typeof SEPARATOR;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

// ---------------------------------------------------------------------------
// Markdown scanning
// ---------------------------------------------------------------------------

interface LineSpan {
  /** Index of the first character of the line. */
  start: number;
  /** Index one past the last character of the line, excluding the newline. */
  end: number;
}

function splitLines(md: string): LineSpan[] {
  const lines: LineSpan[] = [];
  let start = 0;
  for (let i = 0; i <= md.length; i++) {
    if (i === md.length || md[i] === "\n") {
      let end = i;
      if (end > start && md[end - 1] === "\r") end -= 1;
      lines.push({ start, end });
      start = i + 1;
    }
  }
  return lines;
}

/** CommonMark's escapable punctuation set. */
const ESCAPABLE = new Set("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~");

const RE_BLANK = /^[ \t]*$/;
const RE_WHITESPACE_ONLY = /^\s*$/;
const RE_FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const RE_THEMATIC_BREAK = /^ {0,3}([-*_])[ \t]*(?:\1[ \t]*){2,}$/;
const RE_HEADING = /^ {0,3}#{1,6}(?:[ \t]+|$)/;
const RE_HEADING_TRAILING_HASHES = /[ \t]+#+[ \t]*$/;
const RE_BLOCKQUOTE = /^ {0,3}>[ \t]?/;
const RE_LIST_ITEM = /^[ \t]*(?:[-*+]|\d{1,9}[.)])(?:[ \t]+|$)/;
const RE_TASK_MARKER = /^\\?\[[xX ]?\\?\](?:[ \t]+|$)/;
const RE_IMAGE_ONLY = /^!\[[^\]]*\]\([^\s)]*(?:[ \t]+"[^"]*")?\)$/;
const RE_TABLE_ROW = /^ {0,3}\|/;
const RE_TABLE_DELIMITER = /^ {0,3}\|?(?:[ \t]*:?-+:?[ \t]*\|)+[ \t]*:?-*:?[ \t]*\|?[ \t]*$/;
const RE_TRAILING_WS = /[ \t]+$/;
const RE_LEADING_WS = /^[ \t]+/;
const RE_SETEXT_UNDERLINE = /^ {0,3}=+[ \t]*$/;
const RE_AUTOLINK = /^<[a-zA-Z][a-zA-Z0-9+.-]*:[^<>\s]*>/;

function isAlphaNumeric(ch: string | undefined): boolean {
  return ch !== undefined && /[\p{L}\p{N}]/u.test(ch);
}

function isWhitespace(ch: string | undefined): boolean {
  return ch === undefined || /\s/.test(ch);
}

/**
 * Classify every character of `md` as syntax, content, or block separator.
 *
 * Modelled on the behaviour observed from the app's actual TipTap + markdown-it
 * configuration (`html: false`, `linkify: false`, `breaks: false`, Highlight and
 * Underline have no markdown-it rules, wiki links are plain text).
 */
function classifyMarkdown(md: string): Uint8Array {
  const kinds = new Uint8Array(md.length); // defaults to SYNTAX
  const lines = splitLines(md);

  let seenTextBlock = false;
  let openParagraph = false;
  let hardBreakPending = false;
  let wasBlank = false;
  let inFence = false;
  let fenceChar = "`";
  let fenceLength = 0;
  let fenceBodyStarted = false;
  let tableState: "none" | "header" | "body" = "none";

  const set = (index: number, kind: Kind) => {
    if (index >= 0 && index < kinds.length) kinds[index] = kind;
  };

  /** Mark the newline that precedes `lineStart` (if any) as `kind`. */
  const markPrecedingNewline = (lineStart: number, kind: Kind) => {
    if (lineStart > 0 && md[lineStart - 1] === "\n") set(lineStart - 1, kind);
  };

  /**
   * Register the start of a text block. Every text block except the first is
   * preceded by exactly one separator character in ProseMirror's flattened text;
   * we pin that character onto `anchor` (a syntax character that sits just before
   * the block's content — normally the newline above it, or the `|` before a
   * table cell).
   */
  const startTextBlock = (anchor: number) => {
    if (seenTextBlock) set(anchor, SEPARATOR);
    seenTextBlock = true;
  };

  /** Mark [from, to) as content, skipping markdown inline syntax. */
  const scanInline = (from: number, to: number) => {
    let i = from;
    while (i < to) {
      const ch = md[i];

      // Backslash escape: `\[` renders as `[`.
      if (ch === "\\" && i + 1 < to && ESCAPABLE.has(md[i + 1])) {
        set(i + 1, CONTENT);
        i += 2;
        continue;
      }

      // Inline code span — closed by a backtick run of the same length.
      if (ch === "`") {
        let runEnd = i;
        while (runEnd < to && md[runEnd] === "`") runEnd++;
        const runLength = runEnd - i;
        const close = findBacktickRun(md, runEnd, to, runLength);
        if (close >= 0) {
          // CommonMark strips one leading and one trailing space from a code
          // span that has both (so `` ` a ` `` renders as "a").
          let innerStart = runEnd;
          let innerEnd = close;
          if (
            innerEnd - innerStart >= 2 &&
            md[innerStart] === " " &&
            md[innerEnd - 1] === " " &&
            md.slice(innerStart, innerEnd).trim() !== ""
          ) {
            innerStart += 1;
            innerEnd -= 1;
          }
          for (let k = innerStart; k < innerEnd; k++) set(k, CONTENT);
          i = close + runLength;
          continue;
        }
        for (let k = i; k < runEnd; k++) set(k, CONTENT);
        i = runEnd;
        continue;
      }

      // Inline image — a leaf node, so it contributes no text at all.
      if (ch === "!" && md[i + 1] === "[") {
        const span = matchLink(md, i + 1, to);
        if (span) {
          i = span.end;
          continue;
        }
      }

      // Inline link — the label is content, the target is syntax.
      // `[[Wiki Links]]` have no `(target)` so they fall through as plain text.
      if (ch === "[") {
        const span = matchLink(md, i, to);
        if (span) {
          scanInline(span.labelStart, span.labelEnd);
          i = span.end;
          continue;
        }
      }

      // Autolink `<https://example.com>` — the angle brackets vanish.
      if (ch === "<") {
        const match = RE_AUTOLINK.exec(md.slice(i, to));
        if (match) {
          for (let k = i + 1; k < i + match[0].length - 1; k++) set(k, CONTENT);
          i += match[0].length;
          continue;
        }
      }

      // Emphasis / strong / strike delimiters.
      if (ch === "*" || ch === "_" || ch === "~") {
        const consumed = scanEmphasis(md, i, to, scanInline);
        if (consumed > 0) {
          i = consumed;
          continue;
        }
      }

      set(i, CONTENT);
      i++;
    }
  };

  for (let li = 0; li < lines.length; li++) {
    const { start, end } = lines[li];
    const raw = md.slice(start, end);

    // --- inside a fenced code block -------------------------------------
    if (inFence) {
      const closing = RE_FENCE.exec(raw);
      if (
        closing &&
        closing[1][0] === fenceChar &&
        closing[1].length >= fenceLength &&
        !closing[2].trim()
      ) {
        inFence = false;
        continue; // the closing fence is pure syntax
      }
      // Code lines are verbatim; the newlines *between* them are real characters.
      if (fenceBodyStarted) markPrecedingNewline(start, CONTENT);
      fenceBodyStarted = true;
      for (let i = start; i < end; i++) set(i, CONTENT);
      continue;
    }

    // --- opening fence ---------------------------------------------------
    const fence = RE_FENCE.exec(raw);
    if (fence && !(fence[1][0] === "`" && fence[2].includes("`"))) {
      inFence = true;
      fenceChar = fence[1][0];
      fenceLength = fence[1].length;
      fenceBodyStarted = false;
      startTextBlock(start - 1);
      openParagraph = false;
      hardBreakPending = false;
      tableState = "none";
      continue; // the whole fence line is syntax
    }

    // --- blank line -------------------------------------------------------
    if (RE_BLANK.test(raw)) {
      // `ParagraphMarkdown`'s "preserve-blank-lines" rule rewrites a run of n ≥ 3
      // newlines into n - 2 NBSP placeholder paragraphs so extra blank lines
      // survive a round trip. Each is an empty text block: one separator, no
      // characters. Anchor them on the run's own newlines, leaving the last one
      // for whatever block follows.
      if (!wasBlank) {
        const runStart = start > 0 && md[start - 1] === "\n" ? start - 1 : start;
        let runLength = 0;
        while (md[runStart + runLength] === "\n") runLength++;
        for (let k = 1; k <= runLength - 2; k++) startTextBlock(runStart + k);
      }
      wasBlank = true;
      openParagraph = false;
      hardBreakPending = false;
      tableState = "none";
      continue;
    }
    wasBlank = false;

    // --- setext underline (`Title` / `=====`) ------------------------------
    // The line above already opened a text block; the underline only re-types it.
    if (openParagraph && RE_SETEXT_UNDERLINE.test(raw)) {
      openParagraph = false;
      hardBreakPending = false;
      tableState = "none";
      continue;
    }

    // --- placeholder paragraph (a lone NBSP written by ParagraphMarkdown) --
    // It is a text block (so it earns a separator) but ProseMirror drops the
    // whitespace, so it holds no characters of its own.
    if (RE_WHITESPACE_ONLY.test(raw)) {
      startTextBlock(start - 1);
      openParagraph = true;
      hardBreakPending = false;
      tableState = "none";
      continue;
    }

    // --- strip blockquote markers ----------------------------------------
    let contentStart = start;
    for (;;) {
      const marker = RE_BLOCKQUOTE.exec(md.slice(contentStart, end));
      if (!marker) break;
      contentStart += marker[0].length;
    }
    const rest = md.slice(contentStart, end);
    if (RE_BLANK.test(rest)) {
      openParagraph = false;
      hardBreakPending = false;
      tableState = "none";
      continue;
    }

    // --- thematic break ---------------------------------------------------
    if (RE_THEMATIC_BREAK.test(rest)) {
      openParagraph = false;
      hardBreakPending = false;
      tableState = "none";
      continue; // horizontalRule is a leaf: no separator, no characters
    }

    // --- table ------------------------------------------------------------
    if (RE_TABLE_ROW.test(rest)) {
      if (tableState === "none") {
        const next = lines[li + 1];
        const nextText = next ? md.slice(next.start, next.end) : "";
        if (next && RE_TABLE_DELIMITER.test(nextText)) {
          tableState = "header";
          scanTableRow(md, contentStart, end, start, startTextBlock, scanInline);
          openParagraph = false;
          hardBreakPending = false;
          continue;
        }
      } else if (tableState === "header" && RE_TABLE_DELIMITER.test(rest)) {
        tableState = "body";
        continue; // delimiter row is pure syntax
      } else {
        scanTableRow(md, contentStart, end, start, startTextBlock, scanInline);
        openParagraph = false;
        hardBreakPending = false;
        continue;
      }
    } else {
      tableState = "none";
    }

    // --- ATX heading ------------------------------------------------------
    const heading = RE_HEADING.exec(rest);
    if (heading) {
      startTextBlock(start - 1);
      const bodyStart = contentStart + heading[0].length;
      let bodyEnd = trimTrailing(md, bodyStart, end);
      const closing = RE_HEADING_TRAILING_HASHES.exec(md.slice(bodyStart, bodyEnd));
      if (closing) bodyEnd -= closing[0].length;
      scanInline(bodyStart, bodyEnd);
      openParagraph = false;
      hardBreakPending = false;
      continue;
    }

    // --- list item (bullet, ordered, task) --------------------------------
    const listItem = RE_LIST_ITEM.exec(rest);
    if (listItem) {
      let bodyStart = contentStart + listItem[0].length;
      const task = RE_TASK_MARKER.exec(md.slice(bodyStart, end));
      if (task) bodyStart += task[0].length;
      startTextBlock(start - 1);
      const { bodyEnd, hardBreak } = trimParagraphTail(md, bodyStart, end);
      scanInline(bodyStart, bodyEnd);
      openParagraph = true;
      hardBreakPending = hardBreak;
      continue;
    }

    // --- standalone image (a block leaf: no separator, no characters) ------
    if (!openParagraph && RE_IMAGE_ONLY.test(rest.trim())) {
      openParagraph = false;
      hardBreakPending = false;
      continue;
    }

    // --- paragraph --------------------------------------------------------
    if (openParagraph) {
      // A soft break renders as a single space; a hard break is a leaf node
      // and renders as nothing at all.
      markPrecedingNewline(start, hardBreakPending ? SYNTAX : CONTENT);
    } else {
      startTextBlock(start - 1);
    }
    const leading = RE_LEADING_WS.exec(rest);
    const bodyStart = contentStart + (leading ? leading[0].length : 0);
    const { bodyEnd, hardBreak } = trimParagraphTail(md, bodyStart, end);
    scanInline(bodyStart, bodyEnd);
    openParagraph = true;
    hardBreakPending = hardBreak;
  }

  return kinds;
}

/** Drop trailing spaces/tabs from [from, to). */
function trimTrailing(md: string, from: number, to: number): number {
  const match = RE_TRAILING_WS.exec(md.slice(from, to));
  return match ? to - match[0].length : to;
}

/**
 * Trim a paragraph line's tail, reporting whether it ends in a hard break
 * (two or more trailing spaces, or a trailing backslash).
 */
function trimParagraphTail(
  md: string,
  from: number,
  to: number,
): { bodyEnd: number; hardBreak: boolean } {
  const raw = md.slice(from, to);
  const trailing = RE_TRAILING_WS.exec(raw);
  let bodyEnd = trailing ? to - trailing[0].length : to;
  if (trailing && trailing[0].length >= 2) return { bodyEnd, hardBreak: true };
  if (bodyEnd > from && md[bodyEnd - 1] === "\\" && md[bodyEnd - 2] !== "\\") {
    bodyEnd -= 1;
    return { bodyEnd, hardBreak: true };
  }
  return { bodyEnd, hardBreak: false };
}

/** Index of the next run of exactly `length` backticks in [from, to), or -1. */
function findBacktickRun(md: string, from: number, to: number, length: number): number {
  let i = from;
  while (i < to) {
    if (md[i] !== "`") {
      i++;
      continue;
    }
    let runEnd = i;
    while (runEnd < to && md[runEnd] === "`") runEnd++;
    if (runEnd - i === length) return i;
    i = runEnd;
  }
  return -1;
}

interface LinkSpan {
  labelStart: number;
  labelEnd: number;
  /** Index one past the closing `)`. */
  end: number;
}

/** Match `[label](target)` starting at the `[` in `start`. */
function matchLink(md: string, start: number, to: number): LinkSpan | null {
  if (md[start] !== "[") return null;
  let depth = 0;
  let i = start;
  for (; i < to; i++) {
    const ch = md[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) break;
    }
  }
  if (i >= to || depth !== 0) return null;
  const labelEnd = i;
  if (md[labelEnd + 1] !== "(") return null;
  let j = labelEnd + 2;
  let parens = 1;
  for (; j < to; j++) {
    const ch = md[j];
    if (ch === "\\") {
      j++;
      continue;
    }
    if (ch === "(") parens++;
    else if (ch === ")") {
      parens--;
      if (parens === 0) break;
    }
  }
  if (j >= to) return null;
  return { labelStart: start + 1, labelEnd, end: j + 1 };
}

/**
 * Try to consume an emphasis/strong/strike delimiter run at `i`.
 * Returns the index to continue from, or 0 when the run is literal text.
 * Matched delimiters are simply left at their default SYNTAX classification.
 */
function scanEmphasis(
  md: string,
  i: number,
  to: number,
  scanInline: (from: number, to: number) => void,
): number {
  const ch = md[i];
  let runEnd = i;
  while (runEnd < to && md[runEnd] === ch) runEnd++;
  let length = runEnd - i;
  if (ch === "~") {
    if (length < 2) return 0;
    length = 2;
  } else if (length > 3) {
    return 0;
  }

  // The delimiter must hug its content, and `_` may not split a word.
  if (isWhitespace(md[i + length])) return 0;
  if (ch === "_" && isAlphaNumeric(md[i - 1])) return 0;

  // Prefer a closing run of exactly the same length. Without that preference the
  // outer `*` of `a *b **c** d* e` would latch onto the inner `**`.
  const close =
    findEmphasisClose(md, i, to, ch, length, true) ??
    findEmphasisClose(md, i, to, ch, length, false);
  if (close === null) return 0;
  scanInline(i + length, close);
  return close + length;
}

function findEmphasisClose(
  md: string,
  i: number,
  to: number,
  ch: string,
  length: number,
  exact: boolean,
): number | null {
  for (let j = i + length; j < to; j++) {
    if (md[j] === "\\") {
      j++;
      continue;
    }
    if (md[j] !== ch) continue;
    let closeEnd = j;
    while (closeEnd < to && md[closeEnd] === ch) closeEnd++;
    const runLength = closeEnd - j;
    const fits = exact ? runLength === length : runLength >= length;
    if (!fits || isWhitespace(md[j - 1]) || (ch === "_" && isAlphaNumeric(md[j + length]))) {
      j = closeEnd - 1;
      continue;
    }
    return j;
  }
  return null;
}

/** Classify one `| a | b |` table row: pipes are syntax, each cell is a text block. */
function scanTableRow(
  md: string,
  from: number,
  to: number,
  lineStart: number,
  startTextBlock: (anchor: number) => void,
  scanInline: (from: number, to: number) => void,
): void {
  const pipes: number[] = [];
  for (let i = from; i < to; i++) {
    if (md[i] === "\\") {
      i++;
      continue;
    }
    if (md[i] === "|") pipes.push(i);
  }
  if (pipes.length === 0) return;

  const boundaries = [from - 1, ...pipes, to];
  const last = boundaries.length - 2;
  for (let c = 0; c <= last; c++) {
    const cellStart = boundaries[c] + 1;
    const cellEnd = boundaries[c + 1];
    const body = md.slice(cellStart, cellEnd);
    // The spans outside the outer pipes are padding, not cells. Interior blank
    // cells are real: they hold an empty paragraph, so they earn a separator.
    if ((c === 0 || c === last) && RE_BLANK.test(body)) continue;
    const leading = RE_LEADING_WS.exec(body);
    const innerStart = cellStart + (leading ? leading[0].length : 0);
    const innerEnd = trimTrailing(md, innerStart, cellEnd);
    startTextBlock(boundaries[c] >= from ? boundaries[c] : lineStart - 1);
    scanInline(innerStart, innerEnd);
  }
}

// ---------------------------------------------------------------------------
// Markdown ⇄ text offset
// ---------------------------------------------------------------------------

interface OffsetTable {
  /** `offsets[i]` = number of text characters in `markdown.slice(0, i)`. */
  offsets: Int32Array;
  kinds: Uint8Array;
}

let cacheKey: string | null = null;
let cacheValue: OffsetTable | null = null;

function offsetTable(markdown: string): OffsetTable {
  if (cacheKey === markdown && cacheValue) return cacheValue;
  const kinds = classifyMarkdown(markdown);
  const offsets = new Int32Array(markdown.length + 1);
  for (let i = 0; i < kinds.length; i++) {
    offsets[i + 1] = offsets[i] + (kinds[i] === SYNTAX ? 0 : 1);
  }
  cacheKey = markdown;
  cacheValue = { offsets, kinds };
  return cacheValue;
}

/** Total number of reader-visible characters in `markdown`. */
export function markdownTextLength(markdown: string): number {
  const { offsets } = offsetTable(markdown);
  return offsets[offsets.length - 1];
}

/**
 * Convert a caret index into the raw markdown source to a text offset.
 * A caret parked inside markdown punctuation resolves to the nearest text
 * position before it (e.g. between the asterisks of `**bold**` → before "bold").
 */
export function markdownIndexToTextOffset(markdown: string, index: number): number {
  const { offsets } = offsetTable(markdown);
  return offsets[clamp(index, 0, markdown.length)];
}

/**
 * Convert a text offset back to a caret index into the raw markdown source.
 *
 * Several indices can share one offset (all the syntax characters between two
 * visible characters). We prefer, in order: sitting immediately *before* real
 * text, sitting immediately *after* real text, then the earliest candidate.
 * That puts the caret after `# ` rather than before `#`, and after `**` rather
 * than before it.
 */
export function textOffsetToMarkdownIndex(markdown: string, offset: number): number {
  const { offsets, kinds } = offsetTable(markdown);
  const total = offsets[offsets.length - 1];
  const target = clamp(offset, 0, total);

  let first = -1;
  let afterContent = -1;
  for (let i = 0; i <= markdown.length; i++) {
    if (offsets[i] !== target) {
      if (first >= 0) break; // offsets are non-decreasing — the run is over
      continue;
    }
    if (first < 0) first = i;
    if (i < markdown.length && kinds[i] === CONTENT) return i;
    if (i > 0 && kinds[i - 1] === CONTENT) afterContent = i;
  }
  if (afterContent >= 0) return afterContent;
  return first >= 0 ? first : clamp(0, 0, markdown.length);
}

// ---------------------------------------------------------------------------
// ProseMirror document ⇄ text offset
// ---------------------------------------------------------------------------

/** Convert a ProseMirror document position to a text offset. */
export function docPositionToTextOffset(doc: ProseMirrorNode, pos: number): number {
  const size = doc.content.size;
  return doc.textBetween(0, clamp(pos, 0, size), BLOCK_SEPARATOR, LEAF_TEXT).length;
}

/** Total number of reader-visible characters in a ProseMirror document. */
export function docTextLength(doc: ProseMirrorNode): number {
  return docPositionToTextOffset(doc, doc.content.size);
}

/** Position inside a text block's inline content for a text offset within it. */
function inlinePosition(block: ProseMirrorNode, textOffset: number): number {
  let remaining = textOffset;
  let pos = 0;
  let found = -1;
  block.forEach((child) => {
    if (found >= 0) return;
    if (child.isText) {
      const length = child.text?.length ?? 0;
      if (remaining <= length) {
        found = pos + remaining;
        return;
      }
      remaining -= length;
    }
    pos += child.nodeSize;
  });
  return found >= 0 ? found : Math.min(pos, block.content.size);
}

/**
 * Convert a text offset to a ProseMirror document position.
 * Always returns a position inside `doc`; falls back to the end of the document
 * when the offset lands beyond the last text block (or there is none).
 */
export function textOffsetToDocPosition(doc: ProseMirrorNode, offset: number): number {
  const size = doc.content.size;
  const target = clamp(offset, 0, docTextLength(doc));

  let accumulated = 0;
  let first = true;
  let found = -1;

  doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (!node.isTextblock) return true;
    if (!first) accumulated += 1; // block separator
    first = false;
    const length = node.textContent.length;
    if (target <= accumulated + length) {
      found = pos + 1 + inlinePosition(node, target - accumulated);
      return false;
    }
    accumulated += length;
    return false;
  });

  return clamp(found >= 0 ? found : size, 0, size);
}
