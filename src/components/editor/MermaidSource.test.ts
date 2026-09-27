import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vitest";
import { makeEditor } from "../../test/editor-harness";
import {
  closeMermaidSource,
  MermaidSourceExtension,
  mermaidSourceOpenAt,
  openMermaidSource,
} from "./MermaidSource";

const DOC = ["Before", "", "```mermaid", "graph TD; A-->B", "```", "", "After"].join("\n");

let editor: Editor;
afterEach(() => editor?.destroy());

function mount(markdown = DOC) {
  editor = makeEditor(markdown, [MermaidSourceExtension]);
  return editor;
}

/** Start position of the first code block. */
function blockPos(): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found < 0 && node.type.name === "codeBlock") found = pos;
  });
  return found;
}

function parentName() {
  return editor.state.selection.$head.parent.type.name;
}

function setCursor(pos: number) {
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)));
}

describe("MermaidSource", () => {
  it("starts with every diagram's source closed", () => {
    mount();
    expect(mermaidSourceOpenAt(editor.state, blockPos())).toBe(false);
  });

  it("moves a caret that lands inside a closed diagram to the far side, in the direction of travel", () => {
    mount();
    const pos = blockPos();
    setCursor(pos - 1); // end of "Before"
    setCursor(pos + 3); // arrowing forward into the hidden block
    expect(parentName()).toBe("paragraph");
    expect(editor.state.selection.$head.parent.textContent).toBe("After");

    const after = pos + (editor.state.doc.nodeAt(pos)?.nodeSize ?? 0) + 1;
    setCursor(after); // start of "After"
    setCursor(pos + 3); // arrowing backward into it
    expect(editor.state.selection.$head.parent.textContent).toBe("Before");
  });

  it("keeps the caret inside while the source is open", () => {
    mount();
    const pos = blockPos();
    editor.view.dispatch(openMermaidSource(editor.state.tr, pos));
    expect(mermaidSourceOpenAt(editor.state, pos)).toBe(true);
    expect(parentName()).toBe("codeBlock");
    setCursor(pos + 5);
    expect(parentName()).toBe("codeBlock");
  });

  it("closes when the caret leaves the block", () => {
    mount();
    const pos = blockPos();
    editor.view.dispatch(openMermaidSource(editor.state.tr, pos));
    setCursor(1);
    expect(mermaidSourceOpenAt(editor.state, pos)).toBe(false);
  });

  it("closes on request and moves the caret out of the hidden source", () => {
    mount();
    const pos = blockPos();
    editor.view.dispatch(openMermaidSource(editor.state.tr, pos));
    editor.view.dispatch(closeMermaidSource(editor.state.tr));
    expect(mermaidSourceOpenAt(editor.state, pos)).toBe(false);
    expect(parentName()).toBe("paragraph");
  });

  it("closes on Escape", () => {
    mount();
    const pos = blockPos();
    editor.view.dispatch(openMermaidSource(editor.state.tr, pos));
    editor.view.someProp("handleKeyDown", (f) =>
      f(editor.view, new KeyboardEvent("keydown", { key: "Escape" })),
    );
    expect(mermaidSourceOpenAt(editor.state, pos)).toBe(false);
    expect(parentName()).toBe("paragraph");
  });

  it("closes when the editor loses focus", () => {
    mount();
    const pos = blockPos();
    editor.view.dispatch(openMermaidSource(editor.state.tr, pos));
    editor.view.dom.dispatchEvent(new FocusEvent("blur"));
    expect(mermaidSourceOpenAt(editor.state, pos)).toBe(false);
  });

  it("stays open across edits to the source", () => {
    mount();
    const pos = blockPos();
    editor.view.dispatch(openMermaidSource(editor.state.tr, pos));
    editor.view.dispatch(editor.state.tr.insertText("X"));
    expect(mermaidSourceOpenAt(editor.state, pos)).toBe(true);
    expect(editor.state.doc.nodeAt(pos)?.textContent).toContain("X");
  });

  it("opens the diagram when there is nowhere else for the caret to go", () => {
    mount("```mermaid\ngraph TD; A-->B\n```");
    setCursor(3);
    expect(mermaidSourceOpenAt(editor.state, 0)).toBe(true);
    expect(parentName()).toBe("codeBlock");
  });

  it("leaves ordinary code blocks alone", () => {
    mount("Before\n\n```js\nconst x = 1;\n```\n\nAfter");
    setCursor(blockPos() + 3);
    expect(parentName()).toBe("codeBlock");
  });
});
