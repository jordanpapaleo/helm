/**
 * Graph view — interactive force-directed graph of note connections.
 * Shows all notes as nodes and wiki links as edges.
 *
 * Interactions:
 *  - Click a node  → open that note
 *  - Drag node onto another node → create a frontmatter link between them
 *  - Click a link (frontmatter links only) → remove the link
 *  - Hover a node  → highlight its neighborhood, show full title tooltip
 *  - Hover a link  → highlight in red if deletable (frontmatter link)
 */
import { forceX, forceY } from "d3-force-3d";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { extractWikiLinks, serializeNote } from "../lib/note-parser";
import { tauriCommands } from "../lib/tauri-commands";
import { useNoteStore } from "../store/notes";
import { useUIStore } from "../store/ui";
import type { Note, NoteState } from "../types/note";

// ── Types ──────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
  state: NoteState | undefined;
  /** Total degree — computed after graphData is built */
  degree: number;
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  /** True when the link comes from frontmatter.links — these can be removed by clicking */
  fromFrontmatter: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────

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

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function nodeColor(state: NoteState | undefined): string {
  if (state && STATE_COLOR_VAR[state]) return cssVar(STATE_COLOR_VAR[state], "#0a84ff");
  return cssVar("--color-accent", "#0a84ff");
}

function resolveId(ref: string | GraphNode): string {
  return typeof ref === "object" ? ref.id : ref;
}

/** Stable key for a directed link — used to track hover state. */
function linkKey(link: GraphLink): string {
  return `${resolveId(link.source)}->${resolveId(link.target)}`;
}

// ── Component ──────────────────────────────────────────────────────────────

export function GraphView() {
  const { notes, updateNote } = useNoteStore();
  const { navigate, selectedGrouping } = useUIStore();

  // biome-ignore lint/suspicious/noExplicitAny: react-force-graph-2d does not export ref instance types
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Node hover state
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [isNodeHovered, setIsNodeHovered] = useState(false);

  // Link hover state (only set for deletable frontmatter links)
  const [hoveredLinkKey, setHoveredLinkKey] = useState<string | null>(null);

  // Drag-to-link state
  const [dragLinkTarget, setDragLinkTarget] = useState<string | null>(null);

  // Stable ref so canvas callbacks read neighborMap without stale closures
  const neighborMap = useRef<Map<string, Set<string>>>(new Map());
  // Always-current snapshot of nodes (with live x/y from simulation)
  const graphNodesRef = useRef<GraphNode[]>([]);

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

  // ── Configure d3 forces ───────────────────────────────────────────────

  useEffect(() => {
    if (size.width === 0 || !fgRef.current) return;
    const fg = fgRef.current;
    fg.d3Force("charge")?.strength(-60);
    fg.d3Force("link")?.distance(60);
    // biome-ignore lint/suspicious/noExplicitAny: d3-force-3d node type is not exported
    const isolateStrength = (n: any) => (n.degree === 0 ? 0.4 : 0.02);
    fg.d3Force("x", forceX(0).strength(isolateStrength));
    fg.d3Force("y", forceY(0).strength(isolateStrength));
    fg.d3Force("center", null);
  }, [size.width]);

  // ── Graph data + neighbor map ─────────────────────────────────────────

  const graphData = useMemo(() => {
    const titleToId = new Map(notes.map((n) => [n.frontmatter.title.toLowerCase(), n.id]));

    const links: GraphLink[] = notes.flatMap((n) => {
      const savedLinks = (n.frontmatter.links ?? [])
        .filter((targetId) => notes.some((t) => t.id === targetId))
        .map((targetId) => ({ source: n.id, target: targetId, fromFrontmatter: true }));

      const contentLinks = extractWikiLinks(n.content)
        .map((title) => titleToId.get(title.toLowerCase()))
        .filter(
          (targetId): targetId is string =>
            targetId !== undefined &&
            targetId !== n.id &&
            !savedLinks.some((l) => l.target === targetId),
        )
        .map((targetId) => ({ source: n.id, target: targetId, fromFrontmatter: false }));

      return [...savedLinks, ...contentLinks];
    });

    const degreeCount = new Map<string, number>();
    for (const link of links) {
      const s = resolveId(link.source);
      const t = resolveId(link.target);
      degreeCount.set(s, (degreeCount.get(s) ?? 0) + 1);
      degreeCount.set(t, (degreeCount.get(t) ?? 0) + 1);
    }

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

    graphNodesRef.current = nodes;
    return { nodes, links };
  }, [notes]);

  // ── Link mutation helpers ─────────────────────────────────────────────

  const createLink = useCallback(
    async (sourceId: string, targetId: string) => {
      const sourceNote = notes.find((n) => n.id === sourceId);
      if (!sourceNote) return;
      if ((sourceNote.frontmatter.links ?? []).includes(targetId)) return; // already linked
      const updated: Note = {
        ...sourceNote,
        frontmatter: {
          ...sourceNote.frontmatter,
          links: [...(sourceNote.frontmatter.links ?? []), targetId],
        },
      };
      updateNote(updated);
      try {
        await tauriCommands.writeNote(updated.filePath, serializeNote(updated));
      } catch (e) {
        console.error("Failed to create link:", e);
      }
    },
    [notes, updateNote],
  );

  const removeLink = useCallback(
    async (sourceId: string, targetId: string) => {
      const sourceNote = notes.find((n) => n.id === sourceId);
      if (!sourceNote) return;
      const updated: Note = {
        ...sourceNote,
        frontmatter: {
          ...sourceNote.frontmatter,
          links: (sourceNote.frontmatter.links ?? []).filter((id) => id !== targetId),
        },
      };
      updateNote(updated);
      try {
        await tauriCommands.writeNote(updated.filePath, serializeNote(updated));
      } catch (e) {
        console.error("Failed to remove link:", e);
      }
    },
    [notes, updateNote],
  );

  // ── Interaction handlers ───────────────────────────────────────────────

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      if (node.id) {
        navigate({ view: "notes", selectedNoteId: node.id, selectedGrouping });
      }
    },
    // selectedNoteId and selectedGrouping are stable enough here — navigate handles dedup
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate, selectedGrouping],
  );

  const handleNodeHover = useCallback((node: GraphNode | null) => {
    setHoveredId(node ? node.id : null);
    setHoveredLabel(node ? node.label : null);
    setIsNodeHovered(node !== null);
  }, []);

  /** During drag: find if we're hovering close enough to another node to snap a link. */
  const handleNodeDrag = useCallback((rawNode: object) => {
    const node = rawNode as GraphNode;
    const SNAP_THRESHOLD = 25;
    let closest: string | null = null;
    let closestDist = SNAP_THRESHOLD;

    for (const other of graphNodesRef.current) {
      if (other.id === node.id) continue;
      const dx = (other.x ?? 0) - (node.x ?? 0);
      const dy = (other.y ?? 0) - (node.y ?? 0);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closest = other.id;
      }
    }
    setDragLinkTarget(closest);
  }, []);

  /** On drag end: create a link if we were over another node. */
  const handleNodeDragEnd = useCallback(
    async (rawNode: object) => {
      const node = rawNode as GraphNode;
      const targetId = dragLinkTarget;
      setDragLinkTarget(null);
      if (targetId && targetId !== node.id) {
        await createLink(node.id, targetId);
      }
    },
    [dragLinkTarget, createLink],
  );

  /** Click a frontmatter link to remove it. */
  const handleLinkClick = useCallback(
    async (rawLink: object) => {
      const link = rawLink as GraphLink;
      if (!link.fromFrontmatter) return;
      await removeLink(resolveId(link.source), resolveId(link.target));
    },
    [removeLink],
  );

  /** Highlight deletable links on hover. */
  const handleLinkHover = useCallback((rawLink: object | null) => {
    if (!rawLink) {
      setHoveredLinkKey(null);
      return;
    }
    const link = rawLink as GraphLink;
    setHoveredLinkKey(link.fromFrontmatter ? linkKey(link) : null);
  }, []);

  // ── Canvas renderers ──────────────────────────────────────────────────

  const paintNode = useCallback(
    (rawNode: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const node = rawNode as GraphNode;
      const { x = 0, y = 0, label = "", state, degree } = node;

      const radius = Math.max(3, Math.sqrt(degree + 1) * 2);
      const isAnyHovered = hoveredId !== null;
      const isNeighbor = hoveredId !== null && neighborMap.current.get(hoveredId)?.has(node.id);
      const isSelf = node.id === hoveredId;
      const isDragTarget = node.id === dragLinkTarget;

      const opacity = !isAnyHovered || isSelf || isNeighbor ? 1 : 0.15;
      const fill = nodeColor(state);

      ctx.save();
      ctx.globalAlpha = opacity;

      // Node circle
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = fill;
      ctx.fill();

      // Ring for hovered self or neighbor
      if (isSelf || isNeighbor) {
        ctx.strokeStyle = fill;
        ctx.lineWidth = 1.5 / globalScale;
        ctx.globalAlpha = opacity * 0.5;
        ctx.beginPath();
        ctx.arc(x, y, radius + 2 / globalScale, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.globalAlpha = opacity;
      }

      // Drag-target ring — bright pulsing indicator that a link will be created
      if (isDragTarget) {
        ctx.strokeStyle = cssVar("--color-primary", "#0a84ff");
        ctx.lineWidth = 2 / globalScale;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(x, y, radius + 5 / globalScale, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.globalAlpha = opacity;
      }

      // Label pill — only when zoomed in enough
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
        const pillY = y + radius + 2 / globalScale;

        ctx.fillStyle = cssVar("--color-surface", "#1c1c1e");
        ctx.globalAlpha = opacity * 0.82;
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillWidth, pillHeight, pillHeight / 2);
        ctx.fill();

        ctx.globalAlpha = opacity;
        ctx.fillStyle = cssVar("--color-base-content", "#f2f2f7");
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(displayLabel, x, pillY + pillHeight / 2);
      }

      ctx.restore();
    },
    [hoveredId, dragLinkTarget],
  );

  const paintPointerArea = useCallback(
    (rawNode: object, color: string, ctx: CanvasRenderingContext2D) => {
      const node = rawNode as GraphNode;
      const { x = 0, y = 0, degree } = node;
      const radius = Math.max(3, Math.sqrt(degree + 1) * 2);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fill();
    },
    [],
  );

  const linkColor = useCallback(
    (rawLink: object) => {
      const link = rawLink as GraphLink;
      const key = linkKey(link);
      // Hovered deletable link → red
      if (hoveredLinkKey === key) return cssVar("--color-error", "#ff453a");
      // Node-hover highlighting
      if (hoveredId !== null) {
        const s = resolveId(link.source);
        const t = resolveId(link.target);
        return s === hoveredId || t === hoveredId
          ? cssVar("--color-primary", "#0a84ff")
          : cssVar("--color-border", "#3a3a3c");
      }
      return cssVar("--color-border", "#3a3a3c");
    },
    [hoveredId, hoveredLinkKey],
  );

  const linkWidth = useCallback(
    (rawLink: object) => {
      const link = rawLink as GraphLink;
      const key = linkKey(link);
      if (hoveredLinkKey === key) return 2.5;
      if (hoveredId === null) return 1;
      const s = resolveId(link.source);
      const t = resolveId(link.target);
      return s === hoveredId || t === hoveredId ? 2 : 0.5;
    },
    [hoveredId, hoveredLinkKey],
  );

  const bgColor = cssVar("--color-surface", "#1c1c1e");

  // Tooltip text: show "Release to link →" during drag targeting, otherwise full note title
  const tooltipText = dragLinkTarget
    ? `Link → ${graphNodesRef.current.find((n) => n.id === dragLinkTarget)?.label ?? ""}`
    : hoveredLabel;

  return (
    <div className="h-full w-full p-6" style={{ background: "var(--color-bg)" }}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: canvas container tracks mouse position for tooltip only — no keyboard interaction needed */}
      <div
        ref={containerRef}
        className="relative h-full w-full overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
        style={{ cursor: isNodeHovered || hoveredLinkKey ? "pointer" : "default" }}
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
          nodeLabel=""
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkHoverPrecision={8}
          nodeCanvasObjectMode={() => "replace"}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={paintPointerArea}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          onNodeDrag={handleNodeDrag}
          onNodeDragEnd={handleNodeDragEnd}
          onLinkClick={handleLinkClick}
          onLinkHover={handleLinkHover}
          warmupTicks={120}
          cooldownTicks={40}
          onEngineStop={() => fgRef.current?.zoomToFit(300, 30)}
        />

        {/* Hover / drag tooltip */}
        {tooltipText && hoverPos && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs shadow-lg"
            style={{
              left: hoverPos.x + 14,
              top: hoverPos.y - 10,
              color: dragLinkTarget
                ? cssVar("--color-primary", "#0a84ff")
                : "var(--color-base-content)",
              maxWidth: 220,
            }}
          >
            {tooltipText}
          </div>
        )}

        {/* State legend + interaction hints */}
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
          <div className="mt-1 border-t border-[var(--color-border)] pt-1.5 flex flex-col gap-1">
            <span className="text-xs" style={{ color: "var(--color-text-muted)", opacity: 0.7 }}>
              Drag node → node to link
            </span>
            <span className="text-xs" style={{ color: "var(--color-text-muted)", opacity: 0.7 }}>
              Click edge to remove
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
