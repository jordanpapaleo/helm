import { afterEach, describe, expect, it, vi } from "vitest";
import type { VaultConfig } from "../types/note";
import {
  CHECKPOINT_DEBOUNCE_MS,
  type CheckpointScheduler,
  decideEditorSync,
  errorOutcome,
  resetCheckpointTimers,
  runStartupPull,
  runVaultSync,
  type SyncBarrier,
  type SyncClient,
  scheduleCheckpoint,
  syncLabel,
  syncPrefs,
} from "./git-sync";
import type { GitSyncOutcome } from "./tauri-commands";

const VAULT: VaultConfig = { id: "v1", name: "Notes", path: "/vault" };

function outcome(partial: Partial<GitSyncOutcome> = {}): GitSyncOutcome {
  return { ...errorOutcome("ok"), state: "synced", message: "Synced.", ...partial };
}

function barrier(): SyncBarrier & { paths: string[] } {
  const paths: string[] = [];
  return {
    paths,
    begin(path) {
      paths.push(path);
    },
    end(path) {
      const index = paths.indexOf(path);
      if (index >= 0) paths.splice(index, 1);
    },
    isActive(path) {
      return paths.includes(path);
    },
  };
}

function client(overrides: Partial<SyncClient> = {}): SyncClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    flush: vi.fn(async () => {
      calls.push("flush");
      return { failed: 0 };
    }),
    startup: vi.fn(async () => {
      calls.push("startup");
      return outcome();
    }),
    pull: vi.fn(async () => {
      calls.push("pull");
      return outcome();
    }),
    push: vi.fn(async () => {
      calls.push("push");
      return outcome({ pushed: true });
    }),
    syncNow: vi.fn(async () => {
      calls.push("sync");
      return outcome({ pushed: true });
    }),
    checkpoint: vi.fn(async () => {
      calls.push("checkpoint");
      return outcome({ committed: true, ahead: 1, pendingCommits: 1, state: "pending" });
    }),
    reload: vi.fn(async () => {
      calls.push("reload");
    }),
    ...overrides,
  };
}

afterEach(() => {
  resetCheckpointTimers();
  vi.useRealTimers();
});

describe("sync prefs", () => {
  it("treats a vault config with no sync field as disconnected", () => {
    expect(syncPrefs(VAULT)).toEqual({ enabled: false, pullOnStartup: true, autoPush: true });
    expect(syncLabel(outcome({ state: "disabled" }))).toBe("Disabled");
  });
});

describe("startup pull", () => {
  it("does nothing for a disconnected vault", async () => {
    const api = client();
    const gate = barrier();
    await expect(runStartupPull(VAULT, api, gate)).resolves.toBeNull();
    expect(api.calls).toEqual([]);
    expect(gate.paths).toEqual([]);
  });

  it("flushes, pulls, and reloads before editing", async () => {
    const api = client();
    const gate = barrier();
    const vault = { ...VAULT, sync: { enabled: true, pullOnStartup: true, autoPush: true } };
    const result = await runStartupPull(vault, api, gate);
    expect(result?.state).toBe("synced");
    expect(api.calls).toEqual(["flush", "startup", "reload"]);
    expect(gate.paths).toEqual([]);
  });

  it("does not call git when a save fails", async () => {
    const api = client({
      flush: vi.fn(async () => ({ failed: 1 })),
    });
    const vault = { ...VAULT, sync: { enabled: true, pullOnStartup: true, autoPush: false } };
    const result = await runStartupPull(vault, api, barrier());
    expect(result?.state).toBe("error");
    expect(api.calls).toEqual([]);
    expect(api.startup).not.toHaveBeenCalled();
  });

  it("shares one startup across overlapping callers", async () => {
    let release: (() => void) | undefined;
    const api = client({
      startup: vi.fn(
        () =>
          new Promise<GitSyncOutcome>((resolve) => {
            release = () => resolve(outcome());
          }),
      ),
    });
    const vault = { ...VAULT, sync: { enabled: true, pullOnStartup: true, autoPush: true } };
    const gate = barrier();
    const first = runStartupPull(vault, api, gate);
    const second = runStartupPull(vault, api, gate);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    release?.();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(api.startup).toHaveBeenCalledOnce();
  });

  it("opens the local vault when startup fails", async () => {
    const api = client({
      startup: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    const vault = { ...VAULT, sync: { enabled: true, pullOnStartup: true, autoPush: true } };
    const result = await runStartupPull(vault, api, barrier());
    expect(result?.state).toBe("error");
    expect(result?.message).toContain("offline");
  });
});

describe("manual sync", () => {
  it("pulls without pushing and push does not pull", async () => {
    const api = client();
    const vault = { ...VAULT, sync: { enabled: true, pullOnStartup: true, autoPush: true } };
    await runVaultSync(vault, "pull", api, barrier());
    await runVaultSync(vault, "push", api, barrier());
    expect(api.calls).toEqual(["flush", "pull", "reload", "flush", "push", "reload"]);
  });

  it("refuses a second sync while the barrier is up", async () => {
    const gate = barrier();
    gate.begin(VAULT.path);
    const api = client();
    const result = await runVaultSync(VAULT, "sync", api, gate);
    expect(result.state).toBe("error");
    expect(api.calls).toEqual([]);
  });
});

describe("checkpoint scheduler", () => {
  it("waits for the debounce, then checkpoints and syncs when there is something to upload", async () => {
    vi.useFakeTimers();
    const vault = { ...VAULT, sync: { enabled: true, pullOnStartup: true, autoPush: true } };
    const seen: GitSyncOutcome[] = [];
    const scheduler: CheckpointScheduler = {
      getVault: () => vault,
      barrierActive: () => false,
      checkpoint: vi.fn(async () =>
        outcome({ committed: true, ahead: 1, pendingCommits: 1, state: "pending" }),
      ),
      syncNow: vi.fn(async () => outcome({ pushed: true })),
      onOutcome: (_id, next) => seen.push(next),
      delayMs: CHECKPOINT_DEBOUNCE_MS,
    };
    scheduleCheckpoint(vault.id, scheduler);
    await vi.advanceTimersByTimeAsync(CHECKPOINT_DEBOUNCE_MS - 1);
    expect(scheduler.checkpoint).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(scheduler.checkpoint).toHaveBeenCalledOnce();
    expect(scheduler.syncNow).toHaveBeenCalledOnce();
    expect(seen.at(-1)?.pushed).toBe(true);
  });

  it("does not push an empty checkpoint or a vault with auto-push off", async () => {
    vi.useFakeTimers();
    const vault = { ...VAULT, sync: { enabled: true, pullOnStartup: true, autoPush: false } };
    const scheduler: CheckpointScheduler = {
      getVault: () => vault,
      barrierActive: () => false,
      checkpoint: vi.fn(async () => outcome({ committed: false, ahead: 0, pendingCommits: 0 })),
      syncNow: vi.fn(async () => outcome({ pushed: true })),
      onOutcome: () => {},
      delayMs: 10,
    };
    scheduleCheckpoint(vault.id, scheduler);
    await vi.advanceTimersByTimeAsync(10);
    expect(scheduler.syncNow).not.toHaveBeenCalled();
  });

  it("ignores a disconnected vault", () => {
    vi.useFakeTimers();
    const scheduler: CheckpointScheduler = {
      getVault: () => VAULT,
      barrierActive: () => false,
      checkpoint: vi.fn(),
      syncNow: vi.fn(),
      onOutcome: () => {},
      delayMs: 10,
    };
    scheduleCheckpoint(VAULT.id, scheduler);
    vi.advanceTimersByTime(10);
    expect(scheduler.checkpoint).not.toHaveBeenCalled();
  });
});

describe("editor sync decision", () => {
  it("adopts incoming content when the editor was flushed", () => {
    expect(
      decideEditorSync({ dirtySinceFlush: false, flushedContent: "old", incomingContent: "new" }),
    ).toBe("adopt-incoming");
  });

  it("keeps keystrokes when the file did not change", () => {
    expect(
      decideEditorSync({
        dirtySinceFlush: true,
        flushedContent: "saved",
        incomingContent: "\nsaved\n",
      }),
    ).toBe("keep-editor");
  });

  it("holds keystrokes instead of writing them over a different incoming note", () => {
    expect(
      decideEditorSync({
        dirtySinceFlush: true,
        flushedContent: "saved",
        incomingContent: "remote",
      }),
    ).toBe("hold");
  });
});
