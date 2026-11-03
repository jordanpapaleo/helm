import { Icon } from "@iconify/react";
import { memo } from "react";
import { pinNoteToSide, unpinNoteFromSide, usePinnedPanelStore } from "../../store/pinned-panel";

/**
 * Pins the given note into the right panel. `noteId` is the note this control
 * acts on — the open note in the editor, which can differ from the tab on screen.
 */
export const PinToSideButton = memo(function PinToSideButton({
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
      : `btn btn-ghost btn-sm btn-square ${
          pinned ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"
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
      <Icon
        id={variant === "editor" ? "note-heading-pin-to-side" : "toolbar-pin-to-side"}
        icon="uil:columns"
        className="h-4 w-4"
        aria-hidden="true"
      />
    </button>
  );
});
