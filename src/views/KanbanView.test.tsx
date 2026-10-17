import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseNote } from "../lib/note-parser";
import { DEFAULT_SETTINGS } from "../lib/settings";
import { tauriCommands } from "../lib/tauri-commands";
import { useNoteStore } from "../store/notes";
import { useSettingsStore } from "../store/settings";
import { useUIStore } from "../store/ui";
import type { Note } from "../types/note";
import { KanbanView } from "./KanbanView";

vi.mock("../lib/tauri-commands", () => ({
  tauriCommands: {
    writeNote: vi.fn().mockResolvedValue(undefined),
  },
}));

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "id-managed",
    filePath: "/vault/managed.md",
    fileName: "managed.md",
    content: "",
    vaultId: "v1",
    frontmatter: {
      id: "id-managed",
      title: "Managed Note",
      created: "2026-01-01",
      updated: "2026-01-01",
      tags: [],
      urgent: false,
      important: false,
      state: "Doing",
      blocked: false,
      links: [],
      ...overrides.frontmatter,
    },
    ...overrides,
  };
}

beforeEach(() => {
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
  useUIStore.setState({ activeView: "kanban" });
});

describe("KanbanView — unmanaged notes", () => {
  it("hides unmanaged notes from the board", () => {
    useNoteStore.setState({
      notes: [
        makeNote(),
        makeNote({
          id: "id-unmanaged",
          filePath: "/vault/unmanaged.md",
          fileName: "unmanaged.md",
          frontmatter: {
            id: "id-unmanaged",
            title: "Unmanaged Note",
            created: "2026-01-01",
            updated: "2026-01-01",
            tags: [],
            urgent: false,
            important: false,
            state: "Doing",
            blocked: false,
            links: [],
            unmanaged: true,
          },
        }),
      ],
    });

    render(<KanbanView />);

    expect(screen.getByText("Managed Note")).toBeInTheDocument();
    expect(screen.queryByText("Unmanaged Note")).not.toBeInTheDocument();
  });
});

describe("KanbanView — archived notes", () => {
  beforeEach(() => {
    useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
  });

  function archivedNote(): Note {
    return makeNote({
      id: "old",
      filePath: "/vault/old.md",
      fileName: "old.md",
      frontmatter: {
        id: "old",
        title: "Archived Card",
        created: "2026-01-01",
        updated: "2026-01-01",
        tags: [],
        urgent: false,
        important: false,
        state: "Doing",
        blocked: false,
        links: [],
        archived: true,
      },
    });
  }

  it("hides archived notes from the board by default", () => {
    useNoteStore.setState({ notes: [makeNote(), archivedNote()] });
    render(<KanbanView />);
    expect(screen.getByText("Managed Note")).toBeInTheDocument();
    expect(screen.queryByText("Archived Card")).not.toBeInTheDocument();
  });

  it("shows archived notes with a mark when the setting is on", () => {
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, showArchivedNotes: true } });
    useNoteStore.setState({ notes: [archivedNote()] });
    render(<KanbanView />);
    expect(screen.getByText("Archived Card")).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });
});

describe("KanbanView — new note menu", () => {
  it("creates from a template in the chosen column, overriding the template state", async () => {
    useNoteStore.setState({
      notes: [
        makeNote({
          id: "tmpl",
          filePath: "/vault/bug.md",
          fileName: "bug.md",
          content: "column body",
          frontmatter: {
            id: "tmpl",
            title: "Bug report",
            created: "2026-01-01",
            updated: "2026-01-01",
            tags: ["eng"],
            urgent: true,
            important: false,
            state: "Maintain",
            blocked: false,
            links: [],
            template: true,
            kanbanOrder: 9,
          },
        }),
      ],
    });

    render(<KanbanView />);
    fireEvent.click(screen.getByRole("button", { name: "New note in Doing" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Bug report" }));

    await waitFor(() => expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1));
    const [filePath, raw] = vi.mocked(tauriCommands.writeNote).mock.calls[0] ?? [];
    const parsed = parseNote(raw ?? "", filePath ?? "");
    expect(parsed.frontmatter.state).toBe("Doing");
    expect(parsed.frontmatter.urgent).toBe(true);
    expect(parsed.frontmatter.tags).toEqual(["eng"]);
    expect(parsed.content.trim()).toBe("column body");
    expect(parsed.frontmatter.template).toBeUndefined();
    expect(parsed.frontmatter.kanbanOrder).toBeUndefined();
    expect(raw).not.toContain("kanbanOrder");
    expect(useUIStore.getState().activeView).toBe("notes");
  });
});
