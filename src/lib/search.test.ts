import { describe, expect, it } from "vitest";
import type { Note } from "../types/note";
import { buildIndex, searchNotes } from "./search";

function makeNote(id: string, title: string, content: string, tags: string[] = []): Note {
  return {
    id,
    filePath: `/notes/${id}.md`,
    fileName: `${id}.md`,
    content,
    vaultId: "",
    frontmatter: {
      id,
      title,
      created: "2026-03-13",
      updated: "2026-03-13",
      tags,
      urgent: false,
      important: false,
      state: "Doing",
      blocked: false,
    },
  };
}

const notes = [
  makeNote("01", "Rule Builder", "Build composite membership rules for portfolios", ["Code", "CE"]),
  makeNote("02", "CE Tooling Updates", "Document tooling upgrade for CE projects", [
    "Influence",
    "CE",
  ]),
  makeNote("03", "RL Tailwind", "Implement Tailwind CSS in RL codebase", ["Code", "RL"]),
];

describe("buildIndex + searchNotes", () => {
  it("finds notes by title keyword", () => {
    const index = buildIndex(notes);
    const results = searchNotes(index, notes, "Rule");
    expect(results.map((r) => r.id)).toContain("01");
  });

  it("finds notes by content keyword", () => {
    const index = buildIndex(notes);
    const results = searchNotes(index, notes, "composite");
    expect(results.map((r) => r.id)).toContain("01");
  });

  it("finds notes by tag", () => {
    const index = buildIndex(notes);
    const results = searchNotes(index, notes, "CE");
    const ids = results.map((r) => r.id);
    expect(ids).toContain("01");
    expect(ids).toContain("02");
  });

  it("returns empty array for no match", () => {
    const index = buildIndex(notes);
    const results = searchNotes(index, notes, "xyzzy12345");
    expect(results).toHaveLength(0);
  });

  it("returns empty array for empty query", () => {
    const index = buildIndex(notes);
    const results = searchNotes(index, notes, "");
    expect(results).toHaveLength(0);
  });
});
