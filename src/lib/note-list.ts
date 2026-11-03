import type { Grouping } from "../store/ui";
import type { Note } from "../types/note";
import { isArchived, visibleNotes } from "./archive";
import { noteMatchesQuery } from "./search";

export interface TrashEntry {
  note: Note;
  deletedAt: string;
}

export interface ListedNote {
  note: Note;
  /** Set when this row is a Trash note surfaced by search. */
  deletedAt: string | null;
}

function inScope(note: Note, grouping: Grouping, activeVaultId: string | null): boolean {
  if (activeVaultId && note.vaultId !== activeVaultId) return false;
  if (grouping.type === "folder" && grouping.id) {
    return note.filePath.startsWith(`${grouping.id}/`);
  }
  if (grouping.type === "tag" && grouping.id) {
    const tag = grouping.id;
    const prefix = `${tag}/`;
    return note.frontmatter.tags.some((t) => t === tag || t.startsWith(prefix));
  }
  return true;
}

function byRecent(a: ListedNote, b: ListedNote): number {
  if (a.note.frontmatter.pinned && !b.note.frontmatter.pinned) return -1;
  if (!a.note.frontmatter.pinned && b.note.frontmatter.pinned) return 1;
  return b.note.frontmatter.updated.localeCompare(a.note.frontmatter.updated);
}

/**
 * Rows for the note list.
 * The archive grouping shows archived notes even when the setting is off.
 * A query uses the same title, tag, and body match for archived notes and
 * Trash notes in the current vault, folder, or tag scope.
 */
export function notesForList(options: {
  notes: Note[];
  trash: TrashEntry[];
  grouping: Grouping;
  activeVaultId: string | null;
  showArchived: boolean;
  query: string;
}): ListedNote[] {
  const { notes, trash, grouping, activeVaultId, showArchived, query } = options;
  if (grouping.type === "trash") return [];

  const scoped = (note: Note) => inScope(note, grouping, activeVaultId);

  if (grouping.type === "archive") {
    return notes
      .filter(
        (note) => isArchived(note.frontmatter) && scoped(note) && noteMatchesQuery(note, query),
      )
      .map((note) => ({ note, deletedAt: null }))
      .sort(byRecent);
  }

  const base = visibleNotes(notes, showArchived).filter(scoped);
  if (!query.trim()) {
    return base.map((note) => ({ note, deletedAt: null })).sort(byRecent);
  }

  const rows: ListedNote[] = [];
  const seen = new Set<string>();
  for (const note of base) {
    if (!noteMatchesQuery(note, query)) continue;
    rows.push({ note, deletedAt: null });
    seen.add(note.id);
  }
  if (!showArchived) {
    for (const note of notes) {
      if (!isArchived(note.frontmatter) || seen.has(note.id) || !scoped(note)) continue;
      if (!noteMatchesQuery(note, query)) continue;
      rows.push({ note, deletedAt: null });
      seen.add(note.id);
    }
  }
  for (const item of trash) {
    if (seen.has(item.note.id) || !scoped(item.note)) continue;
    if (!noteMatchesQuery(item.note, query)) continue;
    rows.push({ note: item.note, deletedAt: item.deletedAt });
  }
  return rows.sort(byRecent);
}

/** Trash rows, filtered with the same matcher as the note list. */
export function trashForList(trash: TrashEntry[], query: string): TrashEntry[] {
  return trash.filter((item) => noteMatchesQuery(item.note, query));
}
