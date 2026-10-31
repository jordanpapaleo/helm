import { describe, expect, it } from "vitest";
import { type LinkNote, replaceWikiLinkTitle, resolveOutgoingLinks } from "./note-links";
import { extractWikiLinks } from "./note-parser";

function note(id: string, title: string, content = "", links?: string[]): LinkNote {
  return {
    id,
    content,
    frontmatter: { title, ...(links ? { links } : {}) },
  };
}

describe("resolveOutgoingLinks", () => {
  it("unions a saved id with a wiki title and skips a dangling id and self", () => {
    const self = note("self", "Self", "See [[Other]] and [[self]] and [[missing title]]", [
      "saved",
      "gone",
      "self",
    ]);
    const saved = note("saved", "Saved");
    const other = note("other", "Other");
    const resolved = resolveOutgoingLinks(self, [self, saved, other]);

    expect(resolved).toEqual([
      { id: "saved", fromFrontmatter: true },
      { id: "other", fromFrontmatter: false },
    ]);
  });

  it("matches a wiki title case-insensitively and keeps a single edge when both sources agree", () => {
    const source = note("source", "Source", "See [[pyramid]]", ["target"]);
    const target = note("target", "Pyramid");
    expect(resolveOutgoingLinks(source, [source, target])).toEqual([
      { id: "target", fromFrontmatter: true },
    ]);
  });

  it("resolves a body-only wiki link when frontmatter has no links key", () => {
    const source = note("source", "Source", "See [[pyramid]]");
    const target = note("target", "Pyramid");
    expect(source.frontmatter.links).toBeUndefined();
    expect(resolveOutgoingLinks(source, [source, target])).toEqual([
      { id: "target", fromFrontmatter: false },
    ]);
  });

  it("lets the later note win when two titles match", () => {
    const source = note("source", "Source", "See [[Same]]");
    const first = note("first", "Same");
    const second = note("second", "Same");
    expect(resolveOutgoingLinks(source, [source, first, second])).toEqual([
      { id: "second", fromFrontmatter: false },
    ]);
  });
});

describe("replaceWikiLinkTitle", () => {
  it("rewrites every case variant, including an escaped pair, and leaves other links", () => {
    const content = "See [[alpha]] and [[ALPHA]] plus \\[\\[Alpha\\]\\] and [[Alpha Extra]]";
    const next = replaceWikiLinkTitle(content, "Alpha", "Beta");
    expect(next).toBe("See [[Beta]] and [[Beta]] plus [[Beta]] and [[Alpha Extra]]");
    expect(extractWikiLinks(next)).toEqual(["Beta", "Alpha Extra"]);
  });

  it("trims the inner title and returns the same string when nothing matches", () => {
    expect(replaceWikiLinkTitle("Go to [[ Alpha ]]", "alpha", "Beta")).toBe("Go to [[Beta]]");
    const untouched = "No link, and [[Gamma]]";
    expect(replaceWikiLinkTitle(untouched, "Alpha", "Beta")).toBe(untouched);
  });
});
