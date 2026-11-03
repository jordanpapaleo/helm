import { describe, expect, it } from "vitest";
import type { Note } from "../types/note";
import { notesForList, trashForList } from "./note-list";

function note(
  id: string,
  title: string,
  extra: Partial<Note> & {
    archived?: boolean;
    tags?: string[];
    pinned?: boolean;
    updated?: string;
  } = {},
): Note {
  return {
    id,
    filePath: extra.filePath ?? `/vault/${id}.md`,
    fileName: `${id}.md`,
    content: extra.content ?? "",
    vaultId: extra.vaultId ?? "v1",
    frontmatter: {
      id,
      title,
      created: "2026-01-01T00:00:00Z",
      updated: extra.updated ?? "2026-01-01T00:00:00Z",
      tags: extra.tags ?? [],
      urgent: false,
      important: false,
      state: "Prepare",
      blocked: false,
      links: [],
      archived: extra.archived,
      pinned: extra.pinned,
    },
  };
}

describe("notesForList", () => {
  const current = note("current", "Current", { content: "current body" });
  const archived = note("old", "Old Decision", {
    content: "preserved body",
    tags: ["keep"],
    archived: true,
  });
  const deleted = note("gone", "Gone", { content: "discarded draft", tags: ["keep"] });
  const trash = [{ note: deleted, deletedAt: "2026-04-01T00:00:00.000Z" }];

  it("hides archived and deleted notes until a query matches them", () => {
    const hidden = notesForList({
      notes: [current, archived],
      trash,
      grouping: { type: "all", id: null },
      activeVaultId: "v1",
      showArchived: false,
      query: "",
    });
    expect(hidden.map((row) => row.note.id)).toEqual(["current"]);

    const byTitle = notesForList({
      notes: [current, archived],
      trash,
      grouping: { type: "all", id: null },
      activeVaultId: "v1",
      showArchived: false,
      query: "Old",
    });
    expect(byTitle.map((row) => row.note.id)).toEqual(["old"]);

    const byBody = notesForList({
      notes: [current, archived],
      trash,
      grouping: { type: "all", id: null },
      activeVaultId: "v1",
      showArchived: false,
      query: "discarded",
    });
    expect(byBody.map((row) => [row.note.id, row.deletedAt])).toEqual([
      ["gone", "2026-04-01T00:00:00.000Z"],
    ]);

    const byTag = notesForList({
      notes: [current, archived],
      trash,
      grouping: { type: "all", id: null },
      activeVaultId: "v1",
      showArchived: false,
      query: "keep",
    });
    expect(byTag.map((row) => row.note.id).sort()).toEqual(["gone", "old"]);
  });

  it("does not list the same archived note twice when show archived is on", () => {
    const rows = notesForList({
      notes: [current, archived],
      trash,
      grouping: { type: "all", id: null },
      activeVaultId: "v1",
      showArchived: true,
      query: "body",
    });
    expect(rows.map((row) => row.note.id).sort()).toEqual(["current", "old"]);
  });

  it("lists only archived notes in the archive grouping, then filters them", () => {
    const all = notesForList({
      notes: [current, archived],
      trash,
      grouping: { type: "archive", id: null },
      activeVaultId: "v1",
      showArchived: false,
      query: "",
    });
    expect(all.map((row) => row.note.id)).toEqual(["old"]);

    const missed = notesForList({
      notes: [current, archived],
      trash,
      grouping: { type: "archive", id: null },
      activeVaultId: "v1",
      showArchived: false,
      query: "discarded",
    });
    expect(missed).toEqual([]);
  });

  it("keeps folder scope for archived and deleted matches", () => {
    const inside = note("inside", "Inside", {
      filePath: "/vault/inbox/inside.md",
      archived: true,
      content: "lighthouse",
    });
    const outside = note("outside", "Outside", { content: "lighthouse" });
    const trashed = note("trashed", "Trashed", {
      filePath: "/vault/other/trashed.md",
      content: "lighthouse",
    });
    const rows = notesForList({
      notes: [inside, outside],
      trash: [{ note: trashed, deletedAt: "2026-04-01T00:00:00.000Z" }],
      grouping: { type: "folder", id: "/vault/inbox" },
      activeVaultId: "v1",
      showArchived: false,
      query: "lighthouse",
    });
    expect(rows.map((row) => row.note.id)).toEqual(["inside"]);
  });
});

describe("notesForList pinned order", () => {
  const pinnedOld = note("pinned", "Pinned old", {
    updated: "2026-01-01T00:00:00Z",
    pinned: true,
    archived: true,
  });
  const newer = note("newer", "Newer", { updated: "2026-02-01T00:00:00Z", archived: true });
  const list = (grouping: { type: "all" | "archive"; id: null }, query: string) =>
    notesForList({
      notes: [newer, pinnedOld],
      trash: [],
      grouping,
      activeVaultId: "v1",
      showArchived: true,
      query,
    }).map((row) => row.note.id);

  it("always puts pinned notes before newer unpinned notes", () => {
    expect(list({ type: "all", id: null }, "")).toEqual(["pinned", "newer"]);
    expect(list({ type: "all", id: null }, "e")).toEqual(["pinned", "newer"]);
    expect(list({ type: "archive", id: null }, "")).toEqual(["pinned", "newer"]);
  });
});

describe("trashForList", () => {
  it("filters trash with the same title, tag, and body match", () => {
    const alpha = note("a", "Alpha", { content: "one", tags: ["work"] });
    const beta = note("b", "Beta", { content: "two" });
    const trash = [
      { note: alpha, deletedAt: "2026-04-01T00:00:00.000Z" },
      { note: beta, deletedAt: "2026-04-02T00:00:00.000Z" },
    ];
    expect(trashForList(trash, "").map((item) => item.note.id)).toEqual(["a", "b"]);
    expect(trashForList(trash, "work").map((item) => item.note.id)).toEqual(["a"]);
    expect(trashForList(trash, "two").map((item) => item.note.id)).toEqual(["b"]);
  });
});
