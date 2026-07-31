import { describe, expect, it } from "vitest";
import { extractInlineTags } from "../../lib/note-parser";
import { findInlineTagRanges } from "./InlineTag";

/** Convenience helper: return the decorated substrings for a piece of text. */
function decorated(text: string): string[] {
  return findInlineTagRanges(text).map((r) => text.slice(r.from, r.to));
}

describe("findInlineTagRanges", () => {
  it("matches a plain tag", () => {
    expect(findInlineTagRanges("hello #work")).toEqual([{ from: 6, to: 11 }]);
    expect(decorated("hello #work")).toEqual(["#work"]);
  });

  it("matches a tag at the start of the text", () => {
    expect(findInlineTagRanges("#work rocks")).toEqual([{ from: 0, to: 5 }]);
  });

  it("matches nested tags", () => {
    expect(decorated("plan #work/project today")).toEqual(["#work/project"]);
  });

  it("matches tags containing underscores and hyphens", () => {
    expect(decorated("#deep_work and #side-quest")).toEqual(["#deep_work", "#side-quest"]);
  });

  it("excludes 3-digit hex colors", () => {
    expect(findInlineTagRanges("use #fff please")).toEqual([]);
  });

  it("excludes 6-digit hex colors", () => {
    expect(findInlineTagRanges("use #ff0000 please")).toEqual([]);
  });

  it("still matches a tag that only looks hex-ish", () => {
    // 5 and 7 characters — neither is a valid 3- or 6-digit hex color
    expect(decorated("#face1 and #decaffe")).toEqual(["#face1", "#decaffe"]);
  });

  it("does not match a # in the middle of a word", () => {
    expect(findInlineTagRanges("issue123#tag")).toEqual([]);
    expect(findInlineTagRanges("abc#def")).toEqual([]);
  });

  it("does not match a markdown heading", () => {
    expect(findInlineTagRanges("# Title")).toEqual([]);
    expect(findInlineTagRanges("### Deep Heading")).toEqual([]);
  });

  it("does not match a bare hash or hash followed by a digit", () => {
    expect(findInlineTagRanges("#")).toEqual([]);
    expect(findInlineTagRanges("issue #42")).toEqual([]);
  });

  it("matches multiple tags on one line with correct offsets", () => {
    const text = "Plan #work and #personal now";
    expect(findInlineTagRanges(text)).toEqual([
      { from: 5, to: 10 },
      { from: 15, to: 24 },
    ]);
    expect(decorated(text)).toEqual(["#work", "#personal"]);
  });

  it("does not include the preceding boundary character in the range", () => {
    const text = "(#work)";
    expect(findInlineTagRanges(text)).toEqual([{ from: 1, to: 6 }]);
    expect(decorated(text)).toEqual(["#work"]);
  });

  it("stops the range at punctuation following the tag", () => {
    expect(decorated("done #work. next")).toEqual(["#work"]);
  });

  it("returns an empty array when there are no tags", () => {
    expect(findInlineTagRanges("just some prose")).toEqual([]);
  });

  it("agrees with extractInlineTags on what counts as a tag", () => {
    const text = "Plan #work/project with #fff and #personal, not issue123#nope or #ff0000";
    const decoratedNames = decorated(text).map((s) => s.slice(1));
    expect(decoratedNames).toEqual(extractInlineTags(text));
  });
});
