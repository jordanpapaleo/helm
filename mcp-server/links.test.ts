import { describe, expect, it } from "vitest";
import {
  replaceWikiLinkTitle as appReplace,
  resolveOutgoingLinks as appResolve,
  type LinkNote,
} from "../src/lib/note-links";
import { extractWikiLinks as appExtract } from "../src/lib/note-parser";
import { extractWikiLinks, replaceWikiLinkTitle, resolveOutgoingLinks } from "./links";

function note(id: string, title: string, content = "", links?: string[]): LinkNote {
  return {
    id,
    content,
    frontmatter: { title, ...(links ? { links } : {}) },
  };
}

const fixtures: { label: string; note: LinkNote; notes: LinkNote[] }[] = [
  {
    label: "wiki only",
    note: note("source", "Source", "See [[pyramid]]"),
    notes: [note("source", "Source", "See [[pyramid]]"), note("target", "Pyramid")],
  },
  {
    label: "union",
    note: note("self", "Self", "See [[Other]] and [[self]]", ["saved", "gone", "self"]),
    notes: [
      note("self", "Self", "See [[Other]] and [[self]]", ["saved", "gone", "self"]),
      note("saved", "Saved"),
      note("other", "Other"),
    ],
  },
];

const bodies = [
  "See [[alpha]] and [[ALPHA]] plus \\[\\[Alpha\\]\\] and [[Alpha Extra]]",
  "Go to [[ Alpha ]]",
  "No link, and [[Gamma]]",
  "See \\[\\[Some Note\\]\\] here",
];

describe("MCP links stay in sync with the app", () => {
  it("resolves the same ids the app resolver returns", () => {
    for (const fixture of fixtures) {
      expect(resolveOutgoingLinks(fixture.note, fixture.notes), fixture.label).toEqual(
        appResolve(fixture.note, fixture.notes),
      );
    }
  });

  it("rewrites wiki titles the same way the app does", () => {
    for (const body of bodies) {
      expect(replaceWikiLinkTitle(body, "Alpha", "Beta")).toBe(appReplace(body, "Alpha", "Beta"));
      expect(extractWikiLinks(body)).toEqual(appExtract(body));
    }
  });
});
