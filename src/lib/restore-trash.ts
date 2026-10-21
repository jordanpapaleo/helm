import { reportError } from "../store/toast";
import type { TrashItem } from "../store/trash";

export interface TrashRestorePlan {
  /** Snapshots that can be written back without sharing a path. */
  restore: TrashItem[];
  /** Left in Trash because their path is already taken. */
  held: TrashItem[];
}

/**
 * Restore at most one snapshot per file path.
 *
 * Paths already used by live notes start out taken, and each snapshot chosen
 * for restore claims its path for the rest of the batch. A later snapshot with
 * that path stays in Trash so Restore all cannot write it over the earlier one
 * and then drop it. Trash order is newest first, so the newest snapshot keeps
 * the historical path; older ones wait until that path is free.
 */
export function planTrashRestore(
  items: TrashItem[],
  occupiedPaths: Iterable<string>,
): TrashRestorePlan {
  const taken = new Set(occupiedPaths);
  const restore: TrashItem[] = [];
  const held: TrashItem[] = [];
  for (const item of items) {
    const path = item.note.filePath;
    if (taken.has(path)) {
      held.push(item);
      continue;
    }
    taken.add(path);
    restore.push(item);
  }
  return { restore, held };
}

/** Tell the user which snapshots stayed in Trash, and why. */
export function reportPathCollisions(held: TrashItem[]): void {
  if (held.length === 0) return;
  const paths = [...new Set(held.map((item) => item.note.filePath))];
  const notes = held.length === 1 ? "note" : "notes";
  reportError(
    `Kept ${held.length} ${notes} in Trash`,
    new Error(
      `${paths.join(", ")} already has a note. Move that note, then restore what is still in Trash.`,
    ),
  );
}
