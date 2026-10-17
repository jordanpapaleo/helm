import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../lib/settings";
import { useNoteStore } from "../../store/notes";
import { useSettingsStore } from "../../store/settings";
import type { Note } from "../../types/note";
import { BacklinksPanel } from "./BacklinksPanel";

function makeNote(
  id: string,
  title: string,
  links: string[] = [],
  archived = false,
): Note {
  return {
    id,
    filePath: `/vault/${id}.md`,
    fileName: `${id}.md`,
    content: "",
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
      links,
      archived,
    },
  };
}

beforeEach(() => {
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
});

describe("BacklinksPanel archive", () => {
  const current = makeNote("current", "Current", ["old"]);
  const old = makeNote("old", "Old Target", [], true);
  const inbound = makeNote("inbound", "From Archive", ["current"], true);
  const liveInbound = makeNote("live", "From Live", ["current"]);

  it("keeps a link to an archived note navigable and hides archived backlinks", () => {
    useNoteStore.setState({ notes: [current, old, inbound, liveInbound] });
    render(<BacklinksPanel note={current} />);

    expect(screen.getByRole("button", { name: /Old Target/ })).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /From Live/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /From Archive/ })).not.toBeInTheDocument();
  });

  it("shows archived backlinks, marked, when the setting is on", () => {
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, showArchivedNotes: true } });
    useNoteStore.setState({ notes: [current, old, inbound, liveInbound] });
    render(<BacklinksPanel note={current} />);

    expect(screen.getByRole("button", { name: /From Archive/ })).toBeInTheDocument();
    expect(screen.getAllByText("Archived").length).toBeGreaterThan(0);
  });
});
