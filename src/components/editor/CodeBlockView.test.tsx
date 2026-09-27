import { act, fireEvent, render, screen } from "@testing-library/react";
import { EditorContent, useEditor } from "@tiptap/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const renderMermaid = vi.fn();
vi.mock("../../lib/mermaid", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/mermaid")>()),
  renderMermaid: (...a: unknown[]) => renderMermaid(...a),
}));

import type { Editor } from "@tiptap/core";
import { richCodeBlock } from "./CodeBlockView";
import { getEditorMarkdown, markdownExtensions } from "./extensions";
import { MermaidSourceExtension } from "./MermaidSource";

const DOC = [
  "Intro",
  "",
  "```mermaid",
  "flowchart TD",
  "    A[Start] --> B{Ok?}",
  "```",
  "",
  "```Mermaid",
  "sequenceDiagram",
  "    A->>B: hi",
  "```",
  "",
  "```js",
  "const x = 1;",
  "```",
].join("\n");

let editorRef: Editor | null = null;

function Harness({ content }: { content: string }) {
  const editor = useEditor({
    extensions: [...markdownExtensions(richCodeBlock()), MermaidSourceExtension],
    content,
  });
  editorRef = editor;
  return <EditorContent editor={editor} />;
}

async function settle() {
  // Node views mount after the editor, then each preview awaits its render.
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
  }
}

async function mount(content = DOC) {
  const result = render(<Harness content={content} />);
  await settle();
  return result;
}

function caretBlock(): string {
  const parent = editorRef?.state.selection.$head.parent;
  return parent?.type.name === "codeBlock" ? String(parent.attrs.language) : "text";
}

function collapsed(container: HTMLElement) {
  return [...container.querySelectorAll(".code-block-node-view pre")].map((p) =>
    p.classList.contains("code-block-source-collapsed"),
  );
}

describe("CodeBlockView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    editorRef = null;
    renderMermaid.mockReset();
    renderMermaid.mockImplementation(async (src: string) => `<svg data-src="${src.length}"></svg>`);
  });

  it("renders mermaid blocks as labelled diagrams, whatever the language casing", async () => {
    await mount();
    expect(screen.getByRole("img", { name: "Flowchart diagram" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Sequence diagram" })).toBeInTheDocument();
    expect(renderMermaid).toHaveBeenCalledTimes(2);
  });

  it("hides mermaid source but leaves other code visible", async () => {
    const { container } = await mount();
    expect(collapsed(container)).toEqual([true, true, false]);
  });

  it("keeps the source hidden when the caret is placed in the diagram's block", async () => {
    const { container } = await mount();
    act(() => {
      editorRef?.commands.focus();
      editorRef?.commands.setTextSelection(10);
    });
    expect(collapsed(container)).toEqual([true, true, false]);
    expect(caretBlock()).not.toMatch(/^mermaid$/i);
  });

  it("toggles the source with a keyboard-reachable Edit source button", async () => {
    const { container } = await mount();
    const buttons = screen.getAllByRole("button", { name: "Edit source" });
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAttribute("aria-expanded", "false");

    act(() => buttons[0].click());
    expect(collapsed(container)).toEqual([false, true, false]);
    const { $from } = editorRef?.state.selection ?? {};
    expect($from?.parent.textContent).toContain("flowchart TD");
    const hide = screen.getByRole("button", { name: "Hide source" });
    expect(hide).toHaveAttribute("aria-expanded", "true");

    act(() => hide.click());
    expect(collapsed(container)).toEqual([true, true, false]);
    expect(caretBlock()).not.toMatch(/^mermaid$/i);
  });

  it("hides the source again on Escape", async () => {
    const { container } = await mount();
    act(() => screen.getAllByRole("button", { name: "Edit source" })[1].click());
    expect(collapsed(container)).toEqual([true, false, false]);
    act(() => {
      fireEvent.keyDown(container.querySelector(".ProseMirror") as Element, { key: "Escape" });
    });
    expect(collapsed(container)).toEqual([true, true, false]);
  });

  it("opens the source when the diagram is clicked", async () => {
    const { container } = await mount();
    act(() => {
      fireEvent.click(screen.getByRole("img", { name: "Flowchart diagram" }));
    });
    expect(collapsed(container)).toEqual([false, true, false]);
  });

  it("round-trips the markdown source unchanged", async () => {
    await mount();
    if (!editorRef) throw new Error("editor not mounted");
    expect(getEditorMarkdown(editorRef)).toBe(DOC);
  });
});
