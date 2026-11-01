import { Icon } from "@iconify/react";
import { useState } from "react";
import { useNoteStore } from "../store/notes";
import { DuplicateIdsModal } from "./DuplicateIdsModal";

/**
 * Non-blocking banner shown while any frontmatter id is held by more than one
 * file. It stays until every group is resolved; "Review" opens the fix-up modal.
 */
export function DuplicateIdsAlert() {
  const count = useNoteStore((s) => s.duplicateGroups.length);
  const [open, setOpen] = useState(false);

  return (
    <>
      {count > 0 && (
        <div
          role="status"
          className="alert alert-warning alert-soft rounded-none px-4 py-2 text-sm"
        >
          <Icon icon="uil:exclamation-triangle" aria-hidden="true" />
          <span className="min-w-0">
            {count === 1
              ? "1 note ID is used by more than one file."
              : `${count} note IDs are used by more than one file.`}{" "}
            Helm is showing one copy of each.
          </span>
          <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
            Review duplicates
          </button>
        </div>
      )}
      {open && <DuplicateIdsModal onClose={() => setOpen(false)} />}
    </>
  );
}
