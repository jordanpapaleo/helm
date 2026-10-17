import { Icon } from "@iconify/react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { syncLabel, syncPrefs } from "../../lib/git-sync";
import { syncVault } from "../../lib/git-sync-runtime";
import type { GitConnectPreview } from "../../lib/tauri-commands";
import { tauriCommands } from "../../lib/tauri-commands";
import { useGitSyncStore } from "../../store/git-sync";
import { useNoteStore } from "../../store/notes";
import { reportError } from "../../store/toast";
import type { VaultConfig, VaultSyncPrefs } from "../../types/note";

interface Draft {
  url: string;
  branch: string;
}

interface PreviewState {
  vaultId: string;
  url: string;
  branch: string;
  preview: GitConnectPreview;
}

function formatWhen(ms: number | null): string {
  if (!ms) return "Never";
  return new Date(ms).toLocaleString();
}

async function persistSync(vault: VaultConfig, sync: VaultSyncPrefs): Promise<void> {
  const vaults = useNoteStore
    .getState()
    .vaults.map((item) => (item.id === vault.id ? { ...item, sync } : item));
  useNoteStore.getState().setVaults(vaults);
  await tauriCommands.setVaults(vaults);
}

export function SyncTab() {
  const vaults = useNoteStore((state) => state.vaults);
  const outcomes = useGitSyncStore((state) => state.byVaultId);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    for (const vault of vaults) {
      tauriCommands
        .gitSyncInspect(vault.path)
        .then((report) => {
          if (cancelled) return;
          setDrafts((current) => {
            if (current[vault.id]) return current;
            return {
              ...current,
              [vault.id]: {
                url: report.originUrl ?? "",
                branch: report.branch ?? "main",
              },
            };
          });
          if (report.message) {
            useGitSyncStore.getState().setOutcome(vault.id, {
              state: report.vaultIsRoot ? "disabled" : "error",
              message: report.message,
              ahead: 0,
              behind: 0,
              pendingCommits: 0,
              dirty: false,
              lastSuccessMs: null,
              remoteOid: null,
              attentionPaths: [],
              committed: false,
              pushed: false,
              branch: report.branch,
              originUrl: report.originUrl,
            });
          }
        })
        .catch((error: unknown) => reportError("Could not inspect this vault", error));
    }
    return () => {
      cancelled = true;
    };
  }, [vaults]);

  async function withBusy(vaultId: string, work: () => Promise<void>) {
    setBusyId(vaultId);
    try {
      await work();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm opacity-70">
        Connect a vault to a Git remote to pull on startup and push local checkpoints. Helm stays
        usable with sync off. Sync does not replace one side of a conflict.
      </p>
      {vaults.length > 1 && vaults.some((vault) => syncPrefs(vault).enabled) && (
        <button
          type="button"
          className="btn btn-ghost btn-sm w-fit"
          onClick={() => {
            for (const vault of vaults.filter((item) => syncPrefs(item).enabled)) {
              void syncVault(vault, "sync").catch((error: unknown) =>
                reportError("Sync failed", error),
              );
            }
          }}
        >
          Sync all connected vaults
        </button>
      )}
      {vaults.length === 0 && (
        <p className="text-sm opacity-60">Add a vault before connecting a remote.</p>
      )}
      {vaults.map((vault) => {
        const prefs = syncPrefs(vault);
        const draft = drafts[vault.id] ?? { url: "", branch: "main" };
        const outcome = outcomes[vault.id];
        const label = outcome ? syncLabel(outcome) : prefs.enabled ? "Sync" : "Disabled";
        const busy = busyId === vault.id || outcome?.state === "syncing";
        return (
          <section key={vault.id} className="rounded-xl border border-base-300 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Icon icon="uil:folder" className="h-4 w-4 opacity-70" aria-hidden="true" />
              <h3 className="flex-1 truncate text-sm font-semibold">{vault.name}</h3>
              <span className="text-xs opacity-60">{label}</span>
            </div>
            <p className="mb-3 truncate text-xs opacity-50">{vault.path}</p>
            <label className="mb-2 block text-xs opacity-60" htmlFor={`sync-url-${vault.id}`}>
              Remote URL
            </label>
            <input
              id={`sync-url-${vault.id}`}
              value={draft.url}
              onChange={(event) =>
                setDrafts((current) => ({
                  ...current,
                  [vault.id]: { ...draft, url: event.target.value },
                }))
              }
              placeholder="https://github.com/you/notes.git"
              className="input input-bordered input-sm mb-2 w-full"
            />
            <label className="mb-2 block text-xs opacity-60" htmlFor={`sync-branch-${vault.id}`}>
              Branch
            </label>
            <input
              id={`sync-branch-${vault.id}`}
              value={draft.branch}
              onChange={(event) =>
                setDrafts((current) => ({
                  ...current,
                  [vault.id]: { ...draft, branch: event.target.value },
                }))
              }
              className="input input-bordered input-sm mb-3 w-full"
            />
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy || draft.url.trim() === ""}
                onClick={() =>
                  withBusy(vault.id, async () => {
                    try {
                      const result = await tauriCommands.gitSyncTestConnection(draft.url.trim());
                      if (!result.ok) reportError("Connection failed", new Error(result.message));
                    } catch (error) {
                      reportError("Connection failed", error);
                    }
                  })
                }
              >
                Test connection
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy || draft.url.trim() === "" || draft.branch.trim() === ""}
                onClick={() =>
                  withBusy(vault.id, async () => {
                    try {
                      const next = await tauriCommands.gitSyncPreviewConnect(
                        vault.path,
                        draft.url.trim(),
                        draft.branch.trim(),
                      );
                      setPreview({
                        vaultId: vault.id,
                        url: draft.url.trim(),
                        branch: draft.branch.trim(),
                        preview: next,
                      });
                    } catch (error) {
                      reportError("Could not review this remote", error);
                    }
                  })
                }
              >
                Review files
              </button>
              {prefs.enabled && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() =>
                    withBusy(vault.id, async () => {
                      const accepted = await confirm(
                        `Stop syncing ${vault.name}? Notes, Time Machine snapshots, and Git history stay on disk.`,
                        { title: "Disconnect sync", kind: "warning" },
                      );
                      if (!accepted) return;
                      try {
                        await persistSync(vault, { ...prefs, enabled: false });
                      } catch (error) {
                        reportError("Could not disconnect", error);
                      }
                    })
                  }
                >
                  Disconnect
                </button>
              )}
            </div>
            {preview?.vaultId === vault.id && (
              <div className="mb-3 rounded-lg bg-base-300/40 p-3">
                <p className="mb-2 text-sm">These files will be committed and can be uploaded:</p>
                {preview.preview.files.length === 0 ? (
                  <p className="text-xs opacity-60">
                    No new files. Commits already ahead: {preview.preview.commitsAhead}.
                  </p>
                ) : (
                  <ul className="mb-2 max-h-32 overflow-y-auto text-xs">
                    {preview.preview.files.map((file) => (
                      <li key={file} className="truncate">
                        {file}
                      </li>
                    ))}
                  </ul>
                )}
                {preview.preview.warnings.map((warning) => (
                  <p key={warning} className="mb-2 text-xs opacity-70">
                    {warning}
                  </p>
                ))}
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={busy}
                    onClick={() =>
                      withBusy(vault.id, async () => {
                        try {
                          const result = await tauriCommands.gitSyncConnect(
                            vault.path,
                            preview.url,
                            preview.branch,
                          );
                          useGitSyncStore.getState().setOutcome(vault.id, result.outcome);
                          if (
                            result.outcome.state === "error" ||
                            result.outcome.state === "attention" ||
                            result.outcome.state === "offline"
                          ) {
                            reportError("Could not connect", new Error(result.outcome.message));
                            return;
                          }
                          await persistSync(vault, { ...prefs, enabled: true });
                          setPreview(null);
                          if (prefs.autoPush)
                            await syncVault(
                              { ...vault, sync: { ...prefs, enabled: true } },
                              "sync",
                            );
                        } catch (error) {
                          reportError("Could not connect", error);
                        }
                      })
                    }
                  >
                    Connect
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setPreview(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <label className="label cursor-pointer justify-start gap-3 px-0 py-1">
              <input
                type="checkbox"
                checked={prefs.pullOnStartup}
                onChange={(event) => {
                  void persistSync(vault, { ...prefs, pullOnStartup: event.target.checked }).catch(
                    (error: unknown) => reportError("Could not save sync settings", error),
                  );
                }}
                className="rounded accent-[var(--color-accent)]"
              />
              <span className="label-text">Pull on startup</span>
            </label>
            <label className="label cursor-pointer justify-start gap-3 px-0 py-1">
              <input
                type="checkbox"
                checked={prefs.autoPush}
                onChange={(event) => {
                  void persistSync(vault, { ...prefs, autoPush: event.target.checked }).catch(
                    (error: unknown) => reportError("Could not save sync settings", error),
                  );
                }}
                className="rounded accent-[var(--color-accent)]"
              />
              <span className="label-text">Push after local checkpoints</span>
            </label>
            <p className="mt-2 text-xs opacity-60">
              Last sync: {formatWhen(outcome?.lastSuccessMs ?? null)}
              {outcome ? ` · ${outcome.pendingCommits} to upload` : ""}
            </p>
            {outcome?.message && <p className="mt-1 text-xs opacity-80">{outcome.message}</p>}
            {outcome?.attentionPaths && outcome.attentionPaths.length > 0 && (
              <ul className="mt-1 text-xs opacity-70">
                {outcome.attentionPaths.map((path) => (
                  <li key={path}>{path}</li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-sm"
                disabled={!prefs.enabled || busy}
                onClick={() => void syncVault(vault, "sync")}
              >
                <Icon icon="uil:sync" className="h-4 w-4" aria-hidden="true" />
                Sync now
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={!prefs.enabled || busy}
                onClick={() => void syncVault(vault, "pull")}
              >
                Pull
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={!prefs.enabled || busy}
                onClick={() => void syncVault(vault, "push")}
              >
                Push
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
