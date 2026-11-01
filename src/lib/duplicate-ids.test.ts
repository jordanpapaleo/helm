import { describe, expect, it } from "vitest";
import { type CopyKey, partitionDuplicateIds } from "./duplicate-ids";

function copy(id: string, filePath: string, created = "2026-03-13T09:00:00Z"): CopyKey {
  return { id, filePath, created };
}

const keyOf = (item: CopyKey) => item;

describe("partitionDuplicateIds", () => {
  it("returns every item and no groups when ids are unique", () => {
    const items = [copy("A", "/v/a.md"), copy("B", "/v/b.md")];
    const { unique, groups } = partitionDuplicateIds(items, keyOf);
    expect(unique).toEqual(items);
    expect(groups).toEqual([]);
  });

  it("keeps one copy per id and groups the rest", () => {
    const original = copy("A", "/v/note.md");
    const duplicate = copy("A", "/v/note copy.md");
    const other = copy("B", "/v/b.md");
    const { unique, groups } = partitionDuplicateIds([duplicate, other, original], keyOf);
    expect(unique.map((item) => item.filePath)).toEqual(["/v/b.md", "/v/note.md"]);
    expect(groups).toEqual([{ id: "A", keeper: original, copies: [duplicate] }]);
  });

  it("keeps the earliest created copy", () => {
    const older = copy("A", "/v/zzz-long-name.md", "2026-01-01T00:00:00Z");
    const newer = copy("A", "/v/a.md", "2026-02-01T00:00:00Z");
    const { groups } = partitionDuplicateIds([newer, older], keyOf);
    expect(groups[0].keeper).toBe(older);
  });

  it("ranks a missing created date last", () => {
    const undated = copy("A", "/v/a.md", "");
    const dated = copy("A", "/v/longer-name.md");
    const { groups } = partitionDuplicateIds([undated, dated], keyOf);
    expect(groups[0].keeper).toBe(dated);
  });

  it("breaks created ties by shorter path, then path order", () => {
    const a = copy("A", "/v/note 2.md");
    const b = copy("A", "/v/note.md");
    const c = copy("A", "/v/note 1.md");
    const { groups } = partitionDuplicateIds([a, b, c], keyOf);
    expect(groups[0].keeper).toBe(b);
    expect(groups[0].copies).toEqual([c, a]);
  });

  it("is independent of input order", () => {
    const items = [copy("A", "/v/x.md"), copy("A", "/v/yy.md"), copy("A", "/v/w.md")];
    const forward = partitionDuplicateIds(items, keyOf).groups;
    const reversed = partitionDuplicateIds([...items].reverse(), keyOf).groups;
    expect(reversed).toEqual(forward);
  });

  it("ignores items without an id", () => {
    const items = [copy("", "/v/a.md"), copy("", "/v/b.md")];
    const { unique, groups } = partitionDuplicateIds(items, keyOf);
    expect(unique).toEqual(items);
    expect(groups).toEqual([]);
  });
});
