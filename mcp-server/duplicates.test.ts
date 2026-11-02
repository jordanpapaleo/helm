import { describe, expect, it } from "vitest";
import * as app from "../src/lib/duplicate-ids";
import { type CopyKey, partitionDuplicateIds } from "./duplicates";

function copy(id: string, filePath: string, created = "2026-03-13T09:00:00Z"): CopyKey {
  return { id, filePath, created };
}

const fixtures: CopyKey[][] = [
  [copy("A", "/v/a.md"), copy("B", "/v/b.md")],
  [copy("A", "/v/note copy.md"), copy("B", "/v/b.md"), copy("A", "/v/note.md")],
  [copy("A", "/v/zzz.md", "2026-01-01T00:00:00Z"), copy("A", "/v/a.md", "2026-02-01T00:00:00Z")],
  [copy("A", "/v/a.md", ""), copy("A", "/v/longer.md")],
  [copy("A", "/v/note 2.md"), copy("A", "/v/note.md"), copy("A", "/v/note 1.md")],
  [copy("B", "/x/b.md"), copy("A", "/y/a.md"), copy("B", "/w/b.md"), copy("A", "/a/a.md")],
  [copy("", "/v/a.md"), copy("", "/v/b.md")],
];

const keyOf = (item: CopyKey) => item;

describe("mcp partitionDuplicateIds", () => {
  it("keeps one file per id so id lookups are deterministic", () => {
    const original = copy("A", "/vault/plan.md");
    const duplicate = copy("A", "/vault/plan copy.md");
    const { unique, groups } = partitionDuplicateIds([duplicate, original], keyOf);
    expect(unique).toEqual([original]);
    expect(groups).toEqual([{ id: "A", keeper: original, copies: [duplicate] }]);
  });

  it.each(
    fixtures.map((items, index) => [index, items] as const),
  )("picks the same keeper as the app (fixture %i)", (_, items) => {
    expect(partitionDuplicateIds(items, keyOf)).toEqual(app.partitionDuplicateIds(items, keyOf));
    expect(partitionDuplicateIds([...items].reverse(), keyOf).groups).toEqual(
      app.partitionDuplicateIds(items, keyOf).groups,
    );
  });
});
