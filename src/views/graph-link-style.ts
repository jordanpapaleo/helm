/**
 * Stroke style for Link canvas edges.
 *
 * Connecting lines are the theme text color at 80% opacity. A solid mix of
 * that color into the surface was too strong. Hovered edges keep the solid
 * primary and error colors.
 */

export type GraphLinkEmphasis = "rest" | "dim" | "active" | "delete";

/** Screen pixels. react-force-graph divides by zoom, so these stay constant. */
export const GRAPH_LINK_WIDTH: Record<GraphLinkEmphasis, number> = {
  rest: 2,
  dim: 1.5,
  active: 2.75,
  delete: 3.25,
};

/** Opacity of a connecting line that is not using a hover color. */
export const GRAPH_LINK_OPACITY_PERCENT = 80;

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

export function graphLinkOpacityColor(baseContent: string): string {
  return `color-mix(in oklab, ${baseContent} ${GRAPH_LINK_OPACITY_PERCENT}%, transparent)`;
}

function cssColor(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Theme colors the canvas can stroke. Custom properties stay unresolved in canvas. */
export function readGraphLinkColors(): {
  baseContent: string;
  primary: string;
  error: string;
} {
  return {
    baseContent: cssColor("--color-base-content", "#1c1c1e"),
    primary: cssColor("--color-primary", "#0a84ff"),
    error: cssColor("--color-error", "#ff453a"),
  };
}

export function graphLinkStroke(
  emphasis: GraphLinkEmphasis,
  color: { baseContent: string; primary: string; error: string },
): string {
  if (emphasis === "active") return color.primary;
  if (emphasis === "delete") return color.error;
  return graphLinkOpacityColor(color.baseContent);
}
