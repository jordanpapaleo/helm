import { useEffect, useState } from "react";
import { parseNote } from "../../lib/note-parser";
import { type HistoryEntry, tauriCommands } from "../../lib/tauri-commands";
import { reportError } from "../../store/toast";
import type { Note } from "../../types/note";

interface NoteHistoryModalProps {
  note: Note;
  vaultPath: string;
  onClose: () => void;
  /** Called with the snapshot's markdown body (no frontmatter) to restore it. */
  onRestore: (content: string) => void;
}

function formatTs(tsMs: number): string {
  return new Date(tsMs).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Time machine for a single note — lists snapshots taken before saves,
 * previews any version, and restores it. Restore forces a snapshot of the
 * current file first (min age 0, same as MCP restore) so a version younger
 * than five minutes is not skipped, then writes the chosen body through the
 * normal save path.
 */
export function NoteHistoryModal({ note, vaultPath, onClose, onRestore }: NoteHistoryModalProps) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [selected, setSelected] = useState<HistoryEntry | null>(null);
  const [previewBody, setPreviewBody] = useState<string | null>(null);

  useEffect(() => {
    tauriCommands
      .listNoteHistory(vaultPath, note.id)
      .then(setEntries)
      .catch((e) => {
        reportError("Failed to load note history", e);
        setEntries([]);
      });
  }, [vaultPath, note.id]);

  async function handleSelect(entry: HistoryEntry) {
    setSelected(entry);
    setPreviewBody(null);
    try {
      const raw = await tauriCommands.readNote(entry.path);
      setPreviewBody(parseNote(raw, entry.path).content);
    } catch (e) {
      reportError("Failed to read snapshot", e);
    }
  }

  async function handleRestore() {
    if (previewBody === null) return;
    // Ordinary saves coalesce snapshots younger than 5 minutes. Restore must
    // keep the text it is about to replace, so force this snapshot (min age 0).
    // A failure leaves the note alone — replacing it would drop that text.
    try {
      await tauriCommands.snapshotNote(vaultPath, note.id, note.filePath, 0);
    } catch (e) {
      reportError("Failed to snapshot the current note before restore", e);
      return;
    }
    onRestore(previewBody);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex h-[70vh] w-[720px] max-w-[90vw] flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <p className="font-semibold text-[var(--color-text)]">
            History — {note.frontmatter.title || "Untitled"}
          </p>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="btn btn-ghost btn-sm btn-square opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="w-56 shrink-0 overflow-y-auto border-r border-[var(--color-border)] p-2">
            {entries === null ? (
              <p className="p-2 text-sm text-[var(--color-text-muted)]">Loading…</p>
            ) : entries.length === 0 ? (
              <p className="p-2 text-sm text-[var(--color-text-muted)]">
                No history yet — snapshots are taken as you edit (at most one every 5 minutes).
              </p>
            ) : (
              entries.map((entry) => (
                <button
                  type="button"
                  key={entry.ts_ms}
                  aria-label={`Snapshot from ${formatTs(entry.ts_ms)}`}
                  onClick={() => handleSelect(entry)}
                  className={`block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                    selected?.ts_ms === entry.ts_ms
                      ? "bg-[var(--color-accent)] text-white"
                      : "text-[var(--color-text)] hover:bg-[var(--color-border)]/40"
                  }`}
                >
                  {formatTs(entry.ts_ms)}
                </button>
              ))
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            {selected === null ? (
              <p className="p-4 text-sm text-[var(--color-text-muted)]">
                Select a snapshot to preview it.
              </p>
            ) : previewBody === null ? (
              <p className="p-4 text-sm text-[var(--color-text-muted)]">Loading…</p>
            ) : (
              <>
                <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-4 text-sm text-[var(--color-text)]">
                  {previewBody}
                </pre>
                <div className="border-t border-[var(--color-border)] p-3 text-right">
                  <button
                    type="button"
                    onClick={handleRestore}
                    className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm text-white transition-opacity hover:opacity-90"
                  >
                    Restore this version
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
