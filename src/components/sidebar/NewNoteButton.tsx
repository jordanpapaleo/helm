import { ulid } from "ulid";
import { noteFilePath, serializeNote } from "../../lib/note-parser";
import { tauriCommands } from "../../lib/tauri-commands";
import { useNoteStore } from "../../store/notes";
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
