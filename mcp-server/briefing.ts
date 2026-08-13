/**
 * Rules-based daily briefing for the MCP server.
 * KEEP IN SYNC with src/lib/briefing.ts — same buckets, windows, and ordering.
 */

import { timestampDate } from "./timestamps.js";

interface BriefingFrontmatter {
  id: string;
  state: string;
  blocked: boolean;
  updated: string;
  deadline?: string;
  /** Excludes the note from the workflow system — and so from the briefing */
  unmanaged?: boolean;
  [key: string]: unknown;
}

interface BriefingNote {
  frontmatter: BriefingFrontmatter;
}

export interface Briefing<N extends BriefingNote = BriefingNote> {
  doing: N[];
  blocked: N[];
  overdue: N[];
  dueSoon: N[];
  staleDoing: N[];
}

const DUE_SOON_DAYS = 7;
const STALE_DAYS = 14;

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

export function buildBriefing<N extends BriefingNote>(notes: N[], today: string): Briefing<N> {
  // The briefing is entirely workflow data, so unmanaged notes are outside it —
  // the same rule Kanban and Eisenhower already apply. Filtered here, before
  // `open`, so every bucket is consistent. Their state is cleared to "", which
  // is `!== "Done"`, so without this they would count as open and a stale
  // deadline would resurface as overdue.
  const managed = notes.filter((n) => !n.frontmatter.unmanaged);
  const open = managed.filter((n) => n.frontmatter.state !== "Done");
  const withDeadline = open.filter((n) => n.frontmatter.deadline);
  const byDeadline = (a: N, b: N) =>
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
      // `updated` may be a full timestamp or a legacy date-only value, while
      // the cutoff is always date-only. Compare date portions: a raw
      // "2026-06-26T10:00:00Z" <= "2026-06-26" is false, which would silently
      // drop boundary-day notes that the date-only form counted as stale.
      .filter((n) => {
        if (n.frontmatter.state !== "Doing") return false;
        // A note with no `updated` at all is not stale — the old comparison
        // against `undefined` was false, and this keeps it that way (and keeps
        // `timestampDate` off a non-string).
        const updated = n.frontmatter.updated;
        return typeof updated === "string" && timestampDate(updated) <= staleCutoff;
      })
      // Sorting is safe on the raw values: the stored format is chosen so that
      // string order is chronological order, with date-only sorting as the
      // start of its day.
      .sort((a, b) => a.frontmatter.updated.localeCompare(b.frontmatter.updated)),
  };
}
