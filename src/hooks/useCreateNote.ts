import { ulid } from "ulid";
import { noteFilePath, serializeNote } from "../lib/note-parser";
import { tauriCommands } from "../lib/tauri-commands";
import { nowTimestamp } from "../lib/timestamps";
import { useNoteStore } from "../store/notes";
import { reportError } from "../store/toast";
import { useUIStore } from "../store/ui";
import type { Note } from "../types/note";

export function useCreateNote() {
  const { vaults, activeVaultId, addNote, selectNote } = useNoteStore();
  const { setView } = useUIStore();

  const vault = vaults.find((v) => v.id === activeVaultId) ?? vaults[0];

  async function createNote() {
    if (!vault) return;

    const id = ulid();
    const title = "Untitled";
    const filePath = noteFilePath(vault.path, id.toLowerCase());
    const fileName = filePath.split("/").at(-1) ?? "";
    const now = nowTimestamp();

    const note: Note = {
      id,
      filePath,
      fileName,
      content: "",
      vaultId: vault.id,
      frontmatter: {
        id,
        title,
        created: now,
        updated: now,
        tags: [],
        urgent: false,
        important: false,
        state: "Prepare",
        blocked: false,
        links: [],
      },
    };

    try {
      await tauriCommands.writeNote(filePath, serializeNote(note));
      addNote(note);
      selectNote(id);
      setView("notes");
    } catch (e) {
      reportError("Failed to create note", e);
    }
  }

  return { createNote, canCreate: !!vault };
}
