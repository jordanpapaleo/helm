import { describe, expect, it } from "vitest";
import { parseHtmlMetadata, writeHtmlMetadata } from "./html-metadata";

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

describe("writeHtmlMetadata", () => {
  it("inserts a helm block into an existing head", () => {
    const html = `<html>\n<head>\n<title>Q3</title>\n</head>\n<body>\n<p>x</p>\n</body>\n</html>`;
    const out = writeHtmlMetadata(html, { title: "Q3 Report", pinned: true });
    expect(out).toContain(`<meta name="helm:title" content='"Q3 Report"'>`);
    expect(out).toContain(`<meta name="helm:pinned" content='true'>`);
    // everything else survives byte for byte
    expect(out).toContain(`<title>Q3</title>`);
    expect(out).toContain(`<body>\n<p>x</p>\n</body>`);
  });

  it("replaces existing helm tags rather than duplicating them", () => {
    const first = writeHtmlMetadata(`<html><head></head><body>b</body></html>`, { title: "A" });
    const second = writeHtmlMetadata(first, { title: "B" });
    expect(second.match(/name="helm:title"/g)).toHaveLength(1);
    expect(parseHtmlMetadata(second).title).toBe("B");
  });

  it("round-trips every value type", () => {
    const fields = {
      id: "01KX6HDM2Q4WJAB7DD0JE0R68N",
      title: "A & B's <report>",
      tags: ["rfl", "rfl/reports"],
      pinned: true,
      kanbanOrder: 3,
      links: [],
    };
    const out = writeHtmlMetadata(`<html><head></head><body></body></html>`, fields);
    expect(parseHtmlMetadata(out)).toEqual(fields);
  });

  it("creates a head when the document has none", () => {
    const out = writeHtmlMetadata(`<html>\n<body>\n<p>x</p>\n</body>\n</html>`, { title: "A" });
    expect(out).toMatch(/<head>[\s\S]*helm:title[\s\S]*<\/head>/);
    expect(out).toContain(`<body>\n<p>x</p>\n</body>`);
  });

  it("wraps a bare fragment that has no html element", () => {
    const out = writeHtmlMetadata(`<div class="c">hi</div>`, { title: "A" });
    expect(out).toMatch(/<html>[\s\S]*<head>[\s\S]*helm:title/);
    expect(out).toContain(`<div class="c">hi</div>`);
  });

  it("changes nothing but the helm block on rewrite", () => {
    const original = `<html>\n<head>\n  <meta charset="utf-8">\n  <style>body{color:red}</style>\n</head>\n<body>\n  <h1>Title</h1>\n</body>\n</html>`;
    const withMeta = writeHtmlMetadata(original, { title: "A" });
    const stripped = withMeta.replace(/\s*<meta name="helm:[^>]*>/g, "");
    expect(stripped).toBe(original);
  });

  it("omits undefined fields", () => {
    const out = writeHtmlMetadata(`<html><head></head><body></body></html>`, {
      title: "A",
      deadline: undefined,
    });
    expect(out).not.toContain("helm:deadline");
  });
});
