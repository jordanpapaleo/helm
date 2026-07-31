import { type AnyExtension, type Editor, Extension, InputRule } from "@tiptap/core";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Paragraph from "@tiptap/extension-paragraph";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import taskListPlugin from "markdown-it-task-lists";
import { Markdown } from "tiptap-markdown";

/**
 * Shared, framework-free editor building blocks used by NoteEditor.
 *
 * These live in their own module (rather than inline in NoteEditor.tsx) so the
 * editor's tests can import and exercise the *real* implementations instead of
 * mirroring copies. Nothing here depends on React or Tauri.
 */

/** Non-breaking space used as the placeholder that survives markdown round-trips. */
const NBSP = " ";

// Extends Paragraph to preserve blank lines (empty paragraphs) through markdown round-trips.
// Empty paragraphs are serialized as a single NBSP character so markdown-it doesn't collapse
// them, and a preprocessor restores them when parsing content that has extra blank lines.
export const ParagraphMarkdown = Paragraph.extend({
  addStorage() {
    return {
      markdown: {
        // biome-ignore lint/suspicious/noExplicitAny: tiptap-markdown serializer types are not exported
        serialize(state: any, node: any) {
          if (node.childCount === 0 || node.textContent === NBSP) {
            state.write(NBSP); // NBSP placeholder — survives markdown round-trip
          } else {
            state.renderInline(node);
          }
          state.closeBlock(node);
        },
        parse: {
          // biome-ignore lint/suspicious/noExplicitAny: markdown-it instance type not exported by tiptap-markdown
          setup(md: any) {
            if (!md.__blankLinesAdded) {
              // Convert runs of 3+ newlines (extra blank lines) into NBSP placeholder paragraphs
              // so they survive the markdown-it block parser which collapses multiple blank lines.
              // biome-ignore lint/suspicious/noExplicitAny: markdown-it core ruler state not exported
              md.core.ruler.before("block", "preserve-blank-lines", (state: any) => {
                state.src = state.src.replace(/\n{3,}/g, (match: string) => {
                  const extraBlanks = match.length - 2;
                  return `\n\n${`${NBSP}\n\n`.repeat(extraBlanks)}`;
                });
              });
              md.__blankLinesAdded = true;
            }
          },
        },
      },
    };
  },
});

// Give the user a text slot between/around back-to-back code blocks.
// When two code blocks are adjacent there is no paragraph between them, so a
// cursor can't land there and content can't be inserted. Pressing ArrowDown at
// the end of a code block whose next sibling is another code block (or that sits
// at the end of the doc) inserts an empty paragraph after it; ArrowUp at the
// start of a code block whose previous sibling is another code block (or that is
// the first node) inserts one before it. All other cases return false so normal
// arrow navigation is untouched. Pairs with the .ProseMirror-gapcursor CSS in
// globals.css that makes the click-between gap visible.
export const CodeBlockGapCursor = Extension.create({
  name: "codeBlockGapCursor",
  addKeyboardShortcuts() {
    const insertParagraph = (editor: Editor, side: "before" | "after"): boolean => {
      const { state } = editor;
      const { $from, empty } = state.selection;
      if (!empty) return false;
      if ($from.parent.type.name !== "codeBlock") return false;

      // Only act at the very start (ArrowUp) or very end (ArrowDown) of the block,
      // so mid-block arrow presses navigate lines normally.
      const atStart = $from.parentOffset === 0;
      const atEnd = $from.parentOffset === $from.parent.content.size;
      if (side === "before" && !atStart) return false;
      if (side === "after" && !atEnd) return false;

      const codeBlockDepth = $from.depth;
      const index = $from.index(codeBlockDepth - 1);
      const parent = $from.node(codeBlockDepth - 1);
      const sibling =
        side === "before" ? parent.maybeChild(index - 1) : parent.maybeChild(index + 1);
      const siblingIsCodeBlock = sibling?.type.name === "codeBlock";
      const atDocEdge = side === "before" ? index === 0 : index === parent.childCount - 1;

      // Bail unless default navigation would otherwise trap the user: an adjacent
      // code block leaves no landing slot, and a code block at the doc edge has none.
      if (!siblingIsCodeBlock && !atDocEdge) return false;

      const insertPos =
        side === "before" ? $from.before(codeBlockDepth) : $from.after(codeBlockDepth);
      return editor.commands.command(({ tr, dispatch }) => {
        const paragraph = state.schema.nodes.paragraph.create();
        tr.insert(insertPos, paragraph);
        // Cursor lands inside the new empty paragraph (insertPos + 1 = its content start).
        tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
        dispatch?.(tr);
        return true;
      });
    };

    return {
      ArrowDown: ({ editor }) => insertParagraph(editor, "after"),
      ArrowUp: ({ editor }) => insertParagraph(editor, "before"),
    };
  },
});

/**
 * Handle a plain-text paste. Inside a code block the text is inserted verbatim
 * (tiptap-markdown's clipboardTextParser would otherwise re-parse braces/newlines
 * as document structure and spill content out of the block). Elsewhere it routes
 * through the markdown clipboardTextParser, falling back to a literal insert.
 *
 * Returns true when it handled the paste (the caller should then preventDefault).
 */
export function handleTextPaste(view: EditorView, text: string | undefined): boolean {
  if (!text) return false;

  // Inside a code block: paste verbatim, preserving newlines/indentation.
  if (view.state.selection.$from.parent.type.name === "codeBlock") {
    view.dispatch(view.state.tr.insertText(text));
    return true;
  }

  // Otherwise let tiptap-markdown's clipboardTextParser interpret the text,
  // bypassing ProseMirror's default which would prefer text/html.
  let handled = false;
  // biome-ignore lint/suspicious/noExplicitAny: ProseMirror someProp callback is untyped
  view.someProp("clipboardTextParser", (f: any) => {
    const slice = f(text, view.state.selection.$from, false, view);
    if (slice) {
      view.dispatch(view.state.tr.replaceSelection(slice));
      handled = true;
    }
    return !!slice;
  });
  if (!handled) view.dispatch(view.state.tr.insertText(text));
  return true;
}

// tiptap-markdown calls parse.setup(md) on every parse() call (initial load, paste, setContent).
// We use this to register markdown-it-task-lists once on the md instance.
// setup runs inside parser.parse() so the md instance already exists.
export const TaskListMarkdown = TaskList.extend({
  addInputRules() {
    return [
      // When "[ ] " or "[x] " is typed at the start of a bulletList item, convert it
      // to a taskList item. The "- " prefix already created a bulletList via StarterKit's
      // input rule, so we match only the checkbox portion here.
      new InputRule({
        find: /^\[([xX ]?)\]\s$/,
        handler: ({ state, match }) => {
          const checked = match[1]?.toLowerCase() === "x";
          const { $from } = state.selection;
          const taskListType = state.schema.nodes.taskList;
          const taskItemType = state.schema.nodes.taskItem;
          const listItemType = state.schema.nodes.listItem;
          if (!taskListType || !taskItemType || !listItemType) return;

          // Only fire when inside a bulletList listItem
          let listItemDepth = -1;
          for (let d = $from.depth; d >= 0; d--) {
            if ($from.node(d).type === listItemType) {
              listItemDepth = d;
              break;
            }
          }
          if (listItemDepth < 0) return;

          const { tr } = state;
          // Replace the entire bulletList in one operation to avoid intermediate invalid state
          const bulletListStart = $from.before(listItemDepth - 1);
          const bulletListEnd = $from.after(listItemDepth - 1);
          const paragraph = state.schema.nodes.paragraph?.create();
          const taskItem = taskItemType.create({ checked }, paragraph ?? undefined);
          const taskList = taskListType.create(null, taskItem);
          tr.replaceWith(bulletListStart, bulletListEnd, taskList);
          // Place cursor inside the new task item's paragraph:
          // taskList(+1) > taskItem(+1) > paragraph(+1) = +3 from bulletListStart
          tr.setSelection(TextSelection.create(tr.doc, bulletListStart + 3));
        },
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        // biome-ignore lint/suspicious/noExplicitAny: tiptap-markdown serializer types are not exported
        serialize(state: any, node: any) {
          state.renderList(node, "  ", () => "- ");
        },
        parse: {
          // biome-ignore lint/suspicious/noExplicitAny: markdown-it instance type not exported by tiptap-markdown
          setup(md: any) {
            if (!md.__taskListsAdded) {
              // Normalize escaped task list brackets \[ \] → [ ] before task list plugin runs.
              // Backward-compatibility shim, not an active workaround: TaskItemMarkdown
              // now writes "[ ] "/"[x] " unescaped, and `unescapeWikiLinks` deliberately
              // leaves single brackets alone. Notes serialized before task-list support
              // existed still carry `- \[ \]` on disk (tiptap-markdown escapes [ and ] in
              // plain text), and this is what still turns them back into task lists.
              // biome-ignore lint/suspicious/noExplicitAny: markdown-it core ruler state not exported
              md.core.ruler.before("block", "unescape-task-list", (state: any) => {
                state.src = state.src.replace(/^([-*+])\s+\\\[([xX ]?)\\\]/gm, "$1 [$2]");
              });
              md.use(taskListPlugin);
              md.__taskListsAdded = true;
            }
          },
          // updateDOM converts markdown-it-task-lists output classes to tiptap data-type attrs
          updateDOM(element: Element) {
            [...element.querySelectorAll(".contains-task-list")].forEach((list) => {
              list.setAttribute("data-type", "taskList");
            });
          },
        },
      },
    };
  },
});

export const TaskItemMarkdown = TaskItem.extend({
  addStorage() {
    return {
      markdown: {
        // biome-ignore lint/suspicious/noExplicitAny: tiptap-markdown serializer types are not exported
        serialize(state: any, node: any) {
          state.write(node.attrs.checked ? "[x] " : "[ ] ");
          state.renderContent(node);
        },
        parse: {
          updateDOM(element: Element) {
            [...element.querySelectorAll(".task-list-item")].forEach((item) => {
              const input = item.querySelector("input");
              item.setAttribute("data-type", "taskItem");
              if (input) {
                item.setAttribute("data-checked", String((input as HTMLInputElement).checked));
                input.remove();
              }
            });
          },
        },
      },
    };
  },
});

/**
 * Undo the bracket escaping prosemirror-markdown applies to `[[Wiki Links]]`.
 *
 * `[[Wiki Links]]` are plain *text* in the document: WikiLink.ts contributes
 * only a decoration plugin — no node, no mark — so the serializer sees ordinary
 * characters and escapes them, exactly as it should for generic text. Its
 * `esc()` (prosemirror-markdown/dist/index.js, ~line 820) escapes
 * `` ` * \ ~ [ ] _ ``, which turns `[[Some Note]]` into `\[\[Some Note\]\]` on
 * disk. Helm reads it back fine (re-parsing turns `\[` into `[`), but every
 * other reader of the file — other markdown editors, Claude Code, the MCP
 * server — sees the backslashes.
 *
 * Only the *doubled* pairs are unescaped, and that limit is load-bearing:
 * - `\[\[` / `\]\]` can only come from the text `[[` / `]]`, which is wiki-link
 *   syntax by this app's definition (see `extractWikiLinks`), so restoring them
 *   round-trips to the same document text.
 * - A single `\[` / `\]` protects literal prose. Unescaping `\[draft\]` or
 *   `\[text\](url)` would make them parse back as link syntax on the next load,
 *   silently rewriting the user's text. Leave them escaped.
 * - `\*`, `\~`, `` \` `` and `\\` are correct markdown for literal characters
 *   and are deliberately untouched.
 *
 * Code is skipped. prosemirror-markdown writes code-block and inline-code
 * content verbatim, so a `\[\[` inside a fence or a code span is real user
 * content (a regex, say) rather than an escape — rewriting it would corrupt it.
 *
 * @param markdown - Serializer output
 * @returns The same markdown with `\[\[`/`\]\]` restored outside code
 */
export function unescapeWikiLinks(markdown: string): string {
  // Non-global: `replace` with a global regex would be fine, but these run per
  // segment and a plain pattern keeps the intent obvious.
  const unescapeSegment = (segment: string) =>
    segment.replace(/\\\[\\\[/g, "[[").replace(/\\\]\\\]/g, "]]");

  // Odd indices of the split are code spans (the capture group), so only the
  // even ones — the prose between them — get unescaped.
  const unescapeOutsideCodeSpans = (line: string) =>
    line
      .split(/(`+[^`]*`+)/)
      .map((part, i) => (i % 2 === 1 ? part : unescapeSegment(part)))
      .join("");

  let openFence: string | null = null;
  return markdown
    .split("\n")
    .map((line) => {
      const fence = line.match(/^ {0,3}(`{3,}|~{3,})/)?.[1];
      if (fence) {
        if (openFence === null) openFence = fence;
        else if (fence[0] === openFence[0] && fence.length >= openFence.length) openFence = null;
        return line;
      }
      return openFence === null ? unescapeOutsideCodeSpans(line) : line;
    })
    .join("\n");
}

/**
 * Read the editor's content as the markdown that should land on disk.
 *
 * The single save-side entry point: every path that persists editor content
 * goes through here, so the wiki-link unescape lives in exactly one place.
 * (The raw markdown textarea in MainPanel is deliberately not a caller — its
 * text never passes through the serializer, so it has nothing to unescape.)
 *
 * @param editor - The TipTap editor to serialize
 * @returns Markdown for the document, or its plain text if tiptap-markdown is absent
 */
export function getEditorMarkdown(editor: Editor): string {
  const markdown =
    (editor.storage as { markdown?: { getMarkdown?: () => string } }).markdown?.getMarkdown?.() ??
    editor.getText();
  return unescapeWikiLinks(markdown);
}

/**
 * The extensions that determine the editor's *schema* and its markdown
 * parse/serialize behaviour — i.e. everything that decides what text a document
 * contains once markdown has been parsed.
 *
 * NoteEditor composes this with its interaction-only extensions (Placeholder,
 * WikiLinkExtension, FindReplaceExtension, CodeBlockGapCursor, ClearMarksOnEnter,
 * HeadingKeyboardFix). Those are deliberately excluded: none of them registers a
 * node, a mark, or a markdown spec, so none can change the text of a parsed
 * document.
 *
 * Tests build their editor from this same function. Re-declaring an
 * "equivalent" list in a test is how a harness silently becomes a different
 * editor from the one that ships — the task-list extensions below are exactly
 * that trap, because stock TaskList/TaskItem parse `- [ ] x` through
 * tiptap-markdown's built-in specs and produce different text than these do.
 *
 * `codeBlock` is passed in because the app wraps it in a React node view and
 * tests do not; a node view cannot affect document text.
 */
export function markdownExtensions(codeBlock: AnyExtension): AnyExtension[] {
  return [
    StarterKit.configure({ codeBlock: false, paragraph: false }),
    ParagraphMarkdown,
    Highlight.configure({ multicolor: false }),
    codeBlock,
    TaskListMarkdown,
    TaskItemMarkdown.configure({ nested: true }),
    Image.configure({ inline: false, allowBase64: false }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    Markdown.configure({
      html: false,
      transformPastedText: true,
      transformCopiedText: true,
    }),
  ];
}
