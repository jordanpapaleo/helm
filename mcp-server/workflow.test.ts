import { describe, expect, it } from "vitest";
import { groupEisenhower, groupKanban } from "./workflow";

function note(id: string, state: string, unmanaged?: boolean) {
  return { id, frontmatter: { state, unmanaged } };
}

describe("MCP kanban and eisenhower", () => {
  const notes = [
    note("doing", "Doing"),
    note("prepare", "Prepare"),
    note("unmanaged-doing", "Doing", true),
    note("cleared", "", true),
    note("done", "Done"),
  ];

  it("keeps unmanaged notes off the kanban, including a cleared state", () => {
    const columns = groupKanban(notes);
    expect(columns.Doing.map((item) => item.id)).toEqual(["doing"]);
    expect(columns.Prepare.map((item) => item.id)).toEqual(["prepare"]);
    expect(columns.Done.map((item) => item.id)).toEqual(["done"]);
    expect(columns.Maintain).toEqual([]);
    const placed = Object.values(columns).flatMap((column) => column.map((item) => item.id));
    expect(placed).not.toContain("unmanaged-doing");
    expect(placed).not.toContain("cleared");
  });

  it("keeps unmanaged notes off the eisenhower matrix", () => {
    expect(groupEisenhower(notes).map((item) => item.id)).toEqual(["doing", "prepare"]);
  });
});
