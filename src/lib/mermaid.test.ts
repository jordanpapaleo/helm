import { beforeEach, describe, expect, it, vi } from "vitest";

const initialize = vi.fn();
const render = vi.fn();
vi.mock("mermaid", () => ({ default: { initialize, render } }));

import { mermaidAriaLabel, renderMermaid, sanitizeMermaidSvg } from "./mermaid";
import { THEMES } from "./themes";

const light = THEMES[0];
const dark = THEMES.find((t) => t.colorScheme === "dark") ?? THEMES[1];

describe("renderMermaid", () => {
  beforeEach(() => {
    initialize.mockReset();
    render.mockReset();
    render.mockResolvedValue({ svg: "<svg><g><text>A</text></g></svg>" });
  });

  it("initialises mermaid with the strict security level and the theme's colours", async () => {
    await renderMermaid("graph TD; A-->B", dark);
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        themeVariables: expect.objectContaining({ darkMode: true }),
      }),
    );
  });

  it("re-initialises only when the theme changes", async () => {
    await renderMermaid("graph TD; A-->B", light);
    initialize.mockClear();
    await renderMermaid("graph TD; A-->C", light);
    expect(initialize).not.toHaveBeenCalled();
    await renderMermaid("graph TD; A-->C", dark);
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it("never lets one render's theme leak into a concurrent render", async () => {
    await renderMermaid("warm up", light);
    const calls: string[] = [];
    initialize.mockImplementation((cfg: { themeVariables: { darkMode: boolean } }) => {
      calls.push(`init:${cfg.themeVariables.darkMode ? "dark" : "light"}`);
    });
    let release: () => void = () => {};
    render
      .mockImplementationOnce(async () => {
        calls.push("render:1");
        await new Promise<void>((r) => {
          release = r;
        });
        return { svg: "<svg></svg>" };
      })
      .mockImplementationOnce(async () => {
        calls.push("render:2");
        return { svg: "<svg></svg>" };
      });

    const first = renderMermaid("graph TD; A-->B", dark);
    const second = renderMermaid("graph TD; A-->C", light);
    await vi.waitFor(() => expect(calls).toContain("render:1"));
    expect(calls).not.toContain("init:light");
    release();
    await Promise.all([first, second]);
    expect(calls).toEqual(["init:dark", "render:1", "init:light", "render:2"]);
  });

  it("keeps rendering after a failed render", async () => {
    render.mockRejectedValueOnce(new Error("bad"));
    await expect(renderMermaid("x", light)).rejects.toThrow("bad");
    await expect(renderMermaid("graph TD; A-->B", light)).resolves.toContain("<svg");
  });

  it("returns sanitised svg", async () => {
    render.mockResolvedValueOnce({
      svg: '<svg onload="alert(1)"><script>alert(2)</script><text>ok</text></svg>',
    });
    const svg = await renderMermaid("graph TD; A-->B", light);
    expect(svg).toContain("<text>ok</text>");
    expect(svg).not.toMatch(/onload|script/i);
  });

  it("rethrows parse failures as plain errors", async () => {
    render.mockRejectedValueOnce(new Error("Parse error on line 2"));
    await expect(renderMermaid("graph TD; A-->", light)).rejects.toThrow("Parse error on line 2");
  });
});

describe("sanitizeMermaidSvg", () => {
  it("keeps the markup mermaid relies on", () => {
    const svg =
      '<svg id="m1" viewBox="0 0 10 10" aria-roledescription="flowchart-v2">' +
      "<style>#m1 .node rect{fill:#fff}</style>" +
      '<g class="node"><rect width="5" height="5"></rect>' +
      '<foreignObject width="5" height="5"><div><span class="nodeLabel">Label</span></div></foreignObject>' +
      '</g><marker id="arrow"><path d="M0,0 L1,1"></path></marker></svg>';
    const out = sanitizeMermaidSvg(svg);
    expect(out).toContain("<style>");
    expect(out).toContain('class="nodeLabel"');
    expect(out).toContain("<foreignObject");
    expect(out).toContain("<marker");
  });

  it("strips scripts, event handlers and javascript: links", () => {
    const out = sanitizeMermaidSvg(
      '<svg><a href="javascript:alert(1)"><text>x</text></a>' +
        '<foreignObject><div><img src="x" onerror="alert(1)"><iframe src="https://evil"></iframe></div></foreignObject>' +
        "<script>alert(1)</script></svg>",
    );
    expect(out).not.toMatch(/javascript:|onerror|<script|<iframe/i);
  });
});

describe("mermaidAriaLabel", () => {
  it("names the diagram type", () => {
    expect(mermaidAriaLabel("flowchart TD\n A-->B")).toBe("Flowchart diagram");
    expect(mermaidAriaLabel("graph LR; A-->B")).toBe("Flowchart diagram");
    expect(mermaidAriaLabel("sequenceDiagram\n A->>B: hi")).toBe("Sequence diagram");
    expect(mermaidAriaLabel("stateDiagram-v2\n [*] --> A")).toBe("State diagram");
  });

  it("prefers the author's accTitle", () => {
    expect(mermaidAriaLabel("flowchart TD\n accTitle: Checkout flow\n A-->B")).toBe(
      "Checkout flow",
    );
  });

  it("skips front matter, directives and comments before the diagram keyword", () => {
    const src = '---\ntitle: X\n---\n%%{init: {}}%%\n%% note\npie\n "a": 1';
    expect(mermaidAriaLabel(src)).toBe("Pie chart");
  });

  it("falls back to a generic label", () => {
    expect(mermaidAriaLabel("somethingNew\n x")).toBe("Mermaid diagram");
  });
});
