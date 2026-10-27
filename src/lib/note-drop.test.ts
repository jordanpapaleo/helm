import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNoteStore } from "../store/notes";
import type { Note, VaultConfig } from "../types/note";
import { NOTE_DRAG_MIME, writeNoteDrag } from "./note-drag";
import { addTagFromDrop, moveNoteToFolder } from "./note-drop";
import { registerSaveFlusher, unregisterSaveFlusher } from "./pending-saves";
import { tauriCommands } from "./tauri-commands";

vi.mock("./tauri-commands", () => ({
  tauriCommands: {
    renameNote: vi.fn().mockResolvedValue(undefined),
    writeNote: vi.fn().mockResolvedValue(undefined),
  },
}));

const VAULT: VaultConfig = { id: "v1", name: "My Vault", path: "/vault" };

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "alpha",
    filePath: "/vault/note.md",
    fileName: "note.md",
    content: "Keep this body",
    vaultId: "v1",
    frontmatter: {
      id: "alpha",
      title: "Alpha",
      created: "2026-01-01",
      updated: "2026-01-01",
      tags: [],
      urgent: false,
      important: false,
      state: "Prepare",
      blocked: false,
      links: ["01OTHER"],
    },
    ...overrides,
  };
}

function createDragData() {
  const store = new Map<string, string>();
  return {
    dropEffect: "none",
    effectAllowed: "all",
    get types() {
      return [...store.keys()];
    },
    setData(format: string, data: string) {
      store.set(format, String(data));
    },
    getData(format: string) {
      return store.get(format) ?? "";
    },
    clearData(format?: string) {
      if (format) store.delete(format);
      else store.clear();
    },
  };
}

describe("note drop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    unregisterSaveFlusher("pending-edit");
    const note = makeNote();
    useNoteStore.setState({
      notes: [note],
      selectedNoteId: null,
      vaults: [VAULT],
      activeVaultId: "v1",
      tagTree: {},
      searchIndex: null,
      searchQuery: "",
      searchResults: [],
      knownFolderPaths: ["/vault/inbox"],
    });
  });

  it("does not put the note body in the drag payload", () => {
    const data = createDragData();
    writeNoteDrag(data as unknown as DataTransfer, "alpha");
    expect(data.getData(NOTE_DRAG_MIME)).toBe("alpha");
    expect(data.getData("text/plain")).not.toContain("Keep this body");
    expect(data.getData("text/html")).not.toContain("Keep this body");
  });

  it("leaves the note in place when it is dropped on its current folder", async () => {
    const note = useNoteStore.getState().notes[0];
    await moveNoteToFolder(note, "/vault");
    expect(tauriCommands.renameNote).not.toHaveBeenCalled();
    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
    const stored = useNoteStore.getState().notes[0];
    expect(stored.filePath).toBe("/vault/note.md");
    expect(stored.content).toBe("Keep this body");
    expect(stored.frontmatter.links).toEqual(["01OTHER"]);
  });

  it("renames into the folder and keeps the body, including edits flushed first", async () => {
    registerSaveFlusher("pending-edit", {
      isPending: () => true,
      flush: () => {
        const current = useNoteStore.getState().notes[0];
        useNoteStore.getState().updateNote({ ...current, content: "Saved body" });
      },
    });
    await moveNoteToFolder(useNoteStore.getState().notes[0], "/vault/inbox");
    expect(tauriCommands.renameNote).toHaveBeenCalledWith("/vault/note.md", "/vault/inbox/note.md");
    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
    const moved = useNoteStore.getState().notes[0];
    expect(moved.filePath).toBe("/vault/inbox/note.md");
    expect(moved.fileName).toBe("note.md");
    expect(moved.content).toBe("Saved body");
    expect(moved.id).toBe("alpha");
    expect(moved.frontmatter.links).toEqual(["01OTHER"]);
  });

  it("does not move the file when a pending save fails", async () => {
    registerSaveFlusher("pending-edit", {
      isPending: () => true,
      flush: () => Promise.reject(new Error("disk full")),
    });
    await moveNoteToFolder(useNoteStore.getState().notes[0], "/vault/inbox");
    expect(tauriCommands.renameNote).not.toHaveBeenCalled();
    const stored = useNoteStore.getState().notes[0];
    expect(stored.filePath).toBe("/vault/note.md");
    expect(stored.content).toBe("Keep this body");
  });

  it("keeps the note where it is when the rename fails", async () => {
    vi.mocked(tauriCommands.renameNote).mockRejectedValueOnce(new Error("exists"));
    await moveNoteToFolder(useNoteStore.getState().notes[0], "/vault/inbox");
    const stored = useNoteStore.getState().notes[0];
    expect(stored.filePath).toBe("/vault/note.md");
    expect(stored.content).toBe("Keep this body");
  });

  it("adds a tag without rewriting the body", async () => {
    await addTagFromDrop(useNoteStore.getState().notes[0], "work");
    expect(tauriCommands.renameNote).not.toHaveBeenCalled();
    const raw = vi.mocked(tauriCommands.writeNote).mock.calls[0]?.[1];
    expect(raw).toContain("Keep this body");
    const stored = useNoteStore.getState().notes[0];
    expect(stored.content).toBe("Keep this body");
    expect(stored.filePath).toBe("/vault/note.md");
    expect(stored.frontmatter.tags).toEqual(["work"]);
    expect(stored.frontmatter.links).toEqual(["01OTHER"]);
  });

  it("does not write when the note already has that tag", async () => {
    const note = makeNote();
    note.frontmatter = { ...note.frontmatter, tags: ["work"] };
    useNoteStore.setState({ notes: [note] });
    await addTagFromDrop(note, "work");
    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
    expect(useNoteStore.getState().notes[0].content).toBe("Keep this body");
    expect(useNoteStore.getState().notes[0].frontmatter.tags).toEqual(["work"]);
  });

  it("does not write a tag onto a locked note", async () => {
    const note = makeNote();
    note.frontmatter = { ...note.frontmatter, locked: true };
    useNoteStore.setState({ notes: [note] });
    await addTagFromDrop(note, "work");
    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
    expect(useNoteStore.getState().notes[0].content).toBe("Keep this body");
    expect(useNoteStore.getState().notes[0].frontmatter.tags).toEqual([]);
  });
});
