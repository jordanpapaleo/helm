import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NOTE_DRAG_MIME } from "../../lib/note-drag";
import * as noteDrop from "../../lib/note-drop";
import { parseNote } from "../../lib/note-parser";
import type { Project } from "../../lib/projects";
import { DEFAULT_SETTINGS } from "../../lib/settings";
import { tauriCommands } from "../../lib/tauri-commands";
import { useNoteStore } from "../../store/notes";
import { useProjectStore } from "../../store/projects";
import { useSettingsStore } from "../../store/settings";
import { useTrashStore } from "../../store/trash";
import { useUIStore } from "../../store/ui";
import type { Note, VaultConfig } from "../../types/note";
import { LeftColumn } from "./LeftColumn";
import { NoteListPanel } from "./NoteListPanel";

vi.mock("../../lib/tauri-commands", () => ({
  tauriCommands: {
    writeNote: vi.fn().mockResolvedValue(undefined),
    renameNote: vi.fn().mockResolvedValue(undefined),
    deleteNote: vi.fn().mockResolvedValue(undefined),
    createFolder: vi.fn().mockResolvedValue(undefined),
    renameFolder: vi.fn().mockResolvedValue(undefined),
    writeTextFile: vi.fn().mockResolvedValue(undefined),
    listProjectFiles: vi.fn().mockResolvedValue([]),
    deleteFolder: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../hooks/useVault", () => ({
  addVault: vi.fn(),
  removeVault: vi.fn(),
}));

const VAULT: VaultConfig = { id: "v1", name: "My Vault", path: "/vault" };

function makeNote(
  id: string,
  title: string,
  filePath: string,
  extra: Partial<Note["frontmatter"]> = {},
): Note {
  const fileName = filePath.split("/").pop() ?? "note.md";
  return {
    id,
    filePath,
    fileName,
    content: "Keep this body",
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
      links: ["01OTHER"],
      ...extra,
    },
  };
}

function createDragData() {
  const store = new Map<string, string>();
  return {
    dropEffect: "none",
    effectAllowed: "all",
    get types() {
      return [...store.keys()];
    },
    setData(format: string, data: string) {
      store.set(format, String(data));
    },
    getData(format: string) {
      return store.get(format) ?? "";
    },
    clearData(format?: string) {
      if (format) store.delete(format);
      else store.clear();
    },
  };
}

function dropTarget(id: string): HTMLElement {
  const found = document.querySelector(`[data-drop-target="${id}"]`);
  if (!(found instanceof HTMLElement)) throw new Error(`missing drop target ${id}`);
  return found;
}

function dragNote(name: RegExp) {
  const handle = screen.getByRole("button", { name });
  const dataTransfer = createDragData();
  fireEvent.dragStart(handle, { dataTransfer });
  return dataTransfer;
}

function dropOn(id: string, dataTransfer: ReturnType<typeof createDragData>) {
  const target = dropTarget(id);
  fireEvent.dragEnter(target, { dataTransfer });
  fireEvent.dragOver(target, { dataTransfer });
  fireEvent.drop(target, { dataTransfer });
  return target;
}

describe("dragging a note onto a folder or tag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    useNoteStore.setState({
      notes: [
        makeNote("alpha", "Alpha", "/vault/note.md"),
        makeNote("beta", "Beta", "/vault/inbox/beta.md", { tags: ["work"] }),
      ],
      selectedNoteId: null,
      vaults: [VAULT],
      activeVaultId: "v1",
      tagTree: {},
      searchIndex: null,
      searchQuery: "",
      searchResults: [],
      knownFolderPaths: ["/vault/inbox"],
    });
    useProjectStore.setState({ projects: [] });
    useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
    useTrashStore.setState({ items: [] });
    useUIStore.setState({
      activeView: "notes",
      selectedGrouping: { type: "all", id: null },
      settingsOpen: false,
    });
  });

  function renderPanes() {
    render(
      <>
        <LeftColumn />
        <NoteListPanel />
      </>,
    );
  }

  it("moves the note into the folder and keeps the body", async () => {
    renderPanes();
    const dataTransfer = dragNote(/Alpha/);
    expect(dataTransfer.getData(NOTE_DRAG_MIME)).toBe("alpha");
    expect(dataTransfer.getData("text/plain")).not.toContain("Keep this body");
    expect(dataTransfer.getData("text/html")).not.toContain("Keep this body");

    const target = dropOn("folder:/vault/inbox", dataTransfer);
    expect(target).toHaveAttribute("data-drop-active", "false");

    await waitFor(() =>
      expect(tauriCommands.renameNote).toHaveBeenCalledWith(
        "/vault/note.md",
        "/vault/inbox/note.md",
      ),
    );
    const moved = useNoteStore.getState().notes.find((note) => note.id === "alpha");
    expect(moved?.filePath).toBe("/vault/inbox/note.md");
    expect(moved?.content).toBe("Keep this body");
    expect(moved?.frontmatter.links).toEqual(["01OTHER"]);
    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
  });

  it("does nothing when the note is dropped on its current folder", async () => {
    const move = vi.spyOn(noteDrop, "moveNoteToFolder");
    renderPanes();
    dropOn("folder:/vault", dragNote(/Alpha/));
    await waitFor(() =>
      expect(move).toHaveBeenCalledWith(expect.objectContaining({ id: "alpha" }), "/vault"),
    );
    await move.mock.results[0]?.value;
    expect(tauriCommands.renameNote).not.toHaveBeenCalled();
    const stored = useNoteStore.getState().notes.find((note) => note.id === "alpha");
    expect(stored?.filePath).toBe("/vault/note.md");
    expect(stored?.content).toBe("Keep this body");
    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
  });

  it("keeps the note and its body when the folder rename fails", async () => {
    vi.mocked(tauriCommands.renameNote).mockRejectedValueOnce(new Error("exists"));
    renderPanes();
    dropOn("folder:/vault/inbox", dragNote(/Alpha/));
    await waitFor(() => expect(tauriCommands.renameNote).toHaveBeenCalled());
    const stored = useNoteStore.getState().notes.find((note) => note.id === "alpha");
    expect(stored?.filePath).toBe("/vault/note.md");
    expect(stored?.content).toBe("Keep this body");
  });

  it("adds the tag and keeps the body", async () => {
    renderPanes();
    dropOn("tag:work", dragNote(/Alpha/));
    await waitFor(() => expect(tauriCommands.writeNote).toHaveBeenCalled());
    const raw = vi.mocked(tauriCommands.writeNote).mock.calls[0]?.[1] as string;
    expect(raw).toContain("Keep this body");
    const parsed = parseNote(raw, "/vault/note.md");
    expect(parsed.frontmatter.tags).toEqual(["work"]);
    expect(parsed.content).toContain("Keep this body");
    const stored = useNoteStore.getState().notes.find((note) => note.id === "alpha");
    expect(stored?.content).toBe("Keep this body");
    expect(stored?.filePath).toBe("/vault/note.md");
    expect(stored?.frontmatter.tags).toEqual(["work"]);
    expect(tauriCommands.renameNote).not.toHaveBeenCalled();
  });

  it("still opens from the keyboard and keeps Move to", async () => {
    const user = userEvent.setup();
    renderPanes();
    const noteButton = screen.getByRole("button", { name: /Alpha/ });
    noteButton.focus();
    await user.keyboard("{Enter}");
    expect(useNoteStore.getState().selectedNoteId).toBe("alpha");

    fireEvent.keyDown(noteButton, { key: "F10", shiftKey: true });
    expect(screen.getByRole("menuitem", { name: "Move to…" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to…" }));
    expect(screen.getByRole("menuitem", { name: "inbox" })).toBeInTheDocument();
  });

  it("moves a note onto a project folder without changing the section menu", async () => {
    const kitchen: Project = {
      id: "01PROJECT0000000000000001",
      name: "Kitchen",
      mainPageId: "01MAIN",
      status: "active",
      repository: null,
      rootPath: "/vault/kitchen",
      metaPath: "/vault/kitchen/helm-project.json",
      vaultId: "v1",
      vaultPath: "/vault",
    };
    useProjectStore.setState({ projects: [kitchen] });
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, enableProjects: true } });
    renderPanes();

    fireEvent.click(screen.getByRole("button", { name: "Expand Kitchen" }));
    expect(
      screen.getByRole("button", { name: "New note in Kitchen Thinking" }),
    ).toBeInTheDocument();
    dropOn("folder:/vault/kitchen/thinking", dragNote(/Alpha/));

    await waitFor(() =>
      expect(tauriCommands.renameNote).toHaveBeenCalledWith(
        "/vault/note.md",
        "/vault/kitchen/thinking/note.md",
      ),
    );
    const moved = useNoteStore.getState().notes.find((note) => note.id === "alpha");
    expect(moved?.content).toBe("Keep this body");
    expect(moved?.filePath).toBe("/vault/kitchen/thinking/note.md");
  });
});
