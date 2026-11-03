/**
 * One overwrite path for a note that already exists.
 *
 * A queued write must not replace a file whose body is newer than the
 * in-memory note. History snapshots the previous file only when this write
 * changes the body. Frontmatter-only edits (header, Properties, pin, lock,
 * unmanaged, archive) do not snapshot.
 *
 * Callers already inside the note's queue call `commitExistingNote`.
 * Queueing again on the same id would wait on the running task.
 */
import matter from "gray-matter";
import { useNoteStore } from "../store/notes";
import { reportError } from "../store/toast";
import type { Note } from "../types/note";
import { normalizeContent, parseNote, serializeNote } from "./note-parser";
import { enqueueNoteWrite, resolveNoteWritePath } from "./note-write-path";
import { tauriCommands } from "./tauri-commands";
import { normalizeTimestamp } from "./timestamps";

export type ExistingNoteWriteResult =
  | { ok: true; wrote: boolean; note: Note; fromDisk: boolean }
  | {
      ok: false;
      reason: "missing" | "id-conflict" | "newer-body" | "failed";
      error?: unknown;
      note?: Note;
    };

export interface ExistingNoteWrite {
  noteId: string;
  /** Path captured when the edit was requested. */
  enqueuedPath: string;
  /** Store `updated` from before this edit. A later file stamp wins. */
  beforeUpdated: string | undefined;
  /**
   * Body from before this edit. The store may already show the new body, so
   * a snapshot compares against this when the file itself is not newer.
   */
  previousContent?: string;
  /** Used when the store has no copy yet (repair, a file the watcher just read). */
  fallback?: Note;
  /** Skips the vault lookup. `null` means there is nowhere to snapshot. */
  vaultPath?: string | null;
  /**
   * `resolve` picks a path that is already a file. `exact` reads and writes
   * `enqueuedPath` only, so a duplicate copy is not saved onto the keeper.
   */
  pathSource?: "resolve" | "exact";
  /** Read the file and edit that, even when its `updated` is not newer. */
  preferDisk?: boolean;
  /**
   * Refuse the write when the file is newer and its body differs from this
   * text. Editor saves use it so a stale draft cannot replace the newer body.
   */
  refuseIfBodyDiffers?: string;
  /** When the snapshot and the write succeed. Default true. */
  updateStore?: boolean;
  /** Runs before the store adopts a newer disk body that this write will not replace. */
  onDiskKept?: () => void;
  /** Publish the note in the store before `writeNote` returns. */
  mirrorBeforeWrite?: boolean;
  /** Skip toasts. A batch reports one summary of its own. */
  silent?: boolean;
  /** Let the caller toast. Rename does this so a failure still rejects. */
  throwOnFailure?: boolean;
  failureMessage: string;
  /**
   * `base` is the latest store note, or the on-disk note when that file is
   * newer (or when `preferDisk` is set). Return null to skip the write.
   */
  apply: (base: Note, fromDisk: boolean) => Note | null;
}

/** `updated` as stored in the file, ignoring the clock parseNote fills in. */
function fileUpdated(raw: string): string | undefined {
  try {
    return normalizeTimestamp(matter(raw).data.updated);
  } catch {
    return undefined;
  }
}

function stampMillis(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const iso = value.length === 10 ? `${value}T00:00:00Z` : value;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? undefined : time;
}

function diskIsNewer(raw: string, beforeUpdated: string | undefined): boolean {
  const diskMillis = stampMillis(fileUpdated(raw));
  const storeMillis = stampMillis(beforeUpdated);
  return diskMillis !== undefined && storeMillis !== undefined && diskMillis > storeMillis;
}

function noteFromDisk(raw: string, path: string, current: Note): Note {
  const disk = parseNote(raw, path);
  const fileName = path.split("/").pop() ?? current.fileName;
  return {
    ...current,
    content: disk.content,
    filePath: path,
    fileName,
    id: current.id,
    vaultId: current.vaultId,
    frontmatter: { ...disk.frontmatter, id: current.frontmatter.id || current.id },
  };
}

function fail(
  request: ExistingNoteWrite,
  reason: "missing" | "id-conflict" | "newer-body" | "failed",
  error: unknown,
  note?: Note,
): ExistingNoteWriteResult {
  if (request.throwOnFailure) throw error instanceof Error ? error : new Error(String(error));
  if (!request.silent) reportError(request.failureMessage, error);
  return { ok: false, reason, error, note };
}

async function readFile(path: string): Promise<string | undefined> {
  try {
    return await tauriCommands.readNote(path);
  } catch {
    return undefined;
  }
}

async function snapshot(vaultPath: string | null, noteId: string, path: string): Promise<void> {
  if (!vaultPath || !noteId) return;
  try {
    await tauriCommands.snapshotNote(vaultPath, noteId, path);
  } catch {
    /* snapshotting must never block a save */
  }
}

export async function commitExistingNote(
  request: ExistingNoteWrite,
): Promise<ExistingNoteWriteResult> {
  const store = useNoteStore.getState();
  const loaded = store.notes.find((item) => item.id === request.noteId);
  const current = loaded ?? request.fallback;
  const pathSource = request.pathSource ?? "resolve";
  const path =
    pathSource === "exact"
      ? request.enqueuedPath
      : await resolveNoteWritePath(request.noteId, request.enqueuedPath);
  if (!path || !current) {
    return fail(request, "missing", new Error("The note file is not on disk"));
  }

  const raw = await readFile(path);
  const newer = raw !== undefined && diskIsNewer(raw, request.beforeUpdated);
  const fromDisk = raw !== undefined && (request.preferDisk === true || newer);
  let base = current;
  if (fromDisk && raw !== undefined) {
    const disk = parseNote(raw, path);
    if (disk.id && disk.id !== current.id) {
      return fail(request, "id-conflict", new Error("A different note is at this path"));
    }
    if (
      newer &&
      request.refuseIfBodyDiffers !== undefined &&
      normalizeContent(disk.content) !== normalizeContent(request.refuseIfBodyDiffers)
    ) {
      const kept = noteFromDisk(raw, path, current);
      request.onDiskKept?.();
      if (request.updateStore !== false) store.updateNote(kept);
      if (!request.silent) {
        reportError(
          "This note changed on disk",
          new Error("The newer text was kept. This edit was not saved."),
        );
      }
      return { ok: false, reason: "newer-body", note: kept };
    }
    if (newer && normalizeContent(disk.content) !== normalizeContent(current.content)) {
      if (!request.silent) {
        reportError(
          "This note changed on disk",
          new Error("The newer text was kept. This change was saved on top of it."),
        );
      }
    }
    base = noteFromDisk(raw, path, current);
  }

  const fileName = path.split("/").pop() ?? base.fileName;
  const applied = request.apply({ ...base, filePath: path, fileName }, fromDisk);
  if (!applied)
    return { ok: true, wrote: false, note: { ...base, filePath: path, fileName }, fromDisk };

  const target: Note = { ...applied, filePath: path, fileName };
  const vaultPath =
    request.vaultPath !== undefined
      ? request.vaultPath
      : (store.vaults.find((vault) => vault.id === target.vaultId)?.path ?? null);
  if (request.mirrorBeforeWrite && request.updateStore !== false) {
    useNoteStore.getState().updateNote(target);
  }
  // History is the note body. A pin, lock, archive, or other frontmatter
  // edit leaves the body and skips the snapshot. The store may already
  // contain the new body, so the pre-edit text is the comparison when the
  // file on disk is not the base.
  const previousBody = fromDisk ? base.content : (request.previousContent ?? base.content);
  if (normalizeContent(target.content) !== normalizeContent(previousBody)) {
    await snapshot(vaultPath, target.id, path);
  }
  try {
    await tauriCommands.writeNote(path, serializeNote(target));
  } catch (error) {
    return fail(request, "failed", error);
  }
  if (request.updateStore !== false) useNoteStore.getState().updateNote(target);
  return { ok: true, wrote: true, note: target, fromDisk };
}

export function queueExistingNoteWrite(
  request: ExistingNoteWrite,
): Promise<ExistingNoteWriteResult> {
  return enqueueNoteWrite(request.noteId, () => commitExistingNote(request));
}
