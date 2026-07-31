import { describe, expect, it } from "vitest";
import { extractInlineTags } from "./note-parser";
import {
  isValidTagName,
  normalizeTagName,
  removeInlineTag,
  removeTagFromList,
  renameInlineTag,
  renameTagInList,
  tagMatches,
} from "./tags";

describe("tagMatches", () => {
  it("matches the tag itself", () => {
    expect(tagMatches("work", "work")).toBe(true);
  });

  it("matches descendants", () => {
    expect(tagMatches("work/project", "work")).toBe(true);
    expect(tagMatches("work/project/alpha", "work")).toBe(true);
    expect(tagMatches("work/project/alpha", "work/project")).toBe(true);
  });

  it("does not match a prefix that is not a path boundary", () => {
    expect(tagMatches("workflow", "work")).toBe(false);
    expect(tagMatches("work-flow", "work")).toBe(false);
  });

  it("does not match ancestors or unrelated tags", () => {
    expect(tagMatches("work", "work/project")).toBe(false);
    expect(tagMatches("home", "work")).toBe(false);
  });
});

describe("renameTagInList", () => {
  it("renames the tag and its descendants", () => {
    expect(renameTagInList(["work", "work/project", "work/ops"], "work", "client")).toEqual([
      "client",
      "client/project",
      "client/ops",
    ]);
  });

  it("leaves non-matching tags untouched and preserves order", () => {
    expect(renameTagInList(["alpha", "work", "workflow", "zeta"], "work", "client")).toEqual([
      "alpha",
      "client",
      "workflow",
      "zeta",
    ]);
  });

  it("renames a nested target", () => {
    expect(
      renameTagInList(["work/project", "work/project/alpha", "work/ops"], "work/project", "work/x"),
    ).toEqual(["work/x", "work/x/alpha", "work/ops"]);
  });

  it("deduplicates when the rename collides with an existing tag", () => {
    expect(renameTagInList(["work", "client", "work/a"], "work", "client")).toEqual([
      "client",
      "client/a",
    ]);
  });

  it("returns the list unchanged when nothing matches", () => {
    expect(renameTagInList(["alpha", "beta"], "work", "client")).toEqual(["alpha", "beta"]);
  });
});

describe("removeTagFromList", () => {
  it("removes the tag and its descendants", () => {
    expect(removeTagFromList(["work", "work/project", "home"], "work")).toEqual(["home"]);
  });

  it("keeps tags that merely share a prefix", () => {
    expect(removeTagFromList(["work", "workflow"], "work")).toEqual(["workflow"]);
  });

  it("removes a nested target without touching its parent", () => {
    expect(removeTagFromList(["work", "work/project", "work/project/a"], "work/project")).toEqual([
      "work",
    ]);
  });
});

describe("normalizeTagName", () => {
  it("trims whitespace", () => {
    expect(normalizeTagName("  work  ")).toBe("work");
  });

  it("strips a leading hash", () => {
    expect(normalizeTagName("#work")).toBe("work");
    expect(normalizeTagName("  #work/project ")).toBe("work/project");
  });

  it("returns an empty string for empty input", () => {
    expect(normalizeTagName("   ")).toBe("");
    expect(normalizeTagName("#")).toBe("");
  });
});

describe("isValidTagName", () => {
  it("accepts names the tag grammar can represent", () => {
    expect(isValidTagName("work")).toBe(true);
    expect(isValidTagName("work/project")).toBe(true);
    expect(isValidTagName("work/project-2_b")).toBe(true);
    expect(isValidTagName("a")).toBe(true);
  });

  it("rejects empty names", () => {
    expect(isValidTagName("")).toBe(false);
  });

  it("rejects names that do not start with a letter", () => {
    expect(isValidTagName("1work")).toBe(false);
    expect(isValidTagName("/work")).toBe(false);
    expect(isValidTagName("-work")).toBe(false);
  });

  it("rejects characters outside the tag grammar", () => {
    expect(isValidTagName("my work")).toBe(false);
    expect(isValidTagName("work!")).toBe(false);
    expect(isValidTagName("work.project")).toBe(false);
    expect(isValidTagName("work#project")).toBe(false);
  });

  it("rejects empty path segments", () => {
    expect(isValidTagName("work/")).toBe(false);
    expect(isValidTagName("work//project")).toBe(false);
  });

  // extractInlineTags treats bare 3/6-char hex strings as color values, not
  // tags, so a tag named "abc" would never round-trip from the body.
  it("rejects names that read as hex colors", () => {
    expect(isValidTagName("abc")).toBe(false);
    expect(isValidTagName("ffffff")).toBe(false);
    expect(isValidTagName("abcd")).toBe(true);
    expect(isValidTagName("abc/def")).toBe(true);
  });
});

describe("renameInlineTag", () => {
  it("renames a bare occurrence", () => {
    expect(renameInlineTag("Plan #work today", "work", "client")).toBe("Plan #client today");
  });

  it("renames descendant occurrences", () => {
    expect(renameInlineTag("#work/project and #work/ops", "work", "client")).toBe(
      "#client/project and #client/ops",
    );
  });

  it("does not touch tags that merely share a prefix", () => {
    expect(renameInlineTag("#workflow stays #work goes", "work", "client")).toBe(
      "#workflow stays #client goes",
    );
  });

  it("renames a nested target", () => {
    expect(renameInlineTag("#work/project/a and #work/ops", "work/project", "client")).toBe(
      "#client/a and #work/ops",
    );
  });

  it("renames a tag at the very start of the content", () => {
    expect(renameInlineTag("#work first", "work", "client")).toBe("#client first");
  });

  it("renames consecutive tags", () => {
    expect(renameInlineTag("#work #work #work", "work", "client")).toBe("#client #client #client");
  });

  it("does not rewrite inside fenced code blocks", () => {
    const content = "Live #work\n\n```\nnot a tag: #work\n```\n\nAlso #work/ops";
    expect(renameInlineTag(content, "work", "client")).toBe(
      "Live #client\n\n```\nnot a tag: #work\n```\n\nAlso #client/ops",
    );
  });

  it("does not rewrite inside inline code", () => {
    expect(renameInlineTag("Use `#work` literally but tag #work", "work", "client")).toBe(
      "Use `#work` literally but tag #client",
    );
  });

  it("does not treat a heading as a tag", () => {
    expect(renameInlineTag("# Work heading\n\n#work", "work", "client")).toBe(
      "# Work heading\n\n#client",
    );
  });

  it("does not match a tag glued to a word character", () => {
    expect(renameInlineTag("email a#work b", "work", "client")).toBe("email a#work b");
  });

  it("leaves content untouched when nothing matches", () => {
    const content = "Nothing to see #home here";
    expect(renameInlineTag(content, "work", "client")).toBe(content);
  });

  it("produces a body whose extracted tags reflect the rename", () => {
    const content = "#work and #work/project and #workflow";
    const renamed = renameInlineTag(content, "work", "client");
    expect(extractInlineTags(renamed).sort()).toEqual(["client", "client/project", "workflow"]);
  });
});

// The rewriters must classify code regions exactly the way extractInlineTags
// does, or a body ends up disagreeing with the tag list derived from it. These
// are the inputs where a naive single-pass alternation diverges from
// extractInlineTags' strip-fences-then-strip-inline-code order.
describe("code-region classification matches extractInlineTags", () => {
  const samples = [
    "` ```x``` ` #work",
    "#work ` unclosed #work",
    "``` #work ``` #work",
    "a`b```c#work```d`e #work",
    "`#work",
    "#work`",
    "```\n#work\n``` #work ```\n#work\n```",
  ];

  for (const sample of samples) {
    it(`agrees on ${JSON.stringify(sample)}`, () => {
      const before = extractInlineTags(sample);
      const after = extractInlineTags(renameInlineTag(sample, "work", "client"));
      expect(after.sort()).toEqual(before.map((t) => (t === "work" ? "client" : t)).sort());
    });
  }
});

describe("removeInlineTag", () => {
  it("removes a mid-sentence tag without leaving a double space", () => {
    expect(removeInlineTag("Plan #work today", "work")).toBe("Plan today");
  });

  it("removes a trailing tag without leaving a space before punctuation", () => {
    expect(removeInlineTag("Plan the #work.", "work")).toBe("Plan the.");
  });

  it("removes a tag at end of line without leaving trailing whitespace", () => {
    expect(removeInlineTag("Plan the #work", "work")).toBe("Plan the");
    expect(removeInlineTag("Plan the #work\nnext line", "work")).toBe("Plan the\nnext line");
  });

  it("removes a tag at the start of a line without leaving a leading space", () => {
    expect(removeInlineTag("#work is first", "work")).toBe("is first");
    expect(removeInlineTag("line one\n#work is next", "work")).toBe("line one\nis next");
  });

  it("preserves intentional blank lines", () => {
    expect(removeInlineTag("Tagged: #work\n\nNext paragraph", "work")).toBe(
      "Tagged:\n\nNext paragraph",
    );
  });

  it("removes the whole line when the tag is alone on it", () => {
    expect(removeInlineTag("a\n#work\nb", "work")).toBe("a\nb");
    expect(removeInlineTag("Notes here.\n\n#work\n", "work")).toBe("Notes here.\n\n");
    expect(removeInlineTag("#work", "work")).toBe("");
  });

  it("removes an indented tag-only line entirely", () => {
    expect(removeInlineTag("a\n  #work\nb", "work")).toBe("a\nb");
    expect(removeInlineTag("a\n\t#work\nb", "work")).toBe("a\nb");
  });

  it("removes a list item that held nothing but the tag", () => {
    expect(removeInlineTag("- #work\n- keep", "work")).toBe("- keep");
    expect(removeInlineTag("* #work\n* keep", "work")).toBe("* keep");
    expect(removeInlineTag("+ #work\n+ keep", "work")).toBe("+ keep");
    expect(removeInlineTag("1. #work\n2. keep", "work")).toBe("2. keep");
    expect(removeInlineTag("  - #work/ops\n  - keep", "work")).toBe("  - keep");
  });

  it("removes a task checkbox item that held nothing but the tag", () => {
    expect(removeInlineTag("- [ ] #work\n- [x] keep", "work")).toBe("- [x] keep");
  });

  it("keeps a list item that still has content", () => {
    expect(removeInlineTag("- #work ship it\n- keep", "work")).toBe("- ship it\n- keep");
    expect(removeInlineTag("- ship #work\n- keep", "work")).toBe("- ship\n- keep");
  });

  it("does not remove a blank or empty-bullet line it did not create", () => {
    expect(removeInlineTag("a\n\n#work b\n\nc", "work")).toBe("a\n\nb\n\nc");
    expect(removeInlineTag("- \n- #work\n- keep", "work")).toBe("- \n- keep");
  });

  it("removes a tag-only line with CRLF endings", () => {
    expect(removeInlineTag("a\r\n  #work\r\nb", "work")).toBe("a\r\nb");
  });

  it("removes descendants too", () => {
    expect(removeInlineTag("a #work/project b #work/ops c", "work")).toBe("a b c");
  });

  it("keeps tags that merely share a prefix", () => {
    expect(removeInlineTag("keep #workflow drop #work", "work")).toBe("keep #workflow drop");
  });

  it("removes consecutive tags cleanly", () => {
    expect(removeInlineTag("#work #work rest", "work")).toBe("rest");
    expect(removeInlineTag("start #work #work end", "work")).toBe("start end");
  });

  it("keeps neighbouring tags intact", () => {
    expect(removeInlineTag("#home #work #away", "work")).toBe("#home #away");
  });

  it("does not touch fenced code blocks", () => {
    const content = "Drop #work\n\n```\nkeep #work here\n```\n\nDrop #work/ops too";
    expect(removeInlineTag(content, "work")).toBe("Drop\n\n```\nkeep #work here\n```\n\nDrop too");
  });

  it("does not touch inline code", () => {
    expect(removeInlineTag("Keep `#work` drop #work", "work")).toBe("Keep `#work` drop");
  });

  it("leaves content untouched when nothing matches", () => {
    const content = "Nothing to see #home here";
    expect(removeInlineTag(content, "work")).toBe(content);
  });

  it("produces a body from which the tag is no longer extractable", () => {
    const content = "#work and #work/project and #workflow";
    const stripped = removeInlineTag(content, "work");
    expect(extractInlineTags(stripped)).toEqual(["workflow"]);
  });
});
