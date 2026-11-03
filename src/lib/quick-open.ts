import type { Note, VaultConfig } from "../types/note";
import { visibleNotes } from "./archive";
import type { NoteIndex } from "./search";

export const QUICK_OPEN_RECENT_LIMIT = 20;
export const QUICK_OPEN_RESULT_LIMIT = 50;

const SEARCH = { prefix: true, fuzzy: 0.2 } as const;

export type QuickOpenList =
  | { kind: "recent"; notes: Note[] }
  | { kind: "matches"; titles: Note[]; content: Note[] };

/**
 * Notes for the ⌘P palette. Archived notes follow **Show archived notes**, like
 * the other discovery views; Trash notes are never in `notes`. An empty query
 * lists the most recently updated notes, with no groups. A query searches
 * titles and then the rest of the index (body and tags). Title matches come
 * first; a note is listed only once.
 */
export function quickOpenList(options: {
  notes: Note[];
  index: NoteIndex | null;
  query: string;
  showArchived: boolean;
}): QuickOpenList {
  const { notes, index, query, showArchived } = options;
  const candidates = visibleNotes(notes, showArchived);
  const q = query.trim();
  if (!q) {
    return {
      kind: "recent",
      notes: [...candidates]
        .sort((a, b) => b.frontmatter.updated.localeCompare(a.frontmatter.updated))
        .slice(0, QUICK_OPEN_RECENT_LIMIT),
    };
  }
  if (!index) return { kind: "matches", titles: [], content: [] };

  const byId = new Map(candidates.map((note) => [note.id, note]));
  const titles: Note[] = [];
  const content: Note[] = [];
  const seen = new Set<string>();
  const take = (hits: { id: string | number }[], into: Note[]) => {
    for (const hit of hits) {
      if (seen.size === QUICK_OPEN_RESULT_LIMIT) return;
      const id = String(hit.id);
      const note = byId.get(id);
      if (!note || seen.has(id)) continue;
      seen.add(id);
      into.push(note);
    }
  };
  take(index.search(q, { ...SEARCH, fields: ["title"] }), titles);
  // Body and tag matches. Title hits are already recorded, so they stay out of this group.
  take(index.search(q, SEARCH), content);
  return { kind: "matches", titles, content };
}

/** Title matches, then body-or-tag matches. An empty query is the recent list. */
export function quickOpenResults(options: {
  notes: Note[];
  index: NoteIndex | null;
  query: string;
  showArchived: boolean;
}): Note[] {
  const list = quickOpenList(options);
  return list.kind === "recent" ? list.notes : [...list.titles, ...list.content];
}

/**
 * The note's folder relative to its vault, prefixed with the vault name when
 * more than one vault is loaded. A note at the vault root shows the vault name.
 */
export function quickOpenFolder(note: Note, vaults: VaultConfig[]): string {
  const vault = vaults.find((v) => v.id === note.vaultId);
  const dir = note.filePath.slice(0, Math.max(0, note.filePath.lastIndexOf("/")));
  const relative = vault && dir.startsWith(vault.path) ? dir.slice(vault.path.length + 1) : dir;
  const vaultName = vault?.name ?? "";
  if (!relative) return vaultName;
  return vaults.length > 1 && vaultName ? `${vaultName}/${relative}` : relative;
}
