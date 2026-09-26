import DOMPurify from "dompurify";
import { mermaidThemeVariables } from "./mermaid-theme";
import type { Theme } from "./themes";

// Mermaid is imported on first use so it stays out of the initial bundle.

type MermaidModule = typeof import("mermaid")["default"];

let loading: Promise<MermaidModule> | null = null;
let currentThemeId: string | null = null;
let renderCounter = 0;

async function load(theme: Theme): Promise<MermaidModule> {
  if (!loading) {
    loading = import("mermaid").then((m) => m.default);
  }
  const mermaid = await loading;
  if (currentThemeId !== theme.id) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      themeVariables: mermaidThemeVariables(theme),
      fontFamily: "inherit",
    });
    currentThemeId = theme.id;
  }
  return mermaid;
}

/**
 * Defence in depth on top of mermaid's strict mode: the SVG is injected as
 * markup, so anything executable is stripped before it gets near the DOM.
 * The html profile stays on because mermaid draws labels as HTML inside
 * `<foreignObject>`.
 */
export function sanitizeMermaidSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true, html: true },
    ADD_TAGS: ["foreignObject", "style"],
    HTML_INTEGRATION_POINTS: { foreignobject: true },
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button"],
  });
}

export async function renderMermaid(source: string, theme: Theme): Promise<string> {
  const mermaid = await load(theme);
  const id = `helm-mermaid-${++renderCounter}`;
  try {
    const { svg } = await mermaid.render(id, source);
    return sanitizeMermaidSvg(svg);
  } catch (e) {
    // Mermaid leaves an error element in the DOM on failure.
    document.getElementById(`d${id}`)?.remove();
    throw new Error(e instanceof Error ? e.message : String(e));
  }
}

const DIAGRAM_LABELS: [RegExp, string][] = [
  [/^(flowchart|graph)\b/, "Flowchart diagram"],
  [/^sequenceDiagram\b/, "Sequence diagram"],
  [/^classDiagram/, "Class diagram"],
  [/^stateDiagram/, "State diagram"],
  [/^erDiagram\b/, "Entity relationship diagram"],
  [/^journey\b/, "User journey diagram"],
  [/^gantt\b/, "Gantt chart"],
  [/^pie\b/, "Pie chart"],
  [/^gitGraph\b/, "Git graph"],
  [/^mindmap\b/, "Mind map"],
  [/^timeline\b/, "Timeline"],
  [/^quadrantChart\b/, "Quadrant chart"],
  [/^xychart/, "XY chart"],
];

/** Accessible name for a diagram: its `accTitle`, else a description of its type. */
export function mermaidAriaLabel(source: string): string {
  const accTitle = /^\s*accTitle\s*:\s*(.+)$/m.exec(source)?.[1]?.trim();
  if (accTitle) return accTitle;

  const body = source.replace(/^\s*---\n[\s\S]*?\n---\s*\n/, "");
  const keyword = body
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("%%"));
  const match = keyword && DIAGRAM_LABELS.find(([re]) => re.test(keyword));
  return match ? match[1] : "Mermaid diagram";
}
