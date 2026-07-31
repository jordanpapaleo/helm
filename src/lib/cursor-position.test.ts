import { Schema } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";
import {
  docPositionToTextOffset,
  docTextLength,
  markdownIndexToTextOffset,
  markdownTextLength,
  resolveTextOffset,
  textOffsetToDocPosition,
  textOffsetToMarkdownIndex,
} from "./cursor-position";

/**
 * A caret index in the markdown source and a ProseMirror document position are
 * different coordinate systems. These tests pin the shared "text offset" currency
 * that bridges them. Nothing here touches React, Tauri, or a live editor —
 * `src/test/cursor-position-editor.test.ts` covers agreement with the real editor.
 */

/** Shorthand: text offset of the caret placed just before `needle` in `md`. */
function offsetBefore(md: string, needle: string): number {
  return markdownIndexToTextOffset(md, md.indexOf(needle));
}

describe("markdownIndexToTextOffset", () => {
  it("counts every character of a plain paragraph", () => {
    const md = "Hello world";
    expect(markdownIndexToTextOffset(md, 0)).toBe(0);
    expect(markdownIndexToTextOffset(md, 6)).toBe(6);
    expect(markdownIndexToTextOffset(md, md.length)).toBe(11);
    expect(markdownTextLength(md)).toBe(11);
  });

  it("skips heading markers", () => {
    const md = "# Title";
    expect(markdownIndexToTextOffset(md, 0)).toBe(0);
    expect(markdownIndexToTextOffset(md, 1)).toBe(0); // after "#"
    expect(markdownIndexToTextOffset(md, 2)).toBe(0); // after "# "
    expect(offsetBefore(md, "Title")).toBe(0);
    expect(markdownTextLength(md)).toBe(5);
  });

  it("counts one character per block boundary", () => {
    const md = "# Title\n\nBody";
    // "Title" + separator + "Body"
    expect(markdownTextLength(md)).toBe(10);
    expect(offsetBefore(md, "Body")).toBe(6);
  });

  it("skips bold and italic delimiters", () => {
    const md = "a **bold** and *it* end";
    expect(markdownTextLength(md)).toBe("a bold and it end".length);
    expect(offsetBefore(md, "bold")).toBe(2);
    expect(offsetBefore(md, "it*")).toBe(11);
    // A caret parked between the asterisks has no rich-text counterpart; it
    // resolves to the nearest text position before it.
    expect(markdownIndexToTextOffset(md, 3)).toBe(2);
  });

  it("skips bullet markers", () => {
    const md = "- one\n- two";
    expect(markdownTextLength(md)).toBe(7); // "one" + separator + "two"
    expect(offsetBefore(md, "one")).toBe(0);
    expect(offsetBefore(md, "two")).toBe(4);
  });

  it("skips task checkboxes", () => {
    const md = "- [ ] todo\n\n- [x] done";
    expect(markdownTextLength(md)).toBe(9); // "todo" + separator + "done"
    expect(offsetBefore(md, "todo")).toBe(0);
    expect(offsetBefore(md, "done")).toBe(5);
  });

  it("keeps fenced code verbatim but drops the fences", () => {
    const md = "```js\nconst a = 1;\nconst b = 2;\n```";
    expect(markdownTextLength(md)).toBe("const a = 1;\nconst b = 2;".length);
    expect(offsetBefore(md, "const b")).toBe(13);
  });

  it("keeps wiki-link brackets — they are literal text in the editor", () => {
    expect(markdownTextLength("[[Some Note]]")).toBe(13);
    // …but a backslash escape written by the serializer is syntax.
    expect(markdownTextLength("\\[\\[Some Note\\]\\]")).toBe(13);
  });

  it("keeps highlight and inline HTML literal — neither has a markdown-it rule", () => {
    expect(markdownTextLength("a ==h== b")).toBe(9);
    expect(markdownTextLength("a <u>u</u> b")).toBe(12);
  });

  it("drops link targets but keeps link labels", () => {
    const md = "see [text](https://x.com) end";
    expect(markdownTextLength(md)).toBe("see text end".length);
    expect(offsetBefore(md, "text]")).toBe(4);
  });

  it("treats a standalone image as a leaf with no text", () => {
    expect(markdownTextLength("![alt](a.png)")).toBe(0);
    expect(markdownTextLength("a\n\n![alt](a.png)\n\nb")).toBe(3); // "a" + sep + "b"
  });

  it("handles an empty document", () => {
    expect(markdownTextLength("")).toBe(0);
    expect(markdownIndexToTextOffset("", 0)).toBe(0);
    expect(textOffsetToMarkdownIndex("", 0)).toBe(0);
  });

  it("clamps out-of-range and non-finite input instead of throwing", () => {
    const md = "abc";
    expect(markdownIndexToTextOffset(md, -50)).toBe(0);
    expect(markdownIndexToTextOffset(md, 9999)).toBe(3);
    expect(markdownIndexToTextOffset(md, Number.NaN)).toBe(0);
    expect(textOffsetToMarkdownIndex(md, -50)).toBe(0);
    expect(textOffsetToMarkdownIndex(md, 9999)).toBe(3);
    expect(textOffsetToMarkdownIndex(md, Number.NaN)).toBe(0);
  });
});

describe("textOffsetToMarkdownIndex", () => {
  it("lands after the heading marker, not before it", () => {
    expect(textOffsetToMarkdownIndex("# Title", 0)).toBe(2);
    expect(textOffsetToMarkdownIndex("### Deep", 0)).toBe(4);
  });

  it("lands at the very start of a plain paragraph", () => {
    expect(textOffsetToMarkdownIndex("Hello", 0)).toBe(0);
  });

  it("lands at the very end of the document", () => {
    expect(textOffsetToMarkdownIndex("Hello", 5)).toBe(5);
    expect(textOffsetToMarkdownIndex("abc\n", 3)).toBe(3); // before the trailing newline
  });

  it("steps over emphasis delimiters onto the text they wrap", () => {
    const md = "a **bold** b";
    expect(textOffsetToMarkdownIndex(md, 2)).toBe(md.indexOf("bold"));
    expect(textOffsetToMarkdownIndex(md, 6)).toBe(md.indexOf("** b") + 2);
  });

  it("steps over a bullet marker onto the item text", () => {
    const md = "- one\n- two";
    expect(textOffsetToMarkdownIndex(md, 4)).toBe(md.indexOf("two"));
    expect(textOffsetToMarkdownIndex(md, 3)).toBe(5); // end of "one"
  });

  it("steps over a task checkbox onto the item text", () => {
    const md = "- [ ] todo";
    expect(textOffsetToMarkdownIndex(md, 0)).toBe(md.indexOf("todo"));
  });

  it("is stable under a markdown → offset → markdown round trip", () => {
    const samples = [
      "Hello world",
      "# Title\n\nBody text",
      "a **bold** and *it* tail",
      "- one\n- two\n- three",
      "- [ ] todo\n\n- [x] done",
      "```js\nconst a = 1;\n```",
      "",
      "go to [[Some Note]] now",
      "| a | b |\n| --- | --- |\n| 1 | 2 |",
    ];
    for (const md of samples) {
      for (let index = 0; index <= md.length; index++) {
        const offset = markdownIndexToTextOffset(md, index);
        const back = textOffsetToMarkdownIndex(md, offset);
        // Round tripping never drifts to a different logical spot.
        expect(markdownIndexToTextOffset(md, back)).toBe(offset);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// ProseMirror side — a minimal schema keeps this file free of editor deps.
// ---------------------------------------------------------------------------

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*", toDOM: () => ["p", 0] },
    heading: { group: "block", content: "inline*", toDOM: () => ["h1", 0] },
    codeBlock: { group: "block", content: "text*", code: true, toDOM: () => ["pre", ["code", 0]] },
    image: { group: "block", inline: false, atom: true, toDOM: () => ["img"] },
    text: { group: "inline" },
  },
  marks: {},
});

function paragraph(text?: string) {
  return schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined);
}

describe("document ⇄ text offset", () => {
  it("maps positions in a single paragraph one-to-one", () => {
    const doc = schema.nodes.doc.create(null, [paragraph("Hello")]);
    expect(docTextLength(doc)).toBe(5);
    expect(docPositionToTextOffset(doc, 1)).toBe(0);
    expect(docPositionToTextOffset(doc, 6)).toBe(5);
    expect(textOffsetToDocPosition(doc, 0)).toBe(1);
    expect(textOffsetToDocPosition(doc, 5)).toBe(6);
  });

  it("charges one character per block boundary", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.heading.create(null, schema.text("Title")),
      paragraph("Body"),
    ]);
    expect(docTextLength(doc)).toBe(10); // "Title" + "\n" + "Body"
    expect(textOffsetToDocPosition(doc, 6)).toBe(8); // start of "Body"
    expect(docPositionToTextOffset(doc, 8)).toBe(6);
  });

  it("treats an empty paragraph as a boundary with no characters", () => {
    const doc = schema.nodes.doc.create(null, [paragraph("a"), paragraph(), paragraph("b")]);
    expect(docTextLength(doc)).toBe(4); // "a" + "\n" + "" + "\n" + "b"
  });

  it("gives leaf nodes no text but keeps positions valid", () => {
    const doc = schema.nodes.doc.create(null, [
      paragraph("a"),
      schema.nodes.image.create(),
      paragraph("b"),
    ]);
    expect(docTextLength(doc)).toBe(3); // the image contributes nothing
    // paragraph "a" occupies 0..3, the image is a single position at 3,
    // so the second paragraph's text starts at 5.
    expect(textOffsetToDocPosition(doc, 2)).toBe(5);
  });

  it("keeps newlines inside a code block as real characters", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.codeBlock.create(null, schema.text("l1\nl2")),
    ]);
    expect(docTextLength(doc)).toBe(5);
    expect(textOffsetToDocPosition(doc, 3)).toBe(4);
  });

  it("clamps rather than throwing on out-of-range input", () => {
    const doc = schema.nodes.doc.create(null, [paragraph("abc")]);
    const size = doc.content.size;
    expect(docPositionToTextOffset(doc, -10)).toBe(0);
    expect(docPositionToTextOffset(doc, 9999)).toBe(3);
    expect(docPositionToTextOffset(doc, Number.NaN)).toBe(0);
    expect(textOffsetToDocPosition(doc, -10)).toBe(1);
    expect(textOffsetToDocPosition(doc, 9999)).toBeLessThanOrEqual(size);
    expect(textOffsetToDocPosition(doc, Number.NaN)).toBe(1);
  });

  it("never returns a position outside the document", () => {
    const doc = schema.nodes.doc.create(null, [paragraph("one"), paragraph("two")]);
    for (let offset = -5; offset <= 20; offset++) {
      const pos = textOffsetToDocPosition(doc, offset);
      expect(pos).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThanOrEqual(doc.content.size);
    }
  });

  it("reports whether an offset had to be clamped", () => {
    const doc = schema.nodes.doc.create(null, [paragraph("abc")]);
    // In range: trustworthy.
    expect(resolveTextOffset(doc, 0)).toEqual({ pos: 1, clamped: false });
    expect(resolveTextOffset(doc, 3)).toEqual({ pos: 4, clamped: false });
    // Out of range: still a valid position, but flagged so the caller can fall
    // back instead of confidently jumping to the end of the note.
    expect(resolveTextOffset(doc, 4).clamped).toBe(true);
    expect(resolveTextOffset(doc, 9999).clamped).toBe(true);
    expect(resolveTextOffset(doc, -1).clamped).toBe(true);
    // A clamped result is still inside the document.
    for (const offset of [-50, 4, 9999]) {
      const { pos } = resolveTextOffset(doc, offset);
      expect(pos).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThanOrEqual(doc.content.size);
    }
  });

  it("round-trips every document position through a text offset", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.heading.create(null, schema.text("Title")),
      paragraph("some body"),
      paragraph(),
      schema.nodes.codeBlock.create(null, schema.text("l1\nl2")),
      paragraph("tail"),
    ]);
    for (let pos = 0; pos <= doc.content.size; pos++) {
      const offset = docPositionToTextOffset(doc, pos);
      const back = textOffsetToDocPosition(doc, offset);
      expect(docPositionToTextOffset(doc, back)).toBe(offset);
    }
  });
});
