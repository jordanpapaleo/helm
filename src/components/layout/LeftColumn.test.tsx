import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../lib/settings";
import { useNoteStore } from "../../store/notes";
import { useSettingsStore } from "../../store/settings";
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

describe("LeftColumn — archived note counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStores();
    useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
  });

  function listed(id: string, title: string, tags: string[], archived = false): Note {
    const base = makeNote();
    return {
      ...base,
      id,
      filePath: `/vault/${id}.md`,
      fileName: `${id}.md`,
      frontmatter: { ...base.frontmatter, id, title, tags, archived },
    };
  }

  it("omits archived notes from vault, all-notes, and tag counts", () => {
    useNoteStore.setState({
      notes: [listed("live", "Live", ["home"]), listed("old", "Old", ["work"], true)],
    });
    render(<LeftColumn />);

    const allNotes = screen.getByText("All Notes").parentElement;
    expect(allNotes).toHaveTextContent("1");
    expect(screen.getByText("home")).toBeInTheDocument();
    expect(screen.queryByText("work")).not.toBeInTheDocument();
  });

  it("counts archived notes when the setting is on", () => {
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, showArchivedNotes: true } });
    useNoteStore.setState({
      notes: [listed("live", "Live", ["home"]), listed("old", "Old", ["work"], true)],
    });
    render(<LeftColumn />);

    expect(screen.getByText("All Notes").parentElement).toHaveTextContent("2");
    expect(screen.getByText("work")).toBeInTheDocument();
  });
});

describe("LeftColumn — New Note Here", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStores();
  });

  it("offers Blank and templates, and creates the chosen template in that folder", async () => {
    useNoteStore.setState({
      notes: [
        makeNote({
          id: "tmpl",
          filePath: "/other/bug.md",
          fileName: "bug.md",
          content: "template body",
          vaultId: "v-other",
          frontmatter: {
            id: "tmpl",
            title: "Bug report",
            created: "2026-01-01",
            updated: "2026-01-01",
            tags: ["eng"],
            urgent: false,
            important: true,
            state: "Prepare",
            blocked: false,
            links: [],
            template: true,
          },
        }),
      ],
      vaults: [VAULT, { id: "v-other", name: "Other", path: "/other" }],
    });
    render(<LeftColumn />);

    fireEvent.contextMenu(screen.getByText("parent"));
    fireEvent.click(screen.getByRole("menuitem", { name: "New Note Here" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Bug report" }));

    await waitFor(() => expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1));
    const [filePath, raw] = vi.mocked(tauriCommands.writeNote).mock.calls[0] ?? [];
    expect(filePath?.startsWith("/vault/parent/")).toBe(true);
    expect(filePath).not.toContain("/other/");
    expect(raw).toContain("template body");
    expect(raw).toContain("important: true");
    expect(raw).not.toContain("template:");
    expect(useNoteStore.getState().notes.find((n) => n.id === "tmpl")?.content).toBe(
      "template body",
    );
  });
});
