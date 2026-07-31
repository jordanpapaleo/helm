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
