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
 * pins agreement with the real editor across a wide corpus, and the scanner has
 * been checked against every caret position of every note in a real vault.
 *
 * Known remaining drift, none of which the editor itself produces:
 *   - an image *inside* a paragraph (the parser splits the paragraph around it,
 *     costing one character);
 *   - link reference definitions / `[^1]`-style labels (markdown-it resolves them,
 *     we treat them as literal text);
 *   - ragged tables whose rows are shorter than the header (each missing cell is
 *     one character);
 *   - HTML5 *legacy* entity references written without their semicolon, where the
 *     browser still decodes a prefix (`&notanentity;` renders as `¬anentity;`).
 *     Entities with a semicolon are handled.
 *
 * Because drift can never be fully eliminated, callers must not treat a mapped
 * position as authoritative: `resolveTextOffset` reports when an offset fell
 * outside the document so the caller can fall back rather than confidently
 * jumping to the far end of the note.
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
// markdown-it-task-lists only converts a checkbox that is followed by a space
// *and* actual content — `- [ ]` on its own stays the literal text "[ ]".
const RE_TASK_MARKER = /^\\?\[[xX ]?\\?\][ \t]+(?=\S)/;
const RE_IMAGE_ONLY = /^!\[[^\]]*\]\([^\s)]*(?:[ \t]+"[^"]*")?\)$/;
const RE_TABLE_ROW = /^ {0,3}\|/;
const RE_TABLE_DELIMITER = /^ {0,3}\|?(?:[ \t]*:?-+:?[ \t]*\|)+[ \t]*:?-*:?[ \t]*\|?[ \t]*$/;
const RE_TRAILING_WS = /[ \t]+$/;
const RE_LEADING_WS = /^[ \t]+/;
const RE_SETEXT_UNDERLINE = /^ {0,3}=+[ \t]*$/;
const RE_AUTOLINK = /^<[a-zA-Z][a-zA-Z0-9+.-]*:[^<>\s]*>/;

/**
 * Named HTML entities worth decoding. Every one of these collapses to a single
 * character, so only membership matters, not the character itself.
 *
 * This is deliberately a list rather than a blanket `&\w+;` match: an unknown
 * sequence like `&notarealentity;` stays literal text, and treating it as one
 * character would be a far larger error than leaving it alone.
 */
const NAMED_ENTITIES = new Set([
  "amp",
  "lt",
  "gt",
  "quot",
  "apos",
  "nbsp",
  "ensp",
  "emsp",
  "thinsp",
  "ndash",
  "mdash",
  "hellip",
  "bull",
  "middot",
  "dagger",
  "Dagger",
  "permil",
  "lsquo",
  "rsquo",
  "sbquo",
  "ldquo",
  "rdquo",
  "bdquo",
  "laquo",
  "raquo",
  "prime",
  "Prime",
  "times",
  "divide",
  "plusmn",
  "minus",
  "frac12",
  "frac14",
  "frac34",
  "sup1",
  "sup2",
  "sup3",
  "deg",
  "micro",
  "para",
  "sect",
  "copy",
  "reg",
  "trade",
  "euro",
  "pound",
  "yen",
  "cent",
  "curren",
  "larr",
  "rarr",
  "uarr",
  "darr",
  "harr",
  "lArr",
  "rArr",
  "uArr",
  "dArr",
  "hArr",
  "ne",
  "le",
  "ge",
  "asymp",
  "equiv",
  "infin",
  "radic",
  "sum",
  "prod",
  "int",
  "part",
  "nabla",
  "isin",
  "notin",
  "cap",
  "cup",
  "sub",
  "sup",
  "sube",
  "supe",
  "oplus",
  "otimes",
  "perp",
  "ang",
  "and",
  "or",
  "not",
  "there4",
  "alpha",
  "beta",
  "gamma",
  "delta",
  "epsilon",
  "zeta",
  "eta",
  "theta",
  "iota",
  "kappa",
  "lambda",
  "mu",
  "nu",
  "xi",
  "pi",
  "rho",
  "sigma",
  "tau",
  "upsilon",
  "phi",
  "chi",
  "psi",
  "omega",
  "Alpha",
  "Beta",
  "Gamma",
  "Delta",
  "Theta",
  "Lambda",
  "Pi",
  "Sigma",
  "Phi",
  "Psi",
  "Omega",
  "hearts",
  "diams",
  "clubs",
  "spades",
  "loz",
  "szlig",
  "agrave",
  "aacute",
  "acirc",
  "atilde",
  "auml",
  "aring",
  "aelig",
  "ccedil",
  "egrave",
  "eacute",
  "ecirc",
  "euml",
  "igrave",
  "iacute",
  "icirc",
  "iuml",
  "ntilde",
  "ograve",
  "oacute",
  "ocirc",
  "otilde",
  "ouml",
  "oslash",
  "ugrave",
  "uacute",
  "ucirc",
  "uuml",
  "yacute",
  "yuml",
  "shy",
  "iquest",
  "iexcl",
  "ordf",
  "ordm",
  "brvbar",
  "uml",
  "macr",
  "acute",
  "cedil",
  "sup",
  "star",
  "check",
  "cross",
  "dash",
  "lowast",
  "oline",
]);

const RE_NUMERIC_ENTITY = /^&#(?:[0-9]{1,7}|[xX][0-9a-fA-F]{1,6});/;
const RE_NAMED_ENTITY = /^&([a-zA-Z][a-zA-Z0-9]{1,31});/;

/**
 * Length of the HTML entity reference starting at `index`, or 0 if there is
 * none. The whole reference renders as a single character.
 */
function matchEntity(md: string, index: number, to: number): number {
  const slice = md.slice(index, to);
  const numeric = RE_NUMERIC_ENTITY.exec(slice);
  if (numeric) return numeric[0].length;
  const named = RE_NAMED_ENTITY.exec(slice);
  if (named && NAMED_ENTITIES.has(named[1])) return named[0].length;
  return 0;
}

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
  // Whitespace runs collapse when the rendered HTML is parsed into a document,
  // so only the first space of a run survives. Tracked across a whole line
  // (including into nested emphasis/link scans) rather than per token.
  let pendingSpace = false;
  // tiptap-markdown's parser strips a leading "\n" from any text node that
  // directly follows an element, so a soft break loses its space when the
  // previous line ended with emphasis, code, a link or an image.
  let lastTokenWasElement = false;
  let previousLineEndedWithElement = false;
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

  /** Emit one content character, collapsing it away if it continues a space run. */
  const emit = (index: number, isSpace: boolean) => {
    set(index, isSpace && pendingSpace ? SYNTAX : CONTENT);
    pendingSpace = isSpace;
  };

  /** Mark [from, to) as content, skipping markdown inline syntax. */
  const scanInline = (from: number, to: number) => {
    let i = from;
    while (i < to) {
      const ch = md[i];

      // Runs of spaces/tabs collapse to a single character.
      if (ch === " " || ch === "\t") {
        emit(i, true);
        lastTokenWasElement = false;
        i += 1;
        continue;
      }

      // Backslash escape: `\[` renders as `[`.
      if (ch === "\\" && i + 1 < to && ESCAPABLE.has(md[i + 1])) {
        emit(i + 1, false);
        lastTokenWasElement = false;
        i += 2;
        continue;
      }

      // HTML entity reference — decodes to a single character.
      if (ch === "&") {
        const length = matchEntity(md, i, to);
        if (length > 0) {
          emit(i, false);
          for (let k = i + 1; k < i + length; k++) set(k, SYNTAX);
          lastTokenWasElement = false;
          i += length;
          continue;
        }
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
          // Whitespace collapses inside a code *span* (it is ordinary inline
          // HTML); only a fenced block preserves it.
          for (let k = innerStart; k < innerEnd; k++) {
            emit(k, md[k] === " " || md[k] === "\t");
          }
          lastTokenWasElement = true;
          i = close + runLength;
          continue;
        }
        for (let k = i; k < runEnd; k++) emit(k, false);
        lastTokenWasElement = false;
        i = runEnd;
        continue;
      }

      // Inline image — a leaf node, so it contributes no text at all.
      if (ch === "!" && md[i + 1] === "[") {
        const span = matchLink(md, i + 1, to);
        if (span) {
          lastTokenWasElement = true;
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
          lastTokenWasElement = true;
          i = span.end;
          continue;
        }
      }

      // Autolink `<https://example.com>` — the angle brackets vanish.
      if (ch === "<") {
        const match = RE_AUTOLINK.exec(md.slice(i, to));
        if (match) {
          for (let k = i + 1; k < i + match[0].length - 1; k++) emit(k, false);
          lastTokenWasElement = true;
          i += match[0].length;
          continue;
        }
      }

      // Emphasis / strong / strike delimiters.
      if (ch === "*" || ch === "_" || ch === "~") {
        const consumed = scanEmphasis(md, i, to, scanInline);
        if (consumed > 0) {
          lastTokenWasElement = true;
          i = consumed;
          continue;
        }
      }

      emit(i, false);
      lastTokenWasElement = false;
      i++;
    }
  };

  /** Scan one line's inline content, resetting the per-line collapsing state. */
  const scanLine = (from: number, to: number) => {
    pendingSpace = false;
    lastTokenWasElement = false;
    scanInline(from, to);
    previousLineEndedWithElement = lastTokenWasElement;
  };

  /** Each table cell is its own text block, so space collapsing restarts. */
  const scanCell = (from: number, to: number) => {
    pendingSpace = false;
    scanInline(from, to);
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
          scanTableRow(md, contentStart, end, start, startTextBlock, scanCell);
          openParagraph = false;
          hardBreakPending = false;
          continue;
        }
      } else if (tableState === "header" && RE_TABLE_DELIMITER.test(rest)) {
        tableState = "body";
        continue; // delimiter row is pure syntax
      } else {
        scanTableRow(md, contentStart, end, start, startTextBlock, scanCell);
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
      scanLine(bodyStart, bodyEnd);
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
      scanLine(bodyStart, bodyEnd);
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
      // A soft break renders as a single space — unless the previous line ended
      // with an element (its leading "\n" is stripped from the following text
      // node) or with a hard break (a leaf node, which renders as nothing).
      markPrecedingNewline(
        start,
        hardBreakPending || previousLineEndedWithElement ? SYNTAX : CONTENT,
      );
    } else {
      startTextBlock(start - 1);
    }
    const leading = RE_LEADING_WS.exec(rest);
    const bodyStart = contentStart + (leading ? leading[0].length : 0);
    const { bodyEnd, hardBreak } = trimParagraphTail(md, bodyStart, end);
    scanLine(bodyStart, bodyEnd);
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
  scanCell: (from: number, to: number) => void,
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
    scanCell(innerStart, innerEnd);
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

/** A document position, and whether the requested offset had to be clamped to reach it. */
export interface ResolvedPosition {
  pos: number;
  /**
   * True when the offset fell outside the document's text. The caller should
   * treat `pos` as a guess: silently clamping an overshoot to the end of the
   * document is how a small mapping error becomes a caret at the far end of the
   * note, so a caller that has a better fallback should use it.
   */
  clamped: boolean;
}

/**
 * Convert a text offset to a ProseMirror document position, reporting whether
 * the offset was out of range. Always returns a position inside `doc`.
 */
export function resolveTextOffset(doc: ProseMirrorNode, offset: number): ResolvedPosition {
  const total = docTextLength(doc);
  const requested = Number.isFinite(offset) ? Math.trunc(offset) : 0;
  return {
    pos: textOffsetToDocPosition(doc, offset),
    clamped: requested < 0 || requested > total,
  };
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
