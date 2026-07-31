import type { AnyExtension } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { describe, expect, it } from "vitest";
import { FindReplaceExtension } from "../components/editor/findReplaceExtension";
import { InlineTagExtension } from "../components/editor/InlineTag";
import { WikiLinkExtension } from "../components/editor/WikiLink";
import {
  docPositionToTextOffset,
  docTextLength,
  markdownIndexToTextOffset,
  markdownTextLength,
  textOffsetToDocPosition,
  textOffsetToMarkdownIndex,
} from "../lib/cursor-position";
import { makeEditor } from "./editor-harness";

/**
 * The markdown scanner in `cursor-position.ts` has to agree with the real parser
 * the app runs, so every editor here comes from `makeEditor` — which builds from
 * the same `markdownExtensions()` NoteEditor uses.
 */

const CORPUS: Record<string, string> = {
  "plain paragraph": "Hello world",
  "empty document": "",
  heading: "# Title\n\nBody text",
  "heading level 3": "### Deep\n\ntail",
  "bold and italic": "a **bold** and *italic* tail",
  "strong emphasis": "***both*** here",
  strikethrough: "a ~~gone~~ b",
  "inline code": "call `fn(x)` now",
  "bullet list": "- one\n- two\n- three",
  "ordered list": "1. one\n2. two",
  "nested bullets": "- one\n  - deep\n- two",
  "task list": "- [ ] todo\n\n- [x] done",
  "fenced code": "```js\nconst a = 1;\nconst b = 2;\n```",
  "fenced code untagged": "text\n\n```\nl1\nl2\n```\n\nafter",
  blockquote: "> quoted line\n\nafter",
  "multi paragraph": "one\n\ntwo\n\nthree",
  "blank line placeholder": "a\n\n \n\nb",
  "horizontal rule": "a\n\n---\n\nb",
  "wiki links": "go to [[Some Note]] now",
  "escaped wiki links": "go to \\[\\[Some Note\\]\\] now",
  "markdown link": "see [text](https://x.com) end",
  "bare url": "see https://x.com end",
  "literal asterisks": "2 * 3 * 4",
  "snake case word": "foo_bar_baz here",
  "highlight is literal": "a ==h== b",
  "underline html is literal": "a <u>u</u> b",
  "standalone image": "before\n\n![alt](http://x/y.png)\n\nafter",
  table: "| a | b |\n| --- | --- |\n| 1 | 2 |",
  "soft break": "line1\nline2",
  "hard break": "line1\\\nline2",
  "trailing newline": "abc\n",
  "inline tags": "note about #work and #home/office",
  "mixed document":
    "# Notes\n\nSome **bold** text with a [[Wiki Link]].\n\n- [ ] first task\n- [x] second\n\n```ts\nconst x: number = 1;\n```\n\n> a quote\n\nFinal line.",
  // Cases that used to drift and are now exact — keep them pinned.
  "setext heading": "Title\n===",
  "nested mixed emphasis": "a *b **c** d* e",
  "code span with backtick": "`` a ` b ``",
  "extra blank lines": "a\n\n\n\nb",
  "three newlines": "a\n\n\nb",
  "leading blank lines": "\n\n\na",
  "trailing blank lines": "a\n\n\n\n",
  "only newlines": "\n\n\n",
  "list continuation": "- item\n  continued line",
  "quoted list": "> - quoted list\n> - second",
  "nested task list": "- [ ] task\n  - [x] nested task",
  "escaped emphasis": "\\*not emphasis\\*",
  "single tilde": "~single tilde~",
  "empty list item": "- \n- x",
  "image with empty alt": "![](a.png)",
  "link containing bold": "[link with **bold**](u) tail",
  "wiki link beside real link": "[[Wiki]] and [real](u)",
  "underscores mid word": "a_b_c and _d_",
  "closing hashes": "# heading ###",
  "hash without space": "#nothashheading",
  "tilde fence": "~~~\ntilde fence\n~~~",
  "unclosed fence": "```\nunclosed fence",
  "consecutive hard breaks": "line1  \nline2  \nline3",
  "pipe in prose": "text with | pipe",
  "not a table": "|no|table|",
  emoji: "emoji 😀 text",
  "html block": "<div>html</div>",
  "whitespace only": "   ",
  "thematic break stars": "***\n",
  "thematic break underscores": "___\n",

  // Constructs found by running the scanner over a real vault, where it had been
  // drifting on 11 of 39 notes. Each one is a distinct cause; keep them pinned.
  //
  // 1. HTML entities decode to a single character (`&lt;` is 4 source chars, 1
  //    rendered). This was the +306 note: a template full of `<Name>` placeholders.
  "entity lt gt": "# Feature: &lt;Name&gt;",
  "entity ampersand": "Tom &amp; Jerry",
  "entity numeric": "quote &#39; here",
  "entity nbsp": "a &nbsp; b",
  "entity arrow prose": "- Workout Template -&gt; Session",
  "entity not decoded in code span": "`a &lt; b`",
  "entity not decoded in fence": "```\na &lt; b\n```",

  // 2. A checkbox with no content after it is not a task item; the `[ ]` stays
  //    literal text. This was the only note that *under*-counted (-9).
  "empty task marker": "- \\[ \\]\n- \\[ \\]\n- CI / GitHub Actions",
  "empty task marker unescaped": "- [ ]\n- x",
  "empty task marker trailing space": "- [ ] \n- x",
  "task marker with content": "- [ ] real task",
  "task marker double space": "- [ ]  real task",

  // 3. Runs of whitespace collapse to one character when the HTML is parsed —
  //    but not inside a fenced block.
  "double space mid sentence": "the Check in icon.  That is implied",
  "triple space": "a   b",
  "double space in code span": "`a  b`",
  "double space preserved in fence": "```\na  b\n```",
  "tab mid line": "a\tb",

  // 4. A soft break after an inline element loses its space entirely: the parser
  //    strips a leading newline from a text node that follows an element.
  "soft break after bold": "**1. Inline rendering**\nHelm already extracts tags",
  "soft break after code span": "`fn()`\nnext line",
  "soft break after link": "[text](https://x.com)\nnext line",
  "soft break after plain text": "plain text\nnext line",
};

/**
 * `markdownExtensions()` deliberately omits NoteEditor's interaction-only
 * extensions, on the stated grounds that none of them registers a node, a mark,
 * or a markdown spec and so none can change the text of a parsed document.
 *
 * That claim is what makes the shared harness trustworthy, so it is tested
 * rather than asserted in a comment — an unnoticed schema contribution here is
 * exactly how the harness silently stopped matching the app once before.
 *
 * Keep this list in step with NoteEditor's extensions array.
 */
const INTERACTION_ONLY: AnyExtension[] = [
  Placeholder.configure({ placeholder: "Start writing…" }),
  InlineTagExtension,
  WikiLinkExtension.configure({ suggestion: {} }),
  FindReplaceExtension,
];

describe("markdownExtensions — the excluded extensions cannot affect text", () => {
  it("registers no nodes, marks, or markdown specs", () => {
    for (const extension of INTERACTION_ONLY) {
      expect(extension.type).toBe("extension");
      // biome-ignore lint/suspicious/noExplicitAny: addStorage's `this` is per-extension
      const addStorage = extension.config.addStorage as undefined | ((this: any) => unknown);
      const storage = addStorage?.call({
        name: extension.name,
        options: extension.options,
        storage: {},
      });
      expect((storage as { markdown?: unknown } | undefined)?.markdown).toBeUndefined();
    }
  });

  it("leaves the parsed text of every corpus document unchanged", () => {
    for (const [name, markdown] of Object.entries(CORPUS)) {
      const bare = makeEditor(markdown);
      const withInteraction = makeEditor(markdown, INTERACTION_ONLY);
      try {
        expect(
          docTextLength(withInteraction.state.doc),
          `${name} changed length when interaction extensions were added`,
        ).toBe(docTextLength(bare.state.doc));
      } finally {
        bare.destroy();
        withInteraction.destroy();
      }
    }
  });
});

describe("cursor-position — agreement with the real editor", () => {
  for (const [name, markdown] of Object.entries(CORPUS)) {
    it(`measures the same text length as ProseMirror: ${name}`, () => {
      const editor = makeEditor(markdown);
      try {
        expect(markdownTextLength(markdown)).toBe(docTextLength(editor.state.doc));
      } finally {
        editor.destroy();
      }
    });
  }

  it("round-trips every caret position in the markdown source without drifting", () => {
    for (const markdown of Object.values(CORPUS)) {
      const editor = makeEditor(markdown);
      try {
        const doc = editor.state.doc;
        for (let index = 0; index <= markdown.length; index++) {
          const offset = markdownIndexToTextOffset(markdown, index);
          const pos = textOffsetToDocPosition(doc, offset);
          // Mapping into the editor and back must land on the same text offset.
          expect(docPositionToTextOffset(doc, pos)).toBe(offset);
          // And mapping that offset back into markdown must be stable.
          const back = textOffsetToMarkdownIndex(markdown, offset);
          expect(markdownIndexToTextOffset(markdown, back)).toBe(offset);
        }
      } finally {
        editor.destroy();
      }
    }
  });

  it("round-trips every document position back to itself where text exists", () => {
    for (const markdown of Object.values(CORPUS)) {
      const editor = makeEditor(markdown);
      try {
        const doc = editor.state.doc;
        for (let pos = 0; pos <= doc.content.size; pos++) {
          const offset = docPositionToTextOffset(doc, pos);
          const index = textOffsetToMarkdownIndex(markdown, offset);
          expect(markdownIndexToTextOffset(markdown, index)).toBe(offset);
        }
      } finally {
        editor.destroy();
      }
    }
  });

  it("keeps the caret next to the same word across a full toggle round trip", () => {
    const markdown = "# Title\n\nSome **bold** words here.\n\n- [ ] a task item";
    const editor = makeEditor(markdown);
    try {
      const doc = editor.state.doc;
      const probes = [
        markdown.indexOf("Title"),
        markdown.indexOf("bold"),
        markdown.indexOf("words"),
        markdown.indexOf("task item"),
        markdown.length,
      ];
      for (const index of probes) {
        const offset = markdownIndexToTextOffset(markdown, index);
        const pos = textOffsetToDocPosition(doc, offset);
        const back = textOffsetToMarkdownIndex(markdown, docPositionToTextOffset(doc, pos));
        expect(back).toBe(index);
      }
    } finally {
      editor.destroy();
    }
  });
});
