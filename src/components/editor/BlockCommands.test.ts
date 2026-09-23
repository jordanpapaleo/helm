import type { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { makeEditor } from "../../test/editor-harness";
import { BlockCommands } from "./BlockCommands";
import { getEditorMarkdown } from "./extensions";

/** Put the caret inside the first text node containing `needle`. */
function caretIn(editor: Editor, needle: string) {
  let pos = -1;
  editor.state.doc.descendants((node, p) => {
    if (pos === -1 && node.isText && node.text?.includes(needle)) pos = p;
  });
  editor.commands.setTextSelection(pos + 1);
}

/**
 * Markdown for the doc, minus the trailing empty paragraph TipTap keeps after a
 * final block. ParagraphMarkdown serializes that paragraph as a lone NBSP, so it
 * would otherwise show up in every expectation here.
 */
function markdownOf(editor: Editor): string {
  return getEditorMarkdown(editor).replace(/(\n* )+\s*$/, "");
}

/** Paragraph text content of the doc, top to bottom. */
function paragraphs(editor: Editor): string[] {
  const out: string[] = [];
  editor.state.doc.forEach((node) => {
    out.push(node.textContent);
  });
  return out;
}

/**
 * Feed a keydown through the editor's real keymap chain, the same path a user's
 * keystroke takes.
 *
 * `Mod` resolves to Ctrl here: prosemirror-keymap picks Meta only when
 * navigator.platform looks like a Mac, and jsdom reports an empty platform.
 * `keyCode` matters too — a shifted "d" arrives as key "D", and the keymap needs
 * the code to map it back to the lowercase name the binding is registered under.
 */
function pressKey(
  editor: Editor,
  key: string,
  mods: { shift?: boolean; alt?: boolean; keyCode?: number } = {},
) {
  const event = new KeyboardEvent("keydown", {
    key,
    ctrlKey: !mods.alt,
    shiftKey: mods.shift ?? false,
    altKey: mods.alt ?? false,
  });
  if (mods.keyCode !== undefined) {
    Object.defineProperty(event, "keyCode", { value: mods.keyCode });
  }
  editor.view.someProp("handleKeyDown", (handler) => handler(editor.view, event));
}

describe("duplicateBlock", () => {
  it("inserts a copy of the caret's block directly below it", () => {
    const editor = makeEditor("one\n\ntwo\n\nthree", [BlockCommands]);

    caretIn(editor, "two");
    editor.commands.duplicateBlock();

    expect(paragraphs(editor)).toEqual(["one", "two", "two", "three"]);

    editor.destroy();
  });

  it("copies the whole list item, not the paragraph inside it", () => {
    const editor = makeEditor("- alpha\n- beta\n- gamma", [BlockCommands]);

    caretIn(editor, "beta");
    editor.commands.duplicateBlock();

    // A duplicated paragraph would nest two <p> in one <li>; a duplicated item
    // yields a fourth sibling <li>.
    expect(markdownOf(editor)).toBe("- alpha\n- beta\n- beta\n- gamma");

    editor.destroy();
  });
});

describe("moveBlockUp", () => {
  it("swaps the caret's block with the one above it", () => {
    const editor = makeEditor("one\n\ntwo\n\nthree", [BlockCommands]);

    caretIn(editor, "two");
    editor.commands.moveBlockUp();

    expect(paragraphs(editor)).toEqual(["two", "one", "three"]);

    editor.destroy();
  });

  it("does nothing when the block is already first", () => {
    const editor = makeEditor("one\n\ntwo", [BlockCommands]);

    caretIn(editor, "one");
    const moved = editor.commands.moveBlockUp();

    expect(moved).toBe(false);
    expect(paragraphs(editor)).toEqual(["one", "two"]);

    editor.destroy();
  });

  it("reorders list items without flattening the list", () => {
    const editor = makeEditor("- alpha\n- beta\n- gamma", [BlockCommands]);

    caretIn(editor, "gamma");
    editor.commands.moveBlockUp();

    expect(markdownOf(editor)).toBe("- alpha\n- gamma\n- beta");

    editor.destroy();
  });
});

describe("moveBlockDown", () => {
  it("swaps the caret's block with the one below it", () => {
    const editor = makeEditor("one\n\ntwo\n\nthree", [BlockCommands]);

    caretIn(editor, "two");
    editor.commands.moveBlockDown();

    expect(paragraphs(editor)).toEqual(["one", "three", "two"]);

    editor.destroy();
  });

  it("does nothing when the block is already last", () => {
    const editor = makeEditor("only", [BlockCommands]);

    caretIn(editor, "only");
    const moved = editor.commands.moveBlockDown();

    expect(moved).toBe(false);

    editor.destroy();
  });
});

describe("deleteBlock", () => {
  it("removes the caret's block and leaves its siblings intact", () => {
    const editor = makeEditor("one\n\ntwo\n\nthree", [BlockCommands]);

    caretIn(editor, "two");
    editor.commands.deleteBlock();

    expect(paragraphs(editor)).toEqual(["one", "three"]);

    editor.destroy();
  });

  it("removes a single list item without disturbing the rest of the list", () => {
    const editor = makeEditor("- alpha\n- beta\n- gamma", [BlockCommands]);

    caretIn(editor, "beta");
    editor.commands.deleteBlock();

    expect(markdownOf(editor)).toBe("- alpha\n- gamma");

    editor.destroy();
  });

  it("leaves an editable empty paragraph when the last block is deleted", () => {
    const editor = makeEditor("only", [BlockCommands]);

    caretIn(editor, "only");
    editor.commands.deleteBlock();

    // A doc with zero blocks is invalid — the user must still have a line to type on.
    expect(editor.state.doc.childCount).toBeGreaterThan(0);
    expect(editor.state.doc.textContent).toBe("");

    editor.destroy();
  });
});

describe("keyboard shortcuts", () => {
  it("duplicates the block on Mod-Shift-D", () => {
    const editor = makeEditor("one\n\ntwo", [BlockCommands]);

    caretIn(editor, "two");
    pressKey(editor, "D", { shift: true, keyCode: 68 });

    expect(paragraphs(editor)).toEqual(["one", "two", "two"]);

    editor.destroy();
  });

  it("moves the block on Alt-ArrowUp and Alt-ArrowDown", () => {
    const editor = makeEditor("one\n\ntwo\n\nthree", [BlockCommands]);

    caretIn(editor, "three");
    pressKey(editor, "ArrowUp", { alt: true });
    expect(paragraphs(editor)).toEqual(["one", "three", "two"]);

    pressKey(editor, "ArrowDown", { alt: true });
    expect(paragraphs(editor)).toEqual(["one", "two", "three"]);

    editor.destroy();
  });

  it("deletes the block on Mod-Shift-K", () => {
    const editor = makeEditor("one\n\ntwo", [BlockCommands]);

    caretIn(editor, "one");
    pressKey(editor, "K", { shift: true, keyCode: 75 });

    expect(paragraphs(editor)).toEqual(["two"]);

    editor.destroy();
  });
});
