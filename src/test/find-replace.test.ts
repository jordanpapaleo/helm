import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { findMatchesInDocument } from "../components/editor/findReplaceExtension";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*" },
    text: { group: "inline" },
  },
  marks: {},
});

function makeDoc(text: string) {
  return schema.node("doc", null, [
    schema.node("paragraph", null, text ? [schema.text(text)] : []),
  ]);
}

describe("findMatchesInDocument", () => {
  it("returns empty array for empty query", () => {
    const doc = makeDoc("hello world");
    expect(findMatchesInDocument(doc, "", false, false)).toEqual([]);
  });

  it("finds a single match", () => {
    const doc = makeDoc("hello world");
    const matches = findMatchesInDocument(doc, "world", false, false);
    expect(matches).toHaveLength(1);
    // ProseMirror positions: doc open(0) > paragraph open(1) > text node at pos 1
    // "hello world" — "world" at index 6, so from = 1+6 = 7, to = 7+5 = 12
    expect(matches[0]).toEqual({ from: 7, to: 12 });
  });

  it("finds multiple matches", () => {
    const doc = makeDoc("cat and cat");
    const matches = findMatchesInDocument(doc, "cat", false, false);
    expect(matches).toHaveLength(2);
  });

  it("is case-insensitive by default (caseSensitive=false)", () => {
    const doc = makeDoc("Hello HELLO hello");
    const matches = findMatchesInDocument(doc, "hello", false, false);
    expect(matches).toHaveLength(3);
  });

  it("respects caseSensitive=true", () => {
    const doc = makeDoc("Hello HELLO hello");
    const matches = findMatchesInDocument(doc, "hello", true, false);
    expect(matches).toHaveLength(1);
  });

  it("respects wholeWord=true — skips partial matches", () => {
    const doc = makeDoc("cat concatenate cat");
    const matches = findMatchesInDocument(doc, "cat", false, true);
    expect(matches).toHaveLength(2);
  });

  it("respects wholeWord=true — matches at start of string", () => {
    const doc = makeDoc("cat is cool");
    const matches = findMatchesInDocument(doc, "cat", false, true);
    expect(matches).toHaveLength(1);
  });

  it("returns empty array when no matches", () => {
    const doc = makeDoc("foo bar");
    expect(findMatchesInDocument(doc, "xyz", false, false)).toHaveLength(0);
  });
});
