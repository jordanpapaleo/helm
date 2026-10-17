import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseNote } from "../../lib/note-parser";
import { DEFAULT_SETTINGS } from "../../lib/settings";
import { tauriCommands } from "../../lib/tauri-commands";
import { useNoteStore } from "../../store/notes";
import { useSettingsStore } from "../../store/settings";
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

describe("NoteListPanel — sorting by last modified", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function note(id: string, title: string, updated: string, pinned = false): Note {
    return {
      ...makeNote({ id, title, updated, pinned }),
      id,
      filePath: `/vault/${id}.md`,
      fileName: `${id}.md`,
    };
  }

  function setNotes(notes: Note[]) {
    resetStores(notes[0]);
    useNoteStore.setState({ notes });
  }

  // The stored format is chosen so plain string comparison sorts correctly
  // across both forms — a legacy date-only value counts as that day's start.
  it("sorts a mix of date-only and datetime values newest first", () => {
    setNotes([
      note("a", "Morning", "2026-07-31T09:00:00Z"),
      note("b", "Legacy midday", "2026-07-31"),
      note("c", "Evening", "2026-07-31T18:23:05Z"),
      note("d", "Yesterday", "2026-07-30T23:59:59Z"),
    ]);
    render(<NoteListPanel />);

    const titles = screen.getAllByText(/Morning|Legacy midday|Evening|Yesterday/);
    expect(titles.map((t) => t.textContent)).toEqual([
      "Evening",
      "Morning",
      "Legacy midday",
      "Yesterday",
    ]);
  });

  it("still floats pinned notes above a newer unpinned one", () => {
    setNotes([
      note("a", "Newest", "2026-07-31T18:23:05Z"),
      note("b", "Pinned old", "2026-07-01", true),
    ]);
    render(<NoteListPanel />);

    const titles = screen.getAllByText(/Newest|Pinned old/);
    expect(titles.map((t) => t.textContent)).toEqual(["Pinned old", "Newest"]);
  });

  it("shows only the day in the list row, with the full stamp as a tooltip", () => {
    setNotes([note("a", "Evening", "2026-07-31T18:23:05Z")]);
    render(<NoteListPanel />);

    const stamp = screen.getByTitle("2026-07-31T18:23:05Z");
    expect(stamp.textContent).toBe("2026-07-31");
  });
});

describe("NoteListPanel — archive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
  });

  function twoNotes(showArchived: boolean) {
    const active = {
      ...makeNote({ title: "Current" }),
      id: "active",
      filePath: "/vault/active.md",
      fileName: "active.md",
      content: "current body",
    };
    active.frontmatter = { ...active.frontmatter, id: "active", title: "Current" };
    const archived = {
      ...makeNote({
        title: "Old",
        archived: true,
        state: "Doing",
        tags: ["keep"],
        links: ["active"],
      }),
      id: "old",
      filePath: "/vault/old.md",
      fileName: "old.md",
      content: "preserved body",
    };
    archived.frontmatter = {
      ...archived.frontmatter,
      id: "old",
      title: "Old",
      archived: true,
      state: "Doing",
      tags: ["keep"],
      links: ["active"],
    };
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, showArchivedNotes: showArchived },
    });
    resetStores(active);
    useNoteStore.setState({ notes: [active, archived], selectedNoteId: "active" });
    return { active, archived };
  }

  it("hides archived notes from the list and from search by default", () => {
    twoNotes(false);
    render(<NoteListPanel />);
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.queryByText("Old")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "Old" } });
    expect(screen.queryByText("Old")).not.toBeInTheDocument();
    expect(screen.queryByText("Current")).not.toBeInTheDocument();
  });

  it("shows archived notes with a mark when the setting is on", () => {
    twoNotes(true);
    render(<NoteListPanel />);
    expect(screen.getByText("Old")).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("archives in place from the context menu", async () => {
    twoNotes(false);
    render(<NoteListPanel />);
    fireEvent.contextMenu(screen.getByText("Current"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));

    await waitFor(() => {
      const saved = useNoteStore.getState().notes.find((n) => n.id === "active");
      expect(saved?.frontmatter.archived).toBe(true);
      expect(saved?.filePath).toBe("/vault/active.md");
      expect(saved?.content).toBe("current body");
      expect(saved?.frontmatter.state).toBe("Doing");
    });
    expect(tauriCommands.deleteNote).not.toHaveBeenCalled();
    expect(tauriCommands.writeNote).toHaveBeenCalledWith(
      "/vault/active.md",
      expect.stringContaining("archived: true"),
    );
    // The note leaves the list, but a direct selection stays open.
    expect(useNoteStore.getState().selectedNoteId).toBe("active");
    expect(screen.queryByText("Current")).not.toBeInTheDocument();
  });

  it("unarchives without clearing previous metadata", async () => {
    twoNotes(true);
    render(<NoteListPanel />);
    fireEvent.contextMenu(screen.getByText("Old"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Unarchive" }));

    await waitFor(() => {
      const saved = useNoteStore.getState().notes.find((n) => n.id === "old");
      expect(saved?.frontmatter.archived).toBe(false);
      expect(saved?.frontmatter.state).toBe("Doing");
      expect(saved?.frontmatter.tags).toEqual(["keep"]);
      expect(saved?.frontmatter.links).toEqual(["active"]);
      expect(saved?.content).toBe("preserved body");
      expect(saved?.filePath).toBe("/vault/old.md");
    });
  });

  it("withholds Archive and Delete on a locked note", () => {
    const locked = makeNote({ title: "Locked", locked: true });
    resetStores(locked);
    render(<NoteListPanel />);
    fireEvent.contextMenu(screen.getByText("Locked"));
    expect(screen.queryByRole("menuitem", { name: "Archive" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Unlock" })).toBeInTheDocument();
    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
    expect(tauriCommands.deleteNote).not.toHaveBeenCalled();
    expect(useNoteStore.getState().notes).toHaveLength(1);
  });

  it("still offers Delete on an unlocked note", () => {
    resetStores(makeNote({ title: "Open" }));
    render(<NoteListPanel />);
    fireEvent.contextMenu(screen.getByText("Open"));
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Archive" })).toBeInTheDocument();
  });
});

describe("NoteListPanel — new note menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a blank note in the selected folder, unchanged from the previous defaults", async () => {
    resetStores(makeNote());
    useUIStore.setState({ selectedGrouping: { type: "folder", id: "/vault/inbox" } });
    render(<NoteListPanel />);

    fireEvent.click(screen.getByRole("button", { name: "New note" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Blank" }));

    await waitFor(() => expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1));
    const [filePath, raw] = vi.mocked(tauriCommands.writeNote).mock.calls[0] ?? [];
    expect(filePath?.startsWith("/vault/inbox/")).toBe(true);
    const parsed = parseNote(raw ?? "", filePath ?? "");
    expect(parsed.frontmatter.title).toBe("Untitled");
    expect(parsed.frontmatter.state).toBe("Prepare");
    expect(parsed.content.trim()).toBe("");
    expect(raw).not.toContain("template:");
  });

  it("copies a template into the active vault and leaves the template note unchanged", async () => {
    const base = makeNote({
      id: "tmpl",
      title: "Bug report",
      template: true,
      tags: ["eng"],
      state: "Maintain",
    });
    const stored: Note = {
      ...base,
      id: "tmpl",
      filePath: "/other/bug.md",
      fileName: "bug.md",
      content: "Reproduce it",
      vaultId: "v-other",
    };
    resetStores(stored);
    render(<NoteListPanel />);

    fireEvent.click(screen.getByRole("button", { name: "New note" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Bug report" }));

    await waitFor(() => expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1));
    const [filePath, raw] = vi.mocked(tauriCommands.writeNote).mock.calls[0] ?? [];
    expect(filePath).not.toBe("/other/bug.md");
    expect(filePath?.startsWith("/vault/")).toBe(true);
    const parsed = parseNote(raw ?? "", filePath ?? "");
    expect(parsed.content.trim()).toBe("Reproduce it");
    expect(parsed.frontmatter.tags).toEqual(["eng"]);
    expect(parsed.frontmatter.state).toBe("Maintain");
    expect(parsed.frontmatter.template).toBeUndefined();
    expect(parsed.frontmatter.title).toBe("Untitled");
    expect(useNoteStore.getState().notes.find((n) => n.id === "tmpl")?.content).toBe(
      "Reproduce it",
    );
  });

  it("adds the selected tag when creating a blank note from a tag grouping", async () => {
    resetStores(makeNote());
    useUIStore.setState({ selectedGrouping: { type: "tag", id: "work" } });
    render(<NoteListPanel />);

    fireEvent.click(screen.getByRole("button", { name: "New note" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Blank" }));

    await waitFor(() => expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1));
    const [filePath, raw] = vi.mocked(tauriCommands.writeNote).mock.calls[0] ?? [];
    const parsed = parseNote(raw ?? "", filePath ?? "");
    expect(parsed.content.trim()).toBe("#work");
    expect(parsed.frontmatter.tags).toEqual(["work"]);
  });
});
