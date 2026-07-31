import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../lib/settings";
import { todayDate } from "../../lib/timestamps";
import { useNoteStore } from "../../store/notes";
import { useSettingsStore } from "../../store/settings";
import { useUIStore } from "../../store/ui";
import type { Note, VaultConfig } from "../../types/note";
import { MainPanel } from "./MainPanel";

vi.mock("../../lib/tauri-commands", () => ({
  tauriCommands: {
    writeNote: vi.fn().mockResolvedValue(undefined),
    snapshotNote: vi.fn().mockResolvedValue(undefined),
    deleteNote: vi.fn().mockResolvedValue(undefined),
    deleteAsset: vi.fn().mockResolvedValue(undefined),
    listNoteHistory: vi.fn().mockResolvedValue([]),
    readNote: vi.fn().mockResolvedValue(""),
    renameNote: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://${p}`,
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn().mockResolvedValue(true),
}));

import { tauriCommands } from "../../lib/tauri-commands";

const VAULT: VaultConfig = { id: "v1", name: "Vault", path: "/vault" };

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "01JPMXYZ123",
    filePath: "/vault/test.md",
    fileName: "test.md",
    content: "Test content",
    vaultId: "v1",
    frontmatter: {
      id: "01JPMXYZ123",
      title: "Test Note",
      created: "2026-03-13",
      updated: "2026-03-13",
      tags: [],
      urgent: false,
      important: false,
      state: "Doing",
      blocked: false,
      links: [],
    },
    ...overrides,
  };
}

function setup(note: Note, markdownMode: boolean) {
  useSettingsStore.setState({
    settings: { ...DEFAULT_SETTINGS, defaultNoteView: markdownMode ? "markdown" : "editor" },
  });
  useNoteStore.setState({
    notes: [note],
    selectedNoteId: note.id,
    vaults: [VAULT],
    activeVaultId: VAULT.id,
  });
  useUIStore.setState({ activeView: "notes", markdownMode });
  return render(<MainPanel />);
}

describe("MainPanel.handleSave — no-op when content is unchanged", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not write the note when the markdown textarea is blurred without edits", () => {
    setup(makeNote(), true);
    const textarea = screen.getByDisplayValue("Test content");

    fireEvent.focus(textarea);
    fireEvent.blur(textarea);

    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
    expect(tauriCommands.snapshotNote).not.toHaveBeenCalled();
    expect(useNoteStore.getState().notes[0].frontmatter.updated).toBe("2026-03-13");
  });

  it("treats content differing only by leading/trailing newlines as unchanged", () => {
    setup(makeNote({ content: "Test content" }), true);
    const textarea = screen.getByDisplayValue("Test content");

    // gray-matter reintroduces a leading \n when parsing a file back, so the
    // editor's round-tripped content routinely differs only at the edges.
    fireEvent.change(textarea, { target: { value: "\nTest content\n\n" } });
    fireEvent.blur(textarea);

    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
    expect(useNoteStore.getState().notes[0].frontmatter.updated).toBe("2026-03-13");
  });

  it("does not write the note when the rich editor is blurred without edits", () => {
    setup(makeNote(), false);
    const editorEl = document.querySelector(".ProseMirror");
    expect(editorEl).toBeTruthy();

    fireEvent.blur(editorEl as Element);

    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
    expect(useNoteStore.getState().notes[0].frontmatter.updated).toBe("2026-03-13");
  });

  it("still saves and bumps `updated` for a genuine content edit", async () => {
    setup(makeNote(), true);
    const textarea = screen.getByDisplayValue("Test content");

    fireEvent.change(textarea, { target: { value: "Test content plus a real edit" } });
    await act(async () => {
      fireEvent.blur(textarea);
    });

    expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1);
    const [filePath, serialized] = vi.mocked(tauriCommands.writeNote).mock.calls[0];
    expect(filePath).toBe("/vault/test.md");
    expect(serialized).toContain("Test content plus a real edit");

    // `updated` is a full UTC timestamp now, so assert the shape plus today's
    // date rather than a bare YYYY-MM-DD equality.
    const stamp = useNoteStore.getState().notes[0].frontmatter.updated;
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(stamp.slice(0, 10)).toBe(todayDate());
    expect(tauriCommands.snapshotNote).toHaveBeenCalledTimes(1);
  });

  it("still bumps `updated` for an explicit frontmatter edit", async () => {
    setup(makeNote(), true);

    const urgentToggle = screen.getByLabelText("Urgent");
    await act(async () => {
      fireEvent.click(urgentToggle);
    });

    expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1);
    const stamp = useNoteStore.getState().notes[0].frontmatter.updated;
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(stamp.slice(0, 10)).toBe(todayDate());
    expect(useNoteStore.getState().notes[0].frontmatter.urgent).toBe(true);
  });
});

describe("MainPanel.handleSave — tags are merged, not recomputed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function savedTags(): string[] {
    return useNoteStore.getState().notes[0].frontmatter.tags;
  }

  async function edit(from: string, to: string) {
    const el = screen.getByDisplayValue(from);
    fireEvent.change(el, { target: { value: to } });
    await act(async () => {
      fireEvent.blur(el);
    });
  }

  // The real data-loss shape: tags set from the property panel, never written
  // as `#tag` in the body. Recomputing from the body wiped all four.
  it("keeps frontmatter-only tags across a content save", async () => {
    const note = makeNote({ content: "Body with no inline tags" });
    note.frontmatter.tags = ["rfl", "rfl/ux", "rfl/phase", "rfl/ios"];
    setup(note, true);

    await edit("Body with no inline tags", "Body with no inline tags, now edited");

    expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1);
    expect(savedTags()).toEqual(["rfl", "rfl/ux", "rfl/phase", "rfl/ios"]);
    const [, serialized] = vi.mocked(tauriCommands.writeNote).mock.calls[0];
    expect(serialized).toContain("rfl/ios");
  });

  it("removes a tag deleted from the body", async () => {
    const note = makeNote({ content: "Plan #work today" });
    note.frontmatter.tags = ["work", "panel-only"];
    setup(note, true);

    await edit("Plan #work today", "Plan today");

    expect(savedTags()).toEqual(["panel-only"]);
  });

  it("adds a tag typed into the body", async () => {
    const note = makeNote({ content: "Plan today" });
    note.frontmatter.tags = ["panel-only"];
    setup(note, true);

    await edit("Plan today", "Plan #work today");

    expect(savedTags()).toEqual(["panel-only", "work"]);
  });

  it("does not resurrect a tag a bulk delete removed from both places", async () => {
    const note = makeNote({ content: "Plan #work today" });
    note.frontmatter.tags = ["work"];
    const view = setup(note, true);

    await act(async () => {
      await useNoteStore.getState().deleteTag("work");
    });
    expect(savedTags()).toEqual([]);
    expect(useNoteStore.getState().notes[0].content).toBe("Plan today");

    // Reopen the note on the rewritten body — the next editor save must not
    // bring the tag back through the merge.
    view.unmount();
    render(<MainPanel />);
    vi.mocked(tauriCommands.writeNote).mockClear();
    await edit("Plan today", "Plan today, edited");

    expect(savedTags()).toEqual([]);
    const [, serialized] = vi.mocked(tauriCommands.writeNote).mock.calls[0];
    expect(serialized).not.toContain("#work");
  });
});

const MARKDOWN_CONTENT = "# Title\n\nSome **bold** words here.";

// TipTap re-renders asynchronously once the editor mounts and takes focus, so the
// toggles are wrapped to keep React's act() bookkeeping quiet.
function toggleToEditor() {
  act(() => {
    fireEvent.click(screen.getByTitle("Switch to editor"));
  });
}

function toggleToMarkdown() {
  act(() => {
    fireEvent.click(screen.getByTitle("Switch to Markdown"));
  });
}

// getByDisplayValue collapses whitespace, so it cannot match multi-line markdown.
function textarea(): HTMLTextAreaElement {
  const el = document.querySelector("textarea");
  if (!el) throw new Error("markdown textarea is not mounted");
  return el;
}

describe("MainPanel — the markdown view follows external writes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // An external write is anything that rewrites the open note's body without
  // going through the textarea: the MCP server, Claude Code, the file watcher,
  // or a bulk tag operation in the store.
  function externalWrite(content: string) {
    act(() => {
      const note = useNoteStore.getState().notes[0];
      useNoteStore.getState().updateNote({ ...note, content });
    });
  }

  it("shows a body that was rewritten underneath it", () => {
    setup(makeNote({ content: "Original body" }), true);

    externalWrite("Rewritten by Claude Code");

    expect(textarea().value).toBe("Rewritten by Claude Code");
  });

  it("does not write the stale body back on blur after an external write", async () => {
    setup(makeNote({ content: "Original body" }), true);

    externalWrite("Rewritten by Claude Code");
    await act(async () => {
      fireEvent.blur(textarea());
    });

    // Blur used to flush the pre-write text, silently reverting the change.
    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
    expect(useNoteStore.getState().notes[0].content).toBe("Rewritten by Claude Code");
  });

  it("ignores its own save coming back around through the store", async () => {
    setup(makeNote({ content: "Original body" }), true);

    fireEvent.change(textarea(), { target: { value: "Original body, edited" } });
    await act(async () => {
      fireEvent.blur(textarea());
    });

    expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1);
    expect(textarea().value).toBe("Original body, edited");
  });

  it("adopts a bulk tag delete that rewrites the open note", async () => {
    const note = makeNote({ content: "Plan #work today" });
    note.frontmatter.tags = ["work"];
    setup(note, true);

    await act(async () => {
      await useNoteStore.getState().deleteTag("work");
    });

    expect(textarea().value).toBe("Plan today");

    vi.mocked(tauriCommands.writeNote).mockClear();
    await act(async () => {
      fireEvent.blur(textarea());
    });

    // The stale textarea used to blur "#work" straight back onto disk, which is
    // what made the bulk tag delete impossible to validate by hand.
    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
    expect(useNoteStore.getState().notes[0].content).toBe("Plan today");
    expect(useNoteStore.getState().notes[0].frontmatter.tags).toEqual([]);
  });

  it("keeps unsaved local edits rather than discarding them for an external write", () => {
    setup(makeNote({ content: "Original body" }), true);

    // Typing starts a 1s debounce; nothing has reached disk yet.
    fireEvent.change(textarea(), { target: { value: "Half-typed sentence" } });
    externalWrite("Rewritten by Claude Code");

    expect(textarea().value).toBe("Half-typed sentence");
  });

  it("preserves the caret across an adopted external change", () => {
    setup(makeNote({ content: "Original body" }), true);
    const caret = "Original ".length;
    const el = textarea();
    el.focus();
    el.setSelectionRange(caret, caret);

    externalWrite("Original body with more text appended");

    expect(textarea().selectionStart).toBe(caret);
  });

  it("clamps the caret when the external body is shorter", () => {
    setup(makeNote({ content: "Original body" }), true);
    const el = textarea();
    el.focus();
    el.setSelectionRange(13, 13);

    externalWrite("Tiny");

    expect(textarea().value).toBe("Tiny");
    expect(textarea().selectionStart).toBe(4);
  });

  it("still loads the other note's body when switching notes", () => {
    const first = makeNote({ content: "First body" });
    const second = makeNote({
      id: "01JPMXYZ456",
      filePath: "/vault/other.md",
      fileName: "other.md",
      content: "Second body",
      frontmatter: { ...makeNote().frontmatter, id: "01JPMXYZ456", title: "Other" },
    });
    setup(first, true);
    act(() => {
      useNoteStore.setState({ notes: [first, second] });
    });

    act(() => {
      useNoteStore.getState().selectNote(second.id);
    });
    expect(textarea().value).toBe("Second body");

    act(() => {
      useNoteStore.getState().selectNote(first.id);
    });
    expect(textarea().value).toBe("First body");
  });
});

describe("MainPanel — cursor position survives the markdown/editor toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the caret to the same word after a markdown → editor → markdown round trip", () => {
    setup(makeNote({ content: MARKDOWN_CONTENT }), true);
    const start = MARKDOWN_CONTENT.indexOf("words");

    const before = textarea();
    before.focus();
    before.setSelectionRange(start, start);

    toggleToEditor();
    expect(document.querySelector(".ProseMirror")).toBeTruthy();

    toggleToMarkdown();
    const after = textarea();
    expect(after.selectionStart).toBe(start);
    // The caret has to be usable, not merely correct.
    expect(document.activeElement).toBe(after);
  });

  it("keeps the caret at the end of the document across the toggle", () => {
    setup(makeNote({ content: MARKDOWN_CONTENT }), true);
    const end = MARKDOWN_CONTENT.length;

    const before = textarea();
    before.setSelectionRange(end, end);

    toggleToEditor();
    toggleToMarkdown();

    expect(textarea().selectionStart).toBe(end);
  });

  it("lands after the heading marker, not before it", () => {
    setup(makeNote({ content: MARKDOWN_CONTENT }), true);
    // "# " has no counterpart in the rich-text view, so the editor only knows
    // "start of the heading text". Coming back it must skip the marker.
    const title = MARKDOWN_CONTENT.indexOf("Title");
    textarea().setSelectionRange(title, title);

    toggleToEditor();
    toggleToMarkdown();

    expect(textarea().selectionStart).toBe(title);
  });

  it("focuses the markdown textarea when arriving from the editor", () => {
    setup(makeNote({ content: MARKDOWN_CONTENT }), false);

    toggleToMarkdown();

    const after = textarea();
    expect(document.activeElement).toBe(after);
    expect(after.selectionStart).toBeGreaterThanOrEqual(0);
  });

  it("does not save the note just because the cursor was restored", () => {
    setup(makeNote({ content: MARKDOWN_CONTENT }), true);
    const start = MARKDOWN_CONTENT.indexOf("bold");
    textarea().setSelectionRange(start, start);

    toggleToEditor();
    toggleToMarkdown();

    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
    expect(tauriCommands.snapshotNote).not.toHaveBeenCalled();
    expect(useNoteStore.getState().notes[0].frontmatter.updated).toBe("2026-03-13");
  });

  it("does not restore a stale cursor when the note changes", () => {
    const first = makeNote({ content: MARKDOWN_CONTENT });
    const second = makeNote({
      id: "01JPMXYZ456",
      filePath: "/vault/other.md",
      fileName: "other.md",
      content: "Another note entirely",
      frontmatter: { ...makeNote().frontmatter, id: "01JPMXYZ456", title: "Other" },
    });
    setup(first, true);
    act(() => {
      useNoteStore.setState({ notes: [first, second] });
    });

    const start = MARKDOWN_CONTENT.indexOf("words");
    textarea().setSelectionRange(start, start);
    toggleToEditor();

    act(() => {
      useNoteStore.getState().selectNote(second.id);
    });

    const other = screen.getByDisplayValue("Another note entirely") as HTMLTextAreaElement;
    expect(other.selectionStart).toBe(0);

    // …and coming back to the first note must not resurrect it either.
    act(() => {
      useNoteStore.getState().selectNote(first.id);
    });
    expect(textarea().selectionStart).toBe(0);
  });

  it("keeps a locked note read-only and toggleable", () => {
    const locked = makeNote({ content: MARKDOWN_CONTENT });
    locked.frontmatter.locked = true;
    setup(locked, true);

    const start = MARKDOWN_CONTENT.indexOf("words");
    textarea().setSelectionRange(start, start);

    toggleToEditor();
    expect(document.querySelector(".ProseMirror")).toBeTruthy();

    toggleToMarkdown();
    const after = textarea();
    expect(after.readOnly).toBe(true);
    expect(after.selectionStart).toBe(start);
    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
  });

  it("keeps the find bar working across the toggle", () => {
    setup(makeNote({ content: MARKDOWN_CONTENT }), true);
    fireEvent.keyDown(document, { key: "f", metaKey: true });
    expect(screen.getByPlaceholderText("Find")).toBeTruthy();

    toggleToEditor();
    expect(screen.getByPlaceholderText("Find")).toBeTruthy();

    toggleToMarkdown();
    expect(screen.getByPlaceholderText("Find")).toBeTruthy();
  });
});
