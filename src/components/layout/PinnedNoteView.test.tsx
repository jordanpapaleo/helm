import { act, fireEvent, render, screen } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readEditorDraft, registerEditorDraft } from "../../lib/editor-draft";
import { DEFAULT_SETTINGS } from "../../lib/settings";
import { useGitSyncStore } from "../../store/git-sync";
import { useNoteStore } from "../../store/notes";
import { usePinnedPanelStore } from "../../store/pinned-panel";
import { useSettingsStore } from "../../store/settings";
import { useToastStore } from "../../store/toast";
import { useToolsStore } from "../../store/tools";
import { useUIStore } from "../../store/ui";
import type { Note } from "../../types/note";
import { RightPanel } from "./RightPanel";

vi.mock("../../lib/tauri-commands", () => ({
  tauriCommands: {
    writeNote: vi.fn().mockResolvedValue(undefined),
    snapshotNote: vi.fn().mockResolvedValue(undefined),
    deleteAsset: vi.fn().mockResolvedValue(undefined),
    writerSend: vi.fn(),
    writerCancel: vi.fn(),
  },
}));
vi.mock("../../lib/mermaid", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/mermaid")>()),
  renderMermaid: vi.fn().mockResolvedValue("<svg></svg>"),
}));
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://${p}`,
  invoke: vi.fn().mockResolvedValue(undefined),
}));

import { tauriCommands } from "../../lib/tauri-commands";

function makeNote(id: string, title: string, content: string): Note {
  return {
    id,
    filePath: `/vault/${id}.md`,
    fileName: `${id}.md`,
    content,
    vaultId: "vault",
    frontmatter: {
      id,
      title,
      created: "2026-10-20T00:00:00Z",
      updated: "2026-10-20T00:00:00Z",
      tags: [],
      urgent: false,
      important: false,
      state: "Prepare",
      blocked: false,
      links: [],
    },
  };
}

const reference = makeNote("reference", "Reference", "The vault password hint is the first ship.");

function pinnedEditor(): Editor {
  const dom = document.querySelector(".ProseMirror");
  if (!dom) throw new Error("pinned editor is not on screen");
  let node: Node | null = dom;
  while (node) {
    const fiberKey = Object.keys(node).find((key) => key.startsWith("__reactFiber$"));
    if (fiberKey) {
      let fiber: Fiber | null | undefined = (node as unknown as Record<string, Fiber | undefined>)[
        fiberKey
      ];
      while (fiber) {
        const editor = fiber.memoizedProps?.editor;
        if (editor?.view) return editor;
        fiber = fiber.return;
      }
    }
    node = node.parentNode;
  }
  throw new Error("pinned editor instance was not found");
}

interface Fiber {
  return: Fiber | null;
  memoizedProps?: { editor?: Editor };
}

function selectText(editor: Editor, needle: string): { from: number; to: number } {
  let from = -1;
  editor.state.doc.descendants((node, pos) => {
    if (from === -1 && node.isText && node.text?.includes(needle)) {
      from = pos + (node.text.indexOf(needle) ?? 0);
    }
  });
  const to = from + needle.length;
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)),
  );
  return { from, to };
}

function insertAtEnd(editor: Editor, text: string) {
  let pos = editor.state.doc.content.size;
  editor.state.doc.descendants((node, nodePos) => {
    if (node.isText && node.text) pos = nodePos + node.text.length;
  });
  editor.view.dispatch(editor.state.tr.insertText(text, pos));
}

function pressKey(editor: Editor, key: string, keyCode: number) {
  const event = new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true });
  Object.defineProperty(event, "keyCode", { value: keyCode });
  editor.view.someProp("handleKeyDown", (handler) => handler(editor.view, event));
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  usePinnedPanelStore.setState({ noteIds: ["reference"], activeId: "reference" });
  useNoteStore.setState({
    notes: [reference],
    selectedNoteId: "reference",
    vaults: [{ id: "vault", name: "Vault", path: "/vault" }],
    activeVaultId: "vault",
  });
  useToolsStore.setState({ writerEnabled: false });
  useGitSyncStore.setState({ byVaultId: {}, barrierPaths: [], heldNoteIds: [], heldDrafts: {} });
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS } });
  useToastStore.setState({ toasts: [] });
  useUIStore.setState({ activeView: "notes", selectedGrouping: { type: "all", id: null } });
  vi.mocked(tauriCommands.writeNote).mockClear();
  vi.mocked(tauriCommands.snapshotNote).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

it("edits with the keyboard and leaves the main editor chrome off the panel", async () => {
  render(<RightPanel />);
  const article = screen.getByRole("article", { name: "Pinned note Reference" });
  const editor = pinnedEditor();
  expect(editor.isEditable).toBe(true);
  expect(article.querySelector(".ProseMirror")).toHaveAttribute("contenteditable", "true");

  for (const label of [
    "State",
    "Urgent",
    "Important",
    "Blocked",
    "Locked",
    "Unmanaged",
    "Template",
    "Properties",
  ]) {
    expect(screen.queryByText(label)).not.toBeInTheDocument();
  }
  expect(screen.queryByRole("checkbox", { name: "Pinned" })).not.toBeInTheDocument();
  expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Bold" })).not.toBeInTheDocument();

  const { from, to } = selectText(editor, "vault");
  pressKey(editor, "b", 66);
  expect(editor.state.doc.rangeHasMark(from, to, editor.state.schema.marks.bold)).toBe(true);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1100);
  });

  expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1);
  const [filePath, serialized] = vi.mocked(tauriCommands.writeNote).mock.calls[0];
  expect(filePath).toBe("/vault/reference.md");
  expect(serialized).toContain("**vault**");
  expect(tauriCommands.snapshotNote).toHaveBeenCalledTimes(1);
  expect(useNoteStore.getState().selectedNoteId).toBe("reference");
});

it("saves a typed edit without dropping frontmatter tags", async () => {
  const tagged = {
    ...reference,
    frontmatter: { ...reference.frontmatter, tags: ["panel-only"] },
  };
  useNoteStore.setState({ notes: [tagged], selectedNoteId: tagged.id });
  render(<RightPanel />);
  const editor = pinnedEditor();
  insertAtEnd(editor, " Edited.");

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1100);
  });

  expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1);
  const [, serialized] = vi.mocked(tauriCommands.writeNote).mock.calls[0];
  expect(serialized).toContain("Edited.");
  expect(serialized).toContain("panel-only");
  expect(useNoteStore.getState().notes[0].frontmatter.tags).toEqual(["panel-only"]);
});

it("keeps a sibling draft and does not replace that draft reader", async () => {
  const unregister = registerEditorDraft("reference", () => "Unsaved hint about the ship");
  try {
    render(<RightPanel />);
    expect(screen.getByRole("article", { name: "Pinned note Reference" })).toHaveTextContent(
      "Unsaved hint about the ship",
    );
    expect(readEditorDraft("reference")).toBe("Unsaved hint about the ship");

    insertAtEnd(pinnedEditor(), "!");
    expect(screen.getByRole("article", { name: "Pinned note Reference" })).toHaveTextContent(
      "Unsaved hint about the ship!",
    );
    expect(readEditorDraft("reference")).toBe("Unsaved hint about the ship");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    const [, serialized] = vi.mocked(tauriCommands.writeNote).mock.calls[0];
    expect(serialized).toContain("Unsaved hint about the ship!");
    expect(screen.getByRole("article", { name: "Pinned note Reference" })).toHaveTextContent(
      "Unsaved hint about the ship!",
    );
  } finally {
    unregister();
  }
});

it("does not write a locked note", async () => {
  const locked = {
    ...reference,
    frontmatter: { ...reference.frontmatter, locked: true },
  };
  useNoteStore.setState({ notes: [locked], selectedNoteId: locked.id });
  render(<RightPanel />);
  const editor = pinnedEditor();
  expect(editor.isEditable).toBe(false);
  expect(editor.view.dom).toHaveAttribute("contenteditable", "false");
  const before = editor.state.doc.textContent;
  pressKey(editor, "b", 66);
  expect(editor.state.doc.textContent).toBe(before);
  expect(editor.state.doc.rangeHasMark(1, 2, editor.state.schema.marks.bold)).toBe(false);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1100);
  });
  fireEvent.blur(editor.view.dom);
  expect(tauriCommands.writeNote).not.toHaveBeenCalled();
});

it("reports a failed save", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(tauriCommands.writeNote).mockRejectedValueOnce(new Error("disk full"));
  render(<RightPanel />);
  insertAtEnd(pinnedEditor(), " more");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1100);
  });
  expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain(
    "Failed to save note: disk full",
  );
});

it("saves on blur when auto-save is off", async () => {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, autoSaveOnEdit: false } });
  render(<RightPanel />);
  const editor = pinnedEditor();
  insertAtEnd(editor, " later");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(tauriCommands.writeNote).not.toHaveBeenCalled();
  fireEvent.blur(editor.view.dom);
  expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1);
  expect(vi.mocked(tauriCommands.writeNote).mock.calls[0][1]).toContain("later");
});

it("drops a recovered held draft once a later edit saves", async () => {
  const other = makeNote("other", "Other", "Second note");
  useNoteStore.setState({
    notes: [reference, other],
    selectedNoteId: reference.id,
    vaults: [{ id: "vault", name: "Vault", path: "/vault" }],
    activeVaultId: "vault",
  });
  usePinnedPanelStore.setState({ noteIds: ["reference", "other"], activeId: "reference" });
  useGitSyncStore.getState().beginBarrier("/vault");
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(<RightPanel />);

  insertAtEnd(pinnedEditor(), " draft-a");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1100);
  });
  expect(tauriCommands.writeNote).not.toHaveBeenCalled();
  expect(useGitSyncStore.getState().heldDraft("reference")).toContain("draft-a");
  expect(useGitSyncStore.getState().heldDraft("reference")).not.toContain("draft-b");

  useGitSyncStore.getState().endBarrier("/vault");
  insertAtEnd(pinnedEditor(), " draft-b");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1100);
  });

  expect(useGitSyncStore.getState().heldDraft("reference")).toBeUndefined();
  expect(vi.mocked(tauriCommands.writeNote).mock.calls[0][1]).toContain("draft-b");

  fireEvent.click(screen.getByRole("tab", { name: "Other" }));
  fireEvent.click(screen.getByRole("tab", { name: "Reference" }));
  const restored = pinnedEditor();
  expect(restored.getText()).toContain("draft-a");
  expect(restored.getText()).toContain("draft-b");

  const writes = vi.mocked(tauriCommands.writeNote).mock.calls.length;
  fireEvent.blur(restored.view.dom);
  expect(tauriCommands.writeNote).toHaveBeenCalledTimes(writes);
  expect(vi.mocked(tauriCommands.writeNote).mock.calls[0][1]).toContain("draft-b");
});

it("moves the block with the block-command shortcut", () => {
  const blocks = makeNote("blocks", "Blocks", "Alpha\n\nBeta");
  useNoteStore.setState({ notes: [blocks], selectedNoteId: blocks.id });
  usePinnedPanelStore.setState({ noteIds: ["blocks"], activeId: "blocks" });
  render(<RightPanel />);
  const editor = pinnedEditor();
  selectText(editor, "Beta");
  const event = new KeyboardEvent("keydown", {
    key: "ArrowUp",
    altKey: true,
    bubbles: true,
  });
  editor.view.someProp("handleKeyDown", (handler) => handler(editor.view, event));
  const paragraphs: string[] = [];
  editor.state.doc.forEach((node) => {
    paragraphs.push(node.textContent);
  });
  expect(paragraphs.filter((text) => text.length > 0)).toEqual(["Beta", "Alpha"]);
});
