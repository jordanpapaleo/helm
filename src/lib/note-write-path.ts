import { useNoteStore } from "../store/notes";
import { tauriCommands } from "./tauri-commands";

/**
 * Per-note write chain. Frontmatter edits, body saves, and renames share it so
 * one note cannot be written to two paths at once.
 *
 * The slot is removed once that chain settles. A later write then starts in
 * the caller's turn. Chaining on an already-settled promise would defer the
 * write by a microtask, so a blur save would not reach disk before the
 * handler returned, and that deferred write could land in the next edit.
 */
const inflight = new Map<string, { tail: Promise<void> }>();
/**
 * Note ids whose queued task is still inside its synchronous start. A rename
 * flushes a pending body save before its first await; that save must run now
 * or the rename would wait on a chain that is waiting on the rename.
 * A click that arrives while the task is suspended at `await` queues instead.
 */
const syncStart = new Set<string>();

/**
 * Path captured when a body save is first scheduled. A later store update must
 * not replace it: that update may point at a slug that is not a file yet.
 */
const scheduledPaths = new Map<string, string>();

/** Last path we proved was on disk. A flush can fall back to it. */
const existingPaths = new Map<string, string>();

export function enqueueNoteWrite<T>(noteId: string, task: () => Promise<T>): Promise<T> {
  if (syncStart.has(noteId)) return task();
  const execute = (): Promise<T> => {
    syncStart.add(noteId);
    let result: Promise<T>;
    try {
      // task() runs until its first await. Nested flushes see syncStart and
      // run inline. Clearing it here lets a later click queue behind this one.
      result = Promise.resolve(task());
    } catch (error) {
      syncStart.delete(noteId);
      return Promise.reject(error);
    }
    syncStart.delete(noteId);
    return result;
  };
  const previous = inflight.get(noteId);
  // An idle note starts the task now, so write_note is reached before the
  // caller returns when the path does not need a disk probe.
  const run = previous ? previous.tail.then(execute, execute) : execute();
  const entry = { tail: Promise.resolve() };
  inflight.set(noteId, entry);
  entry.tail = run.then(
    () => {
      if (inflight.get(noteId) === entry) inflight.delete(noteId);
    },
    () => {
      if (inflight.get(noteId) === entry) inflight.delete(noteId);
    },
  );
  return run;
}

/** Path to write without reading the disk, or null when the path changed. */
export function immediateNoteWritePath(noteId: string, enqueuedPath: string): string | null {
  const current =
    useNoteStore.getState().notes.find((note) => note.id === noteId)?.filePath ?? enqueuedPath;
  const remembered = existingPaths.get(noteId);
  if (current === enqueuedPath && (!remembered || remembered === current)) {
    existingPaths.set(noteId, current);
    return current;
  }
  return null;
}

/** Keep the path from the first keystroke of a pending save. */
export function rememberNotePath(noteId: string, filePath: string): void {
  if (!noteId || !filePath || scheduledPaths.has(noteId)) return;
  scheduledPaths.set(noteId, filePath);
}

export function forgetScheduledPath(noteId: string): void {
  scheduledPaths.delete(noteId);
}

/** Path bound when the save was scheduled, then the note's path at call time. */
export function takeScheduledPath(noteId: string, fallback: string): string {
  const path = scheduledPaths.get(noteId) ?? fallback;
  scheduledPaths.delete(noteId);
  return path;
}

async function noteFileExists(filePath: string): Promise<boolean> {
  try {
    await tauriCommands.readNote(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Choose a path that is already a file. `write_note` creates whatever path it
 * is given, so a store path that only looks like the slug must not be used
 * until that file exists. Order: the store path, the path captured at enqueue,
 * then the last path we successfully read.
 */
export async function resolveNoteWritePath(
  noteId: string,
  enqueuedPath: string,
): Promise<string | null> {
  const current =
    useNoteStore.getState().notes.find((note) => note.id === noteId)?.filePath ?? enqueuedPath;
  const remembered = existingPaths.get(noteId);
  // The usual save still targets the file the edit started on. Existence is
  // checked only after a rename or a watcher points the store at a different
  // path, because that is when write_note would create a second file.
  if (current === enqueuedPath && (!remembered || remembered === current)) {
    existingPaths.set(noteId, current);
    return current;
  }
  if (await noteFileExists(current)) {
    existingPaths.set(noteId, current);
    return current;
  }
  if (enqueuedPath !== current && (await noteFileExists(enqueuedPath))) {
    existingPaths.set(noteId, enqueuedPath);
    return enqueuedPath;
  }
  if (remembered && remembered !== current && (await noteFileExists(remembered))) {
    return remembered;
  }
  return null;
}
