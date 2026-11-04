import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoteEditor, type NoteEditorHandle } from "../components/editor/NoteEditor";
import { MarkdownTextarea } from "../components/layout/MainPanel";
import { PinnedNoteView } from "../components/layout/PinnedNoteView";
import { useGitSyncStore } from "../store/git-sync";
import { useNoteStore } from "../store/notes";
import { useSettingsStore } from "../store/settings";
import type { Note } from "../types/note";
import {
  applyEditorShortcut,
  EDITOR_SHORTCUTS,
  installEditorShortcutListener,
  matchEditorShortcut,
} from "./editor-shortcuts";
import { DEFAULT_SETTINGS } from "./settings";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://${p}`,
  invoke: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./tauri-commands", () => ({
  tauriCommands: {
    writeNote: vi.fn().mockResolvedValue(undefined),
    snapshotNote: vi.fn().mockResolvedValue(undefined),
    deleteAsset: vi.fn().mockResolvedValue(undefined),
  },
}));

function note(content: string, locked = false): Note {
  return {
    id: "01JPMXYZ123",
    filePath: "/vault/a.md",
    fileName: "a.md",
    content,
    vaultId: "v1",
    frontmatter: {
      id: "01JPMXYZ123",
      title: "Note A",
      created: "2026-07-01",
      updated: "2026-07-01",
      tags: [],
      urgent: false,
      important: false,
      state: "Prepare",
      blocked: false,
      locked,
      links: [],
    },
  };
}

function selectText(editor: Editor, needle: string) {
  let from = -1;
  editor.state.doc.descendants((node, pos) => {
    if (from === -1 && node.isText && node.text?.includes(needle)) {
      from = pos + (node.text.indexOf(needle) ?? 0);
    }
  });
  editor.commands.setTextSelection({ from, to: from + needle.length });
}

function press(target: Element, init: KeyboardEventInit) {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
    );
  });
}

async function focusEditor(editor: Editor) {
  act(() => {
    editor.commands.focus(undefined, { scrollIntoView: false });
  });
  await act(async () => {
    await new Promise((done) => requestAnimationFrame(() => done(undefined)));
  });
}

interface Fiber {
  return: Fiber | null;
  memoizedProps?: { editor?: Editor };
}

function editorOnScreen(): Editor {
  const dom = document.querySelector(".ProseMirror");
  if (!dom) throw new Error("editor is not on screen");
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
  throw new Error("editor instance was not found");
}

describe("editor keyboard shortcuts", () => {
  let now = 0;
  let uninstall: (() => void) | undefined;

  beforeEach(() => {
    now += 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    useNoteStore.setState({ notes: [], selectedNoteId: null, vaults: [], activeVaultId: null });
    useGitSyncStore.setState({
      byVaultId: {},
      barrierPaths: [],
      heldNoteIds: [],
      heldDrafts: {},
    });
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS } });
    uninstall = installEditorShortcutListener();
  });

  afterEach(() => {
    uninstall?.();
    vi.restoreAllMocks();
  });

  it("recognizes the formatting and block chords, including a lowercase shift key", () => {
    const key = (init: KeyboardEventInit) =>
      matchEditorShortcut(new KeyboardEvent("keydown", init));
    expect(key({ key: "b", ctrlKey: true })).toBe("bold");
    expect(key({ key: "i", metaKey: true })).toBe("italic");
    expect(key({ key: "e", ctrlKey: true })).toBe("code");
    expect(key({ key: "u", ctrlKey: true })).toBe("underline");
    expect(key({ key: "s", ctrlKey: true, shiftKey: true })).toBe("strike");
    expect(key({ key: "S", metaKey: true, shiftKey: true })).toBe("strike");
    expect(key({ key: "h", ctrlKey: true, shiftKey: true })).toBe("highlight");
    expect(key({ key: "d", ctrlKey: true, shiftKey: true })).toBe("duplicate-block");
    expect(key({ key: "k", ctrlKey: true, shiftKey: true })).toBe("delete-block");
    expect(key({ key: "ArrowUp", altKey: true })).toBe("move-block-up");
    expect(key({ key: "ArrowDown", altKey: true })).toBe("move-block-down");
    expect(key({ key: "b" })).toBeNull();
    expect(key({ key: "p", ctrlKey: true })).toBeNull();
    expect(key({ key: "f", metaKey: true })).toBeNull();
  });

  it("bolds the selection in the main editor once", () => {
    const ref = createRef<NoteEditorHandle>();
    render(<NoteEditor ref={ref} note={note("hello vault world")} onSave={vi.fn()} />);
    const editor = ref.current?.getEditor();
    if (!editor) throw new Error("main editor missing");
    selectText(editor, "vault");
    press(editor.view.dom, { key: "b", ctrlKey: true });
    expect(editor.getHTML()).toBe("<p>hello <strong>vault</strong> world</p>");
  });

  it("refuses the chord when the main editor is locked", () => {
    const ref = createRef<NoteEditorHandle>();
    render(<NoteEditor ref={ref} note={note("hello vault", true)} onSave={vi.fn()} locked />);
    const editor = ref.current?.getEditor();
    if (!editor) throw new Error("main editor missing");
    selectText(editor, "vault");
    press(editor.view.dom, { key: "b", ctrlKey: true });
    expect(editor.getHTML()).toBe("<p>hello vault</p>");
  });

  it("bolds the selection in the pinned editor and refuses it when that pane is locked", () => {
    const pinned = note("The vault password");
    useNoteStore.setState({ notes: [pinned], selectedNoteId: pinned.id });
    const { unmount } = render(<PinnedNoteView noteId={pinned.id} />);
    const editor = editorOnScreen();
    selectText(editor, "vault");
    press(editor.view.dom, { key: "b", ctrlKey: true });
    expect(editor.getHTML()).toContain("<strong>vault</strong>");
    unmount();

    now += 1000;
    const locked = note("The vault password", true);
    useNoteStore.setState({ notes: [locked], selectedNoteId: locked.id });
    render(<PinnedNoteView noteId={locked.id} />);
    const readOnly = editorOnScreen();
    selectText(readOnly, "vault");
    press(readOnly.view.dom, { key: "b", ctrlKey: true });
    expect(readOnly.getHTML()).not.toContain("strong");
  });

  it("moves a block in the pinned editor", () => {
    const blocks = note("Alpha\n\nBeta");
    useNoteStore.setState({ notes: [blocks], selectedNoteId: blocks.id });
    render(<PinnedNoteView noteId={blocks.id} />);
    const editor = editorOnScreen();
    selectText(editor, "Beta");
    press(editor.view.dom, { key: "ArrowUp", altKey: true });
    const paragraphs: string[] = [];
    editor.state.doc.forEach((node) => {
      paragraphs.push(node.textContent);
    });
    expect(paragraphs.filter((text) => text.length > 0)).toEqual(["Beta", "Alpha"]);
  });

  it("applies the menu chord to the note that last had focus", async () => {
    const ref = createRef<NoteEditorHandle>();
    render(<NoteEditor ref={ref} note={note("hello vault world")} onSave={vi.fn()} />);
    const editor = ref.current?.getEditor();
    if (!editor) throw new Error("main editor missing");
    selectText(editor, "vault");
    await focusEditor(editor);
    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    act(() => {
      elsewhere.focus();
    });
    applyEditorShortcut("italic");
    expect(editor.getHTML()).toBe("<p>hello <em>vault</em> world</p>");

    const field = document.createElement("input");
    document.body.append(field);
    act(() => {
      field.focus();
    });
    applyEditorShortcut("underline");
    expect(editor.getHTML()).toBe("<p>hello <em>vault</em> world</p>");
    elsewhere.remove();
    field.remove();
  });

  it("runs one menu chord once when it is delivered twice", async () => {
    const ref = createRef<NoteEditorHandle>();
    render(<NoteEditor ref={ref} note={note("hello vault")} onSave={vi.fn()} />);
    const editor = ref.current?.getEditor();
    if (!editor) throw new Error("main editor missing");
    selectText(editor, "vault");
    await focusEditor(editor);
    applyEditorShortcut("bold");
    applyEditorShortcut("bold");
    expect(editor.getHTML()).toBe("<p>hello <strong>vault</strong></p>");
    now += 1000;
    applyEditorShortcut("bold");
    expect(editor.getHTML()).toBe("<p>hello vault</p>");
  });

  it("wraps markdown once, including a lowercase shift chord, and refuses a locked note", () => {
    const { unmount } = render(
      <MarkdownTextarea noteId="n" vaultPath={null} content="hello" onSave={vi.fn()} />,
    );
    const box = screen.getByRole("textbox");
    if (!(box instanceof HTMLTextAreaElement)) throw new Error("expected a textarea");
    box.setSelectionRange(0, 5);
    fireEvent.keyDown(box, { key: "b", ctrlKey: true });
    expect(box).toHaveValue("**hello**");
    unmount();

    render(<MarkdownTextarea noteId="n2" vaultPath={null} content="hello" onSave={vi.fn()} />);
    const shifted = screen.getByRole("textbox");
    if (!(shifted instanceof HTMLTextAreaElement)) throw new Error("expected a textarea");
    shifted.setSelectionRange(0, 5);
    fireEvent.keyDown(shifted, { key: "s", ctrlKey: true, shiftKey: true });
    expect(shifted).toHaveValue("~~hello~~");

    render(
      <MarkdownTextarea noteId="n3" vaultPath={null} content="hello" onSave={vi.fn()} locked />,
    );
    const lockedBox = screen.getAllByRole("textbox").at(-1);
    if (!(lockedBox instanceof HTMLTextAreaElement)) throw new Error("expected a textarea");
    lockedBox.setSelectionRange(0, 5);
    fireEvent.keyDown(lockedBox, { key: "b", ctrlKey: true });
    expect(lockedBox).toHaveValue("hello");
  });

  it("lists the same chords in the Help menu", () => {
    const menu = readFileSync(resolve("src-tauri/src/lib.rs"), "utf8");
    const help = menu.slice(menu.indexOf("Help menu"));
    for (const shortcut of EDITOR_SHORTCUTS) {
      expect(help).toContain(`.id("${shortcut.menuId}")`);
      expect(help).toContain(`.accelerator("${shortcut.accelerator}")`);
      expect(help).toContain(`MenuItemBuilder::new("${shortcut.label}")`);
      expect(help).toContain(`emit("editor-shortcut", "${shortcut.id}")`);
    }
    expect(help).toContain('SubmenuBuilder::new(app, "Editor Shortcuts")');
  });
});
