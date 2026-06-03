import { ulid } from "ulid";
import { noteFilePath, serializeNote } from "../lib/note-parser";
import { tauriCommands } from "../lib/tauri-commands";
import { useNoteStore } from "../store/notes";
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

    const note: Note = {
      id,
      filePath,
      fileName,
      content: "",
      vaultId: vault.id,
      frontmatter: {
        id,
        title,
        created: new Date().toISOString().split("T")[0],
        updated: new Date().toISOString().split("T")[0],
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
      console.error("Failed to create note:", e);
    }
  }

  return { createNote, canCreate: !!vault };
}
