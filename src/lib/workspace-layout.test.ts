import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, validateLayout, workspaceGeometry } from "./workspace-layout";

describe("workspace layout", () => {
  it("validates partial and malformed persisted values", () => {
    expect(validateLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(
      validateLayout({
        leftOpen: "false",
        rightOpen: true,
        widths: { navigation: Infinity, notes: 9999, right: -1 },
      }),
    ).toEqual({
      leftOpen: true,
      rightOpen: true,
      widths: { navigation: 220, notes: 480, right: 240 },
    });
  });
  it("supports all four requested visibility combinations", () => {
    for (const leftOpen of [false, true])
      for (const rightOpen of [false, true]) {
        const result = workspaceGeometry(1600, true, { ...DEFAULT_LAYOUT, leftOpen, rightOpen });
        expect([result.left, result.right]).toEqual([leftOpen, rightOpen]);
      }
  });
  it("reduces widths before hiding, without mutating preferences", () => {
    const prefs = { ...DEFAULT_LAYOUT, rightOpen: true };
    const result = workspaceGeometry(1000, true, prefs);
    expect(result.left && result.right).toBe(true);
    expect(result.center).toBeGreaterThanOrEqual(320);
    expect(prefs.widths).toEqual(DEFAULT_LAYOUT.widths);
  });
  it("prioritizes explicit opening and restores requested panels when growing", () => {
    const prefs = { ...DEFAULT_LAYOUT, rightOpen: true };
    expect(workspaceGeometry(800, true, prefs)).toMatchObject({ left: true, right: false });
    expect(workspaceGeometry(800, true, prefs, "right")).toMatchObject({
      left: false,
      right: true,
    });
    expect(workspaceGeometry(1600, true, prefs, "right")).toMatchObject({
      left: true,
      right: true,
    });
    expect(workspaceGeometry(250, true, prefs).center).toBe(250);
  });
});
