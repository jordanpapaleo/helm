import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../../lib/projects";
import { DEFAULT_SETTINGS } from "../../lib/settings";
import { useNoteStore } from "../../store/notes";
import { useProjectStore } from "../../store/projects";
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
  useProjectStore.setState({ projects: [] });
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
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
    expect(raw).toContain("title: Bug report");
    expect(raw).toContain("template: false");
    expect(raw).not.toContain("important: true");
    expect(raw).toMatch(/^important: false$/m);
    expect(useNoteStore.getState().notes.find((n) => n.id === "tmpl")?.content).toBe(
      "template body",
    );
  });

  it("refreshes an open submenu when a template is renamed, unflagged, or deleted", async () => {
    const template = makeNote({
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
        important: false,
        state: "Prepare",
        blocked: false,
        template: true,
      },
    });
    useNoteStore.setState({
      notes: [template],
      vaults: [VAULT, { id: "v-other", name: "Other", path: "/other" }],
    });
    render(<LeftColumn />);

    fireEvent.contextMenu(screen.getByText("parent"));
    fireEvent.click(screen.getByRole("menuitem", { name: "New Note Here" }));
    expect(screen.getByRole("menuitem", { name: "Bug report" })).toBeInTheDocument();

    const renamed = {
      ...template,
      frontmatter: { ...template.frontmatter, title: "Defect" },
    };
    await act(async () => {
      useNoteStore.setState({ notes: [renamed] });
    });
    expect(screen.queryByRole("menuitem", { name: "Bug report" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Defect" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "Defect" }));
    await waitFor(() => expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1));
    const [, renamedRaw] = vi.mocked(tauriCommands.writeNote).mock.calls[0] ?? [];
    expect(renamedRaw).toContain("title: Defect");
    expect(renamedRaw).toContain("template body");

    fireEvent.contextMenu(screen.getByText("parent"));
    fireEvent.click(screen.getByRole("menuitem", { name: "New Note Here" }));
    await act(async () => {
      useNoteStore.setState({
        notes: useNoteStore
          .getState()
          .notes.map((note) =>
            note.id === "tmpl"
              ? { ...note, frontmatter: { ...note.frontmatter, template: false } }
              : note,
          ),
      });
    });
    expect(screen.queryByRole("menuitem", { name: "Defect" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Blank" })).toBeInTheDocument();

    await act(async () => {
      useNoteStore.setState({
        notes: useNoteStore.getState().notes.filter((note) => note.id !== "tmpl"),
      });
    });
    expect(screen.queryByRole("menuitem", { name: "Defect" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Blank" })).toBeInTheDocument();
  });
});

describe("LeftColumn — projects", () => {
  const kitchen: Project = {
    id: "01PROJECT0000000000000001",
    name: "Kitchen",
    mainPageId: "01MAINPAGE000000000000001",
    status: "active",
    repository: null,
    rootPath: "/vault/kitchen",
    metaPath: "/vault/kitchen/helm-project.json",
    vaultId: "v1",
    vaultPath: "/vault",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetStores();
  });

  it("hides project navigation until Projects is enabled, then opens the main page", () => {
    useProjectStore.setState({ projects: [kitchen] });
    useNoteStore.setState({
      notes: [
        makeNote({
          id: kitchen.mainPageId,
          filePath: "/vault/kitchen/kitchen.md",
          fileName: "kitchen.md",
          frontmatter: {
            id: kitchen.mainPageId,
            title: "Kitchen",
            created: "2026-01-01",
            updated: "2026-01-01",
            tags: [],
            urgent: false,
            important: false,
            state: "",
            blocked: false,
            unmanaged: true,
          },
        }),
      ],
    });

    const { rerender } = render(<LeftColumn />);
    expect(screen.queryByTestId("projects-nav")).not.toBeInTheDocument();

    act(() => {
      useSettingsStore.setState({
        settings: { ...DEFAULT_SETTINGS, enableProjects: true },
      });
    });
    rerender(<LeftColumn />);

    expect(screen.getByTestId("projects-nav")).toBeInTheDocument();
    expect(screen.queryByText("Context / Docs")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand Kitchen" }));
    expect(screen.getByText("Context / Docs")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Kitchen" }));
    expect(useNoteStore.getState().selectedNoteId).toBe(kitchen.mainPageId);
  });
});
