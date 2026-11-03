import { describe, expect, it } from "vitest";
import type { Note, VaultConfig } from "../types/note";
import {
  QUICK_OPEN_RECENT_LIMIT,
  QUICK_OPEN_RESULT_LIMIT,
  quickOpenFolder,
  quickOpenList,
  quickOpenResults,
} from "./quick-open";
import { buildIndex } from "./search";

function note(
  id: string,
  title: string,
  extra: {
    content?: string;
    updated?: string;
    archived?: boolean;
    unmanaged?: boolean;
    filePath?: string;
    vaultId?: string;
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
      tags: [],
      urgent: false,
      important: false,
      state: extra.unmanaged ? "" : "Prepare",
      blocked: false,
      links: [],
      archived: extra.archived,
      unmanaged: extra.unmanaged,
    },
  };
}

function results(notes: Note[], query: string, showArchived = false) {
  return quickOpenResults({ notes, index: buildIndex(notes), query, showArchived }).map(
    (n) => n.id,
  );
}

describe("quickOpenResults", () => {
  it("lists the most recently updated notes for an empty query", () => {
    const notes = [
      note("a", "Alpha", { updated: "2026-03-01T00:00:00Z" }),
      note("b", "Beta", { updated: "2026-05-01T00:00:00Z" }),
      note("c", "Gamma", { updated: "2026-04-01T00:00:00Z" }),
    ];
    expect(results(notes, "  ")).toEqual(["b", "c", "a"]);
  });

  it("caps the recent list", () => {
    const notes = Array.from({ length: QUICK_OPEN_RECENT_LIMIT + 5 }, (_, i) =>
      note(`n${i}`, `Note ${i}`),
    );
    expect(results(notes, "")).toHaveLength(QUICK_OPEN_RECENT_LIMIT);
  });

  it("lists title matches before body matches, each note once", () => {
    const notes = [
      note("body", "Weekly review", {
        content: "notes about the roadmap and a meeting template",
      }),
      note("both", "Roadmap draft", { content: "the roadmap itself" }),
      note("tagged", "RFL plans", { content: "helm-notes" }),
      note("title", "Roadmap"),
      note("template", "Note template"),
    ];
    notes[2].frontmatter.tags = ["template"];
    const roadmap = quickOpenList({
      notes,
      index: buildIndex(notes),
      query: "roadmap",
      showArchived: false,
    });
    expect(roadmap).toEqual({
      kind: "matches",
      titles: [notes[3], notes[1]],
      content: [notes[0]],
    });

    const template = quickOpenList({
      notes,
      index: buildIndex(notes),
      query: "template",
      showArchived: false,
    });
    expect(template.kind).toBe("matches");
    if (template.kind !== "matches") return;
    expect(template.titles.map((n) => n.id)).toEqual(["template"]);
    expect(template.content.map((n) => n.id)).toEqual(["body"]);
    expect(results(notes, "templ")).toEqual(["template", "body"]);
  });

  it("fills title matches before content matches, up to the result cap", () => {
    const notes = [
      ...Array.from({ length: QUICK_OPEN_RESULT_LIMIT }, (_, i) => note(`t${i}`, `Plan ${i}`)),
      note("body", "Other", { content: "plan details" }),
    ];
    const list = quickOpenList({
      notes,
      index: buildIndex(notes),
      query: "plan",
      showArchived: false,
    });
    expect(list.kind).toBe("matches");
    if (list.kind !== "matches") return;
    expect(list.titles).toHaveLength(QUICK_OPEN_RESULT_LIMIT);
    expect(list.content).toEqual([]);
  });

  it("matches title prefixes and small typos", () => {
    const notes = [note("plan", "Planning offsite"), note("other", "Groceries")];
    expect(results(notes, "plan")).toEqual(["plan"]);
    expect(results(notes, "offsit")).toEqual(["plan"]);
    expect(results(notes, "plannimg")).toEqual(["plan"]);
  });

  it("returns nothing when nothing matches", () => {
    expect(results([note("a", "Alpha")], "zzzz")).toEqual([]);
  });

  it("hides archived notes unless Show archived notes is on", () => {
    const notes = [note("live", "Budget 2026"), note("old", "Budget 2025", { archived: true })];
    expect(results(notes, "budget")).toEqual(["live"]);
    expect(results(notes, "")).toEqual(["live"]);
    expect(results(notes, "budget", true)).toContain("old");
  });

  it("includes unmanaged notes", () => {
    const notes = [note("u", "Reading list", { unmanaged: true })];
    expect(results(notes, "reading")).toEqual(["u"]);
    expect(results(notes, "")).toEqual(["u"]);
  });

  it("returns nothing for a query before the index exists", () => {
    expect(
      quickOpenResults({
        notes: [note("a", "Alpha")],
        index: null,
        query: "a",
        showArchived: false,
      }),
    ).toEqual([]);
  });
});

describe("quickOpenFolder", () => {
  const work: VaultConfig = { id: "v1", name: "Work", path: "/vaults/work" };
  const home: VaultConfig = { id: "v2", name: "Home", path: "/vaults/home" };

  it("shows the folder relative to the vault", () => {
    const n = note("a", "A", { filePath: "/vaults/work/projects/q3/a.md" });
    expect(quickOpenFolder(n, [work])).toBe("projects/q3");
  });

  it("shows the vault name for a note at the vault root", () => {
    expect(quickOpenFolder(note("a", "A", { filePath: "/vaults/work/a.md" }), [work])).toBe("Work");
  });

  it("prefixes the vault name when several vaults are loaded", () => {
    const n = note("a", "A", { filePath: "/vaults/home/garden/a.md", vaultId: "v2" });
    expect(quickOpenFolder(n, [work, home])).toBe("Home/garden");
  });
});
