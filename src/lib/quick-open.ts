import type { Note, VaultConfig } from "../types/note";
import { visibleNotes } from "./archive";
import type { NoteIndex } from "./search";

export const QUICK_OPEN_RECENT_LIMIT = 20;
export const QUICK_OPEN_RESULT_LIMIT = 50;

/**
 * Notes for the ⌘P palette. Archived notes follow **Show archived notes**, like
 * the other discovery views; Trash notes are never in `notes`. An empty query
 * lists the most recently updated notes. A query ranks every title match ahead
 * of matches found only in tags or the body.
 */
export function quickOpenResults(options: {
  notes: Note[];
  index: NoteIndex | null;
  query: string;
  showArchived: boolean;
}): Note[] {
  const { notes, index, query, showArchived } = options;
  const candidates = visibleNotes(notes, showArchived);
  const q = query.trim();
  if (!q) {
    return [...candidates]
      .sort((a, b) => b.frontmatter.updated.localeCompare(a.frontmatter.updated))
      .slice(0, QUICK_OPEN_RECENT_LIMIT);
  }
  if (!index) return [];

  const byId = new Map(candidates.map((note) => [note.id, note]));
  const ranked: Note[] = [];
  const seen = new Set<string>();
  const hits = [
    ...index.search(q, { fields: ["title"], prefix: true, fuzzy: 0.2 }),
    ...index.search(q, { prefix: true, fuzzy: 0.2 }),
  ];
  for (const hit of hits) {
    const id = String(hit.id);
    const note = byId.get(id);
    if (!note || seen.has(id)) continue;
    seen.add(id);
    ranked.push(note);
    if (ranked.length === QUICK_OPEN_RESULT_LIMIT) break;
  }
  return ranked;
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
