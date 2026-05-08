import { useNoteStore } from "../../store/notes";
import type { Note } from "../../types/note";

interface BacklinksPanelProps {
  note: Note;
}

export function BacklinksPanel({ note }: BacklinksPanelProps) {
  const { notes, selectNote } = useNoteStore();

  // Notes that link TO this note (backlinks)
  const backlinks = notes.filter(
    (n) => n.id !== note.id && (n.frontmatter.links ?? []).includes(note.id),
  );

  // Notes this note links TO (outgoing)
  const outgoing = (note.frontmatter.links ?? [])
    .map((id) => notes.find((n) => n.id === id))
    .filter((n): n is Note => n !== undefined);

  if (backlinks.length === 0 && outgoing.length === 0) return null;

  return (
    <div className="border-t border-[var(--color-border)] px-12 py-4 text-sm">
      <div className="grid grid-cols-2 gap-6 max-h-40 overflow-y-auto">
        {/* Left: always outgoing links */}
        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
            Links to
          </p>
          {outgoing.length > 0 ? (
            <div className="flex flex-col gap-1">
              {outgoing.map((n) => (
                <button
                  type="button"
                  key={n.id}
                  onClick={() => selectNote(n.id)}
                  className="text-left text-sm text-[var(--color-accent)] hover:opacity-80 truncate"
                >
                  → {n.frontmatter.title}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)] opacity-50">None</p>
          )}
        </div>

        {/* Right: always backlinks */}
        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
            Backlinks
          </p>
          {backlinks.length > 0 ? (
            <div className="flex flex-col gap-1">
              {backlinks.map((n) => (
                <button
                  type="button"
                  key={n.id}
                  onClick={() => selectNote(n.id)}
                  className="text-left text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] truncate"
                >
                  ← {n.frontmatter.title}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)] opacity-50">None</p>
          )}
        </div>
      </div>
    </div>
  );
}
