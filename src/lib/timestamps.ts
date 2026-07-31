/**
 * Timestamp helpers — the single source of truth for how Helm writes, reads and
 * displays the `created` / `updated` frontmatter fields.
 *
 * The stored form is always UTC at seconds precision with a trailing `Z`
 * (`2026-07-31T18:23:05Z`). That shape is deliberate: plain string comparison
 * over it is a correct chronological sort, and a legacy date-only value
 * (`2026-07-31`) sorts as that day's start — which is exactly right. Never
 * store a local-offset timestamp anywhere: mixed offsets would break
 * lexicographic ordering, which is the entire point of the format.
 *
 * Migration is lazy. Existing date-only values stay as they are until something
 * writes the note, so both forms must remain readable and sortable forever.
 *
 * `deadline` is NOT a timestamp — it is a calendar date and stays `YYYY-MM-DD`.
 *
 * KEEP IN SYNC with mcp-server/timestamps.ts, which carries the same format for
 * the MCP server (it never imports from src/).
 */

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The current instant as a stored timestamp: UTC, seconds precision, `Z`.
 *
 * @param now - Injectable clock, for tests
 * @returns e.g. `2026-07-31T18:23:05Z`
 */
export function nowTimestamp(now: Date = new Date()): string {
  return `${now.toISOString().slice(0, 19)}Z`;
}

/**
 * Today's UTC calendar date — for date-only fields and comparisons against
 * `deadline`, never for `created` / `updated`.
 *
 * @param now - Injectable clock, for tests
 * @returns e.g. `2026-07-31`
 */
export function todayDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The calendar-date portion of a stored timestamp, in either form. Use this
 * whenever a timestamp has to be compared against a date-only value — a raw
 * `"2026-07-24T10:00:00Z" <= "2026-07-24"` is false where the date-only form
 * was true.
 *
 * @param value - A timestamp or a legacy date-only value
 * @returns The `YYYY-MM-DD` prefix
 */
export function timestampDate(value: string): string {
  return value.slice(0, 10);
}

/** True when `value` is a legacy date-only value with no time component. */
export function isDateOnly(value: string): boolean {
  return DATE_ONLY_RE.test(value);
}

/**
 * Coerce a frontmatter value read off disk into a timestamp string.
 *
 * js-yaml parses an *unquoted* ISO value into a JS `Date`, not a string, which
 * would break every string comparison in the app. Helm's serializer always
 * quotes, but a hand-edited file can still produce one, so parsing normalizes
 * defensively. A UTC-midnight `Date` is read back as date-only, preserving the
 * legacy form rather than inventing a time.
 *
 * @param value - Raw frontmatter value (string, Date, or missing)
 * @returns A timestamp string, or undefined when there is nothing usable
 */
export function normalizeTimestamp(value: unknown): string | undefined {
  if (typeof value === "string") return value || undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const iso = value.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : `${iso.slice(0, 19)}Z`;
  }
  return undefined;
}

/**
 * Render a stored timestamp for display in the user's local time.
 * A legacy date-only value shows just the date — no invented midnight — and is
 * formatted in UTC so it can never slide to the previous day.
 *
 * @param value - A timestamp or a legacy date-only value
 * @returns e.g. `Jul 31, 2026, 11:47 AM` or `Jul 31, 2026`; the input verbatim
 *   if it cannot be parsed
 */
export function formatTimestamp(value: string): string {
  if (!value) return "";

  if (isDateOnly(value)) {
    const d = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
