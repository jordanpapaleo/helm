/**
 * Graph view — interactive force-directed graph of note connections.
 * Shows all notes as nodes and wiki links as edges. Click any node to
 * open that note. Node size reflects total degree (connections in + out).
 * Hover a node to highlight its neighborhood and dim everything else.
 */
import { forceX, forceY } from "d3-force-3d";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { extractWikiLinks } from "../lib/note-parser";
import { useNoteStore } from "../store/notes";
import { useUIStore } from "../store/ui";
import type { NoteState } from "../types/note";

// ── Types ──────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
  state: NoteState | undefined;
  /** Total degree — computed after graphData is built */
  degree: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Maps note state → the CSS custom property name for its color */
const STATE_COLOR_VAR: Record<NoteState, string> = {
  Doing: "--color-primary",
  Prepare: "--color-secondary",
  Maintain: "--color-success",
  Done: "--color-neutral-content",
};

const LEGEND_ITEMS: { label: NoteState; varName: string }[] = [
  { label: "Doing", varName: "--color-primary" },
  { label: "Prepare", varName: "--color-secondary" },
  { label: "Maintain", varName: "--color-success" },
  { label: "Done", varName: "--color-neutral-content" },
];

/** Read a CSS custom property from :root and return its resolved value. */
function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Resolve the node fill color based on its state. */
function nodeColor(state: NoteState | undefined): string {
  if (state && STATE_COLOR_VAR[state]) {
    return cssVar(STATE_COLOR_VAR[state], "#0a84ff");
  }
  return cssVar("--color-accent", "#0a84ff");
}

/** Extract the stable string id from a node reference that may be an object after simulation. */
function resolveId(ref: string | GraphNode): string {
  return typeof ref === "object" ? ref.id : ref;
}

// ── Component ──────────────────────────────────────────────────────────────

export function GraphView() {
  const { notes, selectNote } = useNoteStore();
  const { setView } = useUIStore();

  // biome-ignore lint/suspicious/noExplicitAny: react-force-graph-2d does not export ref instance types
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [isNodeHovered, setIsNodeHovered] = useState(false);

  // Stable ref so canvas callbacks can read neighborMap without re-creating
  // the nodeCanvasObject closure on every render.
  const neighborMap = useRef<Map<string, Set<string>>>(new Map());

  // ── Container sizing ──────────────────────────────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Configure d3 forces & zoom-to-fit after mount ────────────────────

  useEffect(() => {
    if (size.width === 0 || !fgRef.current) return;

    const fg = fgRef.current;

    fg.d3Force("charge")?.strength(-60);
    fg.d3Force("link")?.distance(60);
    // Pull isolated nodes (degree 0) strongly toward center; barely nudge connected ones.
    // biome-ignore lint/suspicious/noExplicitAny: d3-force-3d node type is not exported
    const isolateStrength = (n: any) => (n.degree === 0 ? 0.4 : 0.02);
    fg.d3Force("x", forceX(0).strength(isolateStrength));
    fg.d3Force("y", forceY(0).strength(isolateStrength));
    // Remove the uniform center force — the x/y forces above handle positioning better
    fg.d3Force("center", null);
  }, [size.width]);

  // ── Graph data + neighbor map ─────────────────────────────────────────

  const graphData = useMemo(() => {
    const titleToId = new Map(notes.map((n) => [n.frontmatter.title.toLowerCase(), n.id]));

    const links: GraphLink[] = notes.flatMap((n) => {
      const savedLinks = (n.frontmatter.links ?? [])
        .filter((targetId) => notes.some((t) => t.id === targetId))
        .map((targetId) => ({ source: n.id, target: targetId }));

      const contentLinks = extractWikiLinks(n.content)
        .map((title) => titleToId.get(title.toLowerCase()))
        .filter(
          (targetId): targetId is string =>
            targetId !== undefined &&
            targetId !== n.id &&
            !savedLinks.some((l) => l.target === targetId),
        )
        .map((targetId) => ({ source: n.id, target: targetId }));

      return [...savedLinks, ...contentLinks];
    });

    // Build degree count (total connections, both directions)
    const degreeCount = new Map<string, number>();
    for (const link of links) {
      const s = resolveId(link.source);
      const t = resolveId(link.target);
      degreeCount.set(s, (degreeCount.get(s) ?? 0) + 1);
      degreeCount.set(t, (degreeCount.get(t) ?? 0) + 1);
    }

    // Build neighbor set for hover highlighting
    const newNeighborMap = new Map<string, Set<string>>();
    for (const link of links) {
      const s = resolveId(link.source);
      const t = resolveId(link.target);
      if (!newNeighborMap.has(s)) newNeighborMap.set(s, new Set());
      if (!newNeighborMap.has(t)) newNeighborMap.set(t, new Set());
      newNeighborMap.get(s)?.add(t);
      newNeighborMap.get(t)?.add(s);
    }
    neighborMap.current = newNeighborMap;

    const nodes: GraphNode[] = notes.map((n) => ({
      id: n.id,
      label: n.frontmatter.title,
      state: n.frontmatter.state,
      degree: degreeCount.get(n.id) ?? 0,
    }));

    return { nodes, links };
  }, [notes]);

  // ── Interaction handlers ───────────────────────────────────────────────

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      if (node.id) {
        selectNote(node.id);
        setView("notes");
      }
    },
    [selectNote, setView],
  );

  const handleNodeHover = useCallback((node: GraphNode | null) => {
    setHoveredId(node ? node.id : null);
    setHoveredLabel(node ? node.label : null);
    setIsNodeHovered(node !== null);
  }, []);

  // ── Canvas renderers ──────────────────────────────────────────────────

  /**
   * Custom node painter: draws a circle sized by degree, colored by state,
   * with a semi-transparent pill label when zoomed in enough.
   *
   * We use "replace" mode so the library never draws its default circle.
   */
  const paintNode = useCallback(
    (rawNode: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const node = rawNode as GraphNode & { x?: number; y?: number };
      const { x = 0, y = 0, label = "", state, degree } = node;

      const radius = Math.max(3, Math.sqrt(degree + 1) * 2);
      const isHovered = hoveredId !== null;
      const isNeighbor = hoveredId !== null && neighborMap.current.get(hoveredId)?.has(node.id);
      const isSelf = node.id === hoveredId;

      // Dim non-connected nodes when something is hovered
      const opacity = !isHovered || isSelf || isNeighbor ? 1 : 0.15;

      const fill = nodeColor(state);

      ctx.save();
      ctx.globalAlpha = opacity;

      // Node circle
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = fill;
      ctx.fill();

      // Slightly brighter ring on hover/neighbor for emphasis
      if (isSelf || isNeighbor) {
        ctx.strokeStyle = fill;
        ctx.lineWidth = 1.5 / globalScale;
        ctx.globalAlpha = opacity * 0.5;
        ctx.beginPath();
        ctx.arc(x, y, radius + 2 / globalScale, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.globalAlpha = opacity;
      }

      // Label — only when zoomed in enough to be readable
      if (globalScale > 0.7 && label) {
        const fontSize = Math.min(11, 9 / globalScale);
        ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif`;

        const displayLabel = label.length > 10 ? `${label.slice(0, 10)}…` : label;
        const textWidth = ctx.measureText(displayLabel).width;
        const paddingX = 3 / globalScale;
        const paddingY = 2 / globalScale;
        const pillHeight = fontSize + paddingY * 2;
        const pillWidth = textWidth + paddingX * 2;
        const pillX = x - pillWidth / 2;
        // Position pill below the node circle with a small gap
        const pillY = y + radius + 2 / globalScale;
        const cornerRadius = pillHeight / 2;

        // Pill background — semi-transparent surface color for legibility over edges
        ctx.fillStyle = cssVar("--color-surface", "#1c1c1e");
        ctx.globalAlpha = opacity * 0.82;
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillWidth, pillHeight, cornerRadius);
        ctx.fill();

        // Label text
        ctx.globalAlpha = opacity;
        ctx.fillStyle = cssVar("--color-base-content", "#f2f2f7");
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(displayLabel, x, pillY + pillHeight / 2);
      }

      ctx.restore();
    },
    [hoveredId],
  );

  /**
   * Defines the hover hit area — matches the drawn circle size exactly.
   * Returning a circle here ensures pointer detection is accurate.
   */
  const paintPointerArea = useCallback(
    (rawNode: object, color: string, ctx: CanvasRenderingContext2D) => {
      const node = rawNode as GraphNode & { x?: number; y?: number };
      const { x = 0, y = 0, degree } = node;
      const radius = Math.max(3, Math.sqrt(degree + 1) * 2);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fill();
    },
    [],
  );

  /**
   * Link color: connected links are highlighted with primary color when a
   * node is hovered; all others use the border color at reduced opacity.
   */
  const linkColor = useCallback(
    (rawLink: object) => {
      const link = rawLink as GraphLink;
      if (hoveredId === null) return cssVar("--color-border", "#3a3a3c");

      const s = resolveId(link.source);
      const t = resolveId(link.target);
      const isConnected = s === hoveredId || t === hoveredId;
      return isConnected
        ? cssVar("--color-primary", "#0a84ff")
        : cssVar("--color-border", "#3a3a3c");
    },
    [hoveredId],
  );

  const linkWidth = useCallback(
    (rawLink: object) => {
      const link = rawLink as GraphLink;
      if (hoveredId === null) return 1;
      const s = resolveId(link.source);
      const t = resolveId(link.target);
      return s === hoveredId || t === hoveredId ? 2 : 0.5;
    },
    [hoveredId],
  );

  // Read the resolved background color — force-graph doesn't resolve CSS vars itself
  const bgColor = cssVar("--color-surface", "#1c1c1e");

  return (
    <div className="h-full w-full p-6" style={{ background: "var(--color-bg)" }}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: canvas container tracks mouse position for tooltip only — no keyboard interaction needed */}
      <div
        ref={containerRef}
        className="relative h-full w-full overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
        style={{ cursor: isNodeHovered ? "pointer" : "default" }}
        onMouseMove={(e) => {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) setHoverPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
        onMouseLeave={() => setHoverPos(null)}
      >
        <ForceGraph2D
          ref={fgRef}
          width={size.width}
          height={size.height}
          graphData={graphData}
          backgroundColor={bgColor}
          // Disable built-in tooltip — we draw labels ourselves
          nodeLabel=""
          linkColor={linkColor}
          linkWidth={linkWidth}
          // "replace" prevents the library from drawing its own circle under our custom painter
          nodeCanvasObjectMode={() => "replace"}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={paintPointerArea}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          // Pre-run physics before first paint so the graph loads already settled
          warmupTicks={120}
          cooldownTicks={40}
          onEngineStop={() => fgRef.current?.zoomToFit(300, 30)}
        />

        {/* Hover tooltip — full note title */}
        {hoveredLabel && hoverPos && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs shadow-lg"
            style={{
              left: hoverPos.x + 14,
              top: hoverPos.y - 10,
              color: "var(--color-base-content)",
              maxWidth: 200,
            }}
          >
            {hoveredLabel}
          </div>
        )}

        {/* State legend — bottom-left overlay */}
        <div
          className="absolute bottom-4 left-4 flex flex-col gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5"
          style={{ opacity: 0.92 }}
        >
          {LEGEND_ITEMS.map(({ label, varName }) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ background: `var(${varName})` }}
              />
              <span className="text-xs" style={{ color: "var(--color-text-muted)", lineHeight: 1 }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
