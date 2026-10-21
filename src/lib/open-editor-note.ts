import type { Grouping, View } from "../store/ui";
import type { Note } from "../types/note";

/**
 * The note the editor is showing. Dashboard, Kanban, Graph, and Trash keep
 * `selectedNoteId` without opening that note.
 */
export function openEditorNote(
  notes: readonly Note[],
  selectedNoteId: string | null,
  activeView: View,
  grouping: Grouping,
): Note | undefined {
  if (activeView !== "notes" || grouping.type === "trash" || !selectedNoteId) return undefined;
  return notes.find((note) => note.id === selectedNoteId);
}
