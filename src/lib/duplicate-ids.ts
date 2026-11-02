/**
 * Two files in a vault can carry the same frontmatter `id` (a Finder
 * duplicate, a sync-conflict copy, a hand copy). Everything keyed by id —
 * search, selection, tabs, links, the graph — needs exactly one note per id,
 * so one copy keeps the id and the rest are set aside for the user to resolve.
 *
 * KEEP IN SYNC with mcp-server/duplicates.ts — the app and the MCP server must
 * pick the same copy to keep, or they would disagree about which file an id
 * refers to.
 */

export interface CopyKey {
  id: string;
  filePath: string;
  created: string;
}

export interface DuplicateGroup<T> {
  id: string;
  /** The copy that owns the id. Links and lookups resolve to it. */
  keeper: T;
  /** The other files that carry the same id, in rank order. */
  copies: T[];
}

/**
 * Earliest `created` wins (a missing date ranks last), then the shorter path
 * (`note.md` beats `note copy.md`), then path order. The order of the input
 * never matters, so every load picks the same keeper.
 */
export function compareCopies(a: CopyKey, b: CopyKey): number {
  if (a.created !== b.created) {
    if (!a.created) return 1;
    if (!b.created) return -1;
    return a.created < b.created ? -1 : 1;
  }
  if (a.filePath.length !== b.filePath.length) return a.filePath.length - b.filePath.length;
  if (a.filePath === b.filePath) return 0;
  return a.filePath < b.filePath ? -1 : 1;
}

/**
 * Split items into one keeper per id (in input order) and the groups of ids
 * held by more than one file. Items without an id are always kept.
 */
export function partitionDuplicateIds<T>(
  items: readonly T[],
  keyOf: (item: T) => CopyKey,
): { unique: T[]; groups: DuplicateGroup<T>[] } {
  const byId = new Map<string, T[]>();
  for (const item of items) {
    const { id } = keyOf(item);
    if (!id) continue;
    const list = byId.get(id);
    if (list) list.push(item);
    else byId.set(id, [item]);
  }

  const groups: DuplicateGroup<T>[] = [];
  const dropped = new Set<T>();
  for (const [id, list] of byId) {
    if (list.length < 2) continue;
    const ranked = [...list].sort((a, b) => compareCopies(keyOf(a), keyOf(b)));
    const [keeper, ...copies] = ranked;
    for (const item of copies) dropped.add(item);
    groups.push({ id, keeper, copies });
  }
  if (groups.length === 0) return { unique: [...items], groups };

  groups.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { unique: items.filter((item) => !dropped.has(item)), groups };
}
