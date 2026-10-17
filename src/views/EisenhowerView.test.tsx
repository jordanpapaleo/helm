import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseNote } from "../lib/note-parser";
import { DEFAULT_SETTINGS } from "../lib/settings";
import { tauriCommands } from "../lib/tauri-commands";
import { useNoteStore } from "../store/notes";
import { useSettingsStore } from "../store/settings";
import { useUIStore } from "../store/ui";
import type { Note } from "../types/note";
import { EisenhowerView } from "./EisenhowerView";

vi.mock("../lib/tauri-commands", () => ({
  tauriCommands: {
    writeNote: vi.fn().mockResolvedValue(undefined),
  },
}));

function archivedNote(title: string, archived = false): Note {
  return {
    id: title,
    filePath: `/vault/${title}.md`,
    fileName: `${title}.md`,
    content: "",
    vaultId: "v1",
    frontmatter: {
      id: title,
      title,
      created: "2026-01-01",
      updated: "2026-01-01",
      tags: [],
      urgent: true,
      important: true,
      state: "Doing",
      blocked: false,
      links: [],
      archived,
    },
  };
}

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "tmpl",
    filePath: "/vault/bug.md",
    fileName: "bug.md",
    content: "quadrant body",
    vaultId: "v1",
    frontmatter: {
      id: "tmpl",
      title: "Bug report",
      created: "2026-01-01",
      updated: "2026-01-01",
      tags: [],
      urgent: false,
      important: false,
      state: "Maintain",
      blocked: false,
      template: true,
      eisenhowerOrder: 3,
      ...overrides.frontmatter,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
  useNoteStore.setState({
    notes: [],
    selectedNoteId: null,
    vaults: [{ id: "v1", name: "Vault", path: "/vault" }],
    activeVaultId: "v1",
    tagTree: {},
    searchIndex: null,
    searchQuery: "",
    searchResults: [],
    knownFolderPaths: [],
  });
  useUIStore.setState({
    activeView: "eisenhower",
    selectedGrouping: { type: "all", id: null },
    navHistory: [
      {
        view: "eisenhower",
        selectedNoteId: null,
        selectedGrouping: { type: "all", id: null },
      },
    ],
    navIndex: 0,
  });
});

describe("EisenhowerView — archived notes", () => {
  it("hides archived notes from the matrix by default", () => {
    useNoteStore.setState({ notes: [archivedNote("Live"), archivedNote("Shelved", true)] });
    render(<EisenhowerView />);
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.queryByText("Shelved")).not.toBeInTheDocument();
  });

  it("shows archived notes with a mark when the setting is on", () => {
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, showArchivedNotes: true } });
    useNoteStore.setState({ notes: [archivedNote("Shelved", true)] });
    render(<EisenhowerView />);
    expect(screen.getByText("Shelved")).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });
});

describe("EisenhowerView — new note menu", () => {
  it("creates from a template in the quadrant and sets urgent and important from that cell", async () => {
    useNoteStore.setState({ notes: [makeNote()] });
    render(<EisenhowerView />);

    fireEvent.click(screen.getByRole("button", { name: "New note in Do" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Blank" }));

    await waitFor(() => expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1));
    vi.mocked(tauriCommands.writeNote).mockClear();

    fireEvent.click(screen.getByRole("button", { name: "New note in Schedule" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Bug report" }));

    await waitFor(() => expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1));
    const [filePath, raw] = vi.mocked(tauriCommands.writeNote).mock.calls[0] ?? [];
    const parsed = parseNote(raw ?? "", filePath ?? "");
    expect(parsed.frontmatter.title).toBe("Bug report");
    expect(parsed.frontmatter.urgent).toBe(false);
    expect(parsed.frontmatter.important).toBe(true);
    expect(parsed.frontmatter.state).toBe("Prepare");
    expect(parsed.content.trim()).toBe("quadrant body");
    expect(parsed.frontmatter.template).toBe(false);
    expect(raw).not.toContain("eisenhowerOrder");
    expect(useUIStore.getState().activeView).toBe("notes");
    expect(useNoteStore.getState().notes.find((n) => n.id === "tmpl")?.frontmatter.template).toBe(
      true,
    );
  });
});
