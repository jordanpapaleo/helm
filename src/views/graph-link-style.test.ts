import { describe, expect, it } from "vitest";
import {
  GRAPH_LINK_OPACITY_PERCENT,
  GRAPH_LINK_WIDTH,
  graphLinkEmphasis,
  graphLinkOpacityColor,
  graphLinkStroke,
} from "./graph-link-style";

const sample = {
  baseContent: "oklch(21% 0.006 285)",
  primary: "#0a84ff",
  error: "#ff453a",
};

describe("graphLinkEmphasis", () => {
  it("rests when nothing is hovered", () => {
    expect(
      graphLinkEmphasis({ deleteHover: false, nodeHovered: false, touchesHoveredNode: false }),
    ).toBe("rest");
  });

  it("dims edges that do not touch the hovered note", () => {
    expect(
      graphLinkEmphasis({ deleteHover: false, nodeHovered: true, touchesHoveredNode: false }),
    ).toBe("dim");
  });

  it("emphasizes edges that touch the hovered note", () => {
    expect(
      graphLinkEmphasis({ deleteHover: false, nodeHovered: true, touchesHoveredNode: true }),
    ).toBe("active");
  });

  it("prefers the delete color when a removable edge is hovered", () => {
    expect(
      graphLinkEmphasis({ deleteHover: true, nodeHovered: true, touchesHoveredNode: true }),
    ).toBe("delete");
  });
});

describe("graphLinkStroke", () => {
  it("draws connecting lines at 75% opacity", () => {
    expect(GRAPH_LINK_OPACITY_PERCENT).toBe(75);
    const stroke = graphLinkOpacityColor(sample.baseContent);
    expect(stroke).toBe(`color-mix(in oklab, ${sample.baseContent} 75%, transparent)`);
    expect(graphLinkStroke("rest", sample)).toBe(stroke);
    expect(graphLinkStroke("dim", sample)).toBe(stroke);
  });

  it("keeps hover colors solid", () => {
    expect(graphLinkStroke("active", sample)).toBe(sample.primary);
    expect(graphLinkStroke("delete", sample)).toBe(sample.error);
    expect(graphLinkStroke("active", sample)).not.toContain("75%");
    expect(graphLinkStroke("delete", sample)).not.toContain("75%");
  });

  it("keeps resting edges thicker than a hairline and thicker than dimmed edges", () => {
    expect(GRAPH_LINK_WIDTH.rest).toBeGreaterThanOrEqual(2);
    expect(GRAPH_LINK_WIDTH.dim).toBeGreaterThanOrEqual(1.5);
    expect(GRAPH_LINK_WIDTH.rest).toBeGreaterThan(GRAPH_LINK_WIDTH.dim);
    expect(GRAPH_LINK_WIDTH.active).toBeGreaterThan(GRAPH_LINK_WIDTH.rest);
    expect(GRAPH_LINK_WIDTH.delete).toBeGreaterThan(GRAPH_LINK_WIDTH.active);
  });
});
