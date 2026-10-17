import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNoteStore } from "../../store/notes";
import type { Note, VaultConfig } from "../../types/note";
import { LeftColumn } from "./LeftColumn";

// Tauri file I/O is mocked; these tests exercise the sidebar UI + store wiring,
// not the Rust side.
vi.mock("../../lib/tauri-commands", () => ({
  tauriCommands: {
    createFolder: vi.fn().mockResolvedValue(undefined),
    renameFolder: vi.fn().mockResolvedValue(undefined),
    renameNote: vi.fn().mockResolvedValue(undefined),
    writeNote: vi.fn().mockResolvedValue(undefined),
    deleteFolder: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../hooks/useVault", () => ({
  addVault: vi.fn(),
  removeVault: vi.fn(),
}));

import { tauriCommands } from "../../lib/tauri-commands";

const VAULT: VaultConfig = { id: "v1", name: "My Vault", path: "/vault" };

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "01JPMXYZ123",
    filePath: "/vault/parent/note.md",
    fileName: "note.md",
    content: "",
    vaultId: "v1",
    frontmatter: {
      id: "01JPMXYZ123",
      title: "Note",
      created: "2026-01-01",
      updated: "2026-01-01",
      tags: [],
      urgent: false,
      important: false,
      state: "Prepare",
      blocked: false,
      links: [],
    },
    ...overrides,
  };
}

function resetStores() {
  useNoteStore.setState({
    notes: [],
    selectedNoteId: null,
    vaults: [VAULT],
    activeVaultId: "v1",
    tagTree: {},
    searchIndex: null,
    searchQuery: "",
    searchResults: [],
    // A single real folder "parent" with no notes/subfolders inside it.
    knownFolderPaths: ["/vault/parent"],
  });
}

describe("LeftColumn — New Subfolder (Bug A)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStores();
  });

  it("renders an inline input under a non-root folder and creates the subfolder", async () => {
    render(<LeftColumn />);

    const folder = screen.getByText("parent");
    fireEvent.contextMenu(folder);

    fireEvent.click(screen.getByText("New Subfolder"));

    // Input appears (childless folder is expanded to show it).
    const input = await screen.findByPlaceholderText("folder name");

    fireEvent.change(input, { target: { value: "child" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(tauriCommands.createFolder).toHaveBeenCalledWith("/vault/parent/child"),
    );

    // Optimistic store update makes the new empty folder visible immediately.
    expect(useNoteStore.getState().knownFolderPaths).toContain("/vault/parent/child");
    await waitFor(() => expect(screen.getByText("child")).toBeInTheDocument());
  });
});

describe("LeftColumn — Folder Rename (Bug B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStores();
    useNoteStore.setState({ notes: [makeNote()] });
  });

  it("renames a folder and rewrites child note paths", async () => {
    render(<LeftColumn />);

    fireEvent.contextMenu(screen.getByText("parent"));
    fireEvent.click(screen.getByText("Rename"));

    const input = await screen.findByDisplayValue("parent");
    fireEvent.change(input, { target: { value: "renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(tauriCommands.renameFolder).toHaveBeenCalledWith("/vault/parent", "/vault/renamed"),
    );

    await waitFor(() =>
      expect(useNoteStore.getState().notes[0].filePath).toBe("/vault/renamed/note.md"),
    );
    expect(useNoteStore.getState().knownFolderPaths).toContain("/vault/renamed");
  });
});
