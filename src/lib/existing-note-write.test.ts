import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNoteStore } from "../store/notes";
import { useToastStore } from "../store/toast";
import type { Note, VaultConfig } from "../types/note";
import { queueExistingNoteWrite } from "./existing-note-write";
import { serializeNote } from "./note-parser";
import { tauriCommands } from "./tauri-commands";

vi.mock("./tauri-commands", () => ({
  tauriCommands: {
    readNote: vi.fn().mockResolvedValue(""),
    writeNote: vi.fn().mockResolvedValue(undefined),
    snapshotNote: vi.fn().mockResolvedValue(undefined),
  },
}));

const VAULT: VaultConfig = { id: "v1", name: "Vault", path: "/vault" };

function makeNote(content = "November body"): Note {
  return {
    id: "01NOTE",
    filePath: "/vault/note.md",
    fileName: "note.md",
    content,
    vaultId: "v1",
    frontmatter: {
      id: "01NOTE",
      title: "Note",
      created: "2026-11-01T12:00:00Z",
      updated: "2026-11-01T12:00:00Z",
      tags: [],
      urgent: false,
      important: false,
      state: "Doing",
      blocked: false,
      links: [],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  useNoteStore.setState({
    notes: [],
    duplicateGroups: [],
    selectedNoteId: null,
    vaults: [VAULT],
    activeVaultId: "v1",
    tagTree: {},
    searchIndex: null,
    searchQuery: "",
    searchResults: [],
    knownFolderPaths: [],
  });
});

describe("queueExistingNoteWrite", () => {
  it("does not snapshot a frontmatter-only edit", async () => {
    const note = makeNote();
    useNoteStore.getState().setNotes([note]);

    const result = await queueExistingNoteWrite({
      noteId: note.id,
      enqueuedPath: note.filePath,
      beforeUpdated: note.frontmatter.updated,
      failureMessage: "Failed to toggle pin",
      apply: (base) => ({
        ...base,
        frontmatter: { ...base.frontmatter, pinned: true },
      }),
    });

    expect(result.ok && result.wrote).toBe(true);
    expect(tauriCommands.snapshotNote).not.toHaveBeenCalled();
    expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1);
    expect(useNoteStore.getState().notes[0].frontmatter.pinned).toBe(true);
  });

  it("snapshots when the store already shows the new body", async () => {
    const note = makeNote("- [ ] #work\n- [x] keep");
    const edited = { ...note, content: "- [x] keep" };
    useNoteStore.getState().setNotes([edited]);

    await queueExistingNoteWrite({
      noteId: note.id,
      enqueuedPath: note.filePath,
      beforeUpdated: note.frontmatter.updated,
      previousContent: note.content,
      failureMessage: "Failed to save frontmatter",
      apply: (base) => base,
    });

    expect(tauriCommands.snapshotNote).toHaveBeenCalledWith("/vault", note.id, note.filePath);
    expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1);
  });

  it("snapshots before a write that changes the body", async () => {
    const order: string[] = [];
    vi.mocked(tauriCommands.snapshotNote).mockImplementation(async () => {
      order.push("snapshot");
    });
    vi.mocked(tauriCommands.writeNote).mockImplementation(async () => {
      order.push("write");
    });
    const note = makeNote();
    useNoteStore.getState().setNotes([note]);

    await queueExistingNoteWrite({
      noteId: note.id,
      enqueuedPath: note.filePath,
      beforeUpdated: note.frontmatter.updated,
      failureMessage: "Failed to save note",
      apply: (base) => ({ ...base, content: "Edited body" }),
    });

    expect(order).toEqual(["snapshot", "write"]);
    expect(tauriCommands.snapshotNote).toHaveBeenCalledWith("/vault", note.id, note.filePath);
  });

  it("keeps a newer on-disk body and does not snapshot the frontmatter edit", async () => {
    const note = makeNote("November body");
    useNoteStore.getState().setNotes([note]);
    vi.mocked(tauriCommands.readNote).mockResolvedValueOnce(
      serializeNote({
        ...note,
        content: "External body from 15:09",
        frontmatter: { ...note.frontmatter, updated: "2026-11-03T15:09:36Z" },
      }),
    );

    await queueExistingNoteWrite({
      noteId: note.id,
      enqueuedPath: note.filePath,
      beforeUpdated: note.frontmatter.updated,
      failureMessage: "Failed to toggle unmanaged",
      apply: (base) => ({
        ...base,
        frontmatter: { ...base.frontmatter, unmanaged: true, state: "" },
      }),
    });

    const written = String(vi.mocked(tauriCommands.writeNote).mock.calls[0]?.[1]);
    expect(written).toContain("External body from 15:09");
    expect(written).not.toContain("November body");
    expect(written).toContain("unmanaged: true");
    expect(tauriCommands.snapshotNote).not.toHaveBeenCalled();
    expect(useNoteStore.getState().notes[0].content).toContain("External body from 15:09");
  });

  it("refuses an editor write when the on-disk body is newer", async () => {
    const note = makeNote("November body");
    useNoteStore.getState().setNotes([note]);
    vi.mocked(tauriCommands.readNote).mockResolvedValueOnce(
      serializeNote({
        ...note,
        content: "External body from 15:09",
        frontmatter: { ...note.frontmatter, updated: "2026-11-03T15:09:36Z" },
      }),
    );

    const result = await queueExistingNoteWrite({
      noteId: note.id,
      enqueuedPath: note.filePath,
      beforeUpdated: note.frontmatter.updated,
      refuseIfBodyDiffers: "November body plus a stale edit",
      failureMessage: "Failed to save note",
      apply: (base) => ({ ...base, content: "November body plus a stale edit" }),
    });

    expect(result.ok).toBe(false);
    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
    expect(tauriCommands.snapshotNote).not.toHaveBeenCalled();
    expect(useNoteStore.getState().notes[0].content).toContain("External body from 15:09");
  });
});
