import { describe, expect, it } from "vitest";
import { getEditorMarkdown, unescapeWikiLinks } from "../components/editor/extensions";
import { extractWikiLinks } from "../lib/note-parser";
import { makeEditor } from "./editor-harness";

/**
 * `[[Wiki Links]]` are plain text in the ProseMirror document — WikiLink.ts adds
 * only decorations, no node and no mark — so prosemirror-markdown's `esc()`
 * escapes their brackets like any other `[`/`]` in text, and notes landed on
 * disk as `\[\[Some Note\]\]`. Inside the app that was invisible (re-parsing
 * turns `\[` back into `[`); anything else reading the file saw the backslashes.
 *
 * These tests pin the fix: `getEditorMarkdown` is the one save-side entry point
 * and it unescapes only the *doubled* bracket pairs.
 */
describe("wiki-link bracket escaping on save", () => {
  it("writes an inline wiki link with unescaped brackets", () => {
    const editor = makeEditor("");
    editor.view.dispatch(editor.state.tr.insertText("See [[Some Note]] here"));

    const md = getEditorMarkdown(editor);

    expect(md).toContain("See [[Some Note]] here");
    expect(md).not.toContain("\\[");
    expect(md).not.toContain("\\]");
    editor.destroy();
  });

  it("writes a wiki link on its own line with unescaped brackets", () => {
    const editor = makeEditor("");
    editor.view.dispatch(editor.state.tr.insertText("[[Some Note]]"));

    const md = getEditorMarkdown(editor);

    expect(md).toContain("[[Some Note]]");
    expect(md).not.toContain("\\[");
    editor.destroy();
  });

  it("round-trips a saved wiki link without re-escaping it", () => {
    const first = makeEditor("");
    first.view.dispatch(first.state.tr.insertText("A [[Target]] B"));
    const once = getEditorMarkdown(first);
    first.destroy();

    const second = makeEditor(once);
    const twice = getEditorMarkdown(second);
    second.destroy();

    expect(twice.trim()).toBe(once.trim());
    expect(twice).toContain("[[Target]]");
  });

  // The regression that would make this fix dangerous: single brackets must keep
  // their escaping, or literal prose silently becomes link syntax on reload.
  it("keeps a literal [draft] escaped", () => {
    const editor = makeEditor("");
    editor.view.dispatch(editor.state.tr.insertText("A [draft] idea"));

    const md = getEditorMarkdown(editor);

    expect(md).toContain("\\[draft\\]");
    editor.destroy();
  });

  it("keeps a literal [text](url) escaped so it stays text, not a link", () => {
    const editor = makeEditor("");
    editor.view.dispatch(editor.state.tr.insertText("Type [text](url) literally"));

    const md = getEditorMarkdown(editor);

    expect(md).toContain("\\[text\\](url)");

    // And it survives the trip back: still plain text, not a link node.
    const reloaded = makeEditor(md);
    expect(reloaded.getText()).toContain("[text](url)");
    expect(reloaded.getHTML()).not.toContain("<a ");
    reloaded.destroy();
    editor.destroy();
  });

  it("leaves an unmatched \\[\\[ harmless — no closing pair, no corruption", () => {
    const editor = makeEditor("");
    editor.view.dispatch(editor.state.tr.insertText("Half [[open and ]] alone"));

    const md = getEditorMarkdown(editor);
    const reloaded = makeEditor(md);

    // Text survives verbatim through the round trip either way.
    expect(reloaded.getText()).toContain("Half [[open and ]] alone");
    reloaded.destroy();
    editor.destroy();
  });

  it("leaves code blocks alone — their content is written verbatim", () => {
    // prosemirror-markdown never escapes code-block content, so a wiki link in a
    // fence is already literal and a literal `\[\[` in a fence is real content.
    const source = ["```", "[[not a link]]", "const re = /\\[\\[/;", "```", ""].join("\n");
    const editor = makeEditor(source);

    const md = getEditorMarkdown(editor);

    expect(md).toContain("[[not a link]]");
    expect(md).toContain("const re = /\\[\\[/;");
    editor.destroy();
  });
});

describe("unescapeWikiLinks", () => {
  it("unescapes only doubled bracket pairs", () => {
    expect(unescapeWikiLinks("a \\[\\[X\\]\\] b")).toBe("a [[X]] b");
    expect(unescapeWikiLinks("a \\[X\\] b")).toBe("a \\[X\\] b");
    expect(unescapeWikiLinks("\\[text\\](url)")).toBe("\\[text\\](url)");
  });

  it("leaves other markdown escapes untouched", () => {
    expect(unescapeWikiLinks("\\*not bold\\* \\~x\\~ \\`c\\` \\\\")).toBe(
      "\\*not bold\\* \\~x\\~ \\`c\\` \\\\",
    );
  });

  it("does not touch fenced code blocks", () => {
    const src = "before \\[\\[A\\]\\]\n```\n\\[\\[A\\]\\]\n```\nafter \\[\\[B\\]\\]";
    expect(unescapeWikiLinks(src)).toBe("before [[A]]\n```\n\\[\\[A\\]\\]\n```\nafter [[B]]");
  });

  it("does not touch tilde fences or inline code spans", () => {
    expect(unescapeWikiLinks("~~~\n\\[\\[A\\]\\]\n~~~")).toBe("~~~\n\\[\\[A\\]\\]\n~~~");
    expect(unescapeWikiLinks("use `\\[\\[A\\]\\]` and \\[\\[B\\]\\]")).toBe(
      "use `\\[\\[A\\]\\]` and [[B]]",
    );
  });

  it("is a no-op on already-clean markdown", () => {
    expect(unescapeWikiLinks("plain [[A]] text")).toBe("plain [[A]] text");
  });
});

describe("backward compatibility with notes already on disk", () => {
  it("still resolves wiki links in content saved with escaped brackets", () => {
    // Years of saves left `\[\[…\]\]` in the vault; extractWikiLinks stays a shim.
    expect(extractWikiLinks("See \\[\\[Some Note\\]\\] here")).toEqual(["Some Note"]);
  });

  it("heals escaped brackets the next time the note is saved", () => {
    const editor = makeEditor("See \\[\\[Some Note\\]\\] here");

    const md = getEditorMarkdown(editor);

    expect(md).toContain("See [[Some Note]] here");
    expect(md).not.toContain("\\[");
    editor.destroy();
  });
});
