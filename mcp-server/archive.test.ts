import { describe, expect, it } from "vitest";
import { excludeArchivedUnless, isArchived } from "./archive";

function note(id: string, archived?: boolean) {
  return { id, frontmatter: { archived } };
}

describe("MCP archive filter", () => {
  const notes = [note("active"), note("old", true), note("explicit", false)];

  it("treats only archived: true as archived", () => {
    expect(isArchived({ archived: true })).toBe(true);
    expect(isArchived({})).toBe(false);
    expect(isArchived({ archived: false })).toBe(false);
  });

  it("excludes archived notes unless include_archived is exactly true", () => {
    expect(excludeArchivedUnless(notes, undefined).map((n) => n.id)).toEqual([
      "active",
      "explicit",
    ]);
    expect(excludeArchivedUnless(notes, false).map((n) => n.id)).toEqual(["active", "explicit"]);
    expect(excludeArchivedUnless(notes, "true").map((n) => n.id)).toEqual(["active", "explicit"]);
    expect(excludeArchivedUnless(notes, true).map((n) => n.id)).toEqual([
      "active",
      "old",
      "explicit",
    ]);
  });
});
