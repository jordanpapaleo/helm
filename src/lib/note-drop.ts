import { useGitSyncStore } from "../store/git-sync";
import { useNoteStore } from "../store/notes";
import { reportError } from "../store/toast";
import type { Note } from "../types/note";
import { serializeNote } from "./note-parser";
import { flushPendingSavesSettled } from "./pending-saves";
import { isValidTagName, normalizeTagName } from "./tags";
import { tauriCommands } from "./tauri-commands";
import { nowTimestamp } from "./timestamps";

/**
 * Save any debounced editor text before a drop changes the file.
 * A move that runs first would leave those edits at the old path. A tag write
 * that used the pre-flush body would replace them.
 * Returns null when that save failed — the drop must not continue.
 */
async function noteAfterPendingSave(note: Note, action: "move" | "tag"): Promise<Note | null> {
  const { failed } = await flushPendingSavesSettled();
  if (failed > 0) {
    reportError(
      action === "move" ? "Failed to move note" : "Failed to add tag",
      new Error("Pending edits could not be saved"),
    );
    return null;
  }
  return useNoteStore.getState().notes.find((item) => item.id === note.id) ?? null;
}

function vaultPathOf(note: Note): string | null {
  return useNoteStore.getState().vaults.find((vault) => vault.id === note.vaultId)?.path ?? null;
}

/**
 * Move a note into a folder. Same result as the note list "Move to…" command:
 * rename the file, keep the id and the body. Already living in that folder is
 * a no-op and does not touch disk.
 */
export async function moveNoteToFolder(note: Note, folderPath: string): Promise<void> {
  if (`${folderPath}/${note.fileName}` === note.filePath) return;
  const current = await noteAfterPendingSave(note, "move");
  if (!current) return;
  const newFilePath = `${folderPath}/${current.fileName}`;
  if (newFilePath === current.filePath) return;
  try {
    await tauriCommands.renameNote(current.filePath, newFilePath);
    useNoteStore.getState().updateNote({
      ...current,
      filePath: newFilePath,
      fileName: newFilePath.split("/").pop() ?? current.fileName,
    });
  } catch (error) {
    reportError("Failed to move note", error);
  }
}

/**
 * Add a sidebar tag to a note. The markdown body is kept. A tag the note
 * already has, a locked note, or a note sync is holding is left unchanged.
 */
export async function addTagFromDrop(note: Note, tag: string): Promise<void> {
  const name = normalizeTagName(tag);
  if (!isValidTagName(name)) return;
  if (note.frontmatter.locked) {
    reportError("Unlock the note before adding a tag", new Error("Note is locked"));
    return;
  }
  const current = await noteAfterPendingSave(note, "tag");
  if (!current) return;
  if (current.frontmatter.locked) {
    reportError("Unlock the note before adding a tag", new Error("Note is locked"));
    return;
  }
  if (useGitSyncStore.getState().isWriteBlocked(current.id, vaultPathOf(current))) return;
  if ((current.frontmatter.tags ?? []).includes(name)) return;
  const updated: Note = {
    ...current,
    content: current.content,
    frontmatter: {
      ...current.frontmatter,
      tags: [...(current.frontmatter.tags ?? []), name],
      updated: nowTimestamp(),
    },
  };
  try {
    await tauriCommands.writeNote(updated.filePath, serializeNote(updated));
    useNoteStore.getState().updateNote(updated);
  } catch (error) {
    reportError("Failed to add tag", error);
  }
}
