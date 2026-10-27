import type { DragEvent } from "react";

/** Custom drag payload. The note body is never placed in the drag data. */
export const NOTE_DRAG_MIME = "application/x-helm-note";

export function folderDropId(folderPath: string): string {
  return `folder:${folderPath}`;
}

export function tagDropId(tag: string): string {
  return `tag:${tag}`;
}

/**
 * Start a note drag.
 *
 * Only the note id is stored. `text/plain` and `text/html` stay empty so a drop
 * on the editor cannot insert the note body.
 */
export function writeNoteDrag(dataTransfer: DataTransfer, noteId: string): void {
  dataTransfer.setData(NOTE_DRAG_MIME, noteId);
  dataTransfer.setData("text/plain", "");
  dataTransfer.setData("text/html", "");
  dataTransfer.effectAllowed = "copyMove";
}

export function dragCarriesNote(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types).includes(NOTE_DRAG_MIME);
}

export function readDroppedNoteId(dataTransfer: DataTransfer | null): string | null {
  if (!dragCarriesNote(dataTransfer) || !dataTransfer) return null;
  const id = dataTransfer.getData(NOTE_DRAG_MIME).trim();
  return id || null;
}

function pointerStillInside(event: DragEvent<HTMLElement>): boolean {
  const next = event.relatedTarget;
  return next instanceof Node && event.currentTarget.contains(next);
}

export function noteDropHandlers(
  onDropNote: (noteId: string) => void,
  setOver: (over: boolean) => void,
): {
  onDragEnter: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
} {
  return {
    onDragEnter(event) {
      if (!dragCarriesNote(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      setOver(true);
    },
    onDragOver(event) {
      if (!dragCarriesNote(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setOver(true);
    },
    onDragLeave(event) {
      if (pointerStillInside(event)) return;
      setOver(false);
    },
    onDrop(event) {
      if (!dragCarriesNote(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      setOver(false);
      const noteId = readDroppedNoteId(event.dataTransfer);
      if (noteId) onDropNote(noteId);
    },
  };
}
