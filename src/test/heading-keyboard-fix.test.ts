import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { HeadingKeyboardFix } from "../components/editor/editor-keyboard";

function makeEditor(content: string) {
  return new Editor({
    extensions: [StarterKit, HeadingKeyboardFix],
    content,
    element: document.createElement("div"),
  });
}

describe("HeadingKeyboardFix", () => {
  it("converts a heading to a paragraph when Backspace is pressed at position 0", () => {
    const editor = makeEditor("<h1>Hello</h1>");
    // Place cursor at offset 0 of the heading
    editor.commands.setTextSelection(1);
    editor.commands.keyboardShortcut("Backspace");
    expect(editor.isActive("heading")).toBe(false);
    expect(editor.isActive("paragraph")).toBe(true);
    editor.destroy();
  });

  it("does NOT convert heading to paragraph when Backspace is pressed mid-word", () => {
    const editor = makeEditor("<h1>Hello</h1>");
    // Place cursor at offset 3 (mid-word)
    editor.commands.setTextSelection(4);
    editor.commands.keyboardShortcut("Backspace");
    expect(editor.isActive("heading")).toBe(true);
    editor.destroy();
  });

  it("does nothing when Backspace is pressed at position 0 of a paragraph", () => {
    const editor = makeEditor("<p>Hello</p>");
    editor.commands.setTextSelection(1);
    editor.commands.keyboardShortcut("Backspace");
    expect(editor.isActive("paragraph")).toBe(true);
    editor.destroy();
  });
});
