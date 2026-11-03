import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNoteStore } from "../store/notes";
import type { Note } from "../types/note";
import { resolveNoteWritePath } from "./note-write-path";
import { tauriCommands } from "./tauri-commands";

vi.mock("./tauri-commands", () => ({
  tauriCommands: {
    readNote: vi.fn(),
  },
}));

function note(id: string, filePath: string): Note {
  return {
    id,
    filePath,
    fileName: filePath.split("/").pop() ?? "",
    content: "body",
    vaultId: "v1",
    frontmatter: {
      id,
      title: "Note",
      created: "2026-11-01T12:00:00Z",
      updated: "2026-11-01T12:00:00Z",
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
  useNoteStore.setState({
    notes: [],
    duplicateGroups: [],
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

describe("resolveNoteWritePath", () => {
  it("uses the path the store and the write agree on when every read fails", async () => {
    useNoteStore.getState().setNotes([note("n1", "/vault/old-title.md")]);
    vi.mocked(tauriCommands.readNote).mockResolvedValue("old");
    await resolveNoteWritePath("n1", "/vault/old-title.md");

    useNoteStore.getState().setNotes([note("n1", "/vault/n1.md")]);
    vi.mocked(tauriCommands.readNote).mockRejectedValue(new Error("missing"));

    await expect(resolveNoteWritePath("n1", "/vault/n1.md")).resolves.toBe("/vault/n1.md");
  });

  it("keeps a file that exists when the store path does not", async () => {
    useNoteStore.getState().setNotes([note("n1", "/vault/original.md")]);
    vi.mocked(tauriCommands.readNote).mockResolvedValue("body");
    await resolveNoteWritePath("n1", "/vault/original.md");

    useNoteStore.getState().setNotes([note("n1", "/vault/compass.md")]);
    vi.mocked(tauriCommands.readNote).mockImplementation(async (path: string) => {
      if (path === "/vault/original.md") return "body";
      throw new Error("missing");
    });

    await expect(resolveNoteWritePath("n1", "/vault/compass.md")).resolves.toBe(
      "/vault/original.md",
    );
  });
});
