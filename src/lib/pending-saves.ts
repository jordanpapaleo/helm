/**
 * Registry of debounced-autosave flushers. Editors register here so the app
 * can flush any pending (not-yet-fired) saves before the window closes —
 * otherwise edits made within the debounce window are silently lost on quit.
 */

export interface SaveFlusher {
  /** True when a debounced save is scheduled but hasn't written yet. */
  isPending: () => boolean;
  /** Cancel the timer and write immediately. */
  flush: () => void | Promise<void>;
}

const flushers = new Map<string, SaveFlusher>();

export function registerSaveFlusher(key: string, flusher: SaveFlusher): void {
  flushers.set(key, flusher);
}

export function unregisterSaveFlusher(key: string): void {
  flushers.delete(key);
}

export function hasPendingSaves(): boolean {
  return [...flushers.values()].some((f) => f.isPending());
}

/** Flush every pending save and report how many failed. A failure does not block the others. */
export async function flushPendingSavesSettled(): Promise<{ failed: number }> {
  const pending = [...flushers.values()].filter((f) => f.isPending());
  const results = await Promise.allSettled(pending.map((f) => f.flush()));
  return { failed: results.filter((result) => result.status === "rejected").length };
}

/** Flush every pending save; a failing flusher never blocks the others. */
export async function flushPendingSaves(): Promise<void> {
  await flushPendingSavesSettled();
}
