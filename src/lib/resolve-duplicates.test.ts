import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNoteStore } from "../store/notes";
import { useToastStore } from "../store/toast";
import { useTrashStore } from "../store/trash";
import type { Note } from "../types/note";
import { parseNote } from "./note-parser";
import { giveNoteNewId, trashDuplicateCopy } from "./resolve-duplicates";
import { tauriCommands } from "./tauri-commands";

const disk = new Map<string, string>();

vi.mock("./tauri-commands", () => ({
  tauriCommands: {
    readNote: vi.fn(async (path: string) => {
      const raw = disk.get(path);
      if (raw === undefined) throw new Error(`ENOENT ${path}`);
      return raw;
    }),
    writeNote: vi.fn(async (path: string, content: string) => {
      disk.set(path, content);
    }),
    deleteNote: vi.fn(async (path: string) => {
      disk.delete(path);
    }),
  },
}));

const SHARED = "01KX1AKET8KRS5HVRJSJRWC8RZ";

function file(title: string, body: string, extra = ""): string {
  return `---\nid: ${SHARED}\ntitle: ${title}\ncreated: '2026-03-13T09:14:22Z'\nupdated: '2026-03-13T09:14:22Z'\ntags: []\n${extra}---\n${body}\n`;
}

function load(): Note[] {
  const notes = [...disk].map(([path, raw]) => ({ ...parseNote(raw, path), vaultId: "v1" }));
  useNoteStore.getState().setNotes(notes);
  return notes;
}

beforeEach(() => {
  disk.clear();
  disk.set("/vault/plan.md", file("Plan", "Original body"));
  disk.set("/vault/plan copy.md", file("Plan", "Edited copy body"));
  useNoteStore.setState({ notes: [], duplicateGroups: [], selectedNoteId: null });
  useTrashStore.setState({ items: [] });
  useToastStore.setState({ toasts: [] });
  vi.clearAllMocks();
});

describe("a vault where two files share an id", () => {
  it("loads without throwing and keeps one note per id", () => {
    expect(load).not.toThrow();
    const { notes, duplicateGroups } = useNoteStore.getState();
    expect(notes.map((n) => n.filePath)).toEqual(["/vault/plan.md"]);
    expect(duplicateGroups).toHaveLength(1);
    expect(duplicateGroups[0].id).toBe(SHARED);
    expect(duplicateGroups[0].keeper.filePath).toBe("/vault/plan.md");
    expect(duplicateGroups[0].copies.map((n) => n.filePath)).toEqual(["/vault/plan copy.md"]);
  });

  it("searches without crashing", () => {
    load();
    useNoteStore.getState().search("Original");
    expect(useNoteStore.getState().searchResults.map((n) => n.filePath)).toEqual([
      "/vault/plan.md",
    ]);
  });
});

describe("giveNoteNewId", () => {
  it("re-IDs the copy on disk, keeps its body, and resolves the group", async () => {
    load();
    const copy = useNoteStore.getState().duplicateGroups[0].copies[0];

    const updated = await giveNoteNewId(copy);

    expect(updated).not.toBeNull();
    expect(updated?.id).not.toBe(SHARED);
    const onDisk = parseNote(disk.get("/vault/plan copy.md") ?? "", "/vault/plan copy.md");
    expect(onDisk.id).toBe(updated?.id);
    expect(onDisk.content.trim()).toBe("Edited copy body");
    expect(parseNote(disk.get("/vault/plan.md") ?? "", "/vault/plan.md").id).toBe(SHARED);

    const { notes, duplicateGroups } = useNoteStore.getState();
    expect(duplicateGroups).toEqual([]);
    expect(notes.map((n) => n.id).sort()).toEqual([SHARED, updated?.id].sort());
    expect(notes.find((n) => n.id === SHARED)?.filePath).toBe("/vault/plan.md");
  });

  it("hands the id to the other copy when the keeper is re-IDed", async () => {
    load();
    const keeper = useNoteStore.getState().duplicateGroups[0].keeper;
    await giveNoteNewId(keeper);
    const { notes, duplicateGroups } = useNoteStore.getState();
    expect(duplicateGroups).toEqual([]);
    expect(notes.find((n) => n.id === SHARED)?.filePath).toBe("/vault/plan copy.md");
  });

  it("reports a failed write and leaves the group in place", async () => {
    load();
    vi.mocked(tauriCommands.writeNote).mockRejectedValueOnce(new Error("disk full"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const copy = useNoteStore.getState().duplicateGroups[0].copies[0];

    expect(await giveNoteNewId(copy)).toBeNull();
    expect(useNoteStore.getState().duplicateGroups).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].message).toContain("disk full");
  });
});

describe("trashDuplicateCopy", () => {
  it("deletes the file, trashes it under a fresh id, and resolves the group", async () => {
    load();
    const copy = useNoteStore.getState().duplicateGroups[0].copies[0];

    expect(await trashDuplicateCopy(copy)).toBe(true);

    expect(disk.has("/vault/plan copy.md")).toBe(false);
    const [item] = useTrashStore.getState().items;
    expect(item.note.filePath).toBe("/vault/plan copy.md");
    expect(item.note.id).not.toBe(SHARED);
    expect(item.note.frontmatter.id).toBe(item.note.id);
    const { notes, duplicateGroups } = useNoteStore.getState();
    expect(duplicateGroups).toEqual([]);
    expect(notes.map((n) => n.filePath)).toEqual(["/vault/plan.md"]);
  });

  it("refuses a locked copy", async () => {
    disk.set("/vault/plan copy.md", file("Plan", "Edited copy body", "locked: true\n"));
    load();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const copy = useNoteStore.getState().duplicateGroups[0].copies[0];

    expect(await trashDuplicateCopy(copy)).toBe(false);
    expect(tauriCommands.deleteNote).not.toHaveBeenCalled();
    expect(useNoteStore.getState().duplicateGroups).toHaveLength(1);
  });
});
