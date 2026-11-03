import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveOutgoingLinks } from "../lib/note-links";
import { DEFAULT_SETTINGS } from "../lib/settings";
import { tauriCommands } from "../lib/tauri-commands";
import { todayDate } from "../lib/timestamps";
import type { Note, VaultConfig } from "../types/note";
import { occupiedNotePaths, useNoteStore } from "./notes";
import { useSettingsStore } from "./settings";
import { useToastStore } from "./toast";
import { useTrashStore } from "./trash";

vi.mock("../lib/tauri-commands", () => ({
  tauriCommands: {
    renameFolder: vi.fn().mockResolvedValue(undefined),
    renameNote: vi.fn().mockResolvedValue(undefined),
    writeNote: vi.fn().mockResolvedValue(undefined),
    snapshotNote: vi.fn().mockResolvedValue(undefined),
  },
}));

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "01JPMXYZ123",
    filePath: "/notes/test.md",
    fileName: "test.md",
    content: "Test content",
    vaultId: "vault-1",
    frontmatter: {
      id: "01JPMXYZ123",
      title: "Test Note",
      created: "2026-03-13",
      updated: "2026-03-13",
      tags: ["Code"],
      urgent: false,
      important: true,
      state: "Doing",
      blocked: false,
      links: [],
    },
    ...overrides,
  };
}

describe("useNoteStore", () => {
  beforeEach(() => {
    useNoteStore.setState({
      notes: [],
      duplicateGroups: [],
      selectedNoteId: null,
      vaults: [],
      activeVaultId: null,
    });
  });

  it("loads notes into the store", () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => result.current.setNotes([makeNote()]));
    expect(result.current.notes).toHaveLength(1);
    expect(result.current.notes[0].id).toBe("01JPMXYZ123");
  });

  it("selects a note by id", () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => {
      result.current.setNotes([makeNote()]);
      result.current.selectNote("01JPMXYZ123");
    });
    expect(result.current.selectedNoteId).toBe("01JPMXYZ123");
  });

  it("updates a note in place", () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => {
      result.current.setNotes([makeNote()]);
      result.current.updateNote({ ...makeNote(), content: "Updated content" });
    });
    expect(result.current.notes[0].content).toBe("Updated content");
  });

  it("does not replace a note or notify when frontmatter and content are unchanged", () => {
    const note = makeNote();
    const { result } = renderHook(() => useNoteStore());
    act(() => result.current.setNotes([note]));
    let notifications = 0;
    const stop = useNoteStore.subscribe(() => {
      notifications += 1;
    });
    act(() => {
      result.current.updateNote({
        ...note,
        frontmatter: { ...note.frontmatter, tags: ["Code"] },
      });
    });
    expect(result.current.notes[0]).toBe(note);
    expect(notifications).toBe(0);
    act(() => {
      result.current.updateNote({ ...note, filePath: "/notes/moved.md", fileName: "moved.md" });
    });
    expect(result.current.notes[0]).not.toBe(note);
    expect(result.current.notes[0].filePath).toBe("/notes/moved.md");
    expect(notifications).toBe(1);
    stop();
  });

  it("removes a note by id", () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => {
      result.current.setNotes([makeNote()]);
      result.current.removeNote("01JPMXYZ123");
    });
    expect(result.current.notes).toHaveLength(0);
  });

  it("builds tag tree from notes", () => {
    const note1 = makeNote({
      id: "01",
      frontmatter: { ...makeNote().frontmatter, id: "01", tags: ["rl", "ce"] },
    });
    const note2 = makeNote({
      id: "02",
      frontmatter: { ...makeNote().frontmatter, id: "02", tags: ["rl"] },
    });
    const { result } = renderHook(() => useNoteStore());
    act(() => result.current.setNotes([note1, note2]));
    const tree = result.current.tagTree;
    expect(tree.rl).toBeDefined();
    expect(tree.rl.notes).toHaveLength(2);
    expect(tree.ce).toBeDefined();
    expect(tree.ce.notes).toHaveLength(1);
  });
});

describe("vault CRUD", () => {
  beforeEach(() => {
    useNoteStore.setState({
      notes: [],
      selectedNoteId: null,
      vaults: [],
      activeVaultId: null,
      tagTree: {},
      searchIndex: null,
      searchQuery: "",
      searchResults: [],
      knownFolderPaths: [],
    });
  });

  it("setVaults replaces the vault list", () => {
    const { result } = renderHook(() => useNoteStore());
    const vaults: VaultConfig[] = [
      { id: "v1", name: "Vault One", path: "/v1" },
      { id: "v2", name: "Vault Two", path: "/v2" },
    ];
    act(() => result.current.setVaults(vaults));
    expect(result.current.vaults).toEqual(vaults);
  });

  it("addVaultConfig appends a vault", () => {
    const { result } = renderHook(() => useNoteStore());
    const v1: VaultConfig = { id: "v1", name: "Vault One", path: "/v1" };
    const v2: VaultConfig = { id: "v2", name: "Vault Two", path: "/v2" };
    act(() => {
      result.current.setVaults([v1]);
      result.current.addVaultConfig(v2);
    });
    expect(result.current.vaults).toHaveLength(2);
    expect(result.current.vaults[1]).toEqual(v2);
  });

  it("removeVaultConfig removes by id and leaves others", () => {
    const { result } = renderHook(() => useNoteStore());
    const v1: VaultConfig = { id: "v1", name: "Vault One", path: "/v1" };
    const v2: VaultConfig = { id: "v2", name: "Vault Two", path: "/v2" };
    act(() => {
      result.current.setVaults([v1, v2]);
      result.current.removeVaultConfig("v1");
    });
    expect(result.current.vaults).toHaveLength(1);
    expect(result.current.vaults[0].id).toBe("v2");
  });

  it("setActiveVaultId sets the active vault", () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => result.current.setActiveVaultId("v1"));
    expect(result.current.activeVaultId).toBe("v1");
  });

  it("setActiveVaultId with null clears the active vault", () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => {
      result.current.setActiveVaultId("v1");
      result.current.setActiveVaultId(null);
    });
    expect(result.current.activeVaultId).toBeNull();
  });
});

describe("appendNotes", () => {
  beforeEach(() => {
    useNoteStore.setState({
      notes: [],
      selectedNoteId: null,
      vaults: [],
      activeVaultId: null,
      tagTree: {},
      searchIndex: null,
      searchQuery: "",
      searchResults: [],
      knownFolderPaths: [],
    });
  });

  function makeNote(overrides: Partial<Note> = {}): Note {
    return {
      id: "01JPMXYZ123",
      filePath: "/notes/test.md",
      fileName: "test.md",
      content: "Test content",
      vaultId: "vault-1",
      frontmatter: {
        id: "01JPMXYZ123",
        title: "Test Note",
        created: "2026-03-13",
        updated: "2026-03-13",
        tags: [],
        urgent: false,
        important: true,
        state: "Doing",
        blocked: false,
        links: [],
      },
      ...overrides,
    };
  }

  it("adds new notes to existing ones", () => {
    const { result } = renderHook(() => useNoteStore());
    const existing = makeNote({ id: "n1", filePath: "/notes/a.md", fileName: "a.md" });
    const incoming = makeNote({ id: "n2", filePath: "/notes/b.md", fileName: "b.md" });
    act(() => {
      result.current.setNotes([existing]);
      result.current.appendNotes([incoming]);
    });
    expect(result.current.notes).toHaveLength(2);
  });

  it("deduplicates by filePath: incoming replaces existing with same filePath", () => {
    const { result } = renderHook(() => useNoteStore());
    const original = makeNote({ id: "n1", filePath: "/notes/a.md", content: "original" });
    const updated = makeNote({ id: "n1", filePath: "/notes/a.md", content: "updated" });
    act(() => {
      result.current.setNotes([original]);
      result.current.appendNotes([updated]);
    });
    expect(result.current.notes).toHaveLength(1);
    expect(result.current.notes[0].content).toBe("updated");
  });

  it("updates tagTree after append", () => {
    const { result } = renderHook(() => useNoteStore());
    const existing = makeNote({
      id: "n1",
      filePath: "/notes/a.md",
      frontmatter: { ...makeNote().frontmatter, id: "n1", tags: ["alpha"] },
    });
    const incoming = makeNote({
      id: "n2",
      filePath: "/notes/b.md",
      frontmatter: { ...makeNote().frontmatter, id: "n2", tags: ["beta"] },
    });
    act(() => {
      result.current.setNotes([existing]);
      result.current.appendNotes([incoming]);
    });
    expect(result.current.tagTree.alpha).toBeDefined();
    expect(result.current.tagTree.beta).toBeDefined();
  });
});

describe("addNote", () => {
  beforeEach(() => {
    useNoteStore.setState({
      notes: [],
      selectedNoteId: null,
      vaults: [],
      activeVaultId: null,
      tagTree: {},
      searchIndex: null,
      searchQuery: "",
      searchResults: [],
      knownFolderPaths: [],
    });
  });

  function makeNote(overrides: Partial<Note> = {}): Note {
    return {
      id: "01JPMXYZ123",
      filePath: "/notes/test.md",
      fileName: "test.md",
      content: "Test content",
      vaultId: "vault-1",
      frontmatter: {
        id: "01JPMXYZ123",
        title: "Test Note",
        created: "2026-03-13",
        updated: "2026-03-13",
        tags: [],
        urgent: false,
        important: true,
        state: "Doing",
        blocked: false,
        links: [],
      },
      ...overrides,
    };
  }

  it("adds a note not already present", () => {
    const { result } = renderHook(() => useNoteStore());
    const note = makeNote({ id: "n1", filePath: "/notes/new.md" });
    act(() => result.current.addNote(note));
    expect(result.current.notes).toHaveLength(1);
    expect(result.current.notes[0].id).toBe("n1");
  });

  it("does not add duplicate if same filePath already in store", () => {
    const { result } = renderHook(() => useNoteStore());
    const note = makeNote({ id: "n1", filePath: "/notes/dup.md" });
    act(() => {
      result.current.addNote(note);
      result.current.addNote({ ...note, content: "different content" });
    });
    expect(result.current.notes).toHaveLength(1);
    expect(result.current.notes[0].content).toBe("Test content");
  });
});

describe("search", () => {
  beforeEach(() => {
    useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
    useNoteStore.setState({
      notes: [],
      selectedNoteId: null,
      vaults: [],
      activeVaultId: null,
      tagTree: {},
      searchIndex: null,
      searchQuery: "",
      searchResults: [],
      knownFolderPaths: [],
    });
  });

  function makeNote(overrides: Partial<Note> = {}): Note {
    return {
      id: "01JPMXYZ123",
      filePath: "/notes/test.md",
      fileName: "test.md",
      content: "Test content",
      vaultId: "vault-1",
      frontmatter: {
        id: "01JPMXYZ123",
        title: "Test Note",
        created: "2026-03-13",
        updated: "2026-03-13",
        tags: [],
        urgent: false,
        important: true,
        state: "Doing",
        blocked: false,
        links: [],
      },
      ...overrides,
    };
  }

  it("empty query sets searchResults to []", () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => {
      result.current.setNotes([makeNote()]);
      result.current.search("");
    });
    expect(result.current.searchResults).toEqual([]);
    expect(result.current.searchQuery).toBe("");
  });

  it("whitespace-only query sets searchResults to []", () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => {
      result.current.setNotes([makeNote()]);
      result.current.search("   ");
    });
    expect(result.current.searchResults).toEqual([]);
    expect(result.current.searchQuery).toBe("   ");
  });

  it("valid query returns matching notes", () => {
    const { result } = renderHook(() => useNoteStore());
    const note = makeNote({
      id: "n1",
      filePath: "/notes/alpha.md",
      content: "The quick brown fox",
      frontmatter: {
        id: "n1",
        title: "Alpha Note",
        created: "2026-03-13",
        updated: "2026-03-13",
        tags: [],
        urgent: false,
        important: false,
        state: "Doing",
        blocked: false,
        links: [],
      },
    });
    act(() => {
      result.current.setNotes([note]);
      result.current.search("Alpha");
    });
    expect(result.current.searchResults.length).toBeGreaterThan(0);
    expect(result.current.searchResults[0].id).toBe("n1");
  });

  it("finds archived notes and deleted notes whether or not show archived is on", () => {
    const { result } = renderHook(() => useNoteStore());
    const active = makeNote({
      id: "active",
      filePath: "/notes/active.md",
      content: "lighthouse",
      frontmatter: {
        id: "active",
        title: "Active lighthouse",
        created: "2026-03-13",
        updated: "2026-03-13",
        tags: [],
        urgent: false,
        important: false,
        state: "Doing",
        blocked: false,
        links: [],
      },
    });
    const archived = makeNote({
      id: "archived",
      filePath: "/notes/archived.md",
      content: "lighthouse",
      frontmatter: {
        id: "archived",
        title: "Archived lighthouse",
        created: "2026-03-13",
        updated: "2026-03-13",
        tags: ["keep"],
        urgent: true,
        important: true,
        state: "Doing",
        blocked: false,
        links: ["active"],
        archived: true,
      },
    });
    const deleted = makeNote({
      id: "deleted",
      filePath: "/notes/deleted.md",
      content: "lighthouse",
      frontmatter: {
        id: "deleted",
        title: "Deleted lighthouse",
        created: "2026-03-13",
        updated: "2026-03-13",
        tags: [],
        urgent: false,
        important: false,
        state: "Doing",
        blocked: false,
        links: [],
      },
    });
    act(() => {
      useTrashStore.setState({
        items: [{ note: deleted, deletedAt: "2026-04-01T00:00:00.000Z" }],
      });
      useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, showArchivedNotes: false } });
      result.current.setNotes([active, archived]);
      result.current.search("lighthouse");
    });
    expect(result.current.searchResults.map((n) => n.id).sort()).toEqual([
      "active",
      "archived",
      "deleted",
    ]);

    act(() => {
      useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, showArchivedNotes: true } });
      result.current.search("lighthouse");
    });
    expect(result.current.searchResults.map((n) => n.id).sort()).toEqual([
      "active",
      "archived",
      "deleted",
    ]);
    useTrashStore.setState({ items: [] });
    useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
  });

  it("updates searchQuery on every call", () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => result.current.search("first"));
    expect(result.current.searchQuery).toBe("first");
    act(() => result.current.search("second"));
    expect(result.current.searchQuery).toBe("second");
  });
});

describe("setKnownFolderPaths", () => {
  beforeEach(() => {
    useNoteStore.setState({
      notes: [],
      selectedNoteId: null,
      vaults: [],
      activeVaultId: null,
      tagTree: {},
      searchIndex: null,
      searchQuery: "",
      searchResults: [],
      knownFolderPaths: [],
    });
  });

  it("sets knownFolderPaths to the provided array", () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => result.current.setKnownFolderPaths(["/a", "/b", "/c"]));
    expect(result.current.knownFolderPaths).toEqual(["/a", "/b", "/c"]);
  });

  it("replaces previous value", () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => {
      result.current.setKnownFolderPaths(["/old"]);
      result.current.setKnownFolderPaths(["/new1", "/new2"]);
    });
    expect(result.current.knownFolderPaths).toEqual(["/new1", "/new2"]);
  });
});

describe("renameFolder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNoteStore.setState({
      notes: [],
      selectedNoteId: null,
      vaults: [],
      activeVaultId: null,
      tagTree: {},
      searchIndex: null,
      searchQuery: "",
      searchResults: [],
      knownFolderPaths: [],
    });
  });

  it("renames the folder on disk and rewrites child note paths", async () => {
    const child = makeNote({
      id: "n1",
      filePath: "/vault/old/note.md",
      fileName: "note.md",
    });
    const { result } = renderHook(() => useNoteStore());
    act(() => {
      result.current.setNotes([child]);
      result.current.setKnownFolderPaths(["/vault/old", "/vault/old/sub"]);
    });

    await act(async () => {
      await result.current.renameFolder("/vault/old", "new");
    });

    expect(tauriCommands.renameFolder).toHaveBeenCalledWith("/vault/old", "/vault/new");
    expect(result.current.notes[0].filePath).toBe("/vault/new/note.md");
    expect(result.current.notes[0].fileName).toBe("note.md");
    expect(result.current.knownFolderPaths).toEqual(["/vault/new", "/vault/new/sub"]);
  });

  it("no-ops when the new name is empty or unchanged", async () => {
    const { result } = renderHook(() => useNoteStore());
    await act(async () => {
      await result.current.renameFolder("/vault/old", "  ");
      await result.current.renameFolder("/vault/old", "old");
    });
    expect(tauriCommands.renameFolder).not.toHaveBeenCalled();
  });
});

describe("renameNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNoteStore.setState({
      notes: [],
      selectedNoteId: null,
      vaults: [],
      activeVaultId: null,
      tagTree: {},
      searchIndex: null,
      searchQuery: "",
      searchResults: [],
      knownFolderPaths: [],
    });
  });

  it("writes updated content before renaming so a crash never loses the note", async () => {
    const calls: string[] = [];
    vi.mocked(tauriCommands.writeNote).mockImplementation(async () => {
      calls.push("write");
    });
    vi.mocked(tauriCommands.renameNote).mockImplementation(async () => {
      calls.push("rename");
    });

    const note = makeNote({ id: "n1", filePath: "/vault/old-title.md", fileName: "old-title.md" });
    const { result } = renderHook(() => useNoteStore());
    act(() => result.current.setNotes([note]));

    await act(async () => {
      await result.current.renameNote(result.current.notes[0], "New Title");
    });

    expect(calls).toEqual(["write", "rename"]);
    // The write targets the OLD path — the file always exists with full content
    expect(tauriCommands.writeNote).toHaveBeenCalledWith(
      "/vault/old-title.md",
      expect.stringContaining("New Title"),
    );
    expect(tauriCommands.renameNote).toHaveBeenCalledWith(
      "/vault/old-title.md",
      "/vault/new-title.md",
    );
    expect(result.current.notes[0].filePath).toBe("/vault/new-title.md");
    expect(result.current.notes[0].frontmatter.title).toBe("New Title");
  });

  it("does not touch the store when the disk write fails", async () => {
    vi.mocked(tauriCommands.writeNote).mockRejectedValueOnce(new Error("disk full"));
    const note = makeNote({ id: "n1", filePath: "/vault/old-title.md", fileName: "old-title.md" });
    const { result } = renderHook(() => useNoteStore());
    act(() => result.current.setNotes([note]));

    await expect(
      act(async () => {
        await result.current.renameNote(result.current.notes[0], "New Title");
      }),
    ).rejects.toThrow("disk full");

    expect(result.current.notes[0].filePath).toBe("/vault/old-title.md");
    expect(result.current.notes[0].frontmatter.title).toBe("Test Note");
  });

  it("refuses a rename when another note already occupies the destination", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    useToastStore.setState({ toasts: [] });
    const note = makeNote({
      id: "n1",
      filePath: "/vault/old-title.md",
      fileName: "old-title.md",
      frontmatter: { ...makeNote().frontmatter, id: "n1", title: "Old Title" },
    });
    const other = makeNote({
      id: "n2",
      filePath: "/vault/new-title.md",
      fileName: "new-title.md",
      content: "keep me",
      frontmatter: { ...makeNote().frontmatter, id: "n2", title: "Already There" },
    });
    const { result } = renderHook(() => useNoteStore());
    act(() => {
      result.current.setNotes([note, other]);
      result.current.updateNote({
        ...note,
        frontmatter: { ...note.frontmatter, title: "New Title" },
      });
    });

    await act(async () => {
      await result.current.renameNote(note, "New Title");
    });

    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
    expect(tauriCommands.renameNote).not.toHaveBeenCalled();
    const kept = result.current.notes.find((item) => item.id === "n1");
    const occupant = result.current.notes.find((item) => item.id === "n2");
    expect(kept?.filePath).toBe("/vault/old-title.md");
    expect(kept?.frontmatter.title).toBe("Old Title");
    expect(occupant?.filePath).toBe("/vault/new-title.md");
    expect(occupant?.content).toBe("keep me");
    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toEqual([
      "Failed to rename note: /vault/new-title.md already has a note",
    ]);
  });

  it("refuses a rename onto a duplicate copy that is not the kept note", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    useToastStore.setState({ toasts: [] });
    const keeper = makeNote({
      id: "shared",
      filePath: "/vault/alpha.md",
      fileName: "alpha.md",
      content: "keeper",
      frontmatter: { ...makeNote().frontmatter, id: "shared", title: "Alpha" },
    });
    const copy = makeNote({
      id: "shared",
      filePath: "/vault/alpha-copy.md",
      fileName: "alpha-copy.md",
      content: "copy",
      frontmatter: { ...makeNote().frontmatter, id: "shared", title: "Alpha" },
    });
    const { result } = renderHook(() => useNoteStore());
    act(() => result.current.setNotes([keeper, copy]));
    expect(result.current.notes.map((item) => item.filePath)).toEqual(["/vault/alpha.md"]);
    expect(occupiedNotePaths().sort()).toEqual(["/vault/alpha-copy.md", "/vault/alpha.md"]);

    await act(async () => {
      await result.current.renameNote(keeper, "Alpha Copy");
    });

    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
    expect(tauriCommands.renameNote).not.toHaveBeenCalled();
    expect(result.current.notes[0].filePath).toBe("/vault/alpha.md");
    expect(result.current.notes[0].frontmatter.title).toBe("Alpha");
    expect(result.current.duplicateGroups[0].copies[0].content).toBe("copy");
    expect(useToastStore.getState().toasts[0]?.message).toBe(
      "Failed to rename note: /vault/alpha-copy.md already has a note",
    );
  });

  it("still renames when the destination path is this note's own file", async () => {
    const note = makeNote({
      id: "n1",
      filePath: "/vault/test-note.md",
      fileName: "test-note.md",
      frontmatter: { ...makeNote().frontmatter, id: "n1", title: "Test Note" },
    });
    const { result } = renderHook(() => useNoteStore());
    act(() => result.current.setNotes([note]));

    await act(async () => {
      await result.current.renameNote(result.current.notes[0], "Test Note!");
    });

    expect(tauriCommands.writeNote).toHaveBeenCalledWith(
      "/vault/test-note.md",
      expect.stringContaining("Test Note!"),
    );
    expect(tauriCommands.renameNote).toHaveBeenCalledWith(
      "/vault/test-note.md",
      "/vault/test-note.md",
    );
    expect(result.current.notes[0].frontmatter.title).toBe("Test Note!");
  });

  it("rewrites [[Old Title]] in other notes and keeps their link ids", async () => {
    const renamed = makeNote({
      id: "alpha",
      filePath: "/vault/alpha.md",
      fileName: "alpha.md",
      content: "Own [[Alpha]]",
      frontmatter: {
        ...makeNote().frontmatter,
        id: "alpha",
        title: "Alpha",
      },
    });
    const withId = makeNote({
      id: "with-id",
      filePath: "/vault/with-id.md",
      fileName: "with-id.md",
      content: "See [[alpha]]",
      frontmatter: {
        ...makeNote().frontmatter,
        id: "with-id",
        title: "With Id",
        links: ["alpha"],
      },
    });
    const wikiOnly = makeNote({
      id: "wiki-only",
      filePath: "/vault/wiki-only.md",
      fileName: "wiki-only.md",
      content: "Also [[ALPHA]]",
      frontmatter: {
        ...makeNote().frontmatter,
        id: "wiki-only",
        title: "Wiki Only",
        links: undefined,
      },
    });
    const untouched = makeNote({
      id: "untouched",
      filePath: "/vault/untouched.md",
      fileName: "untouched.md",
      content: "No link here",
      frontmatter: {
        ...makeNote().frontmatter,
        id: "untouched",
        title: "Untouched",
        links: ["alpha"],
      },
    });

    const { result } = renderHook(() => useNoteStore());
    act(() => {
      result.current.setVaults([{ id: "vault-1", name: "Vault", path: "/vault" }]);
      result.current.setNotes([renamed, withId, wikiOnly, untouched]);
    });

    await act(async () => {
      await result.current.renameNote(result.current.notes[0], "Beta");
    });

    const notes = result.current.notes;
    const renamedAfter = notes.find((item) => item.id === "alpha");
    const withIdAfter = notes.find((item) => item.id === "with-id");
    const wikiOnlyAfter = notes.find((item) => item.id === "wiki-only");
    const untouchedAfter = notes.find((item) => item.id === "untouched");

    expect(renamedAfter?.frontmatter.title).toBe("Beta");
    expect(renamedAfter?.content).toBe("Own [[Alpha]]");
    expect(withIdAfter?.content).toBe("See [[Beta]]");
    expect(withIdAfter?.frontmatter.links).toEqual(["alpha"]);
    expect(wikiOnlyAfter?.content).toBe("Also [[Beta]]");
    expect(wikiOnlyAfter?.frontmatter.links).toBeUndefined();
    expect(untouchedAfter?.content).toBe("No link here");
    expect(untouchedAfter?.frontmatter.links).toEqual(["alpha"]);

    expect(resolveOutgoingLinks(withIdAfter ?? withId, notes).map((link) => link.id)).toEqual([
      "alpha",
    ]);
    expect(resolveOutgoingLinks(wikiOnlyAfter ?? wikiOnly, notes).map((link) => link.id)).toEqual([
      "alpha",
    ]);
    expect(tauriCommands.writeNote).toHaveBeenCalledWith(
      "/vault/with-id.md",
      expect.stringContaining("[[Beta]]"),
    );
    expect(tauriCommands.writeNote).toHaveBeenCalledWith(
      "/vault/wiki-only.md",
      expect.stringContaining("[[Beta]]"),
    );
    expect(tauriCommands.writeNote).not.toHaveBeenCalledWith(
      "/vault/untouched.md",
      expect.anything(),
    );
  });

  it("does not snapshot or write a locked note when another note is renamed", async () => {
    const renamed = makeNote({
      id: "alpha",
      filePath: "/vault/alpha.md",
      fileName: "alpha.md",
      content: "",
      frontmatter: { ...makeNote().frontmatter, id: "alpha", title: "Alpha" },
    });
    const locked = makeNote({
      id: "locked",
      filePath: "/vault/locked.md",
      fileName: "locked.md",
      content: "See [[Alpha]]",
      frontmatter: {
        ...makeNote().frontmatter,
        id: "locked",
        title: "Locked",
        locked: true,
        links: ["alpha"],
      },
    });
    const open = makeNote({
      id: "open",
      filePath: "/vault/open.md",
      fileName: "open.md",
      content: "See [[Alpha]]",
      frontmatter: { ...makeNote().frontmatter, id: "open", title: "Open" },
    });

    const { result } = renderHook(() => useNoteStore());
    act(() => {
      result.current.setVaults([{ id: "vault-1", name: "Vault", path: "/vault" }]);
      result.current.setNotes([renamed, locked, open]);
    });

    await act(async () => {
      await result.current.renameNote(result.current.notes[0], "Beta");
    });

    const lockedAfter = result.current.notes.find((item) => item.id === "locked");
    const openAfter = result.current.notes.find((item) => item.id === "open");
    expect(lockedAfter?.content).toBe("See [[Alpha]]");
    expect(lockedAfter?.frontmatter.links).toEqual(["alpha"]);
    expect(openAfter?.content).toBe("See [[Beta]]");
    expect(tauriCommands.snapshotNote).not.toHaveBeenCalledWith(
      "/vault",
      "locked",
      "/vault/locked.md",
    );
    expect(tauriCommands.writeNote).not.toHaveBeenCalledWith("/vault/locked.md", expect.anything());
    expect(tauriCommands.writeNote).toHaveBeenCalledWith(
      "/vault/open.md",
      expect.stringContaining("[[Beta]]"),
    );
  });

  it("does not retarget a wiki link that resolved to the other note with the same title", async () => {
    const early = makeNote({
      id: "early",
      filePath: "/vault/early.md",
      fileName: "early.md",
      content: "",
      frontmatter: { ...makeNote().frontmatter, id: "early", title: "Alpha" },
    });
    const linker = makeNote({
      id: "linker",
      filePath: "/vault/linker.md",
      fileName: "linker.md",
      content: "See [[Alpha]]",
      frontmatter: {
        ...makeNote().frontmatter,
        id: "linker",
        title: "Linker",
        links: ["early"],
      },
    });
    const late = makeNote({
      id: "late",
      filePath: "/vault/late.md",
      fileName: "late.md",
      content: "",
      frontmatter: { ...makeNote().frontmatter, id: "late", title: "Alpha" },
    });

    const { result } = renderHook(() => useNoteStore());
    act(() => {
      result.current.setVaults([{ id: "vault-1", name: "Vault", path: "/vault" }]);
      result.current.setNotes([early, linker, late]);
    });

    await act(async () => {
      await result.current.renameNote(
        result.current.notes.find((item) => item.id === "early") ?? early,
        "Beta",
      );
    });

    const linkerAfter = result.current.notes.find((item) => item.id === "linker");
    expect(linkerAfter?.content).toBe("See [[Alpha]]");
    expect(linkerAfter?.frontmatter.links).toEqual(["early"]);
    expect(
      resolveOutgoingLinks(linkerAfter ?? linker, result.current.notes).map((link) => link.id),
    ).toEqual(["early", "late"]);
    expect(tauriCommands.writeNote).not.toHaveBeenCalledWith("/vault/linker.md", expect.anything());
    expect(tauriCommands.snapshotNote).not.toHaveBeenCalledWith(
      "/vault",
      "linker",
      "/vault/linker.md",
    );
  });
});

describe("renameTag / deleteTag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tauriCommands.writeNote).mockResolvedValue(undefined);
    vi.mocked(tauriCommands.snapshotNote).mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
    useToastStore.setState({ toasts: [] });
    useNoteStore.setState({
      notes: [],
      selectedNoteId: null,
      vaults: [],
      activeVaultId: null,
      tagTree: {},
      searchIndex: null,
      searchQuery: "",
      searchResults: [],
      knownFolderPaths: [],
    });
  });

  function tagged(id: string, tags: string[], content: string): Note {
    return makeNote({
      id,
      filePath: `/vault/${id}.md`,
      fileName: `${id}.md`,
      content,
      frontmatter: { ...makeNote().frontmatter, id, tags },
    });
  }

  it("rewrites the body, not just the frontmatter", async () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => result.current.setNotes([tagged("n1", ["work"], "Plan #work today")]));

    await act(async () => {
      await result.current.renameTag("work", "client");
    });

    expect(result.current.notes[0].content).toBe("Plan #client today");
    expect(result.current.notes[0].frontmatter.tags).toEqual(["client"]);
    expect(tauriCommands.writeNote).toHaveBeenCalledWith(
      "/vault/n1.md",
      expect.stringContaining("Plan #client today"),
    );
  });

  it("renames descendants but not tags that merely share a prefix", async () => {
    const { result } = renderHook(() => useNoteStore());
    act(() =>
      result.current.setNotes([
        tagged("n1", ["work", "work/project"], "#work and #work/project"),
        tagged("n2", ["workflow"], "#workflow only"),
      ]),
    );

    await act(async () => {
      await result.current.renameTag("work", "client");
    });

    expect(result.current.notes[0].content).toBe("#client and #client/project");
    expect(result.current.notes[0].frontmatter.tags).toEqual(["client", "client/project"]);
    // Untouched note is never written
    expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1);
    expect(result.current.notes[1].content).toBe("#workflow only");
  });

  it("bumps `updated` to a full UTC timestamp on every rewritten note", async () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => result.current.setNotes([tagged("n1", ["work"], "#work")]));

    await act(async () => {
      await result.current.renameTag("work", "client");
    });

    const stamp = result.current.notes[0].frontmatter.updated;
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(stamp.slice(0, 10)).toBe(todayDate());
  });

  it("rebuilds the tag tree and the search index", async () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => result.current.setNotes([tagged("n1", ["work", "work/project"], "#work/project")]));

    await act(async () => {
      await result.current.renameTag("work", "client");
    });

    expect(result.current.tagTree.work).toBeUndefined();
    expect(result.current.tagTree.client).toBeDefined();
    expect(result.current.tagTree.client.children.project).toBeDefined();

    act(() => result.current.search("client"));
    expect(result.current.searchResults.map((n) => n.id)).toContain("n1");
  });

  it("finds notes whose tag only exists inline (not yet in frontmatter)", async () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => result.current.setNotes([tagged("n1", [], "body has #work inline")]));

    await act(async () => {
      await result.current.renameTag("work", "client");
    });

    expect(result.current.notes[0].content).toBe("body has #client inline");
  });

  it("continues past a failed write and reports one summary error", async () => {
    vi.mocked(tauriCommands.writeNote)
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useNoteStore());
    act(() =>
      result.current.setNotes([tagged("n1", ["work"], "#work"), tagged("n2", ["work"], "#work")]),
    );

    await act(async () => {
      await result.current.renameTag("work", "client");
    });

    expect(tauriCommands.writeNote).toHaveBeenCalledTimes(2);
    // The failed note keeps its old state, the successful one is updated
    expect(result.current.notes[0].content).toBe("#work");
    expect(result.current.notes[1].content).toBe("#client");
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].message).toContain("1 of 2");
  });

  it("no-ops on an empty, unchanged, or identical-after-normalization name", async () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => result.current.setNotes([tagged("n1", ["work"], "#work")]));

    await act(async () => {
      await result.current.renameTag("work", "   ");
      await result.current.renameTag("work", "work");
      await result.current.renameTag("work", "#work");
      await result.current.renameTag("", "client");
    });

    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
  });

  it("normalizes a leading hash and surrounding whitespace in the new name", async () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => result.current.setNotes([tagged("n1", ["work"], "#work")]));

    await act(async () => {
      await result.current.renameTag("work", "  #client/eu ");
    });

    expect(result.current.notes[0].content).toBe("#client/eu");
    expect(result.current.notes[0].frontmatter.tags).toEqual(["client/eu"]);
  });

  it("rejects a name the tag grammar cannot represent", async () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => result.current.setNotes([tagged("n1", ["work"], "#work")]));

    await act(async () => {
      await result.current.renameTag("work", "my client!");
    });

    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
    expect(result.current.notes[0].content).toBe("#work");
    expect(useToastStore.getState().toasts.at(-1)?.message).toContain("not a valid tag name");
  });

  it("deleteTag strips the tag and its descendants from body and frontmatter", async () => {
    const { result } = renderHook(() => useNoteStore());
    act(() =>
      result.current.setNotes([
        tagged("n1", ["work", "work/ops", "home"], "Plan #work and #work/ops but keep #home"),
        tagged("n2", ["workflow"], "#workflow only"),
      ]),
    );

    await act(async () => {
      await result.current.deleteTag("work");
    });

    expect(result.current.notes[0].content).toBe("Plan and but keep #home");
    expect(result.current.notes[0].frontmatter.tags).toEqual(["home"]);
    expect(result.current.notes[1].content).toBe("#workflow only");
    expect(result.current.tagTree.work).toBeUndefined();
    expect(result.current.tagTree.home).toBeDefined();
    expect(result.current.tagTree.workflow).toBeDefined();
  });

  it("deleteTag leaves fenced code blocks alone", async () => {
    const { result } = renderHook(() => useNoteStore());
    act(() =>
      result.current.setNotes([tagged("n1", ["work"], "Drop #work\n\n```\nkeep #work\n```")]),
    );

    await act(async () => {
      await result.current.deleteTag("work");
    });

    expect(result.current.notes[0].content).toBe("Drop\n\n```\nkeep #work\n```");
  });

  it("snapshots each note to history before overwriting it", async () => {
    const order: string[] = [];
    vi.mocked(tauriCommands.snapshotNote).mockImplementation(async (_v, id) => {
      order.push(`snapshot:${id}`);
    });
    vi.mocked(tauriCommands.writeNote).mockImplementation(async (path) => {
      order.push(`write:${path}`);
    });

    const { result } = renderHook(() => useNoteStore());
    act(() => {
      result.current.setVaults([{ id: "vault-1", name: "Vault", path: "/vault" }]);
      result.current.setNotes([tagged("n1", ["work"], "#work"), tagged("n2", ["work"], "#work")]);
    });

    await act(async () => {
      await result.current.renameTag("work", "client");
    });

    expect(order).toEqual([
      "snapshot:n1",
      "write:/vault/n1.md",
      "snapshot:n2",
      "write:/vault/n2.md",
    ]);
    expect(tauriCommands.snapshotNote).toHaveBeenCalledWith("/vault", "n1", "/vault/n1.md");
  });

  it("deleteTag snapshots before rewriting bodies", async () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => {
      result.current.setVaults([{ id: "vault-1", name: "Vault", path: "/vault" }]);
      result.current.setNotes([tagged("n1", ["work"], "#work")]);
    });

    await act(async () => {
      await result.current.deleteTag("work");
    });

    expect(tauriCommands.snapshotNote).toHaveBeenCalledWith("/vault", "n1", "/vault/n1.md");
    expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1);
  });

  it("still writes when the snapshot fails or the vault path is unknown", async () => {
    vi.mocked(tauriCommands.snapshotNote).mockRejectedValue(new Error("history unwritable"));
    const { result } = renderHook(() => useNoteStore());
    act(() => {
      result.current.setVaults([{ id: "vault-1", name: "Vault", path: "/vault" }]);
      result.current.setNotes([
        tagged("n1", ["work"], "#work"),
        // vaultId that resolves to no vault — no snapshot is possible
        makeNote({
          id: "n2",
          filePath: "/elsewhere/n2.md",
          content: "#work",
          vaultId: "gone",
          frontmatter: { ...makeNote().frontmatter, id: "n2", tags: ["work"] },
        }),
      ]);
    });

    await act(async () => {
      await result.current.deleteTag("work");
    });

    expect(tauriCommands.snapshotNote).toHaveBeenCalledTimes(1); // only the resolvable one
    expect(tauriCommands.writeNote).toHaveBeenCalledTimes(2);
    expect(result.current.notes[0].content).toBe("");
    expect(result.current.notes[1].content).toBe("");
  });

  it("deleteTag no-ops on an empty name", async () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => result.current.setNotes([tagged("n1", ["work"], "#work")]));

    await act(async () => {
      await result.current.deleteTag("  ");
    });

    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
  });

  it("deleteTag rebuilds the search index so the tag is no longer searchable", async () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => result.current.setNotes([tagged("n1", ["zebrafish"], "#zebrafish")]));

    await act(async () => {
      await result.current.deleteTag("zebrafish");
    });

    act(() => result.current.search("zebrafish"));
    expect(result.current.searchResults).toHaveLength(0);
  });
});

describe("search index freshness", () => {
  beforeEach(() => {
    useNoteStore.setState({
      notes: [],
      selectedNoteId: null,
      vaults: [],
      activeVaultId: null,
      tagTree: {},
      searchIndex: null,
      searchQuery: "",
      searchResults: [],
      knownFolderPaths: [],
    });
  });

  it("a note added via addNote is findable by search", () => {
    const { result } = renderHook(() => useNoteStore());
    const existing = makeNote({ id: "n1", filePath: "/notes/a.md" });
    const added = makeNote({
      id: "n2",
      filePath: "/notes/b.md",
      content: "zebra migration patterns",
      frontmatter: { ...makeNote().frontmatter, id: "n2", title: "Zebra Notes" },
    });
    act(() => {
      result.current.setNotes([existing]);
      result.current.addNote(added);
      result.current.search("zebra");
    });
    expect(result.current.searchResults.map((n) => n.id)).toContain("n2");
  });
});

describe("removeNote selection", () => {
  beforeEach(() => {
    useNoteStore.setState({
      notes: [],
      selectedNoteId: null,
      vaults: [],
      activeVaultId: null,
      tagTree: {},
      searchIndex: null,
      searchQuery: "",
      searchResults: [],
      knownFolderPaths: [],
    });
  });

  it("deselects the note when the selected note is removed", () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => {
      result.current.setNotes([makeNote({ id: "n1" })]);
      result.current.selectNote("n1");
      result.current.removeNote("n1");
    });
    expect(result.current.selectedNoteId).toBeNull();
  });

  it("keeps the selection when a different note is removed", () => {
    const { result } = renderHook(() => useNoteStore());
    const a = makeNote({ id: "n1", filePath: "/notes/a.md" });
    const b = makeNote({ id: "n2", filePath: "/notes/b.md" });
    act(() => {
      result.current.setNotes([a, b]);
      result.current.selectNote("n1");
      result.current.removeNote("n2");
    });
    expect(result.current.selectedNoteId).toBe("n1");
  });
});

describe("setNoteTitleLive", () => {
  beforeEach(() => {
    useNoteStore.setState({ notes: [], selectedNoteId: null, tagTree: {}, searchIndex: null });
  });

  it("patches the title in place without rebuilding the search index or tag tree", () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => result.current.setNotes([makeNote({ id: "n1" })]));

    // setNotes built these; a live title edit must reuse them, not rebuild.
    const indexBefore = result.current.searchIndex;
    const tagTreeBefore = result.current.tagTree;

    act(() => result.current.setNoteTitleLive("n1", "New Title"));

    expect(result.current.notes[0].frontmatter.title).toBe("New Title");
    expect(result.current.searchIndex).toBe(indexBefore);
    expect(result.current.tagTree).toBe(tagTreeBefore);
  });

  it("no-ops for an unknown note id", () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => result.current.setNotes([makeNote({ id: "n1" })]));

    act(() => result.current.setNoteTitleLive("missing", "x"));

    expect(result.current.notes[0].frontmatter.title).toBe("Test Note");
  });
});

describe("nested tag tree", () => {
  beforeEach(() => {
    useNoteStore.setState({
      notes: [],
      selectedNoteId: null,
      vaults: [],
      activeVaultId: null,
      tagTree: {},
      searchIndex: null,
      searchQuery: "",
      searchResults: [],
      knownFolderPaths: [],
    });
  });

  function makeNote(overrides: Partial<Note> = {}): Note {
    return {
      id: "01JPMXYZ123",
      filePath: "/notes/test.md",
      fileName: "test.md",
      content: "Test content",
      vaultId: "vault-1",
      frontmatter: {
        id: "01JPMXYZ123",
        title: "Test Note",
        created: "2026-03-13",
        updated: "2026-03-13",
        tags: [],
        urgent: false,
        important: true,
        state: "Doing",
        blocked: false,
        links: [],
      },
      ...overrides,
    };
  }

  it("creates nested children for hierarchical tags like work/project", () => {
    const { result } = renderHook(() => useNoteStore());
    const note = makeNote({
      id: "n1",
      frontmatter: {
        ...makeNote().frontmatter,
        id: "n1",
        tags: ["work/project"],
      },
    });
    act(() => result.current.setNotes([note]));
    const tree = result.current.tagTree;
    expect(tree.work).toBeDefined();
    expect(tree.work.children.project).toBeDefined();
  });

  it("note appears in the leaf node of a nested tag", () => {
    const { result } = renderHook(() => useNoteStore());
    const note = makeNote({
      id: "n1",
      frontmatter: {
        ...makeNote().frontmatter,
        id: "n1",
        tags: ["work/project"],
      },
    });
    act(() => result.current.setNotes([note]));
    const leaf = result.current.tagTree.work.children.project;
    expect(leaf.notes).toHaveLength(1);
    expect(leaf.notes[0].id).toBe("n1");
  });

  // A tag whose segment collides with an Object.prototype key used to find the
  // inherited member instead of a node, and the whole vault load died with
  // "undefined is not an object (evaluating '…notes.push')".
  const PROTOTYPE_KEYS = [
    "constructor",
    "__proto__",
    "toString",
    "valueOf",
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "toLocaleString",
  ];

  it.each(PROTOTYPE_KEYS)("indexes %s as an ordinary tag", (tag) => {
    const { result } = renderHook(() => useNoteStore());
    const note = makeNote({
      id: "n1",
      frontmatter: { ...makeNote().frontmatter, id: "n1", tags: [tag] },
    });
    act(() => result.current.setNotes([note]));
    const node = result.current.tagTree[tag];
    expect(node.notes.map((n) => n.id)).toEqual(["n1"]);
    expect(Object.keys(result.current.tagTree)).toContain(tag);
  });

  it.each(PROTOTYPE_KEYS)("indexes work/%s as a nested tag", (tag) => {
    const { result } = renderHook(() => useNoteStore());
    const note = makeNote({
      id: "n1",
      frontmatter: { ...makeNote().frontmatter, id: "n1", tags: [`work/${tag}`] },
    });
    act(() => result.current.setNotes([note]));
    const leaf = result.current.tagTree.work.children[tag];
    expect(leaf.notes.map((n) => n.id)).toEqual(["n1"]);
    expect(Object.keys(result.current.tagTree.work.children)).toContain(tag);
  });

  it("loads the rest of the vault when one note carries a prototype-key tag", () => {
    const { result } = renderHook(() => useNoteStore());
    const poison = makeNote({
      id: "n1",
      frontmatter: { ...makeNote().frontmatter, id: "n1", tags: ["constructor"] },
    });
    const ordinary = makeNote({
      id: "n2",
      filePath: "/notes/other.md",
      frontmatter: { ...makeNote().frontmatter, id: "n2", tags: ["work"] },
    });
    act(() => result.current.setNotes([poison, ordinary]));
    expect(result.current.notes).toHaveLength(2);
    expect(result.current.tagTree.work.notes.map((n) => n.id)).toEqual(["n2"]);
  });
});

describe("useNoteStore with duplicate ids", () => {
  const keeper = makeNote({ filePath: "/notes/plan.md", content: "keeper body" });
  const copy = makeNote({ filePath: "/notes/plan copy.md", content: "copy body" });

  beforeEach(() => {
    useNoteStore.setState({ notes: [], duplicateGroups: [], selectedNoteId: null });
    useNoteStore.getState().setNotes([copy, keeper]);
  });

  it("keeps one note per id and records the group", () => {
    const { notes, duplicateGroups } = useNoteStore.getState();
    expect(notes).toEqual([keeper]);
    expect(duplicateGroups).toEqual([{ id: keeper.id, keeper, copies: [copy] }]);
  });

  it("updates a copy by path without touching the keeper", () => {
    const edited = { ...copy, content: "copy edited on disk" };
    useNoteStore.getState().updateNote(edited);
    const { notes, duplicateGroups } = useNoteStore.getState();
    expect(notes).toEqual([keeper]);
    expect(duplicateGroups[0].copies).toEqual([edited]);
  });

  it("ignores an added file whose path is already loaded as a copy", () => {
    useNoteStore.getState().addNote({ ...copy, content: "again" });
    expect(useNoteStore.getState().duplicateGroups[0].copies).toEqual([copy]);
  });

  it("promotes the copy when the keeper's file is removed", () => {
    useNoteStore.getState().selectNote(keeper.id);
    useNoteStore.getState().removeNoteAtPath(keeper.filePath);
    const { notes, duplicateGroups, selectedNoteId } = useNoteStore.getState();
    expect(notes).toEqual([copy]);
    expect(duplicateGroups).toEqual([]);
    expect(selectedNoteId).toBe(keeper.id);
  });

  it("removing a copy's file leaves the keeper alone", () => {
    useNoteStore.getState().removeNoteAtPath(copy.filePath);
    const { notes, duplicateGroups } = useNoteStore.getState();
    expect(notes).toEqual([keeper]);
    expect(duplicateGroups).toEqual([]);
  });

  it("reports every loaded path as occupied, duplicate copies included", () => {
    expect(occupiedNotePaths().sort()).toEqual(["/notes/plan copy.md", "/notes/plan.md"]);
  });

  it("replacing one vault keeps another vault's duplicate copies", () => {
    const other = makeNote({ filePath: "/other/x.md", vaultId: "vault-2", id: "X" });
    useNoteStore.getState().replaceVaultNotes("vault-2", [other]);
    useNoteStore.getState().replaceVaultNotes("vault-2", [{ ...other, content: "synced" }]);
    const { notes, duplicateGroups } = useNoteStore.getState();
    expect(notes.map((n) => n.filePath)).toEqual(["/notes/plan.md", "/other/x.md"]);
    expect(notes[1].content).toBe("synced");
    expect(duplicateGroups).toEqual([{ id: keeper.id, keeper, copies: [copy] }]);
  });

  it("replacing a vault drops that vault's own copies that are gone from disk", () => {
    useNoteStore.getState().replaceVaultNotes("vault-1", [keeper]);
    expect(useNoteStore.getState().duplicateGroups).toEqual([]);
    expect(useNoteStore.getState().notes).toEqual([keeper]);
  });

  it("appending another vault with the same id regroups deterministically", () => {
    const other = makeNote({ filePath: "/other/plan.md", vaultId: "vault-2" });
    useNoteStore.getState().appendNotes([other]);
    const { notes, duplicateGroups } = useNoteStore.getState();
    expect(notes.map((n) => n.filePath)).toEqual(["/notes/plan.md"]);
    expect(duplicateGroups[0].copies.map((n) => n.filePath)).toEqual([
      "/other/plan.md",
      "/notes/plan copy.md",
    ]);
  });
});
