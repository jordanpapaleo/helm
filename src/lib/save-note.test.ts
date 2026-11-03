import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGitSyncStore } from "../store/git-sync";
import { useNoteStore } from "../store/notes";
import { useToastStore } from "../store/toast";
import type { Note } from "../types/note";
import { saveNoteContent } from "./save-note";
import { tauriCommands } from "./tauri-commands";

vi.mock("./tauri-commands", () => ({
  tauriCommands: {
    writeNote: vi.fn().mockResolvedValue(undefined),
    snapshotNote: vi.fn().mockResolvedValue(undefined),
    deleteAsset: vi.fn().mockResolvedValue(undefined),
    readNote: vi.fn().mockRejectedValue(new Error("missing")),
  },
}));

function makeNote(): Note {
  return {
    id: "01FAILEDSAVE000000000001",
    filePath: "/vault/failed-save.md",
    fileName: "failed-save.md",
    content: "Note A body",
    vaultId: "v1",
    frontmatter: {
      id: "01FAILEDSAVE000000000001",
      title: "Note A",
      created: "2026-07-01T00:00:00Z",
      updated: "2026-07-01T00:00:00Z",
      tags: [],
      urgent: false,
      important: false,
      state: "Prepare",
      blocked: false,
      links: [],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(tauriCommands.writeNote).mockResolvedValue(undefined);
  useToastStore.setState({ toasts: [] });
  useGitSyncStore.setState({
    byVaultId: {},
    barrierPaths: [],
    heldNoteIds: [],
    heldDrafts: {},
  });
  useNoteStore.getState().setNotes([]);
  useNoteStore.setState({
    vaults: [{ id: "v1", name: "Vault", path: "/vault" }],
    activeVaultId: "v1",
  });
});

describe("saveNoteContent", () => {
  it("leaves the note unsaved when the write fails and retries it next time", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const note = makeNote();
      useNoteStore.getState().setNotes([note]);
      vi.mocked(tauriCommands.writeNote).mockRejectedValueOnce(new Error("disk full"));

      const first = await saveNoteContent(note, "Note A body edited");

      expect(first).toBe("failed");
      expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1);
      expect(tauriCommands.snapshotNote).toHaveBeenCalledTimes(1);
      expect(useNoteStore.getState().notes[0].content).toBe("Note A body");
      expect(useNoteStore.getState().notes[0].frontmatter.updated).toBe("2026-07-01T00:00:00Z");
      expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain(
        "Failed to save note: disk full",
      );

      const second = await saveNoteContent(useNoteStore.getState().notes[0], "Note A body edited");

      expect(second).toBe("saved");
      expect(tauriCommands.writeNote).toHaveBeenCalledTimes(2);
      expect(useNoteStore.getState().notes[0].content).toBe("Note A body edited");
    } finally {
      vi.restoreAllMocks();
    }
  });
});

const VAULT = "/vault/notes";
const ASSET = `${VAULT}/assets/pic.png`;

function image(path: string): string {
  return `![pic](http://asset.localhost${path})`;
}

function assetNote(content: string): Note {
  return {
    id: "01JPMXYZ123",
    filePath: `${VAULT}/page.md`,
    fileName: "page.md",
    content,
    vaultId: "v1",
    frontmatter: {
      id: "01JPMXYZ123",
      title: "Page",
      created: "2026-03-13T00:00:00Z",
      updated: "2026-03-13T00:00:00Z",
      tags: [],
      urgent: false,
      important: false,
      state: "Doing",
      blocked: false,
    },
  };
}

describe("saveNoteContent asset deletion", () => {
  async function save(before: string, after: string) {
    const note = assetNote(before);
    useNoteStore.setState({
      notes: [note],
      duplicateGroups: [],
      vaults: [{ id: "v1", name: "Notes", path: VAULT }],
    });
    return saveNoteContent(note, after);
  }

  it("deletes an image removed from the note when it is inside the vault assets directory", async () => {
    const result = await save(`${image(ASSET)}\n`, "kept text\n");
    expect(result).toBe("saved");
    expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1);
    expect(tauriCommands.snapshotNote).toHaveBeenCalledWith(
      VAULT,
      "01JPMXYZ123",
      `${VAULT}/page.md`,
    );
    expect(tauriCommands.deleteAsset).toHaveBeenCalledTimes(1);
    expect(tauriCommands.deleteAsset).toHaveBeenCalledWith(VAULT, ASSET);
  });

  it("does not delete asset.localhost paths outside the vault assets directory", async () => {
    const outside = [
      image("/etc/passwd"),
      image(`${VAULT}/assets-evil/pic.png`),
      `![x](http://asset.localhost${VAULT}/assets%2F..%2F..%2Fetc/passwd)`,
    ].join("\n");
    const result = await save(outside, "removed the images\n");
    expect(result).toBe("saved");
    expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1);
    expect(tauriCommands.deleteAsset).not.toHaveBeenCalled();
  });

  it("keeps a literal backslash in a POSIX asset filename", async () => {
    const literal = `${VAULT}/assets/a\\b.png`;
    const result = await save(`${image(`${VAULT}/assets/a%5Cb.png`)}\n`, "removed\n");
    expect(result).toBe("saved");
    expect(tauriCommands.deleteAsset).toHaveBeenCalledTimes(1);
    expect(tauriCommands.deleteAsset).toHaveBeenCalledWith(VAULT, literal);
  });

  it("treats backslash as a separator only on a Windows asset path", async () => {
    const vault = "C:\\Users\\me\\notes";
    const removed = assetNote(
      "![pic](http://asset.localhost/C:%5CUsers%5Cme%5Cnotes%5Cassets%5Cpic.png)\n",
    );
    const traversal = assetNote(
      "![x](http://asset.localhost/C:%5CUsers%5Cme%5Cnotes%5Cassets%5C..%5C..%5Csecret.png)\n",
    );
    useNoteStore.setState({
      notes: [removed],
      duplicateGroups: [],
      vaults: [{ id: "v1", name: "Notes", path: vault }],
    });
    expect(await saveNoteContent(removed, "removed\n")).toBe("saved");
    expect(tauriCommands.deleteAsset).toHaveBeenCalledWith(
      vault,
      "C:/Users/me/notes/assets/pic.png",
    );

    vi.clearAllMocks();
    useNoteStore.setState({
      notes: [traversal],
      duplicateGroups: [],
      vaults: [{ id: "v1", name: "Notes", path: vault }],
    });
    expect(await saveNoteContent(traversal, "removed\n")).toBe("saved");
    expect(tauriCommands.deleteAsset).not.toHaveBeenCalled();
  });

  it("keeps an asset that is still referenced", async () => {
    const result = await save(`${image(ASSET)}\n`, `${image(ASSET)}\nedited\n`);
    expect(result).toBe("saved");
    expect(tauriCommands.deleteAsset).not.toHaveBeenCalled();
  });
});
