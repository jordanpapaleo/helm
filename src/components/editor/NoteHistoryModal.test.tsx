import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tauriCommands } from "../../lib/tauri-commands";
import type { Note } from "../../types/note";
import { NoteHistoryModal } from "./NoteHistoryModal";

vi.mock("../../lib/tauri-commands", () => ({
  tauriCommands: {
    listNoteHistory: vi.fn(),
    readNote: vi.fn(),
    snapshotNote: vi.fn().mockResolvedValue(undefined),
  },
}));

const note: Note = {
  id: "01ABC",
  filePath: "/vault/note.md",
  fileName: "note.md",
  content: "current content",
  vaultId: "v1",
  frontmatter: {
    id: "01ABC",
    title: "My Note",
    created: "2026-07-01",
    updated: "2026-07-10",
    tags: [],
    urgent: false,
    important: false,
    state: "Doing",
    blocked: false,
    links: [],
  },
};

describe("NoteHistoryModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tauriCommands.snapshotNote).mockResolvedValue(undefined);
  });

  it("shows an empty state when the note has no history", async () => {
    vi.mocked(tauriCommands.listNoteHistory).mockResolvedValue([]);
    render(
      <NoteHistoryModal note={note} vaultPath="/vault" onClose={vi.fn()} onRestore={vi.fn()} />,
    );
    expect(await screen.findByText(/no history yet/i)).toBeInTheDocument();
  });

  it("lists snapshots newest first and previews one on click", async () => {
    vi.mocked(tauriCommands.listNoteHistory).mockResolvedValue([
      { ts_ms: 1751980000000, path: "/vault/.helm-history/01ABC/1751980000000.md" },
      { ts_ms: 1751880000000, path: "/vault/.helm-history/01ABC/1751880000000.md" },
    ]);
    vi.mocked(tauriCommands.readNote).mockResolvedValue("---\nid: 01ABC\n---\nolder body");

    const user = userEvent.setup();
    render(
      <NoteHistoryModal note={note} vaultPath="/vault" onClose={vi.fn()} onRestore={vi.fn()} />,
    );

    const entries = await screen.findAllByRole("button", { name: /snapshot from/i });
    expect(entries).toHaveLength(2);

    await user.click(entries[1]);
    await waitFor(() => expect(screen.getByText(/older body/)).toBeInTheDocument());
    expect(tauriCommands.readNote).toHaveBeenCalledWith(
      "/vault/.helm-history/01ABC/1751880000000.md",
    );
  });

  it("restores the previewed snapshot's body via onRestore", async () => {
    vi.mocked(tauriCommands.listNoteHistory).mockResolvedValue([
      { ts_ms: 1751980000000, path: "/vault/.helm-history/01ABC/1751980000000.md" },
    ]);
    vi.mocked(tauriCommands.readNote).mockResolvedValue("---\nid: 01ABC\n---\nrestored body");
    const onRestore = vi.fn();

    const user = userEvent.setup();
    render(
      <NoteHistoryModal note={note} vaultPath="/vault" onClose={vi.fn()} onRestore={onRestore} />,
    );

    await user.click(await screen.findByRole("button", { name: /snapshot from/i }));
    await user.click(await screen.findByRole("button", { name: /restore this version/i }));

    await waitFor(() => expect(onRestore).toHaveBeenCalledOnce());
    expect(onRestore.mock.calls[0][0]).toContain("restored body");
  });

  it("snapshots the current file with min age 0 before replacing it", async () => {
    vi.mocked(tauriCommands.listNoteHistory).mockResolvedValue([
      { ts_ms: 1751980000000, path: "/vault/.helm-history/01ABC/1751980000000.md" },
    ]);
    vi.mocked(tauriCommands.readNote).mockResolvedValue("---\nid: 01ABC\n---\nrestored body");
    let releaseSnapshot: () => void = () => {};
    const snapshotGate = new Promise<void>((resolve) => {
      releaseSnapshot = resolve;
    });
    vi.mocked(tauriCommands.snapshotNote).mockReturnValue(snapshotGate);
    const onRestore = vi.fn();
    const onClose = vi.fn();

    const user = userEvent.setup();
    render(
      <NoteHistoryModal note={note} vaultPath="/vault" onClose={onClose} onRestore={onRestore} />,
    );

    await user.click(await screen.findByRole("button", { name: /snapshot from/i }));
    await user.click(await screen.findByRole("button", { name: /restore this version/i }));

    expect(tauriCommands.snapshotNote).toHaveBeenCalledWith("/vault", note.id, note.filePath, 0);
    expect(onRestore).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      releaseSnapshot();
    });

    expect(onRestore).toHaveBeenCalledOnce();
    expect(onRestore.mock.calls[0][0]).toContain("restored body");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not replace the note when snapshotting the current file fails", async () => {
    vi.mocked(tauriCommands.listNoteHistory).mockResolvedValue([
      { ts_ms: 1751980000000, path: "/vault/.helm-history/01ABC/1751980000000.md" },
    ]);
    vi.mocked(tauriCommands.readNote).mockResolvedValue("---\nid: 01ABC\n---\nrestored body");
    vi.mocked(tauriCommands.snapshotNote).mockRejectedValue(new Error("history unwritable"));
    const onRestore = vi.fn();
    const onClose = vi.fn();

    const user = userEvent.setup();
    render(
      <NoteHistoryModal note={note} vaultPath="/vault" onClose={onClose} onRestore={onRestore} />,
    );

    await user.click(await screen.findByRole("button", { name: /snapshot from/i }));
    await user.click(await screen.findByRole("button", { name: /restore this version/i }));

    await waitFor(() =>
      expect(tauriCommands.snapshotNote).toHaveBeenCalledWith("/vault", note.id, note.filePath, 0),
    );
    expect(onRestore).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /restore this version/i })).toBeInTheDocument();
  });

  it("closes via the close button", async () => {
    vi.mocked(tauriCommands.listNoteHistory).mockResolvedValue([]);
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <NoteHistoryModal note={note} vaultPath="/vault" onClose={onClose} onRestore={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
