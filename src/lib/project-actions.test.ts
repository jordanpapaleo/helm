import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNoteStore } from "../store/notes";
import { useProjectStore } from "../store/projects";
import { promoteFolder } from "./project-actions";
import { tauriCommands } from "./tauri-commands";

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
});
