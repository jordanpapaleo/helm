import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../lib/settings";
import { useNoteStore } from "../store/notes";
import { useSettingsStore } from "../store/settings";
import type { Note } from "../types/note";
import { GraphView } from "./GraphView";
import { GRAPH_LINK_WIDTH, graphLinkStroke, readGraphLinkColors } from "./graph-link-style";

interface CapturedGraph {
  linkColor?: (link: object) => string;
  linkWidth?: (link: object) => number;
  onNodeHover?: (node: object | null) => void;
  onLinkHover?: (link: object | null) => void;
}

let captured: CapturedGraph | null = null;

vi.mock("react-force-graph-2d", () => ({
  default: (props: CapturedGraph) => {
    captured = props;
    return <div data-testid="link-canvas" />;
  },
}));

vi.mock("../lib/tauri-commands", () => ({
  tauriCommands: {
    writeNote: vi.fn().mockResolvedValue(undefined),
  },
}));

function makeNote(id: string, title: string, links: string[] = [], content = ""): Note {
  return {
    id,
    filePath: `/vault/${id}.md`,
    fileName: `${id}.md`,
    content,
    vaultId: "v1",
    frontmatter: {
      id,
      title,
      created: "2026-01-01",
      updated: "2026-01-01",
      tags: [],
      urgent: false,
      important: false,
      state: "Doing",
      blocked: false,
      links,
    },
  };
}

const savedLink = { source: "a", target: "b", fromFrontmatter: true };
const contentLink = { source: "b", target: "c", fromFrontmatter: false };

function stroke(emphasis: "rest" | "dim" | "active" | "delete"): string {
  return graphLinkStroke(emphasis, readGraphLinkColors());
}

beforeEach(() => {
  captured = null;
  useNoteStore.setState({
    notes: [
      makeNote("a", "Alpha", ["b"]),
      makeNote("b", "Beta", [], "See [[Gamma]]"),
      makeNote("c", "Gamma"),
    ],
    selectedNoteId: null,
    vaults: [{ id: "v1", name: "Vault", path: "/vault" }],
    activeVaultId: "v1",
    tagTree: {},
    searchIndex: null,
    searchQuery: "",
    searchResults: [],
    knownFolderPaths: [],
  });
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
});

describe("GraphView link canvas edges", () => {
  it("paints resting edges with the high-contrast mix and a readable width", () => {
    render(<GraphView />);
    expect(captured?.linkColor?.(savedLink)).toBe(stroke("rest"));
    expect(captured?.linkColor?.(savedLink)).not.toContain("10%");
    expect(captured?.linkWidth?.(savedLink)).toBe(GRAPH_LINK_WIDTH.rest);
    expect(captured?.linkWidth?.(contentLink)).toBe(GRAPH_LINK_WIDTH.rest);
  });

  it("highlights edges on the hovered note and dims the rest", () => {
    render(<GraphView />);
    act(() => {
      captured?.onNodeHover?.({ id: "a" });
    });
    expect(captured?.linkColor?.(savedLink)).toBe(stroke("active"));
    expect(captured?.linkWidth?.(savedLink)).toBe(GRAPH_LINK_WIDTH.active);
    expect(captured?.linkColor?.(contentLink)).toBe(stroke("dim"));
    expect(captured?.linkWidth?.(contentLink)).toBe(GRAPH_LINK_WIDTH.dim);
  });

  it("uses the error color only for a hovered frontmatter edge", () => {
    render(<GraphView />);
    act(() => {
      captured?.onLinkHover?.(savedLink);
    });
    expect(captured?.linkColor?.(savedLink)).toBe(stroke("delete"));
    expect(captured?.linkWidth?.(savedLink)).toBe(GRAPH_LINK_WIDTH.delete);

    act(() => {
      captured?.onLinkHover?.(contentLink);
    });
    expect(captured?.linkColor?.(contentLink)).toBe(stroke("rest"));
    expect(captured?.linkWidth?.(contentLink)).toBe(GRAPH_LINK_WIDTH.rest);
  });
});
