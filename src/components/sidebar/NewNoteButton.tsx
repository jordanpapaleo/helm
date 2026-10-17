import { createNote, creationTargetFromUI } from "../../lib/create-note";
import { useNoteStore } from "../../store/notes";
import { NewNoteMenu } from "./NewNoteMenu";

export function NewNoteButton() {
  const { vaults, activeVaultId } = useNoteStore();
  const vault = vaults.find((v) => v.id === activeVaultId) ?? vaults[0];

  return (
    <NewNoteMenu
      ariaLabel="New note"
      icon="uil:plus"
      disabled={!vault}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40"
      onSelect={(templateId) => {
        void createNote({ ...creationTargetFromUI(), templateId });
      }}
    >
      <span>New Note</span>
    </NewNoteMenu>
  );
}
