import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../lib/settings";
import { useNoteStore } from "../store/notes";
import { useSettingsStore } from "../store/settings";
import type { Note } from "../types/note";
import { EisenhowerView } from "./EisenhowerView";

function makeNote(title: string, archived = false): Note {
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

beforeEach(() => {
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
});

describe("EisenhowerView — archived notes", () => {
  it("hides archived notes from the matrix by default", () => {
    useNoteStore.setState({ notes: [makeNote("Live"), makeNote("Shelved", true)] });
    render(<EisenhowerView />);
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.queryByText("Shelved")).not.toBeInTheDocument();
  });

  it("shows archived notes with a mark when the setting is on", () => {
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, showArchivedNotes: true } });
    useNoteStore.setState({ notes: [makeNote("Shelved", true)] });
    render(<EisenhowerView />);
    expect(screen.getByText("Shelved")).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });
});
