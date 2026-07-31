/**
 * TipTap extension that gives Bear-style inline #tags a visual treatment.
 * Purely presentational: tags render as accent-tinted chips via the
 * "inline-tag" CSS class. Nothing here is clickable and nothing here
 * affects how tags are extracted or stored — see extractInlineTags in
 * src/lib/note-parser.ts for that.
 *
 * The tag grammar itself is imported from note-parser rather than restated
 * here, so what the editor decorates and what gets stored cannot drift apart.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { createTagPattern, HEX_COLOR_RE } from "../../lib/note-parser";

/** A `#tag` span within a piece of text, as zero-based character offsets. */
export interface InlineTagRange {
  /** Offset of the `#` character. */
  from: number;
  /** Offset one past the last character of the tag name. */
  to: number;
}

/**
 * Find every inline `#tag` span in a piece of plain text.
 *
 * The returned ranges cover the `#` and the tag name only — never the
 * boundary character the pattern consumes in front of the hash.
 *
 * @param text - Plain text to scan (a single ProseMirror text node's content)
 * @returns Ranges of the decoratable `#tag` spans, in document order
 * @example
 * findInlineTagRanges("plan #work/project")
 * // => [{ from: 5, to: 18 }]
 */
export function findInlineTagRanges(text: string): InlineTagRange[] {
  const ranges: InlineTagRange[] = [];
  // Fresh pattern per call — the shared grammar is global, so it must never be
  // reused across loops.
  const pattern = createTagPattern();
  let match = pattern.exec(text);
  while (match !== null) {
    const tag = match[1];
    if (!HEX_COLOR_RE.test(tag)) {
      // Skip past the boundary character the pattern consumed, if any.
      const hashIndex = match.index + match[0].length - tag.length - 1;
      ranges.push({ from: hashIndex, to: hashIndex + tag.length + 1 });
    }
    match = pattern.exec(text);
  }
  return ranges;
}

/**
 * TipTap extension adding a decoration plugin that styles inline #tags.
 * Code blocks and text carrying a `code` mark are skipped, matching
 * extractInlineTags, which strips fenced and inline code before matching.
 */
export const InlineTagExtension = Extension.create({
  name: "inlineTag",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("inline-tag-deco"),
        props: {
          decorations(state) {
            const decos: Decoration[] = [];
            state.doc.descendants((node, pos, parent) => {
              if (!node.isText || !node.text) return;
              // Code is not tag territory — skip code blocks and inline code.
              if (parent?.type.name === "codeBlock") return;
              if (node.marks.some((mark) => mark.type.name === "code")) return;
              for (const range of findInlineTagRanges(node.text)) {
                decos.push(
                  Decoration.inline(pos + range.from, pos + range.to, { class: "inline-tag" }),
                );
              }
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});
