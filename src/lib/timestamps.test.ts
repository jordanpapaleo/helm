import { describe, expect, it } from "vitest";
import {
  formatTimestamp,
  isDateOnly,
  normalizeTimestamp,
  nowTimestamp,
  timestampDate,
  todayDate,
} from "./timestamps";

describe("nowTimestamp", () => {
  it("produces a UTC timestamp at seconds precision", () => {
    expect(nowTimestamp(new Date("2026-07-31T18:23:05.123Z"))).toBe("2026-07-31T18:23:05Z");
  });

  it("never emits milliseconds or a local offset", () => {
    const ts = nowTimestamp();
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it("round-trips back to the same instant", () => {
    const d = new Date("2026-07-31T18:23:05.000Z");
    expect(new Date(nowTimestamp(d)).getTime()).toBe(d.getTime());
  });
});

describe("todayDate", () => {
  it("returns the UTC calendar date", () => {
    expect(todayDate(new Date("2026-07-31T23:59:59.999Z"))).toBe("2026-07-31");
  });
});

describe("timestampDate", () => {
  it("extracts the date from a full timestamp", () => {
    expect(timestampDate("2026-07-31T18:23:05Z")).toBe("2026-07-31");
  });

  it("passes a legacy date-only value through unchanged", () => {
    expect(timestampDate("2026-07-31")).toBe("2026-07-31");
  });

  it("is safe on an empty value", () => {
    expect(timestampDate("")).toBe("");
  });
});

describe("isDateOnly", () => {
  it("recognizes the legacy form", () => {
    expect(isDateOnly("2026-07-31")).toBe(true);
  });

  it("rejects a full timestamp", () => {
    expect(isDateOnly("2026-07-31T18:23:05Z")).toBe(false);
  });
});

// The whole storage format is chosen so that plain string comparison is a
// correct chronological sort across both forms. These are the load-bearing
// assertions for that claim.
describe("lexicographic ordering", () => {
  it("orders two same-day timestamps by time", () => {
    expect("2026-07-31T09:00:00Z" < "2026-07-31T18:23:05Z").toBe(true);
  });

  it("sorts a legacy date-only value as that day's start", () => {
    expect("2026-07-31" < "2026-07-31T00:00:01Z").toBe(true);
    expect("2026-07-31" < "2026-07-31T18:23:05Z").toBe(true);
    expect("2026-07-30T23:59:59Z" < "2026-07-31").toBe(true);
  });

  it("sorts a mixed list chronologically", () => {
    const sorted = [
      "2026-07-31T18:23:05Z",
      "2026-07-30",
      "2026-07-31",
      "2026-07-31T09:00:00Z",
      "2026-08-01",
    ].sort((a, b) => a.localeCompare(b));
    expect(sorted).toEqual([
      "2026-07-30",
      "2026-07-31",
      "2026-07-31T09:00:00Z",
      "2026-07-31T18:23:05Z",
      "2026-08-01",
    ]);
  });
});

describe("normalizeTimestamp", () => {
  it("passes a string through untouched", () => {
    expect(normalizeTimestamp("2026-07-31T18:23:05Z")).toBe("2026-07-31T18:23:05Z");
    expect(normalizeTimestamp("2026-07-31")).toBe("2026-07-31");
  });

  it("returns undefined for a missing value", () => {
    expect(normalizeTimestamp(undefined)).toBeUndefined();
    expect(normalizeTimestamp(null)).toBeUndefined();
    expect(normalizeTimestamp("")).toBeUndefined();
  });

  // js-yaml turns an *unquoted* ISO value into a Date. Helm always writes them
  // quoted, but a hand-edited file can still hand us one.
  it("coerces a Date from unquoted YAML back to a timestamp string", () => {
    expect(normalizeTimestamp(new Date("2026-07-31T18:23:05.000Z"))).toBe("2026-07-31T18:23:05Z");
  });

  it("coerces a UTC-midnight Date back to the date-only form", () => {
    expect(normalizeTimestamp(new Date("2026-07-31T00:00:00.000Z"))).toBe("2026-07-31");
  });

  it("ignores an invalid Date", () => {
    expect(normalizeTimestamp(new Date("nope"))).toBeUndefined();
  });
});

describe("formatTimestamp", () => {
  it("renders a full timestamp as a readable local date and time", () => {
    const out = formatTimestamp("2026-07-31T18:23:05Z");
    // Locale/timezone vary by machine, so assert on shape, not exact text.
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/\d{1,2}:\d{2}/);
  });

  it("renders a legacy date-only value without inventing a midnight time", () => {
    const out = formatTimestamp("2026-07-31");
    expect(out).toMatch(/2026/);
    expect(out).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("does not shift a date-only value across a timezone boundary", () => {
    expect(formatTimestamp("2026-07-31")).toContain("31");
  });

  it("returns unparseable input verbatim", () => {
    expect(formatTimestamp("someday")).toBe("someday");
    expect(formatTimestamp("")).toBe("");
  });
});
