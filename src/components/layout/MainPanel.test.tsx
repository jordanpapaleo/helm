import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../lib/settings";
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

    const today = new Date().toISOString().split("T")[0];
    expect(useNoteStore.getState().notes[0].frontmatter.updated).toBe(today);
    expect(tauriCommands.snapshotNote).toHaveBeenCalledTimes(1);
  });

  it("still bumps `updated` for an explicit frontmatter edit", async () => {
    setup(makeNote(), true);

    const urgentToggle = screen.getByLabelText("Urgent");
    await act(async () => {
      fireEvent.click(urgentToggle);
    });

    expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1);
    const today = new Date().toISOString().split("T")[0];
    expect(useNoteStore.getState().notes[0].frontmatter.updated).toBe(today);
    expect(useNoteStore.getState().notes[0].frontmatter.urgent).toBe(true);
  });
});
