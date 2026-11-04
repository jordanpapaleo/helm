import { invoke } from "@tauri-apps/api/core";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readEditorDraft, subscribeEditorDrafts } from "../../lib/editor-draft";
import { saveNoteContent } from "../../lib/save-note";
import { DEFAULT_SETTINGS } from "../../lib/settings";
import { useGitSyncStore } from "../../store/git-sync";
import { useNoteStore } from "../../store/notes";
import { useSettingsStore } from "../../store/settings";
import { useToastStore } from "../../store/toast";
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
    useGitSyncStore.setState({
      byVaultId: {},
      barrierPaths: [],
      heldNoteIds: [],
      heldDrafts: {},
    });
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS } });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies the note font variable on the editor surface", () => {
    render(<NoteEditor note={makeNote()} onSave={vi.fn()} />);
    expect(document.querySelector(".ProseMirror")?.getAttribute("style")).toContain(
      "font-family: var(--editor-font-family)",
    );
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

  it("publishes rich-text edits to the live draft even when auto-save is off", () => {
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, autoSaveOnEdit: false } });
    const onSave = vi.fn();
    const ref = createRef<NoteEditorHandle>();
    const seen: string[] = [];
    const stop = subscribeEditorDrafts(() => {
      const draft = readEditorDraft("01JPMXYZ123");
      if (draft?.includes("edited")) seen.push(draft);
    });
    render(<NoteEditor ref={ref} note={makeNote()} onSave={onSave} />);

    act(() => {
      ref.current?.getEditor()?.commands.insertContent(" edited");
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(readEditorDraft("01JPMXYZ123")).toContain("edited");

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onSave).not.toHaveBeenCalled();
    stop();
  });

  it("saves wiki links with unescaped brackets", () => {
    // The whole point of the fix: what reaches onSave is what lands on disk, and
    // other tools reading the file must see [[Some Note]], not \[\[Some Note\]\].
    const onSave = vi.fn();
    const ref = createRef<NoteEditorHandle>();
    render(
      <NoteEditor
        ref={ref}
        note={makeNote({ content: "See [[Some Note]] here" })}
        onSave={onSave}
      />,
    );

    act(() => {
      ref.current?.getEditor()?.commands.insertContent(" edited");
    });
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved: string = onSave.mock.calls[0][0];
    expect(saved).toContain("See [[Some Note]] here");
    expect(saved).not.toContain("\\[");
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

  it("releases a sync hold on reload and keeps the unsaved buffer", () => {
    const onSave = vi.fn();
    const note = makeNote();
    const ref = createRef<NoteEditorHandle>();
    const { rerender } = render(<NoteEditor ref={ref} note={note} onSave={onSave} />);

    act(() => {
      ref.current?.getEditor()?.commands.insertContent(" edited");
    });
    rerender(
      <NoteEditor
        ref={ref}
        note={{ ...note, content: "Pulled from the other computer" }}
        onSave={onSave}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(useGitSyncStore.getState().isHeld(note.id)).toBe(true);
    expect(ref.current?.getEditor()?.getText()).toContain("edited");

    const other = makeNote({
      id: "01JPMXYZ456",
      filePath: "/vault/b.md",
      fileName: "b.md",
      content: "Note B body",
      frontmatter: { ...makeNote().frontmatter, id: "01JPMXYZ456", title: "Note B" },
    });
    rerender(<NoteEditor ref={ref} note={other} onSave={onSave} />);
    expect(useGitSyncStore.getState().isHeld(note.id)).toBe(false);
    expect(useGitSyncStore.getState().heldDraft(note.id)).toContain("edited");

    rerender(
      <NoteEditor
        ref={ref}
        note={{ ...note, content: "Pulled from the other computer" }}
        onSave={onSave}
      />,
    );
    expect(useGitSyncStore.getState().isHeld(note.id)).toBe(false);
    expect(ref.current?.getEditor()?.getText()).toContain("edited");
    expect(ref.current?.getEditor()?.getText()).not.toContain("Pulled from the other computer");

    act(() => {
      ref.current?.getEditor()?.commands.insertContent(" more");
    });
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(onSave).toHaveBeenCalled();
    expect(onSave.mock.calls.at(-1)?.[0]).toContain("edited");
  });

  it("keeps the edit when the write fails and retries it on the next save", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    useToastStore.setState({ toasts: [] });
    const note = makeNote();
    useNoteStore.setState({
      notes: [note],
      vaults: [{ id: "v1", name: "Vault", path: "/vault" }],
      activeVaultId: "v1",
    });
    let writeAttempts = 0;
    vi.mocked(invoke).mockImplementation(async (command: string) => {
      if (command !== "write_note") return undefined;
      writeAttempts += 1;
      if (writeAttempts === 1) throw new Error("disk full");
      return undefined;
    });

    const ref = createRef<NoteEditorHandle>();
    const onSave = async (content: string): Promise<void> => {
      const current = useNoteStore.getState().notes.find((item) => item.id === note.id) ?? note;
      await saveNoteContent(current, content);
    };
    try {
      const { rerender } = render(<NoteEditor ref={ref} note={note} onSave={onSave} />);
      act(() => {
        ref.current?.getEditor()?.commands.insertContent(" edited");
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });

      expect(writeAttempts).toBe(1);
      expect(useNoteStore.getState().notes[0].content).toBe("Note A body");
      expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain(
        "Failed to save note: disk full",
      );
      expect(ref.current?.getEditor()?.getText()).toContain("edited");

      // The file on disk is still the previous body. A dirty editor must keep
      // the unsaved text instead of adopting that file.
      rerender(
        <NoteEditor ref={ref} note={{ ...note, content: "Note A body\n" }} onSave={onSave} />,
      );
      expect(ref.current?.getEditor()?.getText()).toContain("edited");
      expect(useGitSyncStore.getState().isHeld(note.id)).toBe(false);

      const surface = document.querySelector(".ProseMirror");
      expect(surface).toBeTruthy();
      await act(async () => {
        fireEvent.blur(surface as Element);
      });

      expect(writeAttempts).toBe(2);
      expect(useNoteStore.getState().notes[0].content).toContain("edited");
    } finally {
      vi.mocked(invoke).mockReset();
      vi.mocked(invoke).mockResolvedValue(undefined);
      vi.restoreAllMocks();
    }
  });

  it("does not hold the note when an earlier local save lands under a newer edit", async () => {
    const note = makeNote();
    useNoteStore.setState({
      notes: [note],
      vaults: [{ id: "v1", name: "Vault", path: "/vault" }],
      activeVaultId: "v1",
    });
    let writes = 0;
    let releaseFirst: () => void = () => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    vi.mocked(invoke).mockImplementation(async (command: string) => {
      if (command !== "write_note") return undefined;
      writes += 1;
      if (writes === 1) await firstGate;
      return undefined;
    });

    const ref = createRef<NoteEditorHandle>();
    const onSave = async (content: string): Promise<void> => {
      const current = useNoteStore.getState().notes.find((item) => item.id === note.id) ?? note;
      await saveNoteContent(current, content);
    };
    function LiveEditor() {
      const live = useNoteStore((state) => state.notes.find((item) => item.id === note.id));
      if (!live) return null;
      return <NoteEditor ref={ref} note={live} onSave={onSave} />;
    }
    try {
      render(<LiveEditor />);
      act(() => {
        ref.current?.getEditor()?.commands.insertContent(" one");
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      expect(writes).toBe(1);

      act(() => {
        ref.current?.getEditor()?.commands.insertContent(" two");
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      expect(writes).toBe(1);

      releaseFirst();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(useGitSyncStore.getState().isHeld(note.id)).toBe(false);
      expect(ref.current?.getEditor()?.getText()).toContain("two");

      act(() => {
        ref.current?.getEditor()?.commands.insertContent(" three");
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      expect(useGitSyncStore.getState().isHeld(note.id)).toBe(false);
      expect(writes).toBe(3);
    } finally {
      releaseFirst();
      vi.mocked(invoke).mockReset();
      vi.mocked(invoke).mockResolvedValue(undefined);
    }
  });
});

describe("NoteEditor wiki-link dropdown", () => {
  beforeEach(() => {
    useNoteStore.setState({ notes: [], selectedNoteId: null, vaults: [], activeVaultId: null });
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS } });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("still opens the note-link dropdown in the main editor", async () => {
    const note = makeNote();
    const other = makeNote({
      id: "other",
      filePath: "/vault/other.md",
      fileName: "other.md",
      content: "elsewhere",
      frontmatter: { ...note.frontmatter, id: "other", title: "Other Note" },
    });
    useNoteStore.setState({ notes: [note, other], selectedNoteId: note.id });
    const ref = createRef<NoteEditorHandle>();
    render(<NoteEditor ref={ref} note={note} onSave={vi.fn()} />);
    const editor = ref.current?.getEditor();
    if (!editor) throw new Error("editor missing");
    await act(async () => {
      editor.chain().focus("end").insertContent(" [[").run();
      await Promise.resolve();
    });
    const menu = screen.getByRole("region", { name: "Note links" });
    expect(within(menu).getByRole("button", { name: "Other Note" })).toBeInTheDocument();
    expect(within(menu).queryByRole("button", { name: "Note A" })).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.mouseDown(within(menu).getByRole("button", { name: "Other Note" }));
      await Promise.resolve();
    });
    expect(editor.getText()).toContain("[[Other Note]]");
  });
});
