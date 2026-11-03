import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGitSyncStore } from "../store/git-sync";
import { useNoteStore } from "../store/notes";
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

const VAULT = "/vault/notes";
const ASSET = `${VAULT}/assets/pic.png`;

function image(path: string): string {
  return `![pic](http://asset.localhost${path})`;
}

function makeNote(content: string): Note {
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
  beforeEach(() => {
    vi.clearAllMocks();
    useGitSyncStore.setState({
      barrierPaths: [],
      heldNoteIds: [],
      heldDrafts: {},
    });
  });

  async function save(before: string, after: string) {
    const note = makeNote(before);
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

  it("keeps an asset that is still referenced", async () => {
    const result = await save(`${image(ASSET)}\n`, `${image(ASSET)}\nedited\n`);
    expect(result).toBe("saved");
    expect(tauriCommands.deleteAsset).not.toHaveBeenCalled();
  });
});
