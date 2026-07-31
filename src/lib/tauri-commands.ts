import { invoke } from "@tauri-apps/api/core";
import type { VaultConfig } from "../types/note";

export interface NoteFile {
  path: string;
  fileName: string;
  content: string;
}

export interface HistoryEntry {
  /** Snapshot time as unix epoch milliseconds */
  ts_ms: number;
  path: string;
}

export const tauriCommands = {
  /** Quit the whole process (not just the current window). */
  exitApp: (): Promise<void> => invoke("exit_app"),

  // Legacy — used only for migration from single-vault config
  getVaultPath: (): Promise<string | null> => invoke("get_vault_path"),

  getVaults: (): Promise<VaultConfig[]> => invoke("get_vaults"),

  setVaults: (vaults: VaultConfig[]): Promise<void> => invoke("set_vaults", { vaults }),

  openFolderDialog: async (): Promise<string | null> => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false, title: "Add Vault" });
    return typeof selected === "string" ? selected : null;
  },

  listNotes: (vaultPath: string): Promise<NoteFile[]> => invoke("list_notes", { vaultPath }),

  readNote: (filePath: string): Promise<string> => invoke("read_note", { filePath }),

  writeNote: (filePath: string, content: string): Promise<void> =>
    invoke("write_note", { filePath, content }),

  deleteNote: (filePath: string): Promise<void> => invoke("delete_note", { filePath }),

  renameNote: (oldPath: string, newPath: string): Promise<void> =>
    invoke("rename_note", { oldPath, newPath }),

  watchVault: (vaultPath: string): Promise<void> => invoke("watch_vault", { vaultPath }),

  writeAsset: (vaultPath: string, filename: string, data: number[]): Promise<string> =>
    invoke("write_asset", { vaultPath, filename, data }),

  // Deletes a non-markdown asset file; the Rust side refuses .md paths so a bad
  // asset-path extraction can never delete a note.
  deleteAsset: (filePath: string): Promise<void> => invoke("delete_asset", { filePath }),

  // Snapshot the note's current on-disk content into <vault>/.helm-history/<noteId>/.
  // Coalesced (min 5 min between snapshots) and pruned (50 kept) on the Rust side.
  snapshotNote: (vaultPath: string, noteId: string, filePath: string): Promise<void> =>
    invoke("snapshot_note", { vaultPath, noteId, filePath }),

  listNoteHistory: (vaultPath: string, noteId: string): Promise<HistoryEntry[]> =>
    invoke("list_note_history", { vaultPath, noteId }),

  listFolders: (vaultPath: string): Promise<string[]> => invoke("list_folders", { vaultPath }),

  createFolder: (path: string): Promise<void> => invoke("create_folder", { path }),

  deleteFolder: (path: string): Promise<void> => invoke("delete_folder", { path }),

  renameFolder: (oldPath: string, newPath: string): Promise<void> =>
    invoke("rename_folder", { oldPath, newPath }),
};
