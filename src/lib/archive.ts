/**
 * Note archive visibility.
 * KEEP IN SYNC with mcp-server/archive.ts — `archived: true` is archived;
 * absent or any other value is active.
 *
 * Discovery views (lists, boards, graph, dashboard, briefing, counts,
 * wiki-link autocomplete) use `visibleNotes`. The note list search also
 * returns archived notes. Opening a note by id uses the full store, so a
 * hidden archived note can still be read and unarchived.
 *
 * The app's "Show archived notes" setting is a UI preference only. MCP tools
 * exclude archived notes unless the caller passes `include_archived`.
 */

export function isArchived(frontmatter: { archived?: unknown } | undefined): boolean {
  return frontmatter?.archived === true;
}

/** Notes that belong in discovery views. Does not mutate `notes`. */
export function visibleNotes<T extends { frontmatter: { archived?: unknown } }>(
  notes: T[],
  showArchived: boolean,
): T[] {
  if (showArchived) return notes;
  return notes.filter((n) => !isArchived(n.frontmatter));
}

/**
 * Wiki-link autocomplete candidates. Archived notes are hidden unless
 * `showArchived` is on, matching list search.
 */
export function wikiLinkCandidates<
  T extends { id: string; frontmatter: { title: string; archived?: unknown } },
>(notes: T[], currentId: string, query: string, showArchived: boolean): T[] {
  const q = query.toLowerCase();
  return visibleNotes(notes, showArchived)
    .filter((n) => n.id !== currentId && (n.frontmatter.title || "").toLowerCase().includes(q))
    .slice(0, 8);
}
