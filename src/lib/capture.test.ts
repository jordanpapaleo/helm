import { describe, expect, it } from "vitest";
import { buildCaptureNote } from "./capture";

const NOW = new Date("2026-07-10T15:30:00Z").getTime();

describe("buildCaptureNote", () => {
  it("returns null for blank input", () => {
    expect(buildCaptureNote("", "/vault", NOW)).toBeNull();
    expect(buildCaptureNote("   \n  ", "/vault", NOW)).toBeNull();
  });

  it("uses the first non-empty line as the title", () => {
    const result = buildCaptureNote("Buy milk\nand eggs", "/vault", NOW);
    expect(result?.raw).toContain("title: Buy milk");
  });

  it("truncates long titles to 60 characters", () => {
    const long = "x".repeat(100);
    const result = buildCaptureNote(long, "/vault", NOW);
    expect(result?.raw).toContain(`title: ${"x".repeat(60)}`);
  });

  it("writes the note into the vault root with a slug-based unique filename", () => {
    const result = buildCaptureNote("Buy milk", "/vault", NOW);
    expect(result?.filePath).toMatch(/^\/vault\/buy-milk-\d+\.md$/);
  });

  it("falls back to 'capture' when the title has no sluggable characters", () => {
    const result = buildCaptureNote("!!!", "/vault", NOW);
    expect(result?.filePath).toMatch(/^\/vault\/capture-\d+\.md$/);
  });

  // Quoting is load-bearing: unquoted, js-yaml would read these back as Date
  // objects and every string comparison in the app would break.
  it("keeps the full text as content and stamps created/updated from now", () => {
    const result = buildCaptureNote("Buy milk\nand eggs", "/vault", NOW);
    expect(result?.raw).toContain("Buy milk\nand eggs");
    expect(result?.raw).toContain("created: '2026-07-10T15:30:00Z'");
    expect(result?.raw).toContain("updated: '2026-07-10T15:30:00Z'");
  });

  it("extracts inline tags into frontmatter", () => {
    const result = buildCaptureNote("Fix the login bug #work/auth", "/vault", NOW);
    expect(result?.raw).toContain("work/auth");
  });

  it("assigns a ULID id", () => {
    const result = buildCaptureNote("hello", "/vault", NOW);
    expect(result?.raw).toMatch(/id: [0-9A-HJKMNP-TV-Z]{26}/);
  });
});
