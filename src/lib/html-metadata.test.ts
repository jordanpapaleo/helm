import { describe, expect, it } from "vitest";
import { parseHtmlMetadata } from "./html-metadata";

describe("parseHtmlMetadata", () => {
  it("reads JSON-encoded values of every type", () => {
    const html = `<html><head>
      <meta name="helm:title" content='"Q3 Report"'>
      <meta name="helm:tags" content='["rfl","rfl/reports"]'>
      <meta name="helm:pinned" content="true">
      <meta name="helm:kanbanOrder" content="3">
    </head><body>x</body></html>`;
    expect(parseHtmlMetadata(html)).toEqual({
      title: "Q3 Report",
      tags: ["rfl", "rfl/reports"],
      pinned: true,
      kanbanOrder: 3,
    });
  });

  it("ignores non-helm meta tags", () => {
    const html = `<meta name="viewport" content="width=device-width">
                  <meta name="helm:title" content='"Kept"'>`;
    expect(parseHtmlMetadata(html)).toEqual({ title: "Kept" });
  });

  it("falls back to the raw string when the value is not valid JSON", () => {
    const html = `<meta name="helm:title" content="Hand Written">`;
    expect(parseHtmlMetadata(html)).toEqual({ title: "Hand Written" });
  });

  it("handles attributes in either order and single or double quotes", () => {
    const html = `<meta content='"A"' name="helm:title">
                  <meta name='helm:state' content='"Doing"'>`;
    expect(parseHtmlMetadata(html)).toEqual({ title: "A", state: "Doing" });
  });

  it("unescapes HTML entities in the attribute value", () => {
    const html = `<meta name="helm:title" content='&quot;A &amp; B&quot;'>`;
    expect(parseHtmlMetadata(html)).toEqual({ title: "A & B" });
  });

  it("unescapes &amp; last so a nested &amp;quot; is not double-decoded into a quote", () => {
    // If &amp; were unescaped before &quot;, "&amp;quot;" would become
    // "&quot;" and then get decoded again into a literal `"` character.
    // Decoding &amp; last leaves the inner entity text alone: "&quot;".
    const html = `<meta name="helm:title" content='&amp;quot;'>`;
    expect(parseHtmlMetadata(html)).toEqual({ title: "&quot;" });
  });

  it("returns an empty object for a document with no helm meta", () => {
    expect(parseHtmlMetadata("<html><body>nothing</body></html>")).toEqual({});
  });
});
