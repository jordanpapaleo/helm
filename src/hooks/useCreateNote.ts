import { createNote, creationTargetFromUI } from "../lib/create-note";
import { useNoteStore } from "../store/notes";

/** Programmatic New Note. Pass a template id, or null for a blank note. */
export function useCreateNote() {
  const vaults = useNoteStore((s) => s.vaults);
  const activeVaultId = useNoteStore((s) => s.activeVaultId);
  const vault = vaults.find((v) => v.id === activeVaultId) ?? vaults[0];

  function create(templateId: string | null = null) {
    return createNote({ ...creationTargetFromUI(), templateId });
  }

  return { createNote: create, canCreate: !!vault };
}
