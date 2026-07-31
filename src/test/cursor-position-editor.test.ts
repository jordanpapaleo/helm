import { Editor } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { describe, expect, it } from "vitest";
import { ParagraphMarkdown } from "../components/editor/extensions";
import {
  docPositionToTextOffset,
  docTextLength,
  markdownIndexToTextOffset,
  markdownTextLength,
  textOffsetToDocPosition,
  textOffsetToMarkdownIndex,
} from "../lib/cursor-position";
import { lowlight } from "../lib/lowlight";

/**
 * The markdown scanner in `cursor-position.ts` has to agree with the *real*
 * parser the app runs. These tests build an editor from the same markdown-relevant
 * extension set as `NoteEditor` (React node views and the Tauri paste handler are
 * irrelevant to text measurement) and check the scanner against ProseMirror's own
 * flattened text.
 */
function makeEditor(content: string): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({ codeBlock: false, paragraph: false }),
      ParagraphMarkdown,
      Highlight.configure({ multicolor: false }),
      CodeBlockLowlight.configure({ lowlight }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ inline: false, allowBase64: false }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Markdown.configure({ html: false, transformPastedText: true, transformCopiedText: true }),
    ],
    content,
    element: document.createElement("div"),
  });
}

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
};

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
