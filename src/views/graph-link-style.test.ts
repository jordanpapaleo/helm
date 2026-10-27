import { describe, expect, it } from "vitest";
import { THEMES } from "../lib/themes";
import {
  GRAPH_LINK_CONTENT_MIX,
  GRAPH_LINK_WIDTH,
  graphLinkEmphasis,
  graphLinkMixColor,
  graphLinkStroke,
} from "./graph-link-style";

interface Oklab {
  l: number;
  a: number;
  b: number;
}

/** Parse a theme token. Themes store every color as `oklch(L% C H)`. */
function parseOklch(input: string): Oklab {
  const match = input.match(/oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)/i);
  if (!match) throw new Error(`expected oklch(), got ${input}`);
  const l = Number(match[1]) / 100;
  const c = Number(match[2]);
  const h = (Number(match[3]) * Math.PI) / 180;
  return { l, a: c * Math.cos(h), b: c * Math.sin(h) };
}

function mixOklab(foreground: Oklab, background: Oklab, foregroundShare: number): Oklab {
  const keep = 1 - foregroundShare;
  return {
    l: foregroundShare * foreground.l + keep * background.l,
    a: foregroundShare * foreground.a + keep * background.a,
    b: foregroundShare * foreground.b + keep * background.b,
  };
}

/** OKLab → linear sRGB, then WCAG relative luminance. Channels are clipped. */
function relativeLuminance(color: Oklab): number {
  const l = color.l + 0.3963377774 * color.a + 0.2158037573 * color.b;
  const m = color.l - 0.1055613458 * color.a - 0.0638541728 * color.b;
  const s = color.l - 0.0894841775 * color.a - 1.291485548 * color.b;
  const l3 = l * l * l;
  const m3 = m * m * m;
  const s3 = s * s * s;
  const linear = [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ].map((channel) => Math.min(1, Math.max(0, channel)));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground: Oklab, background: Oklab): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function edgeContrast(baseContent: string, surface: string, mixPercent: number): number {
  const mixed = mixOklab(parseOklch(baseContent), parseOklch(surface), mixPercent / 100);
  return contrastRatio(mixed, parseOklch(surface));
}

const sample = {
  baseContent: "oklch(21% 0.006 285)",
  surface: "oklch(98% 0 0)",
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
  it("mixes text into the surface instead of using the 10% border token", () => {
    const stroke = graphLinkStroke("rest", sample);
    expect(stroke).toBe(
      graphLinkMixColor(sample.baseContent, sample.surface, GRAPH_LINK_CONTENT_MIX.rest),
    );
    expect(stroke).not.toContain("10%");
    expect(stroke).not.toContain("transparent");
  });

  it("uses a lighter mix for dimmed edges and theme colors for hover", () => {
    expect(graphLinkStroke("dim", sample)).toContain(`${GRAPH_LINK_CONTENT_MIX.dim}%`);
    expect(graphLinkStroke("active", sample)).toBe(sample.primary);
    expect(graphLinkStroke("delete", sample)).toBe(sample.error);
  });

  it("keeps resting edges thicker than a hairline and thicker than dimmed edges", () => {
    expect(GRAPH_LINK_WIDTH.rest).toBeGreaterThanOrEqual(2);
    expect(GRAPH_LINK_WIDTH.dim).toBeGreaterThanOrEqual(1.5);
    expect(GRAPH_LINK_WIDTH.rest).toBeGreaterThan(GRAPH_LINK_WIDTH.dim);
    expect(GRAPH_LINK_WIDTH.active).toBeGreaterThan(GRAPH_LINK_WIDTH.rest);
    expect(GRAPH_LINK_WIDTH.delete).toBeGreaterThan(GRAPH_LINK_WIDTH.active);
  });
});

describe("link edge contrast", () => {
  it("treats black on white as 21:1 so the contrast math is anchored", () => {
    const ratio = contrastRatio(parseOklch("oklch(0% 0 0)"), parseOklch("oklch(100% 0 0)"));
    expect(ratio).toBeGreaterThan(20);
    expect(ratio).toBeLessThan(22);
  });

  it("keeps resting and dimmed edges at least 3:1 on every theme", () => {
    for (const theme of THEMES) {
      const rest = edgeContrast(theme.baseContent, theme.base200, GRAPH_LINK_CONTENT_MIX.rest);
      const dim = edgeContrast(theme.baseContent, theme.base200, GRAPH_LINK_CONTENT_MIX.dim);
      const border = edgeContrast(theme.baseContent, theme.base200, 10);
      expect(rest, `${theme.id} resting edge`).toBeGreaterThanOrEqual(3);
      expect(dim, `${theme.id} dimmed edge`).toBeGreaterThanOrEqual(3);
      expect(rest, `${theme.id} rest vs dim`).toBeGreaterThan(dim);
      expect(border, `${theme.id} old border mix`).toBeLessThan(2);
    }
  });
});
