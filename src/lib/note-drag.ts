/** Custom drag payload. The note body is never placed in the drag data. */
export const NOTE_DRAG_MIME = "application/x-helm-note";

/**
 * Id of the note currently being dragged.
 *
 * WKWebView (the desktop app) often omits a custom MIME type from
 * `dataTransfer.types` during dragover, and `getData` is blocked until drop.
 * The row still has to call `preventDefault` on dragover or the webview will
 * not highlight it or fire drop. This id lets a row recognize the drag without
 * reading the payload. It is cleared on dragend, which fires after drop.
 */
let draggingNoteId: string | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("dragend", () => {
    draggingNoteId = null;
  });
}

export function folderDropId(folderPath: string): string {
  return `folder:${folderPath}`;
}

export function tagDropId(tag: string): string {
  return `tag:${tag}`;
}

export function clearNoteDrag(): void {
  draggingNoteId = null;
}

/**
 * Start a note drag.
 *
 * Only the note id is stored. `text/plain` and `text/html` stay empty so a drop
 * on the editor cannot insert the note body.
 */
export function writeNoteDrag(dataTransfer: DataTransfer, noteId: string): void {
  draggingNoteId = noteId;
  // Empty standard types first. A webview that rejects a custom MIME type, or
  // an empty string, must not throw away the in-memory id above.
  setDragData(dataTransfer, "text/plain", "");
  setDragData(dataTransfer, "text/html", "");
  setDragData(dataTransfer, NOTE_DRAG_MIME, noteId);
  try {
    dataTransfer.effectAllowed = "copyMove";
  } catch {
    // A locked dataTransfer still leaves the in-memory id in place.
  }
}

function setDragData(dataTransfer: DataTransfer, format: string, value: string): void {
  try {
    dataTransfer.setData(format, value);
  } catch {
    // WKWebView rejects some formats. The drag is still identified in memory.
  }
}

export function dragCarriesNote(dataTransfer: DataTransfer | null): boolean {
  if (draggingNoteId) return true;
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types).includes(NOTE_DRAG_MIME);
}

export function readDroppedNoteId(dataTransfer: DataTransfer | null): string | null {
  if (dataTransfer && Array.from(dataTransfer.types).includes(NOTE_DRAG_MIME)) {
    const id = dataTransfer.getData(NOTE_DRAG_MIME).trim();
    if (id) return id;
  }
  return draggingNoteId;
}

interface NoteDragEvent {
  dataTransfer: DataTransfer | null;
  relatedTarget: EventTarget | null;
  currentTarget: EventTarget | null;
  preventDefault(): void;
  stopPropagation(): void;
}

function pointerStillInside(event: NoteDragEvent): boolean {
  const next = event.relatedTarget;
  const current = event.currentTarget;
  return next instanceof Node && current instanceof Node && current.contains(next);
}

export function noteDropHandlers(
  onDropNote: (noteId: string) => void,
  setOver: (over: boolean) => void,
): {
  onDragEnter: (event: NoteDragEvent) => void;
  onDragOver: (event: NoteDragEvent) => void;
  onDragLeave: (event: NoteDragEvent) => void;
  onDrop: (event: NoteDragEvent) => void;
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
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
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

/**
 * Listen on the drop row itself.
 *
 * React's root listener calls `preventDefault` too late for WKWebView: the
 * webview decides the row is not a drop target before the event bubbles to
 * `#root`, so the row never highlights and drop never fires. A listener on the
 * row, in the capture phase, accepts the drag while the pointer is over it.
 */
export function bindNoteDropTarget(
  element: HTMLElement,
  onDropNote: (noteId: string) => void,
  setOver: (over: boolean) => void,
): () => void {
  const handlers = noteDropHandlers(onDropNote, setOver);
  const enter = (event: DragEvent) => handlers.onDragEnter(event);
  const over = (event: DragEvent) => handlers.onDragOver(event);
  const leave = (event: DragEvent) => handlers.onDragLeave(event);
  const drop = (event: DragEvent) => handlers.onDrop(event);
  element.addEventListener("dragenter", enter, true);
  element.addEventListener("dragover", over, true);
  element.addEventListener("dragleave", leave, true);
  element.addEventListener("drop", drop, true);
  return () => {
    element.removeEventListener("dragenter", enter, true);
    element.removeEventListener("dragover", over, true);
    element.removeEventListener("dragleave", leave, true);
    element.removeEventListener("drop", drop, true);
  };
}
