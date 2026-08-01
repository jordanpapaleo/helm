import { describe, expect, it } from "vitest";
import { htmlDocumentTitle, htmlToText } from "./html-text";

describe("htmlDocumentTitle", () => {
  it("prefers the title element", () => {
    expect(
      htmlDocumentTitle("<head><title>From Title</title></head><body><h1>From H1</h1></body>"),
    ).toBe("From Title");
  });

  it("falls back to the first h1", () => {
    expect(htmlDocumentTitle("<body><h1>From H1</h1><h1>Second</h1></body>")).toBe("From H1");
  });

  it("returns an empty string when neither is present", () => {
    expect(htmlDocumentTitle("<body><p>nothing</p></body>")).toBe("");
  });

  it("strips inner markup and collapses whitespace", () => {
    expect(htmlDocumentTitle("<h1>A <em>styled</em>\n  title</h1>")).toBe("A styled title");
  });
});

describe("htmlToText", () => {
  it("drops script and style content", () => {
    const html = `<style>body{color:red}</style><script>alert(1)</script><p>Real text</p>`;
    expect(htmlToText(html)).toBe("Real text");
  });

  it("drops tags and attributes but keeps their text", () => {
    expect(htmlToText(`<div class="card"><p>Hello</p><p>World</p></div>`)).toBe("Hello World");
  });

  it("decodes entities", () => {
    expect(htmlToText("<p>A &amp; B &lt;3</p>")).toBe("A & B <3");
  });

  it("drops comments, including helm metadata", () => {
    expect(htmlToText(`<!-- a comment --><meta name="helm:title" content='"X"'><p>Body</p>`)).toBe(
      "Body",
    );
  });
});
