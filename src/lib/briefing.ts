/**
 * Daily briefing — rules-based digest of what needs attention today.
 * Pure functions over the notes list; no I/O.
 */
import type { Note } from "../types/note";

export interface Briefing {
  /** Notes currently in the Doing state */
  doing: Note[];
  /** Blocked notes (excluding Done) */
  blocked: Note[];
  /** Deadline before today (excluding Done), soonest first */
  overdue: Note[];
  /** Deadline within today..today+7 (excluding Done), soonest first */
  dueSoon: Note[];
  /** Doing notes untouched for 14+ days, oldest first */
  staleDoing: Note[];
}

const DUE_SOON_DAYS = 7;
const STALE_DAYS = 14;

/** Add n days to a YYYY-MM-DD string, returning YYYY-MM-DD. */
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

export function buildBriefing(notes: Note[], today: string): Briefing {
  // The briefing is entirely workflow data, so unmanaged notes are outside it —
  // the same rule Kanban and Eisenhower already apply. Filtered here, before
  // `open`, so every bucket is consistent. Their state is cleared to "", which
  // is `!== "Done"`, so without this they would count as open and a stale
  // deadline would resurface as overdue.
  const managed = notes.filter((n) => !n.frontmatter.unmanaged);
  const open = managed.filter((n) => n.frontmatter.state !== "Done");
  const withDeadline = open.filter((n) => n.frontmatter.deadline);
  const byDeadline = (a: Note, b: Note) =>
    (a.frontmatter.deadline ?? "").localeCompare(b.frontmatter.deadline ?? "");

  const dueSoonCutoff = addDays(today, DUE_SOON_DAYS);
  const staleCutoff = addDays(today, -STALE_DAYS);

  return {
    doing: open.filter((n) => n.frontmatter.state === "Doing"),
    blocked: open.filter((n) => n.frontmatter.blocked),
    overdue: withDeadline
      .filter((n) => (n.frontmatter.deadline as string) < today)
      .sort(byDeadline),
    dueSoon: withDeadline
      .filter((n) => {
        const d = n.frontmatter.deadline as string;
        return d >= today && d <= dueSoonCutoff;
      })
      .sort(byDeadline),
    staleDoing: open
      .filter((n) => n.frontmatter.state === "Doing" && n.frontmatter.updated <= staleCutoff)
      .sort((a, b) => a.frontmatter.updated.localeCompare(b.frontmatter.updated)),
  };
}
