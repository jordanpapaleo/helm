import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../lib/settings";
import { useNoteStore } from "../../store/notes";
import { useSettingsStore } from "../../store/settings";
import type { Note } from "../../types/note";
import { GraphView } from "../../views/GraphView";
import { BacklinksPanel } from "./BacklinksPanel";
import { PropertyPanel } from "./PropertyPanel";

interface CapturedGraph {
  graphData?: {
    links: { source: string; target: string; fromFrontmatter: boolean }[];
  };
}

let captured: CapturedGraph | null = null;

vi.mock("react-force-graph-2d", () => ({
  default: (props: CapturedGraph) => {
    captured = props;
    return <div data-testid="link-canvas" />;
  },
}));

vi.mock("../../lib/tauri-commands", () => ({
  tauriCommands: {
    writeNote: vi.fn().mockResolvedValue(undefined),
  },
}));

function makeNote(id: string, title: string, content = ""): Note {
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
      state: "Prepare",
      blocked: false,
    },
  };
}

beforeEach(() => {
  captured = null;
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
  useNoteStore.setState({
    notes: [],
    selectedNoteId: null,
    vaults: [],
    activeVaultId: null,
    tagTree: {},
    searchIndex: null,
    searchQuery: "",
    searchResults: [],
    knownFolderPaths: [],
  });
});

describe("link surfaces", () => {
  it("shows a body-only wiki link in the graph, the footer, and properties", () => {
    const source = makeNote("wiki", "Wiki Only", "See [[pyramid]] for the shape");
    const target = makeNote("pyramid", "Pyramid");
    expect(source.frontmatter.links).toBeUndefined();
    useNoteStore.setState({ notes: [source, target] });

    const graph = render(<GraphView />);
    expect(captured?.graphData?.links).toEqual([
      { source: "wiki", target: "pyramid", fromFrontmatter: false },
    ]);
    graph.unmount();

    const footer = render(<BacklinksPanel note={source} />);
    expect(screen.getByRole("button", { name: /Pyramid/ })).toBeInTheDocument();
    footer.unmount();

    const properties = render(
      <PropertyPanel
        frontmatter={source.frontmatter}
        content={source.content}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Properties" }));
    expect(screen.getByText("Pyramid")).toBeInTheDocument();
    expect(screen.queryByText("use [[Note Title]] in body")).not.toBeInTheDocument();
    properties.unmount();

    render(<BacklinksPanel note={target} />);
    expect(screen.getByRole("button", { name: /Wiki Only/ })).toBeInTheDocument();
  });
});
