/**
 * Archive visibility for agent queries.
 * KEEP IN SYNC with src/lib/archive.ts — `archived: true` is archived;
 * absent or any other value is active.
 *
 * The Helm app's "Show archived notes" setting does not apply here.
 * Each tool takes `include_archived` and excludes archived notes unless it
 * is exactly true.
 */

export function isArchived(frontmatter: { archived?: unknown } | undefined): boolean {
  return frontmatter?.archived === true;
}

export function excludeArchivedUnless<T extends { frontmatter: { archived?: unknown } }>(
  notes: T[],
  includeArchived: unknown,
): T[] {
  if (includeArchived === true) return notes;
  return notes.filter((n) => !isArchived(n.frontmatter));
}
