import { describe, expect, it } from "vitest";
import {
  extractInlineTags,
  extractWikiLinks,
  noteFilePath,
  parseNote,
  serializeNote,
  slugify,
} from "./note-parser";

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

describe("extractWikiLinks", () => {
  it("extracts a single wiki link", () => {
    expect(extractWikiLinks("See [[Status]] for details")).toEqual(["Status"]);
  });

  it("extracts multiple wiki links", () => {
    expect(extractWikiLinks("[[A]] and [[B]]")).toEqual(["A", "B"]);
  });

  it("deduplicates repeated wiki links", () => {
    expect(extractWikiLinks("[[A]] and [[A]]")).toEqual(["A"]);
  });

  it("returns empty array for empty content", () => {
    expect(extractWikiLinks("")).toEqual([]);
  });

  it("returns empty array when no links are present", () => {
    expect(extractWikiLinks("just plain text here")).toEqual([]);
  });

  it("handles escaped brackets (tiptap-markdown format)", () => {
    expect(extractWikiLinks("\\[\\[Status\\]\\]")).toEqual(["Status"]);
  });

  it("trims whitespace inside brackets", () => {
    expect(extractWikiLinks("[[ trimmed ]]")).toEqual(["trimmed"]);
  });
});

describe("extractInlineTags", () => {
  it("extracts a simple inline tag", () => {
    expect(extractInlineTags("hello #work")).toEqual(["work"]);
  });

  it("extracts hierarchical tags", () => {
    expect(extractInlineTags("#work/project")).toEqual(["work/project"]);
  });

  it("extracts multiple tags", () => {
    const result = extractInlineTags("note #work and #personal/todo here");
    expect(result).toContain("work");
    expect(result).toContain("personal/todo");
    expect(result).toHaveLength(2);
  });

  it("deduplicates repeated tags", () => {
    expect(extractInlineTags("#work something #work")).toEqual(["work"]);
  });

  it("ignores markdown headings (# followed by space)", () => {
    expect(extractInlineTags("# Heading")).toEqual([]);
  });

  it("extracts tag at start of line", () => {
    expect(extractInlineTags("#tag at start")).toEqual(["tag"]);
  });

  it("does not extract tag adjacent to alphanumeric characters", () => {
    expect(extractInlineTags("foo#bar")).toEqual([]);
  });

  it("returns empty array for empty content", () => {
    expect(extractInlineTags("")).toEqual([]);
  });
});

describe("parseNote edge cases", () => {
  it("applies defaults when frontmatter fields are missing", () => {
    const raw = `---
title: Minimal Note
---
Some content.
`;
    const note = parseNote(raw, "/notes/minimal.md");
    expect(note.frontmatter.id).toBe("");
    expect(note.frontmatter.state).toBe("Prepare");
    expect(note.frontmatter.urgent).toBe(false);
    expect(note.frontmatter.important).toBe(false);
    expect(note.frontmatter.blocked).toBe(false);
    expect(note.frontmatter.locked).toBe(false);
    expect(note.frontmatter.pinned).toBe(false);
    expect(note.frontmatter.links).toEqual([]);
  });

  it("applies defaults when there is no frontmatter at all", () => {
    const raw = "Just raw markdown with no frontmatter.";
    const note = parseNote(raw, "/notes/raw.md");
    expect(note.frontmatter.id).toBe("");
    expect(note.frontmatter.title).toBe("");
    expect(note.frontmatter.state).toBe("Prepare");
    expect(note.frontmatter.urgent).toBe(false);
    expect(note.frontmatter.links).toEqual([]);
    expect(note.frontmatter.tags).toEqual([]);
  });

  it("merges frontmatter tags with inline tags and deduplicates", () => {
    const raw = `---
title: Tag Test
tags:
  - work
  - shared
---
Content with #shared and #inline tags.
`;
    const note = parseNote(raw, "/notes/tag-test.md");
    expect(note.frontmatter.tags).toContain("work");
    expect(note.frontmatter.tags).toContain("shared");
    expect(note.frontmatter.tags).toContain("inline");
    // "shared" appears in both frontmatter and inline — should appear only once
    expect(note.frontmatter.tags.filter((t) => t === "shared")).toHaveLength(1);
  });

  it("preserves unknown frontmatter fields via spread", () => {
    const raw = `---
title: Custom Fields
customField: hello
anotherField: 42
---
Content.
`;
    const note = parseNote(raw, "/notes/custom.md");
    expect((note.frontmatter as Record<string, unknown>).customField).toBe("hello");
    expect((note.frontmatter as Record<string, unknown>).anotherField).toBe(42);
  });
});
