import { Editor } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { markdownExtensions } from "../components/editor/extensions";
import { lowlight } from "../lib/lowlight";

/**
 * An editor built from the *same* extension set the app ships.
 *
 * Tests that check the cursor mapping have to measure against the real parser.
 * An earlier version hand-rolled a list that looked equivalent but used stock
 * TaskList/TaskItem instead of the app's TaskListMarkdown/TaskItemMarkdown, so
 * `- [ ] x` parsed through tiptap-markdown's built-in specs and produced
 * different text than the app does. The tests then proved agreement with an
 * editor that does not exist.
 *
 * Build editors through this helper. Do not re-declare the extension list.
 */
export function makeEditor(content: string): Editor {
  return new Editor({
    extensions: markdownExtensions(CodeBlockLowlight.configure({ lowlight })),
    content,
    element: document.createElement("div"),
  });
}
