import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../../lib/projects";
import { DEFAULT_SETTINGS } from "../../lib/settings";
import { useNoteStore } from "../../store/notes";
import { useProjectStore } from "../../store/projects";
import { useSettingsStore } from "../../store/settings";
import { useTrashStore } from "../../store/trash";
import { useUIStore } from "../../store/ui";
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
    writeTextFile: vi.fn().mockResolvedValue(undefined),
    listProjectFiles: vi.fn().mockResolvedValue([]),
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

import { confirm } from "@tauri-apps/plugin-dialog";
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
    expect(useUIStore.getState().selectedGrouping).toEqual({
      type: "folder",
      id: kitchen.rootPath,
    });
    expect(screen.getByRole("button", { name: "Leave project" })).toBeInTheDocument();
  });

  it("scopes the main views to the project and leaves back to the unscoped vault", () => {
    useProjectStore.setState({ projects: [kitchen] });
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, enableProjects: true } });
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
    useUIStore.setState({
      activeView: "notes",
      selectedGrouping: { type: "all", id: null },
    });

    render(<LeftColumn />);
    expect(screen.queryByRole("button", { name: "Leave project" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Kitchen" }));
    fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
    expect(useUIStore.getState().activeView).toBe("dashboard");
    expect(useUIStore.getState().selectedGrouping).toEqual({
      type: "folder",
      id: kitchen.rootPath,
    });

    fireEvent.click(screen.getByRole("button", { name: "Leave project" }));
    expect(useUIStore.getState().activeView).toBe("dashboard");
    expect(useUIStore.getState().selectedGrouping).toEqual({ type: "all", id: null });
    expect(screen.queryByRole("button", { name: "Leave project" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Eisenhower" }));
    fireEvent.click(screen.getByRole("button", { name: "Kanban" }));
    expect(useUIStore.getState().selectedGrouping).toEqual({ type: "all", id: null });
    expect(useUIStore.getState().activeView).toBe("kanban");
  });

  it("lists each project once under Projects and keeps other folders in Folders", () => {
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, enableProjects: true } });
    useProjectStore.setState({ projects: [{ ...kitchen, name: "kitchen" }] });
    useNoteStore.setState({
      notes: [
        makeNote({
          id: "ideas",
          filePath: "/vault/kitchen/ideas.md",
          fileName: "ideas.md",
          frontmatter: {
            ...makeNote().frontmatter,
            id: "ideas",
            title: "Ideas",
          },
        }),
        makeNote({
          id: "loose",
          filePath: "/vault/archive/loose.md",
          fileName: "loose.md",
          frontmatter: {
            ...makeNote().frontmatter,
            id: "loose",
            title: "Loose",
          },
        }),
      ],
      knownFolderPaths: ["/vault/kitchen", "/vault/kitchen/context", "/vault/archive"],
    });

    render(<LeftColumn />);

    const projectsNav = screen.getByTestId("projects-nav");
    expect(within(projectsNav).getByText("kitchen")).toBeInTheDocument();
    expect(within(projectsNav).queryByText("archive")).not.toBeInTheDocument();
    expect(screen.getAllByText("kitchen")).toHaveLength(1);
    expect(screen.getByText("archive")).toBeInTheDocument();
    expect(screen.queryByText("context")).not.toBeInTheDocument();
  });

  it("keeps project folders in the folder list while Projects is off", () => {
    useProjectStore.setState({ projects: [{ ...kitchen, name: "kitchen" }] });
    useNoteStore.setState({
      notes: [
        makeNote({
          id: "ideas",
          filePath: "/vault/kitchen/ideas.md",
          fileName: "ideas.md",
          frontmatter: {
            ...makeNote().frontmatter,
            id: "ideas",
            title: "Ideas",
          },
        }),
      ],
      knownFolderPaths: ["/vault/kitchen"],
    });

    render(<LeftColumn />);

    expect(screen.queryByTestId("projects-nav")).not.toBeInTheDocument();
    expect(screen.getByText("kitchen")).toBeInTheDocument();
    fireEvent.contextMenu(screen.getByText("kitchen"));
    expect(screen.queryByRole("menuitem", { name: "Convert to Project" })).not.toBeInTheDocument();
  });

  it("converts a folder from the right-click menu and keeps the notes already in it", async () => {
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, enableProjects: true } });
    const existing = makeNote({
      id: "ideas",
      filePath: "/vault/renovation/ideas.md",
      fileName: "ideas.md",
      content: "Already organized.",
      frontmatter: {
        ...makeNote().frontmatter,
        id: "ideas",
        title: "Ideas",
      },
    });
    useNoteStore.setState({
      notes: [existing],
      knownFolderPaths: ["/vault/renovation", "/vault/archive"],
    });

    render(<LeftColumn />);

    fireEvent.contextMenu(screen.getByText("renovation"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Convert to Project" }));

    await waitFor(() => {
      expect(useProjectStore.getState().projects.map((project) => project.rootPath)).toEqual([
        "/vault/renovation",
      ]);
    });

    const project = useProjectStore.getState().projects[0];
    expect(project).toBeDefined();
    expect(useNoteStore.getState().selectedNoteId).toBe(project?.mainPageId);
    expect(useNoteStore.getState().notes.some((note) => note.id === project?.mainPageId)).toBe(
      true,
    );

    const kept = useNoteStore.getState().notes.find((note) => note.id === existing.id);
    expect(kept?.filePath).toBe("/vault/renovation/ideas.md");
    expect(kept?.content).toBe("Already organized.");
    const written = vi.mocked(tauriCommands.writeNote).mock.calls.map((call) => call[0]);
    expect(written).not.toContain(existing.filePath);
    expect(tauriCommands.createFolder).not.toHaveBeenCalledWith("/vault/renovation");

    const projectsNav = screen.getByTestId("projects-nav");
    expect(within(projectsNav).getByText("renovation")).toBeInTheDocument();
    expect(screen.getAllByText("renovation")).toHaveLength(1);
    expect(screen.getByText("archive")).toBeInTheDocument();
  });

  it("does not offer conversion for a folder that already contains a project", () => {
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, enableProjects: true } });
    useProjectStore.setState({
      projects: [
        {
          ...kitchen,
          name: "kitchen",
          rootPath: "/vault/home/kitchen",
          metaPath: "/vault/home/kitchen/helm-project.json",
        },
      ],
    });
    useNoteStore.setState({
      notes: [
        makeNote({
          id: "ideas",
          filePath: "/vault/home/kitchen/ideas.md",
          fileName: "ideas.md",
          frontmatter: {
            ...makeNote().frontmatter,
            id: "ideas",
            title: "Ideas",
          },
        }),
        makeNote({
          id: "loose",
          filePath: "/vault/home/loose.md",
          fileName: "loose.md",
          frontmatter: {
            ...makeNote().frontmatter,
            id: "loose",
            title: "Loose",
          },
        }),
      ],
      knownFolderPaths: ["/vault/home", "/vault/home/kitchen"],
    });

    render(<LeftColumn />);

    expect(screen.getAllByText("kitchen")).toHaveLength(1);
    fireEvent.contextMenu(screen.getByText("home"));
    expect(screen.queryByRole("menuitem", { name: "Convert to Project" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
  });

  function showKitchenProject() {
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, enableProjects: true } });
    useProjectStore.setState({ projects: [{ ...kitchen, name: "kitchen" }] });
    useNoteStore.setState({
      notes: [
        makeNote({
          id: "ideas",
          filePath: "/vault/kitchen/ideas.md",
          fileName: "ideas.md",
          content: "Tile samples.",
          frontmatter: {
            ...makeNote().frontmatter,
            id: "ideas",
            title: "Ideas",
          },
        }),
      ],
      knownFolderPaths: ["/vault/kitchen", "/vault/archive"],
    });
  }

  it("renames a project from the Projects menu and keeps it out of Folders", async () => {
    showKitchenProject();
    render(<LeftColumn />);

    const projectsNav = screen.getByTestId("projects-nav");
    fireEvent.contextMenu(within(projectsNav).getByText("kitchen"));
    expect(screen.getByRole("menuitem", { name: "New Subfolder" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Convert to Project" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    const input = await screen.findByDisplayValue("kitchen");
    fireEvent.change(input, { target: { value: "pantry" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(tauriCommands.renameFolder).toHaveBeenCalledWith("/vault/kitchen", "/vault/pantry"),
    );
    expect(useProjectStore.getState().projects[0]?.rootPath).toBe("/vault/pantry");
    expect(useNoteStore.getState().notes[0]?.filePath).toBe("/vault/pantry/ideas.md");
    expect(within(screen.getByTestId("projects-nav")).getByText("pantry")).toBeInTheDocument();
    expect(screen.getAllByText("pantry")).toHaveLength(1);
    expect(screen.queryByText("kitchen")).not.toBeInTheDocument();
    expect(screen.getByText("archive")).toBeInTheDocument();
  });

  it("adds a subfolder on the project and does not list that folder twice", async () => {
    showKitchenProject();
    render(<LeftColumn />);

    fireEvent.contextMenu(within(screen.getByTestId("projects-nav")).getByText("kitchen"));
    fireEvent.click(screen.getByRole("menuitem", { name: "New Subfolder" }));
    const input = await screen.findByPlaceholderText("folder name");
    fireEvent.change(input, { target: { value: "samples" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(tauriCommands.createFolder).toHaveBeenCalledWith("/vault/kitchen/samples"),
    );
    const projectsNav = screen.getByTestId("projects-nav");
    expect(within(projectsNav).getByText("samples")).toBeInTheDocument();
    expect(screen.getAllByText("samples")).toHaveLength(1);
    expect(within(projectsNav).queryByText("archive")).not.toBeInTheDocument();
    expect(screen.getByText("archive")).toBeInTheDocument();
  });

  it("creates a blank or template note in the chosen project section", async () => {
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, enableProjects: true } });
    useProjectStore.setState({ projects: [kitchen] });
    useNoteStore.setState({
      notes: [
        makeNote({
          id: "tmpl",
          filePath: "/vault/bug.md",
          fileName: "bug.md",
          content: "Steps to reproduce.",
          frontmatter: {
            ...makeNote().frontmatter,
            id: "tmpl",
            title: "Bug report",
            important: true,
            template: true,
          },
        }),
      ],
    });

    render(<LeftColumn />);
    fireEvent.click(screen.getByRole("button", { name: "Expand Kitchen" }));
    const projectsNav = screen.getByTestId("projects-nav");

    fireEvent.click(
      within(projectsNav).getByRole("button", { name: "New note in Kitchen Features" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Bug report" }));

    await waitFor(() => expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1));
    const feature = useNoteStore
      .getState()
      .notes.find((note) => note.filePath.startsWith("/vault/kitchen/features/"));
    expect(feature?.frontmatter.title).toBe("Bug report");
    expect(feature?.content).toBe("Steps to reproduce.");
    expect(feature?.frontmatter.template).toBe(false);
    expect(feature?.frontmatter.important).toBe(false);
    expect(feature?.frontmatter.unmanaged).toBeUndefined();
    expect(feature?.frontmatter.state).toBe("Prepare");
    expect(useNoteStore.getState().notes.find((note) => note.id === "tmpl")?.content).toBe(
      "Steps to reproduce.",
    );

    fireEvent.click(
      within(projectsNav).getByRole("button", { name: "New note in Kitchen Context / Docs" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Bug report" }));
    await waitFor(() => expect(tauriCommands.writeNote).toHaveBeenCalledTimes(2));
    const context = useNoteStore
      .getState()
      .notes.find((note) => note.filePath.startsWith("/vault/kitchen/context/"));
    expect(context?.frontmatter.title).toBe("Bug report");
    expect(context?.frontmatter.unmanaged).toBe(true);
    expect(context?.frontmatter.state).toBe("");

    fireEvent.click(within(projectsNav).getByRole("button", { name: "New note in Kitchen Bugs" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Blank" }));
    await waitFor(() => expect(tauriCommands.writeNote).toHaveBeenCalledTimes(3));
    const bug = useNoteStore
      .getState()
      .notes.find((note) => note.filePath.startsWith("/vault/kitchen/bugs/"));
    expect(bug?.frontmatter.title).toBe("Untitled");
    expect(bug?.frontmatter.state).toBe("Prepare");
    expect(bug?.frontmatter.unmanaged).toBeUndefined();
    expect(bug?.content).toBe("");
  });

  it("deletes a project from the Projects menu", async () => {
    showKitchenProject();
    useUIStore.setState({ selectedGrouping: { type: "folder", id: "/vault/kitchen" } });
    render(<LeftColumn />);

    fireEvent.contextMenu(within(screen.getByTestId("projects-nav")).getByText("kitchen"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    await waitFor(() => expect(tauriCommands.deleteFolder).toHaveBeenCalledWith("/vault/kitchen"));
    expect(useProjectStore.getState().projects).toEqual([]);
    expect(screen.queryByText("kitchen")).not.toBeInTheDocument();
    expect(screen.getByText("archive")).toBeInTheDocument();
    expect(useUIStore.getState().selectedGrouping).toEqual({ type: "all", id: null });
    expect(useNoteStore.getState().notes).toEqual([]);
  });
});

describe("LeftColumn — archive and trash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStores();
    useUIStore.setState({
      activeView: "dashboard",
      selectedGrouping: { type: "all", id: null },
    });
    useTrashStore.setState({ items: [] });
    vi.mocked(confirm).mockResolvedValue(true);
  });

  function listed(id: string, title: string, archived = false): Note {
    const base = makeNote();
    return {
      ...base,
      id,
      filePath: `/vault/${id}.md`,
      fileName: `${id}.md`,
      content: `${title} body`,
      frontmatter: { ...base.frontmatter, id, title, archived },
    };
  }

  it("opens archived notes from an archive icon and shows how many there are", () => {
    useNoteStore.setState({
      notes: [listed("live", "Live"), listed("old", "Old", true)],
    });
    render(<LeftColumn />);

    const archive = screen.getByRole("button", { name: "Archive" });
    expect(archive).toHaveTextContent("1");
    fireEvent.click(archive);
    expect(useUIStore.getState().activeView).toBe("notes");
    expect(useUIStore.getState().selectedGrouping).toEqual({ type: "archive", id: null });
  });

  it("restores every trashed note from the trash icon menu", async () => {
    const alpha = listed("a", "Alpha");
    const beta = listed("b", "Beta");
    useTrashStore.setState({
      items: [
        { note: alpha, deletedAt: "2026-04-01T00:00:00.000Z" },
        { note: beta, deletedAt: "2026-04-02T00:00:00.000Z" },
      ],
    });
    render(<LeftColumn />);

    fireEvent.contextMenu(screen.getByRole("button", { name: "Trash" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Restore all" }));

    await waitFor(() => expect(useTrashStore.getState().items).toEqual([]));
    expect(tauriCommands.writeNote).toHaveBeenCalledWith(
      "/vault/a.md",
      expect.stringContaining("Alpha"),
    );
    expect(tauriCommands.writeNote).toHaveBeenCalledWith(
      "/vault/b.md",
      expect.stringContaining("Beta"),
    );
    expect(
      useNoteStore
        .getState()
        .notes.map((note) => note.id)
        .sort(),
    ).toEqual(["a", "b"]);
  });

  it("keeps a second snapshot in Trash when Restore all would overwrite its path", async () => {
    const newest = listed("new", "Newest");
    const older = listed("old", "Older");
    newest.content = "newest body";
    older.filePath = newest.filePath;
    older.fileName = newest.fileName;
    older.content = "older body that must survive";
    useTrashStore.setState({
      items: [
        { note: newest, deletedAt: "2026-04-02T00:00:00.000Z" },
        { note: older, deletedAt: "2026-04-01T00:00:00.000Z" },
      ],
    });
    render(<LeftColumn />);

    fireEvent.contextMenu(screen.getByRole("button", { name: "Trash" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Restore all" }));

    await waitFor(() => expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1));
    expect(tauriCommands.writeNote).toHaveBeenCalledWith(
      newest.filePath,
      expect.stringContaining("newest body"),
    );
    const written = vi.mocked(tauriCommands.writeNote).mock.calls.map((call) => String(call[1]));
    expect(written.some((markdown) => markdown.includes("older body that must survive"))).toBe(
      false,
    );
    expect(useNoteStore.getState().notes.map((note) => note.id)).toEqual(["new"]);
    expect(useTrashStore.getState().items.map((item) => item.note.content)).toEqual([
      "older body that must survive",
    ]);
  });

  it("does not overwrite a live note when Restore all hits its path", async () => {
    const live = listed("live", "Live");
    live.content = "live body";
    const trashed = listed("gone", "Gone");
    trashed.filePath = live.filePath;
    trashed.fileName = live.fileName;
    trashed.content = "trashed body";
    useNoteStore.setState({ notes: [live] });
    useTrashStore.setState({
      items: [{ note: trashed, deletedAt: "2026-04-01T00:00:00.000Z" }],
    });
    render(<LeftColumn />);

    fireEvent.contextMenu(screen.getByRole("button", { name: "Trash" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Restore all" }));

    await waitFor(() =>
      expect(useTrashStore.getState().items.map((item) => item.note.id)).toEqual(["gone"]),
    );
    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
    expect(useNoteStore.getState().notes.map((note) => note.content)).toEqual(["live body"]);
    expect(useTrashStore.getState().items[0]?.note.content).toBe("trashed body");
  });

  it("permanently deletes every trashed note after confirmation", async () => {
    const alpha = listed("a", "Alpha");
    useNoteStore.setState({ selectedNoteId: "a" });
    useTrashStore.setState({
      items: [{ note: alpha, deletedAt: "2026-04-01T00:00:00.000Z" }],
    });
    render(<LeftColumn />);

    fireEvent.contextMenu(screen.getByRole("button", { name: "Trash" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete all" }));

    await waitFor(() => expect(useTrashStore.getState().items).toEqual([]));
    expect(confirm).toHaveBeenCalled();
    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
    expect(useNoteStore.getState().selectedNoteId).toBeNull();
  });

  it("leaves trash in place when delete all is cancelled", async () => {
    vi.mocked(confirm).mockResolvedValueOnce(false);
    const alpha = listed("a", "Alpha");
    useTrashStore.setState({
      items: [{ note: alpha, deletedAt: "2026-04-01T00:00:00.000Z" }],
    });
    render(<LeftColumn />);

    fireEvent.contextMenu(screen.getByRole("button", { name: "Trash" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete all" }));

    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(useTrashStore.getState().items).toHaveLength(1);
  });
});
