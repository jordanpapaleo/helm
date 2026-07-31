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

  it("defaults missing timestamps to a full UTC datetime", () => {
    const note = parseNote("---\nid: abc\n---\nbody", "/notes/abc.md");
    expect(note.frontmatter.created).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(note.frontmatter.updated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it("preserves a legacy date-only value rather than migrating it on read", () => {
    const note = parseNote(
      "---\nid: abc\ncreated: '2026-07-01'\nupdated: '2026-07-01'\n---\nbody",
      "/notes/abc.md",
    );
    expect(note.frontmatter.created).toBe("2026-07-01");
    expect(note.frontmatter.updated).toBe("2026-07-01");
  });

  it("preserves a full timestamp verbatim", () => {
    const note = parseNote(
      "---\nid: abc\ncreated: '2026-07-31T18:23:05Z'\nupdated: '2026-07-31T18:23:05Z'\n---\nbody",
      "/notes/abc.md",
    );
    expect(note.frontmatter.updated).toBe("2026-07-31T18:23:05Z");
  });

  // js-yaml turns an *unquoted* ISO value into a JS Date, which would break
  // every string comparison in the app. Helm always writes them quoted, but a
  // hand-edited file can still hand us one.
  it("coerces unquoted YAML timestamps back to strings", () => {
    const note = parseNote(
      "---\nid: abc\ncreated: 2026-07-01\nupdated: 2026-07-31T18:23:05Z\n---\nbody",
      "/notes/abc.md",
    );
    expect(typeof note.frontmatter.created).toBe("string");
    expect(typeof note.frontmatter.updated).toBe("string");
    expect(note.frontmatter.created).toBe("2026-07-01");
    expect(note.frontmatter.updated).toBe("2026-07-31T18:23:05Z");
  });
});

describe("serializeNote — timestamp round-trip", () => {
  // The load-bearing guarantee for the whole datetime format: js-yaml would
  // parse an unquoted ISO timestamp back as a Date, so `serializeNote` must
  // emit it quoted and `parseNote` must hand back a string. Every sort and
  // staleness comparison in the app depends on this.
  it("emits timestamps quoted and reads them back as strings", () => {
    const note = parseNote(RAW_NOTE, "/notes/rule-builder.md");
    const withTimestamps = {
      ...note,
      frontmatter: {
        ...note.frontmatter,
        created: "2026-07-31T18:23:05Z",
        updated: "2026-07-31T18:23:05Z",
      },
    };

    const serialized = serializeNote(withTimestamps);
    expect(serialized).toContain("created: '2026-07-31T18:23:05Z'");
    expect(serialized).toContain("updated: '2026-07-31T18:23:05Z'");

    const reparsed = parseNote(serialized, "/notes/rule-builder.md");
    expect(typeof reparsed.frontmatter.created).toBe("string");
    expect(typeof reparsed.frontmatter.updated).toBe("string");
    expect(reparsed.frontmatter.updated).toBe("2026-07-31T18:23:05Z");
  });

  it("round-trips a legacy date-only value as a string too", () => {
    const note = parseNote(RAW_NOTE, "/notes/rule-builder.md");
    const serialized = serializeNote(note);
    expect(serialized).toContain("updated: '2026-03-13'");

    const reparsed = parseNote(serialized, "/notes/rule-builder.md");
    expect(typeof reparsed.frontmatter.updated).toBe("string");
    expect(reparsed.frontmatter.updated).toBe("2026-03-13");
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

  // Unmanaged notes clear their workflow fields to "" / false rather than
  // dropping the keys — the keys must survive a write/read cycle.
  it("round-trips cleared workflow fields (state: '', urgent/important/blocked: false)", () => {
    const note = parseNote(RAW_NOTE, "/notes/rule-builder.md");
    const cleared = {
      ...note,
      frontmatter: {
        ...note.frontmatter,
        unmanaged: true,
        state: "" as const,
        urgent: false,
        important: false,
        blocked: false,
      },
    };

    const serialized = serializeNote(cleared);
    // serializeNote only drops `undefined`, so the keys stay in the YAML.
    expect(serialized).toContain("state: ''");
    expect(serialized).toContain("urgent: false");
    expect(serialized).toContain("important: false");
    expect(serialized).toContain("blocked: false");

    // parseNote uses `?? "Prepare"`, and "" is not nullish, so it survives.
    const reparsed = parseNote(serialized, "/notes/rule-builder.md");
    expect(reparsed.frontmatter.state).toBe("");
    expect(reparsed.frontmatter.urgent).toBe(false);
    expect(reparsed.frontmatter.important).toBe(false);
    expect(reparsed.frontmatter.blocked).toBe(false);
    expect(reparsed.frontmatter.unmanaged).toBe(true);
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

  it("ignores hex color codes (6-digit)", () => {
    expect(extractInlineTags("color: #ff0000")).toEqual([]);
    expect(extractInlineTags("bg #aabbcc text")).toEqual([]);
  });

  it("ignores hex color codes (3-digit)", () => {
    expect(extractInlineTags("color: #fff")).toEqual([]);
    expect(extractInlineTags("#abc")).toEqual([]);
  });

  it("does not ignore non-hex tags that happen to be short", () => {
    expect(extractInlineTags("#work")).toEqual(["work"]);
    expect(extractInlineTags("#rfl")).toEqual(["rfl"]);
  });

  it("ignores tags inside fenced code blocks", () => {
    const content = "hello\n```css\n.foo { color: #ff0000; }\n```\n#work";
    expect(extractInlineTags(content)).toEqual(["work"]);
  });

  it("ignores tags inside inline code", () => {
    expect(extractInlineTags("use `#tag` syntax and #real")).toEqual(["real"]);
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
    expect(note.frontmatter.title).toBe("Raw"); // derived from filename
    expect(note.frontmatter.state).toBe("Prepare");
    expect(note.frontmatter.urgent).toBe(false);
    expect(note.frontmatter.links).toEqual([]);
    expect(note.frontmatter.tags).toEqual([]);
  });

  it("derives title from first H1 when frontmatter title is absent", () => {
    const raw = "# My Great Note\n\nSome content here.";
    const note = parseNote(raw, "/notes/some-file.md");
    expect(note.frontmatter.title).toBe("My Great Note");
  });

  it("prefers frontmatter title over H1", () => {
    const raw = `---\ntitle: Frontmatter Title\n---\n# H1 Title\n\nContent.`;
    const note = parseNote(raw, "/notes/some-file.md");
    expect(note.frontmatter.title).toBe("Frontmatter Title");
  });

  it("falls back to filename when no frontmatter title and no H1", () => {
    const raw = "Just some content without a heading.";
    const note = parseNote(raw, "/notes/my-project-notes.md");
    expect(note.frontmatter.title).toBe("My Project Notes");
  });

  it("derives title from filename with underscores", () => {
    const note = parseNote("content", "/notes/meeting_notes_2026.md");
    expect(note.frontmatter.title).toBe("Meeting Notes 2026");
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
