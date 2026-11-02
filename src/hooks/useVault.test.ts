import { beforeEach, describe, expect, it, vi } from "vitest";
import { tauriCommands } from "../lib/tauri-commands";
import { useNoteStore } from "../store/notes";
import type { Note } from "../types/note";
import { applyChangedFile } from "./useVault";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("../lib/tauri-commands", () => ({
  tauriCommands: { readNote: vi.fn() },
}));

function makeNote(filePath: string, content = "body"): Note {
  return {
    id: "01KX1AKET8KRS5HVRJSJRWC8RZ",
    filePath,
    fileName: filePath.split("/").pop() ?? "",
    content,
    vaultId: "v1",
    frontmatter: {
      id: "01KX1AKET8KRS5HVRJSJRWC8RZ",
      title: "Plan",
      created: "2026-03-13T09:14:22Z",
      updated: "2026-03-13T09:14:22Z",
      tags: [],
      urgent: false,
      important: false,
      state: "Doing",
      blocked: false,
    },
  };
}

const original = makeNote("/vault/plan.md");

beforeEach(() => {
  useNoteStore.setState({ notes: [], duplicateGroups: [], selectedNoteId: null });
  useNoteStore.getState().setNotes([original]);
  vi.mocked(tauriCommands.readNote).mockReset();
});

describe("applyChangedFile", () => {
  it("flags a new file with a loaded id as a duplicate when the old file still exists", async () => {
    vi.mocked(tauriCommands.readNote).mockResolvedValue("still here");
    const copy = makeNote("/vault/plan copy.md");

    await applyChangedFile(copy);

    const { notes, duplicateGroups } = useNoteStore.getState();
    expect(notes).toEqual([original]);
    expect(duplicateGroups).toEqual([{ id: original.id, keeper: original, copies: [copy] }]);
  });

  it("treats it as a rename when the old file is gone", async () => {
    vi.mocked(tauriCommands.readNote).mockRejectedValue(new Error("ENOENT"));
    const moved = makeNote("/vault/folder/plan.md");

    await applyChangedFile(moved);

    const { notes, duplicateGroups } = useNoteStore.getState();
    expect(notes).toEqual([moved]);
    expect(duplicateGroups).toEqual([]);
  });

  it("updates an already-loaded copy in place", async () => {
    vi.mocked(tauriCommands.readNote).mockResolvedValue("still here");
    await applyChangedFile(makeNote("/vault/plan copy.md"));
    const edited = makeNote("/vault/plan copy.md", "edited");

    await applyChangedFile(edited);

    expect(useNoteStore.getState().notes).toEqual([original]);
    expect(useNoteStore.getState().duplicateGroups[0].copies).toEqual([edited]);
  });
});
