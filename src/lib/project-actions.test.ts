import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNoteStore } from "../store/notes";
import { useProjectStore } from "../store/projects";
import type { Note } from "../types/note";
import { promoteFolder } from "./project-actions";
import { tauriCommands } from "./tauri-commands";

function ideasNote(): Note {
  return {
    id: "01IDEA00000000000000000001",
    filePath: "/vault/renovation/ideas.md",
    fileName: "ideas.md",
    content: "Keep the existing notes.",
    vaultId: "v1",
    frontmatter: {
      id: "01IDEA00000000000000000001",
      title: "Ideas",
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
      tags: [],
      urgent: false,
      important: false,
      state: "Prepare",
      blocked: false,
      links: [],
    },
  };
}

vi.mock("./tauri-commands", () => ({
  tauriCommands: {
    listProjectFiles: vi.fn().mockResolvedValue([]),
    createFolder: vi.fn().mockResolvedValue(undefined),
    writeNote: vi.fn().mockResolvedValue(undefined),
    writeTextFile: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("promoteFolder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tauriCommands.listProjectFiles).mockResolvedValue([]);
    useProjectStore.setState({ projects: [] });
    useNoteStore.setState({
      notes: [],
      knownFolderPaths: ["/vault/renovation"],
      vaults: [{ id: "v1", name: "Vault", path: "/vault" }],
      activeVaultId: "v1",
    });
  });

  it("refuses when helm-project.json exists but is not a note", async () => {
    vi.mocked(tauriCommands.listProjectFiles).mockResolvedValue([
      { path: "/vault/renovation/helm-project.json", content: "{ not valid" },
    ]);

    await expect(
      promoteFolder({
        vaultId: "v1",
        vaultPath: "/vault",
        folderPath: "/vault/renovation",
      }),
    ).rejects.toThrow(/project metadata/);
    expect(tauriCommands.writeTextFile).not.toHaveBeenCalled();
    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
  });

  it("turns the folder into a project and leaves the notes already in it", async () => {
    const existing = ideasNote();
    useNoteStore.setState({
      notes: [existing],
      knownFolderPaths: ["/vault/renovation"],
    });

    const created = await promoteFolder({
      vaultId: "v1",
      vaultPath: "/vault",
      folderPath: "/vault/renovation",
    });

    expect(created.project.rootPath).toBe("/vault/renovation");
    expect(created.mainPage.filePath).not.toBe(existing.filePath);
    const kept = useNoteStore.getState().notes.find((note) => note.id === existing.id);
    expect(kept?.filePath).toBe("/vault/renovation/ideas.md");
    expect(kept?.content).toBe("Keep the existing notes.");
    const written = vi.mocked(tauriCommands.writeNote).mock.calls.map((call) => call[0]);
    expect(written).not.toContain(existing.filePath);
    expect(tauriCommands.createFolder).not.toHaveBeenCalledWith("/vault/renovation");
    expect(tauriCommands.createFolder).toHaveBeenCalledWith("/vault/renovation/thinking");
  });
});
