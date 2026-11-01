import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNoteStore } from "../store/notes";
import type { Note } from "../types/note";
import { reloadVaultNotes } from "./git-sync-runtime";
import { tauriCommands } from "./tauri-commands";

vi.mock("./tauri-commands", () => ({
  tauriCommands: { listNotes: vi.fn(), listFolders: vi.fn() },
}));

const SHARED = "01KX1AKET8KRS5HVRJSJRWC8RZ";

function note(filePath: string, vaultId: string, id = SHARED): Note {
  return {
    id,
    filePath,
    fileName: filePath.split("/").pop() ?? "",
    content: "body",
    vaultId,
    frontmatter: {
      id,
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

beforeEach(() => {
  useNoteStore.setState({ notes: [], duplicateGroups: [], knownFolderPaths: [] });
});

describe("reloadVaultNotes", () => {
  it("keeps duplicate copies that belong to vaults the sync did not touch", async () => {
    const keeper = note("/a/plan.md", "a");
    const copy = note("/a/plan copy.md", "a");
    useNoteStore.getState().setNotes([keeper, copy]);
    vi.mocked(tauriCommands.listNotes).mockResolvedValue([
      {
        path: "/b/other.md",
        fileName: "other.md",
        content: "---\nid: B1\ntitle: Other\ntags: []\n---\nsynced\n",
      },
    ]);
    vi.mocked(tauriCommands.listFolders).mockResolvedValue([]);

    await reloadVaultNotes({ id: "b", name: "b", path: "/b" });

    const { notes, duplicateGroups } = useNoteStore.getState();
    expect(notes.map((n) => n.filePath)).toEqual(["/a/plan.md", "/b/other.md"]);
    expect(duplicateGroups).toEqual([{ id: SHARED, keeper, copies: [copy] }]);
  });
});
