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
      : `btn btn-ghost btn-sm btn-square hover:opacity-100 ${
          pinned ? "text-[var(--color-primary)] opacity-100" : "opacity-60"
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
