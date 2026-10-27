import { Extension } from "@tiptap/core";

/**
 * Keyboard behaviour shared by the main editor and the pinned-note editor.
 *
 * These add shortcuts only. They do not register a node, a mark, or a markdown
 * spec, so they cannot change the text of a parsed document.
 */

// Convert a heading to a paragraph when Backspace is pressed at position 0.
// Without this, pressing Backspace at the start of a heading is a no-op,
// leaving the user unable to demote a heading without switching to raw markdown.
export const HeadingKeyboardFix = Extension.create({
  name: "headingKeyboardFix",
  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { $from } = editor.state.selection;
        if ($from.parent.type.name !== "heading") return false;
        if ($from.parentOffset !== 0) return false;
        return editor.chain().setParagraph().run();
      },
    };
  },
});

// Clear all marks when pressing Enter outside of lists/code blocks
// so new lines never inherit bold, italic, etc.
export const ClearMarksOnEnter = Extension.create({
  name: "clearMarksOnEnter",
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (
          editor.isActive("listItem") ||
          editor.isActive("taskItem") ||
          editor.isActive("codeBlock")
        ) {
          return false;
        }
        // When the line is a code fence (``` or ```lang), explicitly convert the
        // current paragraph to a code block. Input rules only fire on text insertion,
        // not on Enter, so we must handle this ourselves.
        const { $from } = editor.state.selection;
        const fenceMatch = /^```([a-z]*)$/.exec($from.parent.textContent.trim());
        if (fenceMatch) {
          const language = fenceMatch[1];
          return editor
            .chain()
            .command(({ tr, state }) => {
              // Clear the fence text (e.g. "```css") before converting the node
              const { $from } = state.selection;
              tr.delete($from.start(), $from.end());
              return true;
            })
            .setCodeBlock({ language })
            .run();
        }
        return editor.chain().splitBlock().unsetAllMarks().run();
      },
    };
  },
});
