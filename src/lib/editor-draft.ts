// Read the live editor without flushing saves or putting editor instances in global state.
const readers = new Map<string, () => string>();
const listeners = new Set<() => void>();
let revision = 0;

export function registerEditorDraft(noteId: string, read: () => string) {
  readers.set(noteId, read);
  emit();
  return () => {
    if (readers.get(noteId) === read) {
      readers.delete(noteId);
      emit();
    }
  };
}

export function readEditorDraft(noteId: string): string | undefined {
  return readers.get(noteId)?.();
}

/** Editors call this after a local content change so open previews can re-read. */
export function notifyEditorDraft(noteId: string) {
  if (readers.has(noteId)) emit();
}

export function subscribeEditorDrafts(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getEditorDraftRevision() {
  return revision;
}

function emit() {
  revision += 1;
  for (const listener of [...listeners]) listener();
}
