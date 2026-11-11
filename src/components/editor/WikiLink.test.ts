import type { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { makeEditor } from "../../test/editor-harness";
import { wikiLinkSuggestionAllowed } from "./WikiLink";

function openings(editor: Editor): number[] {
  const positions: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    let index = node.text.indexOf("[[");
    while (index !== -1) {
      positions.push(pos + index);
      index = node.text.indexOf("[[", index + 2);
    }
  });
  return positions;
}

describe("wikiLinkSuggestionAllowed", () => {
  it("allows a typed [[ that is not closed yet", () => {
    const editor = makeEditor("See [[Ship");
    const [from] = openings(editor);
    expect(from).toBeGreaterThan(0);
    expect(wikiLinkSuggestionAllowed(editor.state, from)).toBe(true);
    editor.destroy();
  });

  it("refuses a finished wiki link", () => {
    const editor = makeEditor("See [[Ship Log]] today");
    const [from] = openings(editor);
    expect(wikiLinkSuggestionAllowed(editor.state, from)).toBe(false);
    editor.destroy();
  });

  it("allows one closing bracket while the link is still being typed", () => {
    const editor = makeEditor("See [[Ship Log]");
    const [from] = openings(editor);
    expect(wikiLinkSuggestionAllowed(editor.state, from)).toBe(true);
    editor.destroy();
  });

  it("allows a new [[ on a line that already has a finished link", () => {
    const editor = makeEditor("[[New see [[Ship Log]]");
    const [first, second] = openings(editor);
    expect(wikiLinkSuggestionAllowed(editor.state, first)).toBe(true);
    expect(wikiLinkSuggestionAllowed(editor.state, second)).toBe(false);
    editor.destroy();
  });
});
