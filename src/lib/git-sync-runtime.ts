import { ulid } from "ulid";
import { useGitSyncStore } from "../store/git-sync";
import { useNoteStore } from "../store/notes";
import { reportError } from "../store/toast";
import type { Note, VaultConfig } from "../types/note";
import {
  outcomeNeedsAttention,
  runStartupPull,
  runVaultSync,
  type SyncBarrier,
  type SyncClient,
  type SyncMode,
  scheduleCheckpoint,
  syncLabel,
  syncPrefs,
} from "./git-sync";
import { parseNote } from "./note-parser";
import { flushPendingSavesSettled } from "./pending-saves";
import { tauriCommands } from "./tauri-commands";

function syncClient(): SyncClient {
  return {
    flush: flushPendingSavesSettled,
    startup: (path, autoPush) => tauriCommands.gitSyncStartup(path, autoPush),
    pull: (path) => tauriCommands.gitSyncPull(path),
    push: (path) => tauriCommands.gitSyncPush(path),
    syncNow: (path) => tauriCommands.gitSyncNow(path),
    checkpoint: (path) => tauriCommands.gitSyncCheckpoint(path),
    reload: reloadVaultNotes,
  };
}

function syncBarrier(): SyncBarrier {
  const store = useGitSyncStore.getState();
  return {
    begin: store.beginBarrier,
    end: store.endBarrier,
    isActive: store.isBarrierActive,
  };
}

function remember(vaultId: string, outcome: Awaited<ReturnType<SyncClient["syncNow"]>>): void {
  useGitSyncStore.getState().setOutcome(vaultId, outcome);
  if (outcomeNeedsAttention(outcome)) {
    reportError(syncLabel(outcome), new Error(outcome.message));
  }
}

/** Replace one vault's notes and folders from disk after a sync changes files. */
export async function reloadVaultNotes(vault: VaultConfig): Promise<void> {
  const files = await tauriCommands.listNotes(vault.path);
  const incoming: Note[] = files.map((file) => {
    const parsed = parseNote(file.content, file.path);
    const id = parsed.id || ulid();
    return {
      ...parsed,
      id,
      frontmatter: { ...parsed.frontmatter, id },
      vaultId: vault.id,
    };
  });
  const store = useNoteStore.getState();
  const others = store.notes.filter((note) => note.vaultId !== vault.id);
  store.setNotes([...others, ...incoming]);
  const folders = await tauriCommands.listFolders(vault.path).catch(() => [] as string[]);
  const rest = store.knownFolderPaths.filter(
    (path) => !path.startsWith(`${vault.path}/`) && path !== vault.path,
  );
  store.setKnownFolderPaths([...rest, ...folders]);
}

export async function startupVault(vault: VaultConfig) {
  const outcome = await runStartupPull(vault, syncClient(), syncBarrier());
  if (outcome) remember(vault.id, outcome);
  return outcome;
}

export async function syncVault(vault: VaultConfig, mode: SyncMode) {
  const current = useGitSyncStore.getState().byVaultId[vault.id];
  useGitSyncStore.getState().setOutcome(vault.id, {
    ...(current ?? {
      ahead: 0,
      behind: 0,
      pendingCommits: 0,
      dirty: false,
      lastSuccessMs: null,
      remoteOid: null,
      attentionPaths: [],
      committed: false,
      pushed: false,
      branch: null,
      originUrl: null,
    }),
    state: "syncing",
    message: "Syncing.",
  });
  const outcome = await runVaultSync(vault, mode, syncClient(), syncBarrier());
  remember(vault.id, outcome);
  return outcome;
}

export async function syncConnectedVaults(vaults: VaultConfig[], mode: SyncMode) {
  for (const vault of vaults.filter((item) => syncPrefs(item).enabled)) {
    await syncVault(vault, mode);
  }
}

/** Debounced checkpoint for a vault the watcher saw change, including MCP edits. */
export function noteVaultMutated(vaultPath: string): void {
  const vault = useNoteStore.getState().vaults.find((item) => item.path === vaultPath);
  if (!vault || !syncPrefs(vault).enabled) return;
  scheduleCheckpoint(vault.id, {
    getVault: (id) => useNoteStore.getState().vaults.find((item) => item.id === id),
    barrierActive: (path) => useGitSyncStore.getState().isBarrierActive(path),
    checkpoint: (path) => tauriCommands.gitSyncCheckpoint(path),
    syncNow: (path) => tauriCommands.gitSyncNow(path),
    onOutcome: (id, outcome) => {
      remember(id, outcome);
      const current = useNoteStore.getState().vaults.find((item) => item.id === id);
      if (current && outcome.pushed) void reloadVaultNotes(current);
    },
  });
}
