/**
 * Fixes for two files that share a frontmatter id (see duplicate-ids.ts).
 * Both go through the normal write path and leave the other copy untouched,
 * so frontmatter links elsewhere keep pointing at the id that stays.
 */
import { ulid } from "ulid";
import { useNoteStore } from "../store/notes";
import { reportError } from "../store/toast";
import { useTrashStore } from "../store/trash";
import type { Note } from "../types/note";
import { parseNote, serializeNote } from "./note-parser";
import { flushPendingSavesSettled } from "./pending-saves";
import { tauriCommands } from "./tauri-commands";
import { nowTimestamp } from "./timestamps";

function withId(note: Note, id: string): Note {
  return { ...note, id, frontmatter: { ...note.frontmatter, id } };
}

/**
 * Mint a fresh ULID for one copy and write it atomically. The body and every
 * other field are read back from disk first so nothing else changes.
 */
export async function giveNoteNewId(note: Note): Promise<Note | null> {
  try {
    await flushPendingSavesSettled();
    const parsed = parseNote(await tauriCommands.readNote(note.filePath), note.filePath);
    const fresh = withId({ ...parsed, vaultId: note.vaultId }, ulid());
    const updated: Note = {
      ...fresh,
      frontmatter: { ...fresh.frontmatter, updated: nowTimestamp() },
    };
    await tauriCommands.writeNote(note.filePath, serializeNote(updated));
    useNoteStore.getState().updateNote(updated);
    return updated;
  } catch (e) {
    reportError("Failed to give the note a new ID", e);
    return null;
  }
}

/**
 * Delete one copy's file and put it in Trash. The trashed entry gets its own
 * id so restoring it later does not recreate the conflict, and so it cannot
 * collide with the copy that keeps the id in Trash bookkeeping.
 */
export async function trashDuplicateCopy(note: Note): Promise<boolean> {
  if (note.frontmatter.locked) {
    reportError("Unlock the note before moving it to Trash", new Error("Note is locked"));
    return false;
  }
  try {
    await flushPendingSavesSettled();
    const content = await tauriCommands.readNote(note.filePath);
    const parsed = { ...parseNote(content, note.filePath), vaultId: note.vaultId };
    await tauriCommands.deleteNote(note.filePath);
    useTrashStore.getState().addToTrash(withId(parsed, ulid()));
    useNoteStore.getState().removeNoteAtPath(note.filePath);
    return true;
  } catch (e) {
    reportError("Failed to move the copy to Trash", e);
    return false;
  }
}
