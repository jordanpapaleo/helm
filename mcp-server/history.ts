/**
 * Note history for the MCP server — mirrors the conventions in
 * src-tauri/src/vault.rs (snapshot_note_impl): snapshots live at
 * <vault>/.helm-history/<note-id>/<epoch-ms>.md, coalesced and pruned.
 * KEEP IN SYNC with the Rust implementation so both writers share one history.
 */
import fs from "node:fs";
import path from "node:path";

export interface HistoryEntry {
  /** Snapshot time as unix epoch milliseconds (also the filename stem) */
  tsMs: number;
  path: string;
}

/** Default coalescing window — matches HISTORY_MIN_AGE_SECS in vault.rs. */
export const HISTORY_MIN_AGE_MS = 300_000;
/** Default retention — matches HISTORY_MAX_KEEP in vault.rs. */
export const HISTORY_MAX_KEEP = 50;

function historyDir(vaultPath: string, noteId: string): string {
  // Note ids are ULIDs (alphanumeric); reject anything else so an id can
  // never become a path traversal vector.
  if (!noteId || !/^[a-zA-Z0-9]+$/.test(noteId)) {
    throw new Error(`Invalid note id: ${noteId}`);
  }
  return path.join(vaultPath, ".helm-history", noteId);
}

export function listNoteHistory(vaultPath: string, noteId: string): HistoryEntry[] {
  const dir = historyDir(vaultPath, noteId);
  if (!fs.existsSync(dir)) return [];
  const entries: HistoryEntry[] = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".md")) continue;
    const tsMs = Number.parseInt(file.slice(0, -3), 10);
    if (Number.isNaN(tsMs)) continue;
    entries.push({ tsMs, path: path.join(dir, file) });
  }
  entries.sort((a, b) => b.tsMs - a.tsMs);
  return entries;
}

/**
 * Snapshot the note's current on-disk content. Skips when the newest snapshot
 * is younger than `minAgeMs` (coalescing rapid writes); pass 0 to force a
 * snapshot (before deletes and restores). Prunes to the `maxKeep` newest.
 */
export function snapshotNoteFile(
  vaultPath: string,
  noteId: string,
  filePath: string,
  minAgeMs: number = HISTORY_MIN_AGE_MS,
  maxKeep: number = HISTORY_MAX_KEEP,
): void {
  const dir = historyDir(vaultPath, noteId);
  if (!fs.existsSync(filePath)) return; // nothing to snapshot (new note)

  const existing = listNoteHistory(vaultPath, noteId);
  const nowMs = Date.now();
  // Clamp like Rust's saturating_sub: a same-millisecond bumped snapshot can
  // sit "in the future", which must not coalesce away a forced (minAgeMs=0) one.
  if (existing.length > 0 && Math.max(0, nowMs - existing[0].tsMs) < minAgeMs) return;

  fs.mkdirSync(dir, { recursive: true });
  // Never older than the newest snapshot. A same-millisecond bump can sit ahead
  // of the clock; after prune frees that earlier name, reusing it would make
  // the newest file hold an older body.
  let ts = nowMs;
  if (existing.length > 0 && ts <= existing[0].tsMs) ts = existing[0].tsMs + 1;
  while (fs.existsSync(path.join(dir, `${ts}.md`))) ts += 1;
  fs.copyFileSync(filePath, path.join(dir, `${ts}.md`));

  const entries = listNoteHistory(vaultPath, noteId);
  for (const old of entries.slice(maxKeep)) {
    try {
      fs.unlinkSync(old.path);
    } catch {
      // best-effort prune
    }
  }
}
