/**
 * Scroll-position handover between the rich-text editor and the markdown textarea.
 *
 * The two surfaces are separate mount trees, so the incoming one always starts at
 * `scrollTop = 0` and the user loses their place. They render the same document at
 * different heights, though, so an absolute pixel offset is meaningless across the
 * toggle — but the *fraction* of the way through the document is approximately the
 * same place in the text.
 *
 * This deliberately measures nothing about the caret. Working out a textarea
 * caret's pixel coordinates needs a mirror element that duplicates font metrics
 * living in CSS custom properties (`--editor-font-size`, `--editor-line-height`),
 * which the settings panel changes at runtime — so it rots. Scroll fraction needs
 * only `scrollTop`, `scrollHeight`, and `clientHeight`, which every scroller
 * reports directly.
 */

interface Scroller {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** Scrollable distance, or 0 when the content fits and nothing can scroll. */
function scrollRange(el: Scroller): number {
  return Math.max(0, el.scrollHeight - el.clientHeight);
}

/**
 * How far through its scrollable range an element is, as 0…1.
 * Returns `null` when the content fits — there is no position worth restoring,
 * and the range is zero so a fraction would be a divide-by-zero.
 */
export function getScrollFraction(el: Scroller): number | null {
  const range = scrollRange(el);
  if (range <= 0) return null;
  const fraction = el.scrollTop / range;
  if (!Number.isFinite(fraction)) return null;
  return Math.min(Math.max(fraction, 0), 1);
}

/**
 * Scroll an element to the same fraction through its (possibly very different)
 * scrollable range. A no-op when the content fits or the fraction is unusable.
 */
export function applyScrollFraction(el: Scroller, fraction: number | null): void {
  if (fraction === null || !Number.isFinite(fraction)) return;
  const range = scrollRange(el);
  if (range <= 0) return;
  el.scrollTop = Math.round(Math.min(Math.max(fraction, 0), 1) * range);
}
