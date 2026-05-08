import { describe, expect, it } from "vitest";
import { noteFilePath, parseNote, serializeNote, slugify } from "./note-parser";

const RAW_NOTE = `---
id: 01JPMXYZ123
title: Rule Builder
created: "2026-03-13"
updated: "2026-03-13"
tags:
  - Code
  - CE
urgent: true
important: true
state: Doing
blocked: false
links:
  - 01JPMXYZ456
---

This is the note content.

## Heading

More content here.
`;

describe("parseNote", () => {
  it("extracts frontmatter correctly", () => {
    const note = parseNote(RAW_NOTE, "/notes/rule-builder.md");
    expect(note.frontmatter.id).toBe("01JPMXYZ123");
    expect(note.frontmatter.title).toBe("Rule Builder");
    expect(note.frontmatter.tags).toEqual(["Code", "CE"]);
    expect(note.frontmatter.urgent).toBe(true);
    expect(note.frontmatter.state).toBe("Doing");
  });

  it("extracts body content without frontmatter", () => {
    const note = parseNote(RAW_NOTE, "/notes/rule-builder.md");
    expect(note.content.trim()).toContain("This is the note content.");
    expect(note.content).not.toContain("---");
  });

  it("sets filePath and fileName", () => {
    const note = parseNote(RAW_NOTE, "/notes/rule-builder.md");
    expect(note.filePath).toBe("/notes/rule-builder.md");
    expect(note.fileName).toBe("rule-builder.md");
  });
});

describe("serializeNote", () => {
  it("round-trips a note correctly", () => {
    const note = parseNote(RAW_NOTE, "/notes/rule-builder.md");
    const serialized = serializeNote(note);
    const reparsed = parseNote(serialized, "/notes/rule-builder.md");
    expect(reparsed.frontmatter.id).toBe(note.frontmatter.id);
    expect(reparsed.frontmatter.title).toBe(note.frontmatter.title);
    expect(reparsed.content.trim()).toBe(note.content.trim());
  });
});

describe("slugify", () => {
  it("converts title to filename slug", () => {
    expect(slugify("Rule Builder")).toBe("rule-builder");
    expect(slugify("CE Tooling Updates!")).toBe("ce-tooling-updates");
    expect(slugify("  spaces  ")).toBe("spaces");
  });
});

describe("noteFilePath", () => {
  it("builds full file path from vault and title", () => {
    expect(noteFilePath("/Users/j/notes", "Rule Builder")).toBe("/Users/j/notes/rule-builder.md");
  });
});
