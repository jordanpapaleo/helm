/**
 * Stroke style for Link canvas edges.
 *
 * Edges used to reuse `--color-border` (10% of the text color). On the
 * surface that is a hairline you cannot see. These mixes are opaque blends
 * of the theme text color into the surface, so the same values stay readable
 * on light and dark themes. Percentages are the share of text color.
 */

export type GraphLinkEmphasis = "rest" | "dim" | "active" | "delete";

/** Screen pixels. react-force-graph divides by zoom, so these stay constant. */
export const GRAPH_LINK_WIDTH: Record<GraphLinkEmphasis, number> = {
  rest: 2,
  dim: 1.5,
  active: 2.75,
  delete: 3.25,
};

/**
 * Share of `--color-base-content` mixed into `--color-base-200`.
 * 10% (the border token) falls under 2:1 on every theme. Resting edges stay
 * at or above 3:1; dimmed edges stay visible while a hovered note is emphasized.
 */
export const GRAPH_LINK_CONTENT_MIX = {
  rest: 85,
  dim: 66,
} as const;

export function graphLinkEmphasis(input: {
  deleteHover: boolean;
  nodeHovered: boolean;
  touchesHoveredNode: boolean;
}): GraphLinkEmphasis {
  if (input.deleteHover) return "delete";
  if (input.nodeHovered && input.touchesHoveredNode) return "active";
  if (input.nodeHovered) return "dim";
  return "rest";
}

export function graphLinkMixColor(
  baseContent: string,
  surface: string,
  mixPercent: number,
): string {
  return `color-mix(in oklab, ${baseContent} ${mixPercent}%, ${surface})`;
}

function cssColor(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Theme colors the canvas can stroke. Custom properties stay unresolved in canvas. */
export function readGraphLinkColors(): {
  baseContent: string;
  surface: string;
  primary: string;
  error: string;
} {
  return {
    baseContent: cssColor("--color-base-content", "#1c1c1e"),
    surface: cssColor("--color-base-200", "#f2f2f7"),
    primary: cssColor("--color-primary", "#0a84ff"),
    error: cssColor("--color-error", "#ff453a"),
  };
}

export function graphLinkStroke(
  emphasis: GraphLinkEmphasis,
  color: { baseContent: string; surface: string; primary: string; error: string },
): string {
  if (emphasis === "active") return color.primary;
  if (emphasis === "delete") return color.error;
  const mix = emphasis === "dim" ? GRAPH_LINK_CONTENT_MIX.dim : GRAPH_LINK_CONTENT_MIX.rest;
  return graphLinkMixColor(color.baseContent, color.surface, mix);
}
