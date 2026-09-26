import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "../types/note";

const savePdfDialog = vi.fn();
const exportPdf = vi.fn();
vi.mock("../lib/tauri-commands", () => ({
  tauriCommands: {
    savePdfDialog: (...a: unknown[]) => savePdfDialog(...a),
    exportPdf: (...a: unknown[]) => exportPdf(...a),
  },
}));

const flushPendingSaves = vi.fn();
vi.mock("../lib/pending-saves", () => ({
  flushPendingSaves: () => flushPendingSaves(),
}));

import { useNoteStore } from "../store/notes";
import { useToastStore } from "../store/toast";
import { usePdfExport } from "./usePdfExport";

function makeNote(id: string, title: string, content = "body"): Note {
  return {
    id,
    filePath: `/vault/${id}.md`,
    fileName: `${id}.md`,
    vaultId: "v1",
    content,
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
    },
  };
}

describe("usePdfExport", () => {
  beforeEach(() => {
    savePdfDialog.mockReset();
    exportPdf.mockReset();
    flushPendingSaves.mockReset();
    flushPendingSaves.mockResolvedValue(undefined);
    useNoteStore.setState({ notes: [makeNote("n1", "Plan: Q3")] });
    useToastStore.setState({ toasts: [] });
  });

  it("asks for a destination named after the note, then prints it there", async () => {
    savePdfDialog.mockResolvedValue("/tmp/out.pdf");
    exportPdf.mockResolvedValue("/tmp/out.pdf");
    const { result } = renderHook(() => usePdfExport());

    await act(() => result.current.start("n1"));
    expect(savePdfDialog).toHaveBeenCalledWith("Plan- Q3.pdf");
    expect(result.current.job).toMatchObject({ note: { id: "n1" }, path: "/tmp/out.pdf" });
    expect(exportPdf).not.toHaveBeenCalled();

    await act(() => result.current.handleReady());
    expect(exportPdf).toHaveBeenCalledWith("/tmp/out.pdf");
    expect(result.current.job).toBeNull();
    expect(useToastStore.getState().toasts).toEqual([
      expect.objectContaining({ kind: "info", message: "Exported out.pdf" }),
    ]);
  });

  it("flushes pending edits before reading the note", async () => {
    flushPendingSaves.mockImplementation(async () => {
      useNoteStore.setState({ notes: [makeNote("n1", "Plan: Q3", "edited")] });
    });
    savePdfDialog.mockResolvedValue("/tmp/out.pdf");
    const { result } = renderHook(() => usePdfExport());
    await act(() => result.current.start("n1"));
    expect(result.current.job?.note.content).toBe("edited");
  });

  it("does nothing when the dialog is cancelled", async () => {
    savePdfDialog.mockResolvedValue(null);
    const { result } = renderHook(() => usePdfExport());
    await act(() => result.current.start("n1"));
    expect(result.current.job).toBeNull();
    expect(exportPdf).not.toHaveBeenCalled();

    savePdfDialog.mockResolvedValue("/tmp/again.pdf");
    await act(() => result.current.start("n1"));
    expect(result.current.job?.path).toBe("/tmp/again.pdf");
  });

  it("reports export failures as an error toast and resets", async () => {
    savePdfDialog.mockResolvedValue("/tmp/out.pdf");
    exportPdf.mockRejectedValue("Folder does not exist: /tmp");
    const { result } = renderHook(() => usePdfExport());
    await act(() => result.current.start("n1"));
    await act(() => result.current.handleReady());
    expect(result.current.job).toBeNull();
    const [toast] = useToastStore.getState().toasts;
    expect(toast.kind).toBe("error");
    expect(toast.message).toContain("Failed to export PDF");
  });

  it("ignores a second export while one is in progress", async () => {
    savePdfDialog.mockResolvedValue("/tmp/out.pdf");
    const { result } = renderHook(() => usePdfExport());
    await act(() => result.current.start("n1"));
    await act(() => result.current.start("n1"));
    expect(savePdfDialog).toHaveBeenCalledTimes(1);
  });

  it("ignores unknown notes", async () => {
    const { result } = renderHook(() => usePdfExport());
    await act(() => result.current.start("missing"));
    expect(savePdfDialog).not.toHaveBeenCalled();
  });
});
