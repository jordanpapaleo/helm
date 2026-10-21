import { describe, expect, it } from "vitest";
import type { TrashItem } from "../store/trash";
import type { Note } from "../types/note";
import { planTrashRestore } from "./restore-trash";

function item(id: string, filePath: string, content: string): TrashItem {
  const note: Note = {
    id,
    filePath,
    fileName: filePath.slice(filePath.lastIndexOf("/") + 1),
    content,
    vaultId: "v1",
    frontmatter: {
      id,
      title: id,
      created: "2026-03-13",
      updated: "2026-03-13",
      tags: [],
      urgent: false,
      important: false,
      state: "Doing",
      blocked: false,
      links: [],
    },
  };
  return { note, deletedAt: "2026-04-01T00:00:00.000Z" };
}

describe("planTrashRestore", () => {
  it("restores the first snapshot for a path and holds the rest", () => {
    const newest = item("new", "/vault/foo.md", "newest body");
    const older = item("old", "/vault/foo.md", "older body");
    const other = item("other", "/vault/bar.md", "bar body");

    const plan = planTrashRestore([newest, older, other], []);

    expect(plan.restore.map((entry) => entry.note.id)).toEqual(["new", "other"]);
    expect(plan.held.map((entry) => entry.note.content)).toEqual(["older body"]);
  });

  it("holds a snapshot whose path is already used by a live note", () => {
    const trashed = item("gone", "/vault/foo.md", "trashed body");
    const plan = planTrashRestore([trashed], ["/vault/foo.md"]);

    expect(plan.restore).toEqual([]);
    expect(plan.held).toEqual([trashed]);
  });

  it("restores every snapshot when the paths are distinct and free", () => {
    const alpha = item("a", "/vault/a.md", "alpha");
    const beta = item("b", "/vault/b.md", "beta");
    const plan = planTrashRestore([alpha, beta], ["/vault/live.md"]);

    expect(plan.restore).toEqual([alpha, beta]);
    expect(plan.held).toEqual([]);
  });
});
