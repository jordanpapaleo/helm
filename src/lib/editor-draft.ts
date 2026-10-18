// Read the live editor without flushing saves or putting editor instances in global state.
const readers = new Map<string, () => string>();
export function registerEditorDraft(noteId: string, read: () => string) {
  readers.set(noteId, read);
  return () => {
    if (readers.get(noteId) === read) readers.delete(noteId);
  };
}
export function readEditorDraft(noteId: string): string | undefined {
  return readers.get(noteId)?.();
}
