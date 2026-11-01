import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseNote } from "../lib/note-parser";
import { useNoteStore } from "../store/notes";
import { useUIStore } from "../store/ui";
import { DuplicateIdsAlert } from "./DuplicateIdsAlert";

const disk = new Map<string, string>();
const reveal = vi.fn().mockResolvedValue(undefined);

vi.mock("../lib/tauri-commands", () => ({
  tauriCommands: {
    readNote: vi.fn(async (path: string) => disk.get(path) ?? ""),
    writeNote: vi.fn(async (path: string, content: string) => {
      disk.set(path, content);
    }),
    deleteNote: vi.fn(async (path: string) => {
      disk.delete(path);
    }),
  },
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: (p: string) => reveal(p) }));

const SHARED = "01KX1AKET8KRS5HVRJSJRWC8RZ";

function file(title: string, body: string, updated: string): string {
  return `---\nid: ${SHARED}\ntitle: ${title}\ncreated: '2026-03-13T09:14:22Z'\nupdated: '${updated}'\ntags: []\n---\n${body}\n`;
}

beforeEach(() => {
  disk.clear();
  disk.set("/vault/plan.md", file("Plan", "Original body", "2026-03-13T09:14:22Z"));
  disk.set("/vault/plan copy.md", file("Plan (copy)", "Copy body", "2026-04-01T10:00:00Z"));
  useNoteStore.setState({ notes: [], duplicateGroups: [], selectedNoteId: null });
  useNoteStore
    .getState()
    .setNotes([...disk].map(([path, raw]) => ({ ...parseNote(raw, path), vaultId: "v1" })));
  reveal.mockClear();
});

function openModal() {
  render(<DuplicateIdsAlert />);
  fireEvent.click(screen.getByRole("button", { name: "Review duplicates" }));
  return screen.getByRole("dialog", { name: "Duplicate note IDs" });
}

describe("DuplicateIdsAlert", () => {
  it("is absent when every id is unique", () => {
    useNoteStore.setState({ duplicateGroups: [] });
    render(<DuplicateIdsAlert />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("warns persistently while a duplicate exists", () => {
    render(<DuplicateIdsAlert />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 note ID is used by more than one file.",
    );
  });
});

describe("DuplicateIdsModal", () => {
  it("lists each copy with path, title, updated time, and a preview", () => {
    const dialog = openModal();
    expect(
      within(dialog).getByRole("heading", { name: `2 files share ID ${SHARED}` }),
    ).toBeInTheDocument();
    const items = within(dialog).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Plan");
    expect(items[0]).toHaveTextContent("Keeps this ID");
    expect(items[0]).toHaveTextContent("/vault/plan.md");
    expect(items[0]).toHaveTextContent("Original body");
    expect(items[1]).toHaveTextContent("Plan (copy)");
    expect(items[1]).toHaveTextContent("/vault/plan copy.md");
    expect(items[1]).toHaveTextContent("Content differs from the kept copy");
    expect(items[1]).toHaveTextContent("Copy body");
    expect(items[1]).toHaveTextContent(/Updated .*2026/);
    expect(dialog).toHaveTextContent("keep pointing at the copy that keeps the ID");
  });

  it("re-IDs a copy and shows the group as resolved", async () => {
    const dialog = openModal();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Give Plan (copy) at /vault/plan copy.md a new ID",
      }),
    );
    await waitFor(() =>
      expect(within(dialog).getByRole("status")).toHaveTextContent(
        "All duplicate IDs are resolved.",
      ),
    );
    expect(parseNote(disk.get("/vault/plan copy.md") ?? "", "x").id).not.toBe(SHARED);
    expect(useNoteStore.getState().notes).toHaveLength(2);
  });

  it("opens the kept copy in the editor and reveals other copies on disk", async () => {
    const dialog = openModal();
    fireEvent.click(within(dialog).getByRole("button", { name: "Show in folder" }));
    await waitFor(() => expect(reveal).toHaveBeenCalledWith("/vault/plan copy.md"));

    fireEvent.click(within(dialog).getByRole("button", { name: "Open" }));
    expect(useNoteStore.getState().selectedNoteId).toBe(SHARED);
    expect(useUIStore.getState().activeView).toBe("notes");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on Escape and moves focus into the dialog on open", () => {
    const dialog = openModal();
    expect(within(dialog).getByRole("button", { name: "Close duplicate note IDs" })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
