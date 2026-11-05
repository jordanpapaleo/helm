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

/**
 * Listing that should replace the sidebar, or null to keep what is shown.
 * `listings` entries are null when that vault could not be read.
 */
export function nextKnownFolderPaths(
  startedEpoch: number,
  listings: ReadonlyArray<readonly string[] | null>,
): string[] | null {
  if (startedEpoch !== folderListEpoch) return null;
  const paths: string[] = [];
  for (const listing of listings) {
    if (listing === null) return null;
    paths.push(...listing);
  }
  return paths;
}
