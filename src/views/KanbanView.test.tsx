import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../lib/settings";
import { useNoteStore } from "../store/notes";
import { useSettingsStore } from "../store/settings";
import { useUIStore } from "../store/ui";
import type { Note } from "../types/note";
import { KanbanView } from "./KanbanView";

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
