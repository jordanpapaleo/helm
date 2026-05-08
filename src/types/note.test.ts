import { describe, expect, it } from "vitest";
import type { Note } from "./note";
import { getQuadrant } from "./note";

function makeNote(overrides: Partial<Note["frontmatter"]>): Note {
  return {
    id: "01JPMXYZ123",
    filePath: "/notes/test.md",
    fileName: "test.md",
    content: "",
    vaultId: "",
    frontmatter: {
      id: "01JPMXYZ123",
      title: "Test",
      created: "2026-03-13",
      updated: "2026-03-13",
      tags: [],
      urgent: false,
      important: false,
      state: "Doing",
      blocked: false,
      ...overrides,
    },
  };
}

describe("getQuadrant", () => {
  it("returns 'do' for urgent + important", () => {
    expect(getQuadrant(makeNote({ urgent: true, important: true }))).toBe("do");
  });

  it("returns 'schedule' for important but not urgent", () => {
    expect(getQuadrant(makeNote({ urgent: false, important: true }))).toBe("schedule");
  });

  it("returns 'delegate' for urgent but not important", () => {
    expect(getQuadrant(makeNote({ urgent: true, important: false }))).toBe("delegate");
  });

  it("returns 'eliminate' for neither", () => {
    expect(getQuadrant(makeNote({ urgent: false, important: false }))).toBe("eliminate");
  });
});
