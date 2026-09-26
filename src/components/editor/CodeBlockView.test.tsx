import { act, fireEvent, render, screen } from "@testing-library/react";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { EditorContent, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const renderMermaid = vi.fn();
vi.mock("../../lib/mermaid", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/mermaid")>()),
  renderMermaid: (...a: unknown[]) => renderMermaid(...a),
}));

import type { Editor } from "@tiptap/core";
import { lowlight } from "../../lib/lowlight";
import { CodeBlockView } from "./CodeBlockView";
import { getEditorMarkdown, markdownExtensions } from "./extensions";

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
    extensions: markdownExtensions(
      CodeBlockLowlight.extend({
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockView);
        },
      }).configure({ lowlight }),
    ),
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
    const pres = [...container.querySelectorAll(".code-block-node-view pre")];
    expect(pres.map((p) => p.classList.contains("code-block-source-collapsed"))).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("offers a keyboard-reachable Edit source button that moves the caret into the block", async () => {
    await mount();
    const buttons = screen.getAllByRole("button", { name: "Edit source" });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]);
    const { $from } = editorRef?.state.selection ?? {};
    expect($from?.parent.type.name).toBe("codeBlock");
    expect($from?.parent.textContent).toContain("flowchart TD");
  });

  it("round-trips the markdown source unchanged", async () => {
    await mount();
    if (!editorRef) throw new Error("editor not mounted");
    expect(getEditorMarkdown(editorRef)).toBe(DOC);
  });
});
