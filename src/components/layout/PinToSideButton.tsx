import { Icon } from "@iconify/react";
import { pinNoteToSide, unpinNoteFromSide, usePinnedPanelStore } from "../../store/pinned-panel";

/**
 * Pins the given note into the right panel. `noteId` is the note this control
 * acts on — the open note in the editor, which can differ from the tab on screen.
 */
export function PinToSideButton({
  noteId,
  variant,
}: {
  noteId: string | null;
  variant: "toolbar" | "editor";
}) {
  const pinned = usePinnedPanelStore((state) => (noteId ? state.noteIds.includes(noteId) : false));
  const label = pinned ? "Unpin from side" : "Pin to side";
  const className =
    variant === "toolbar"
      ? "workspace-toolbar-button"
      : `inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-[var(--color-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-40 ${
          pinned
            ? "text-[var(--color-accent)]"
            : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        }`;
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      aria-pressed={pinned}
      title={noteId ? label : "Open a note to pin it"}
      disabled={!noteId}
      onClick={() => {
        if (!noteId) return;
        if (pinned) unpinNoteFromSide(noteId);
        else pinNoteToSide(noteId);
      }}
    >
      <Icon icon="uil:columns" className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
