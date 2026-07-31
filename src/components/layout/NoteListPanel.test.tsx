import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNoteStore } from "../../store/notes";
import { useUIStore } from "../../store/ui";
import type { Note, VaultConfig } from "../../types/note";
import { NoteListPanel } from "./NoteListPanel";

// Tauri file I/O is mocked; these tests exercise the note-list UI + store wiring.
vi.mock("../../lib/tauri-commands", () => ({
  tauriCommands: {
    writeNote: vi.fn().mockResolvedValue(undefined),
    renameNote: vi.fn().mockResolvedValue(undefined),
    deleteNote: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn().mockResolvedValue(true),
}));

const VAULT: VaultConfig = { id: "v1", name: "My Vault", path: "/vault" };

function makeNote(overrides: Partial<Note["frontmatter"]> = {}): Note {
  return {
    id: "01JPMXYZ123",
    filePath: "/vault/note.md",
    fileName: "note.md",
    content: "",
    vaultId: "v1",
    frontmatter: {
      id: "01JPMXYZ123",
      title: "Note",
      created: "2026-01-01",
      updated: "2026-01-01",
      tags: [],
      urgent: true,
      important: true,
      state: "Doing",
      blocked: true,
      links: [],
      ...overrides,
    },
  };
}

function resetStores(note: Note) {
  useNoteStore.setState({
    notes: [note],
    selectedNoteId: null,
    vaults: [VAULT],
    activeVaultId: "v1",
    tagTree: {},
    searchIndex: null,
    searchQuery: "",
    searchResults: [],
    knownFolderPaths: [],
  });
  useUIStore.setState({ selectedGrouping: { type: "all", id: null } });
}

describe("NoteListPanel — Mark Unmanaged", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears state/urgent/important/blocked when marking a note unmanaged", async () => {
    resetStores(makeNote());
    render(<NoteListPanel />);

    fireEvent.contextMenu(screen.getByText("Note"));
    fireEvent.click(screen.getByText("Mark Unmanaged"));

    await waitFor(() => {
      const fm = useNoteStore.getState().notes[0].frontmatter;
      expect(fm.unmanaged).toBe(true);
      expect(fm.state).toBe("");
      expect(fm.urgent).toBe(false);
      expect(fm.important).toBe(false);
      expect(fm.blocked).toBe(false);
    });
  });

  it("only flips the flag when marking a note managed again", async () => {
    resetStores(
      makeNote({ unmanaged: true, state: "", urgent: false, important: false, blocked: false }),
    );
    render(<NoteListPanel />);

    fireEvent.contextMenu(screen.getByText("Note"));
    fireEvent.click(screen.getByText("Mark Managed"));

    await waitFor(() => {
      const fm = useNoteStore.getState().notes[0].frontmatter;
      expect(fm.unmanaged).toBe(false);
      expect(fm.state).toBe("");
    });
  });

  it("leaves the workflow fields alone when toggling lock", async () => {
    resetStores(makeNote());
    render(<NoteListPanel />);

    fireEvent.contextMenu(screen.getByText("Note"));
    fireEvent.click(screen.getByText("Lock"));

    await waitFor(() => {
      const fm = useNoteStore.getState().notes[0].frontmatter;
      expect(fm.locked).toBe(true);
      expect(fm.state).toBe("Doing");
      expect(fm.urgent).toBe(true);
      expect(fm.important).toBe(true);
      expect(fm.blocked).toBe(true);
    });
  });
});
