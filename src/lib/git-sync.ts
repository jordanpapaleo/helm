/**
 * Coordination for optional per-vault Git sync.
 *
 * File saves stay local and succeed even when Git or the network fails.
 * Checkpoints are debounced. Sync now, pull, and push never force-push,
 * hard-reset, or delete untracked files. Replacing one side of a vault is
 * GitHub issue #48; this module only records the remote SHA and refuses to
 * overwrite an editor that also changed incoming content.
 */

import type { VaultConfig, VaultSyncPrefs } from "../types/note";
import { normalizeContent } from "./note-parser";
import type { GitSyncOutcome } from "./tauri-commands";

/** Same window as Time Machine snapshot coalescing. */
export const CHECKPOINT_DEBOUNCE_MS = 5000;

export const DEFAULT_SYNC_PREFS: VaultSyncPrefs = {
  enabled: false,
  pullOnStartup: true,
  autoPush: true,
};

export function syncPrefs(vault: VaultConfig): VaultSyncPrefs {
  return {
    enabled: vault.sync?.enabled ?? DEFAULT_SYNC_PREFS.enabled,
    pullOnStartup: vault.sync?.pullOnStartup ?? DEFAULT_SYNC_PREFS.pullOnStartup,
    autoPush: vault.sync?.autoPush ?? DEFAULT_SYNC_PREFS.autoPush,
  };
}

export function syncLabel(
  outcome: Pick<GitSyncOutcome, "state" | "ahead" | "behind" | "dirty">,
): string {
  if (outcome.state === "pending" && outcome.behind > 0 && outcome.ahead === 0 && !outcome.dirty) {
    return "Remote changes";
  }
  switch (outcome.state) {
    case "disabled":
      return "Disabled";
    case "synced":
      return "Synced";
    case "syncing":
      return "Syncing";
    case "pending":
      return "Pending upload";
    case "offline":
      return "Offline";
    case "error":
      return "Error";
    case "attention":
      return "Needs attention";
    default:
      return "Sync";
  }
}

export function outcomeNeedsAttention(outcome: GitSyncOutcome): boolean {
  return outcome.state === "error" || outcome.state === "offline" || outcome.state === "attention";
}

export function errorOutcome(message: string): GitSyncOutcome {
  return {
    state: "error",
    message,
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
  };
}

export interface SyncClient {
  flush(): Promise<{ failed: number }>;
  startup(path: string, autoPush: boolean): Promise<GitSyncOutcome>;
  pull(path: string): Promise<GitSyncOutcome>;
  push(path: string): Promise<GitSyncOutcome>;
  syncNow(path: string): Promise<GitSyncOutcome>;
  checkpoint(path: string): Promise<GitSyncOutcome>;
  reload(vault: VaultConfig): Promise<void>;
}

export interface SyncBarrier {
  begin(path: string): void;
  end(path: string): void;
  isActive(path: string): boolean;
}

export type SyncMode = "sync" | "pull" | "push";

const startupInflight = new Map<string, Promise<GitSyncOutcome | null>>();

/**
 * Pull (and, when auto-push is on, upload commits already ahead) before the
 * vault is edited. Concurrent callers, including React StrictMode, share one
 * attempt per vault path.
 */
export function runStartupPull(
  vault: VaultConfig,
  client: SyncClient,
  barrier: SyncBarrier,
): Promise<GitSyncOutcome | null> {
  const prefs = syncPrefs(vault);
  if (!prefs.enabled || !prefs.pullOnStartup) return Promise.resolve(null);
  const existing = startupInflight.get(vault.path);
  if (existing) return existing;
  const job = (async () => {
    const flushed = await client.flush();
    if (flushed.failed > 0) {
      return errorOutcome("Unsaved edits could not be written, so sync did not start.");
    }
    return runGuarded(vault, barrier, async () => {
      const outcome = await client.startup(vault.path, prefs.autoPush);
      await client.reload(vault);
      return outcome;
    });
  })().catch((error: unknown) =>
    errorOutcome(error instanceof Error ? error.message : String(error)),
  );
  startupInflight.set(vault.path, job);
  return job;
}

export async function runVaultSync(
  vault: VaultConfig,
  mode: SyncMode,
  client: SyncClient,
  barrier: SyncBarrier,
): Promise<GitSyncOutcome> {
  if (barrier.isActive(vault.path)) {
    return errorOutcome("This vault is already syncing.");
  }
  try {
    const flushed = await client.flush();
    if (flushed.failed > 0) {
      return errorOutcome("Unsaved edits could not be written, so sync did not start.");
    }
    return await runGuarded(vault, barrier, async () => {
      const outcome =
        mode === "pull"
          ? await client.pull(vault.path)
          : mode === "push"
            ? await client.push(vault.path)
            : await client.syncNow(vault.path);
      await client.reload(vault);
      return outcome;
    });
  } catch (error) {
    return errorOutcome(error instanceof Error ? error.message : String(error));
  }
}

async function runGuarded(
  vault: VaultConfig,
  barrier: SyncBarrier,
  work: () => Promise<GitSyncOutcome>,
): Promise<GitSyncOutcome> {
  barrier.begin(vault.path);
  try {
    return await work();
  } finally {
    barrier.end(vault.path);
  }
}

export interface CheckpointScheduler {
  getVault(id: string): VaultConfig | undefined;
  barrierActive(path: string): boolean;
  checkpoint(path: string): Promise<GitSyncOutcome>;
  syncNow(path: string): Promise<GitSyncOutcome>;
  onOutcome(vaultId: string, outcome: GitSyncOutcome): void;
  delayMs?: number;
}

const checkpointTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Debounced local checkpoint. Pushes only when auto-push is on and there is something to upload. */
export function scheduleCheckpoint(vaultId: string, scheduler: CheckpointScheduler): void {
  const vault = scheduler.getVault(vaultId);
  if (!vault || !syncPrefs(vault).enabled) return;
  const pending = checkpointTimers.get(vaultId);
  if (pending) clearTimeout(pending);
  const delay = scheduler.delayMs ?? CHECKPOINT_DEBOUNCE_MS;
  checkpointTimers.set(
    vaultId,
    setTimeout(() => {
      checkpointTimers.delete(vaultId);
      void runScheduledCheckpoint(vaultId, scheduler);
    }, delay),
  );
}

export function resetCheckpointTimers(): void {
  for (const timer of checkpointTimers.values()) clearTimeout(timer);
  checkpointTimers.clear();
  startupInflight.clear();
}

async function runScheduledCheckpoint(
  vaultId: string,
  scheduler: CheckpointScheduler,
): Promise<void> {
  const vault = scheduler.getVault(vaultId);
  if (!vault || !syncPrefs(vault).enabled) return;
  if (scheduler.barrierActive(vault.path)) {
    scheduleCheckpoint(vaultId, scheduler);
    return;
  }
  try {
    const checkpointed = await scheduler.checkpoint(vault.path);
    const prefs = syncPrefs(vault);
    if (
      !prefs.autoPush ||
      (!checkpointed.committed && checkpointed.ahead === 0 && checkpointed.pendingCommits === 0)
    ) {
      scheduler.onOutcome(vaultId, checkpointed);
      return;
    }
    scheduler.onOutcome(vaultId, await scheduler.syncNow(vault.path));
  } catch (error) {
    scheduler.onOutcome(
      vaultId,
      errorOutcome(error instanceof Error ? error.message : String(error)),
    );
  }
}

export type EditorSyncDecision = "adopt-incoming" | "keep-editor" | "hold";

/**
 * Incoming sync content and unsaved editor keystrokes must not overwrite each
 * other. Keystrokes typed during the sync are held in the editor, and the
 * file on disk stays the synced version until the user deals with it.
 */
export function decideEditorSync(input: {
  dirtySinceFlush: boolean;
  flushedContent: string;
  incomingContent: string;
}): EditorSyncDecision {
  const same = normalizeContent(input.flushedContent) === normalizeContent(input.incomingContent);
  if (!input.dirtySinceFlush) return same ? "keep-editor" : "adopt-incoming";
  if (same) return "keep-editor";
  return "hold";
}
