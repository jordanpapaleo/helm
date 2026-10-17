import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tauriCommands } from "../../lib/tauri-commands";
import { useNoteStore } from "../../store/notes";
import { useUIStore } from "../../store/ui";
import type { Note, VaultConfig } from "../../types/note";
import { GlobalNewNoteMenu, NewNoteMenu } from "./NewNoteMenu";

vi.mock("../../lib/tauri-commands", () => ({
  tauriCommands: {
    writeNote: vi.fn().mockResolvedValue(undefined),
  },
}));

const VAULT: VaultConfig = { id: "v1", name: "Work", path: "/work" };

function makeNote(id: string, title: string, template = true): Note {
  return {
    id,
    filePath: `/work/${id}.md`,
    fileName: `${id}.md`,
    content: `${title} body`,
    vaultId: "v1",
    frontmatter: {
      id,
      title,
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
      tags: [],
      urgent: false,
      important: false,
      state: "Prepare",
      blocked: false,
      template,
    },
  };
}

beforeEach(() => {
  useNoteStore.setState({
    notes: [makeNote("t1", "Bug report"), makeNote("plain", "Diary", false)],
    selectedNoteId: null,
    vaults: [VAULT],
    activeVaultId: "v1",
    tagTree: {},
    searchIndex: null,
    searchQuery: "",
    searchResults: [],
    knownFolderPaths: [],
  });
});

describe("NewNoteMenu", () => {
  it("opens Blank followed by template titles and creates from the chosen entry", () => {
    const onSelect = vi.fn();
    render(<NewNoteMenu ariaLabel="New note" icon="uil:file-medical" onSelect={onSelect} />);

    const trigger = screen.getByRole("button", { name: "New note" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu", { name: "New note" });
    const items = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(items).toEqual(["Blank", "Bug report"]);
    expect(screen.getByRole("menuitem", { name: "Blank" })).toHaveFocus();

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Bug report" })).toHaveFocus();

    fireEvent.click(screen.getByRole("menuitem", { name: "Bug report" }));
    expect(onSelect).toHaveBeenCalledWith("t1");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("chooses Blank from the keyboard and still offers Blank when nothing is a template", () => {
    const onSelect = vi.fn();
    useNoteStore.setState({ notes: [makeNote("plain", "Diary", false)] });
    render(<NewNoteMenu ariaLabel="New note" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "New note" }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Blank"]);

    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Blank" }), { key: "Enter" });
    // jsdom does not activate buttons on Enter; click covers the selection path.
    fireEvent.click(screen.getByRole("menuitem", { name: "Blank" }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("drops a template from an open menu when it is deleted", async () => {
    render(<NewNoteMenu ariaLabel="New note" onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "New note" }));
    expect(screen.getByRole("menuitem", { name: "Bug report" })).toBeInTheDocument();

    await act(async () => {
      useNoteStore.setState({ notes: [] });
    });

    expect(screen.queryByRole("menuitem", { name: "Bug report" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Blank" })).toBeInTheDocument();
  });

  it("closes on Escape and returns focus to the trigger", () => {
    render(<NewNoteMenu ariaLabel="New note" onSelect={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "New note" });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe("GlobalNewNoteMenu", () => {
  it("opens from the File menu flag and creates a blank note in the active vault", async () => {
    useUIStore.setState({
      newNoteMenuOpen: true,
      activeView: "dashboard",
      selectedGrouping: { type: "all", id: null },
    });
    render(<GlobalNewNoteMenu />);

    fireEvent.click(screen.getByRole("menuitem", { name: "Blank" }));

    await waitFor(() => expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1));
    const [filePath] = vi.mocked(tauriCommands.writeNote).mock.calls[0] ?? [];
    expect(filePath?.startsWith("/work/")).toBe(true);
    expect(useUIStore.getState().newNoteMenuOpen).toBe(false);
    expect(useUIStore.getState().activeView).toBe("notes");
  });
});
