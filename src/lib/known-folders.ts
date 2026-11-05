import { useNoteStore } from "../store/notes";

// Folder listings replace the sidebar wholesale. A create that lands while a
// listing is in flight, or a listing that fails, must not wipe the new folder.
let folderListEpoch = 0;

export function currentFolderListEpoch(): number {
  return folderListEpoch;
}

/** Keep a just-created folder visible and drop listings that started earlier. */
export function rememberCreatedFolder(path: string): void {
  folderListEpoch += 1;
  const normalized = path.replace(/\/+$/, "");
  const { knownFolderPaths, setKnownFolderPaths } = useNoteStore.getState();
  const alreadyKnown = knownFolderPaths.some((item) => item.replace(/\/+$/, "") === normalized);
  if (!alreadyKnown) setKnownFolderPaths([...knownFolderPaths, normalized]);
}

type VaultListing = { path: string; listing: readonly string[] | null };

function vaultRoot(path: string): string {
  return path.replace(/\/+$/, "");
}

/** The refreshed vault that contains this folder. A nested vault wins over its parent. */
function owningVault(path: string, vaults: readonly VaultListing[]): VaultListing | undefined {
  const normalized = vaultRoot(path);
  let best: VaultListing | undefined;
  let bestLength = -1;
  for (const vault of vaults) {
    const root = vaultRoot(vault.path);
    if (root.length <= bestLength) continue;
    if (normalized === root || normalized.startsWith(`${root}/`)) {
      best = vault;
      bestLength = root.length;
    }
  }
  return best;
}

/**
 * Folder list that should replace the sidebar, or null when this refresh started
 * before a folder was created. A vault whose listing failed keeps its current
 * paths. Successful listings replace only that vault's paths.
 */
export function nextKnownFolderPaths(
  startedEpoch: number,
  current: readonly string[],
  vaults: readonly VaultListing[],
): string[] | null {
  if (startedEpoch !== folderListEpoch) return null;
  const next: string[] = [];
  const seen = new Set<string>();
  function add(path: string) {
    const normalized = vaultRoot(path);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    next.push(normalized);
  }
  for (const path of current) {
    const owner = owningVault(path, vaults);
    if (owner?.listing === null) add(path);
  }
  for (const vault of vaults) {
    if (vault.listing === null) continue;
    for (const path of vault.listing) add(path);
  }
  return next;
}
