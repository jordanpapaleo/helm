/**
 * Timestamp helpers for the MCP server.
 * KEEP IN SYNC with src/lib/timestamps.ts — the app and the MCP server write
 * into the same vault, so they must agree on the stored format exactly.
 *
 * Stored form: UTC, seconds precision, trailing `Z` (`2026-07-31T18:23:05Z`),
 * chosen so plain string comparison is a correct chronological sort. Legacy
 * date-only values (`2026-07-31`) sort as that day's start and are migrated
 * lazily — only when something writes the note.
 *
 * `deadline` is a calendar date, not a timestamp; it stays `YYYY-MM-DD`.
 */

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The current instant as a stored timestamp: UTC, seconds precision, `Z`. */
export function nowTimestamp(now: Date = new Date()): string {
  return `${now.toISOString().slice(0, 19)}Z`;
}

/** Today's UTC calendar date — for date-only fields such as `deadline`. */
export function todayDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The calendar-date portion of a stored timestamp, in either form. Required
 * whenever a timestamp is compared against a date-only value.
 */
export function timestampDate(value: string): string {
  return value.slice(0, 10);
}

/** True when `value` is a legacy date-only value with no time component. */
export function isDateOnly(value: string): boolean {
  return DATE_ONLY_RE.test(value);
}

/**
 * Coerce a frontmatter value read off disk into a timestamp string. js-yaml
 * parses an *unquoted* ISO value into a `Date`, which would break every string
 * comparison; a UTC-midnight `Date` is read back as the date-only form.
 */
export function normalizeTimestamp(value: unknown): string | undefined {
  if (typeof value === "string") return value || undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const iso = value.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : `${iso.slice(0, 19)}Z`;
  }
  return undefined;
}
