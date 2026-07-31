import { describe, expect, it } from "vitest";
import { buildBriefing } from "./briefing";

const TODAY = "2026-07-10";

function fm(overrides: Record<string, unknown> = {}) {
  return {
    id: "01A",
    title: "t",
    created: "2026-07-01",
    updated: TODAY,
    tags: [] as string[],
    urgent: false,
    important: false,
    state: "Prepare",
    blocked: false,
    ...overrides,
  };
}

describe("MCP buildBriefing", () => {
  it("buckets doing, blocked, overdue, dueSoon, staleDoing and excludes Done", () => {
    const notes = [
      { frontmatter: fm({ id: "doing", state: "Doing" }) },
      { frontmatter: fm({ id: "blocked", blocked: true }) },
      { frontmatter: fm({ id: "late", deadline: "2026-07-01" }) },
      { frontmatter: fm({ id: "soon", deadline: "2026-07-15" }) },
      { frontmatter: fm({ id: "stale", state: "Doing", updated: "2026-06-01" }) },
      { frontmatter: fm({ id: "done", state: "Done", blocked: true, deadline: "2020-01-01" }) },
    ];
    const b = buildBriefing(notes, TODAY);
    expect(b.doing.map((n) => n.frontmatter.id)).toEqual(["doing", "stale"]);
    expect(b.blocked.map((n) => n.frontmatter.id)).toEqual(["blocked"]);
    expect(b.overdue.map((n) => n.frontmatter.id)).toEqual(["late"]);
    expect(b.dueSoon.map((n) => n.frontmatter.id)).toEqual(["soon"]);
    expect(b.staleDoing.map((n) => n.frontmatter.id)).toEqual(["stale"]);
  });

  it("dueSoon window is today through today+7 inclusive", () => {
    const notes = [
      { frontmatter: fm({ id: "today", deadline: TODAY }) },
      { frontmatter: fm({ id: "edge", deadline: "2026-07-17" }) },
      { frontmatter: fm({ id: "out", deadline: "2026-07-18" }) },
    ];
    const b = buildBriefing(notes, TODAY);
    expect(b.dueSoon.map((n) => n.frontmatter.id)).toEqual(["today", "edge"]);
  });
});

// KEEP IN SYNC with the matching block in src/lib/briefing.test.ts
describe("MCP buildBriefing — unmanaged notes", () => {
  it("excludes an unmanaged note from every bucket", () => {
    const notes = [
      {
        frontmatter: fm({
          id: "unmanaged",
          unmanaged: true,
          state: "Doing",
          blocked: true,
          deadline: "2026-07-01",
          updated: "2026-06-01",
        }),
      },
    ];
    const b = buildBriefing(notes, TODAY);
    expect(b.doing).toHaveLength(0);
    expect(b.blocked).toHaveLength(0);
    expect(b.overdue).toHaveLength(0);
    expect(b.dueSoon).toHaveLength(0);
    expect(b.staleDoing).toHaveLength(0);
  });

  // The specific regression: marking a Done note unmanaged clears state to "",
  // which is `!== "Done"`, so without the unmanaged filter it would resurface
  // as overdue.
  it("keeps a cleared-state note with a past deadline out of overdue", () => {
    const notes = [
      { frontmatter: fm({ id: "cleared", unmanaged: true, state: "", deadline: "2020-01-01" }) },
      { frontmatter: fm({ id: "managed", deadline: "2020-01-01" }) },
    ];
    const b = buildBriefing(notes, TODAY);
    expect(b.overdue.map((n) => n.frontmatter.id)).toEqual(["managed"]);
  });

  it("still includes managed notes alongside unmanaged ones", () => {
    const notes = [
      { frontmatter: fm({ id: "skip", unmanaged: true, state: "Doing" }) },
      { frontmatter: fm({ id: "keep", state: "Doing" }) },
    ];
    const b = buildBriefing(notes, TODAY);
    expect(b.doing.map((n) => n.frontmatter.id)).toEqual(["keep"]);
  });
});
