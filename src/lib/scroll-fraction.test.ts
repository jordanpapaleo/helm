import { describe, expect, it } from "vitest";
import { applyScrollFraction, getScrollFraction } from "./scroll-fraction";

/**
 * jsdom performs no layout, so a real element always reports zeroes. These tests
 * drive the arithmetic directly with the three numbers the production code reads,
 * which is the whole of what this module does.
 */
function scroller(scrollTop: number, scrollHeight: number, clientHeight: number) {
  return { scrollTop, scrollHeight, clientHeight };
}

describe("getScrollFraction", () => {
  it("reports how far through the scrollable range the element is", () => {
    expect(getScrollFraction(scroller(0, 1000, 200))).toBe(0);
    expect(getScrollFraction(scroller(400, 1000, 200))).toBe(0.5);
    expect(getScrollFraction(scroller(800, 1000, 200))).toBe(1);
  });

  it("returns null when the content fits, rather than dividing by zero", () => {
    expect(getScrollFraction(scroller(0, 200, 200))).toBeNull();
    expect(getScrollFraction(scroller(0, 100, 200))).toBeNull();
  });

  it("clamps a scrollTop that overshoots (rubber-band / stale layout)", () => {
    expect(getScrollFraction(scroller(9999, 1000, 200))).toBe(1);
    expect(getScrollFraction(scroller(-50, 1000, 200))).toBe(0);
  });
});

describe("applyScrollFraction", () => {
  it("scrolls to the same fraction of a differently sized range", () => {
    // The rich-text view is routinely a different height from the raw markdown.
    const el = scroller(0, 4000, 200);
    applyScrollFraction(el, 0.5);
    expect(el.scrollTop).toBe(1900);
  });

  it("does nothing when the content fits", () => {
    const el = scroller(0, 150, 200);
    applyScrollFraction(el, 0.75);
    expect(el.scrollTop).toBe(0);
  });

  it("ignores a missing or non-finite fraction instead of producing NaN", () => {
    const el = scroller(37, 1000, 200);
    applyScrollFraction(el, null);
    expect(el.scrollTop).toBe(37);
    applyScrollFraction(el, Number.NaN);
    expect(el.scrollTop).toBe(37);
  });

  it("clamps out-of-range fractions into the scrollable range", () => {
    const el = scroller(0, 1000, 200);
    applyScrollFraction(el, 5);
    expect(el.scrollTop).toBe(800);
    applyScrollFraction(el, -5);
    expect(el.scrollTop).toBe(0);
  });

  it("round-trips a position between two scrollers of different heights", () => {
    const markdown = scroller(600, 3000, 300);
    const fraction = getScrollFraction(markdown);
    expect(fraction).toBeCloseTo(600 / 2700, 10);

    const editor = scroller(0, 5400, 300);
    applyScrollFraction(editor, fraction);

    // Same fraction through the document, not the same pixel offset — and
    // landing on a whole pixel, since that is what scrollTop is.
    expect(editor.scrollTop).toBe(Math.round((600 / 2700) * 5100));
    expect(getScrollFraction(editor)).toBeCloseTo(fraction as number, 3);
  });
});
