import { ulid } from "ulid";
import { noteFilePath, serializeNote } from "../../lib/note-parser";
import { tauriCommands } from "../../lib/tauri-commands";
import { nowTimestamp } from "../../lib/timestamps";
import { useNoteStore } from "../../store/notes";
import { reportError } from "../../store/toast";
import { useUIStore } from "../../store/ui";
import type { Note } from "../../types/note";

export function NewNoteButton() {
  const { vaults, activeVaultId, addNote, selectNote } = useNoteStore();
  const { setView } = useUIStore();

  // Create in the active vault, or the first vault available
  const vault = vaults.find((v) => v.id === activeVaultId) ?? vaults[0];

  async function handleCreate() {
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

  return (
    <button
      type="button"
      onClick={handleCreate}
      disabled={!vault}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <span className="text-base leading-none">+</span>
      <span>New Note</span>
    </button>
  );
}
