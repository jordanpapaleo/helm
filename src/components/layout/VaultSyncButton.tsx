import { Icon } from "@iconify/react";
import { syncLabel, syncPrefs } from "../../lib/git-sync";
import { syncVault } from "../../lib/git-sync-runtime";
import { useGitSyncStore } from "../../store/git-sync";
import { reportError } from "../../store/toast";
import type { VaultConfig } from "../../types/note";

function iconFor(state: string | undefined): string {
  if (state === "attention" || state === "error") return "uil:exclamation-triangle";
  if (state === "offline") return "uil:cloud-slash";
  if (state === "pending") return "uil:cloud-upload";
  if (state === "syncing") return "uil:sync";
  return "uil:cloud-check";
}

/** Per-vault sync status and Sync now, next to the vault selector. */
export function VaultSyncButton({ vault }: { vault: VaultConfig }) {
  const outcome = useGitSyncStore((state) => state.byVaultId[vault.id]);
  if (!syncPrefs(vault).enabled) return null;
  const label = outcome ? syncLabel(outcome) : "Sync";
  return (
    <button
      type="button"
      title={outcome?.message ? `${label}. ${outcome.message}` : label}
      aria-label={`${label} ${vault.name}`}
      className="btn btn-ghost btn-xs btn-square"
      onClick={(event) => {
        event.stopPropagation();
        void syncVault(vault, "sync").catch((error: unknown) => reportError("Sync failed", error));
      }}
    >
      <Icon icon={iconFor(outcome?.state)} className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}
