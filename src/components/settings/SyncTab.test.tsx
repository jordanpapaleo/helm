import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNoteStore } from "../../store/notes";
import type { VaultConfig } from "../../types/note";
import { SyncTab } from "./SyncTab";

vi.mock("../../lib/tauri-commands", () => ({
  tauriCommands: {
    gitSyncInspect: vi.fn(),
    gitSyncPreviewConnect: vi.fn(),
    gitSyncConnect: vi.fn(),
    gitSyncTestConnection: vi.fn(),
    setVaults: vi.fn().mockResolvedValue(undefined),
    gitSyncNow: vi.fn(),
    gitSyncPull: vi.fn(),
    gitSyncPush: vi.fn(),
    gitSyncStartup: vi.fn(),
    gitSyncCheckpoint: vi.fn(),
    listNotes: vi.fn().mockResolvedValue([]),
    listFolders: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn().mockResolvedValue(true),
}));

import { tauriCommands } from "../../lib/tauri-commands";

const VAULT: VaultConfig = { id: "v1", name: "Notes", path: "/vault" };

function syncedOutcome(state = "pending") {
  return {
    state,
    message: "Connected.",
    ahead: 1,
    behind: 0,
    pendingCommits: 1,
    dirty: false,
    lastSuccessMs: null,
    remoteOid: "abc",
    attentionPaths: [],
    committed: true,
    pushed: false,
    branch: "main",
    originUrl: "/remote.git",
  };
}

describe("SyncTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNoteStore.setState({ vaults: [VAULT], notes: [], activeVaultId: VAULT.id });
    vi.mocked(tauriCommands.gitSyncInspect).mockResolvedValue({
      gitAvailable: true,
      isRepo: false,
      vaultIsRoot: true,
      originUrl: null,
      branch: null,
      message: null,
    });
    vi.mocked(tauriCommands.gitSyncPreviewConnect).mockResolvedValue({
      files: ["note.md"],
      commitsAhead: 0,
      branch: "main",
      originUrl: null,
      warnings: [],
    });
    vi.mocked(tauriCommands.gitSyncConnect).mockResolvedValue({
      outcome: syncedOutcome(),
      files: ["note.md"],
      warnings: [],
    });
    vi.mocked(tauriCommands.gitSyncNow).mockResolvedValue(syncedOutcome("synced"));
  });

  it("shows the files that will be uploaded and connects without dropping an old vault config", async () => {
    render(<SyncTab />);
    const url = await screen.findByLabelText("Remote URL");
    fireEvent.change(url, { target: { value: "/remote.git" } });
    fireEvent.click(screen.getByRole("button", { name: "Review files" }));
    expect(await screen.findByText("note.md")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() =>
      expect(tauriCommands.gitSyncConnect).toHaveBeenCalledWith("/vault", "/remote.git", "main"),
    );
    await waitFor(() =>
      expect(tauriCommands.setVaults).toHaveBeenCalledWith([
        expect.objectContaining({
          id: "v1",
          path: "/vault",
          sync: { enabled: true, pullOnStartup: true, autoPush: true },
        }),
      ]),
    );
  });

  it("disconnect leaves the vault in place and only turns sync off", async () => {
    useNoteStore.setState({
      vaults: [{ ...VAULT, sync: { enabled: true, pullOnStartup: true, autoPush: false } }],
    });
    render(<SyncTab />);
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    await waitFor(() =>
      expect(tauriCommands.setVaults).toHaveBeenCalledWith([
        expect.objectContaining({
          sync: { enabled: false, pullOnStartup: true, autoPush: false },
        }),
      ]),
    );
    expect(tauriCommands.gitSyncNow).not.toHaveBeenCalled();
  });
});
