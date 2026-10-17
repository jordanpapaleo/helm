import { describe, expect, it } from "vitest";
import { isArchived, visibleNotes, wikiLinkCandidates } from "./archive";

function note(id: string, archived?: boolean, title = id) {
  return { id, frontmatter: { title, archived } };
}

describe("isArchived", () => {
  it("is true only when archived is exactly true", () => {
    expect(isArchived({ archived: true })).toBe(true);
    expect(isArchived({ archived: false })).toBe(false);
    expect(isArchived({})).toBe(false);
    expect(isArchived(undefined)).toBe(false);
  });
});

describe("visibleNotes", () => {
  const active = note("active");
  const archived = note("archived", true);
  const explicit = note("explicit", false);

  it("hides archived notes when show archived is off", () => {
    expect(visibleNotes([active, archived, explicit], false).map((n) => n.id)).toEqual([
      "active",
      "explicit",
    ]);
  });

  it("returns every note when show archived is on", () => {
    const notes = [active, archived, explicit];
    expect(visibleNotes(notes, true)).toEqual(notes);
  });

  it("does not mutate the input list", () => {
    const notes = [active, archived];
    visibleNotes(notes, false);
    expect(notes).toHaveLength(2);
  });
});

describe("wikiLinkCandidates", () => {
  const notes = [
    note("self", false, "Alpha"),
    note("other", false, "Alpha project"),
    note("old", true, "Alpha archive"),
  ];

  it("omits the current note and archived notes by default", () => {
    expect(wikiLinkCandidates(notes, "self", "alpha", false).map((n) => n.id)).toEqual(["other"]);
  });

  it("includes archived notes when show archived is on", () => {
    expect(wikiLinkCandidates(notes, "self", "alpha", true).map((n) => n.id)).toEqual([
      "other",
      "old",
    ]);
  });
});
