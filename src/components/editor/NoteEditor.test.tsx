import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNoteStore } from "../../store/notes";
import type { Note } from "../../types/note";
import { NoteEditor, type NoteEditorHandle } from "./NoteEditor";

// The editor never touches disk in these tests — Tauri's invoke bridge is absent
// under jsdom, so stub the whole core module (tauri-commands imports invoke from it).
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://${p}`,
  invoke: vi.fn().mockResolvedValue(undefined),
}));

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "01JPMXYZ123",
    filePath: "/vault/a.md",
    fileName: "a.md",
    content: "Note A body",
    vaultId: "v1",
    frontmatter: {
      id: "01JPMXYZ123",
      title: "Note A",
      created: "2026-07-01",
      updated: "2026-07-01",
      tags: [],
      urgent: false,
      important: false,
      state: "Prepare",
      blocked: false,
      links: [],
    },
    ...overrides,
  };
}

describe("NoteEditor — opening a note must not schedule a save", () => {
  beforeEach(() => {
    useNoteStore.setState({ notes: [], selectedNoteId: null, vaults: [], activeVaultId: null });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not call onSave when a note is first opened", () => {
    const onSave = vi.fn();
    render(<NoteEditor note={makeNote()} onSave={onSave} />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it("does not call onSave when switching to a different note", () => {
    const onSave = vi.fn();
    const { rerender } = render(<NoteEditor note={makeNote()} onSave={onSave} />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    const noteB = makeNote({
      id: "01JPMXYZ456",
      filePath: "/vault/b.md",
      fileName: "b.md",
      content: "Note B body",
      frontmatter: { ...makeNote().frontmatter, id: "01JPMXYZ456", title: "Note B" },
    });
    rerender(<NoteEditor note={noteB} onSave={onSave} />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it("does not call onSave when the file changes externally (reload, not an edit)", () => {
    const onSave = vi.fn();
    const note = makeNote();
    const { rerender } = render(<NoteEditor note={note} onSave={onSave} />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Same note id, new content on disk (e.g. written by the MCP server)
    rerender(<NoteEditor note={{ ...note, content: "Changed by Claude Code" }} onSave={onSave} />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it("still saves a genuine user edit", () => {
    const onSave = vi.fn();
    const ref = createRef<NoteEditorHandle>();
    render(<NoteEditor ref={ref} note={makeNote()} onSave={onSave} />);

    act(() => {
      ref.current?.getEditor()?.commands.insertContent(" edited");
    });
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toContain("edited");
  });

  it("still reloads the editor content on an external file change", () => {
    const onSave = vi.fn();
    const note = makeNote();
    const ref = createRef<NoteEditorHandle>();
    const { rerender } = render(<NoteEditor ref={ref} note={note} onSave={onSave} />);

    rerender(
      <NoteEditor ref={ref} note={{ ...note, content: "Rewritten externally" }} onSave={onSave} />,
    );

    expect(ref.current?.getEditor()?.getText()).toContain("Rewritten externally");
  });
});
