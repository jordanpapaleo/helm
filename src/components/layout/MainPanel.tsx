import { listen } from "@tauri-apps/api/event";
import { confirm } from "@tauri-apps/plugin-dialog";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { bindNotePdfExport, usePdfExport } from "../../hooks/usePdfExport";
import { isArchived } from "../../lib/archive";
import { markdownIndexToTextOffset, textOffsetToMarkdownIndex } from "../../lib/cursor-position";
import { notifyEditorDraft, registerEditorDraft } from "../../lib/editor-draft";
import { decideEditorSync } from "../../lib/git-sync";
import { normalizeContent, serializeNote } from "../../lib/note-parser";
import { registerSaveFlusher, unregisterSaveFlusher } from "../../lib/pending-saves";
import { isProjectMember, type Project, serializeProjectMeta } from "../../lib/projects";
import { planTrashRestore, reportPathCollisions } from "../../lib/restore-trash";
import { saveNoteContent } from "../../lib/save-note";
import { applyScrollFraction, getScrollFraction } from "../../lib/scroll-fraction";
import { dropRemovedInlineTags } from "../../lib/tags";
import { tauriCommands } from "../../lib/tauri-commands";
import { nowTimestamp } from "../../lib/timestamps";
import { useGitSyncStore } from "../../store/git-sync";
import { useNoteStore } from "../../store/notes";
import { useProjectStore } from "../../store/projects";
import { useSettingsStore } from "../../store/settings";
import { reportError } from "../../store/toast";
import { useTrashStore } from "../../store/trash";
import { useUIStore } from "../../store/ui";
import type { NoteFrontmatter } from "../../types/note";
import { DashboardView } from "../../views/DashboardView";
import { EisenhowerView } from "../../views/EisenhowerView";
import { GraphView } from "../../views/GraphView";
import { KanbanView } from "../../views/KanbanView";
import { BacklinksPanel } from "../editor/BacklinksPanel";
import { FindReplaceBar } from "../editor/FindReplaceBar";
import { NoteEditor, type NoteEditorHandle } from "../editor/NoteEditor";
import { NoteHistoryModal } from "../editor/NoteHistoryModal";
import { NotePrintView } from "../editor/NotePrintView";
import { PropertyPanel } from "../editor/PropertyPanel";
import { ProjectOverview } from "../projects/ProjectOverview";

export interface MarkdownTextareaHandle {
  textarea: HTMLTextAreaElement | null;
  replaceContent: (newContent: string) => void;
  /**
   * The caret as a surface-independent text offset — the number of characters a
   * reader sees before it. See `src/lib/cursor-position.ts`.
   */
  getCursorTextOffset: () => number | null;
  /** Move the caret to a text offset and focus the textarea. Never throws. */
  setCursorTextOffset: (offset: number) => void;
  /** How far through the document the view is scrolled, 0…1 (see scroll-fraction.ts). */
  getScrollFraction: () => number | null;
}

export const MarkdownTextarea = forwardRef<
  MarkdownTextareaHandle,
  {
    noteId: string;
    vaultPath: string | null;
    content: string;
    onSave: (md: string) => void | Promise<void>;
    locked?: boolean;
    /**
     * Text offset to place the caret at on mount — used to carry the cursor over
     * from the rich-text editor. Applied once, then ignored.
     */
    initialCursorOffset?: number | null;
    /** Scroll fraction to restore on mount, so the view keeps its place. */
    initialScrollFraction?: number | null;
  }
>(function MarkdownTextarea(
  {
    noteId,
    vaultPath,
    content,
    onSave,
    locked,
    initialCursorOffset = null,
    initialScrollFraction = null,
  },
  ref,
) {
  const [value, setValue] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flusherId = useId();

  // Read latest state through refs so the flusher registered on mount never
  // captures stale values.
  useEffect(() => registerEditorDraft(noteId, () => valueRef.current), [noteId]);
  const valueRef = useRef(value);
  valueRef.current = value;
  // Publish after render so readers see valueRef. `value` is the trigger, not an input.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keystrokes and programmatic setValue must refresh open previews
  useEffect(() => {
    notifyEditorDraft(noteId);
  }, [value, noteId]);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const noteIdRef = useRef(noteId);
  noteIdRef.current = noteId;
  const vaultPathRef = useRef(vaultPath);
  vaultPathRef.current = vaultPath;
  const dirtyRef = useRef(false);
  // The imperative handle is created once. Read locked through a ref so a
  // deleted note cannot be replaced, and so restore re-enables replacement
  // without remounting the textarea.
  const lockedRef = useRef(locked === true);
  lockedRef.current = locked === true;

  // Tracks the last content we handed to onSave so we can tell our own saves
  // apart from external file changes (Claude Code, the MCP server, the file
  // watcher, a bulk tag rewrite in the store). Same device as NoteEditor's
  // lastSavedContentRef — every onSave call site must go through commitSave.
  const lastSavedContentRef = useRef(content);
  const commitSave = useCallback((md: string) => {
    const id = noteIdRef.current;
    if (useGitSyncStore.getState().isWriteBlocked(id, vaultPathRef.current)) {
      dirtyRef.current = true;
      useGitSyncStore.getState().preserveHeldDraft(id, md);
      return;
    }
    lastSavedContentRef.current = md;
    dirtyRef.current = false;
    useGitSyncStore.getState().clearHeldDraft(id);
    useGitSyncStore.getState().releaseNote(id);
    return onSaveRef.current(md);
  }, []);

  const flush = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    commitSave(value);
  }, [commitSave, value]);

  // Flush edits still inside the debounce window if the window closes.
  useEffect(() => {
    registerSaveFlusher(flusherId, {
      isPending: () => saveTimer.current !== null,
      flush: () => {
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
          saveTimer.current = null;
        }
        return commitSave(valueRef.current);
      },
    });
    return () => unregisterSaveFlusher(flusherId);
  }, [flusherId, commitSave]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!e.metaKey && !e.ctrlKey) return;
    const ta = e.currentTarget;
    const { selectionStart: start, selectionEnd: end, value: val } = ta;

    type Wrap = [string, string];
    let wrap: Wrap | null = null;

    if (!e.shiftKey) {
      if (e.key === "b") wrap = ["**", "**"];
      else if (e.key === "i") wrap = ["*", "*"];
      else if (e.key === "e") wrap = ["`", "`"];
      else if (e.key === "u") wrap = ["<u>", "</u>"];
    } else {
      if (e.key === "S") wrap = ["~~", "~~"];
      else if (e.key === "H") wrap = ["==", "=="];
    }

    if (!wrap || locked) return;
    e.preventDefault();

    const [prefix, suffix] = wrap;
    const selected = val.slice(start, end);
    const next = val.slice(0, start) + prefix + selected + suffix + val.slice(end);
    dirtyRef.current = true;
    setValue(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      commitSave(next);
    }, 1000);

    // Restore selection inside the wrapping characters
    requestAnimationFrame(() => {
      ta.selectionStart = start + prefix.length;
      ta.selectionEnd = end + prefix.length;
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (locked) return;
    const next = e.target.value;
    dirtyRef.current = true;
    setValue(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      commitSave(next);
    }, 1000);
  };

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  // Caret index to reapply once an adopted external change has repainted the
  // textarea — assigning a new `value` otherwise drops the caret to the end.
  const pendingCaretRef = useRef<number | null>(null);

  // Follow the file when it is rewritten underneath us (a pull, Claude Code, the
  // MCP server, the file watcher, a bulk tag rename/delete in the store). A
  // clean box adopts the incoming text. Keystrokes that overlap a different
  // incoming body stay on screen and are not written back — the same hold the
  // rich editor uses. Leaving the note releases that hold and keeps the buffer.
  useEffect(() => {
    const store = useGitSyncStore.getState();
    const draft = store.heldDraft(noteId);
    const incomingNorm = normalizeContent(content);
    if (
      draft &&
      normalizeContent(draft) !== incomingNorm &&
      normalizeContent(valueRef.current) === incomingNorm &&
      !dirtyRef.current
    ) {
      dirtyRef.current = true;
      lastSavedContentRef.current = content;
      store.releaseNote(noteId);
      setValue(draft);
      return;
    }
    const decision = decideEditorSync({
      dirtySinceFlush:
        dirtyRef.current ||
        normalizeContent(valueRef.current) !== normalizeContent(lastSavedContentRef.current),
      flushedContent: lastSavedContentRef.current,
      incomingContent: content,
    });
    if (decision === "keep-editor") return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (decision === "hold") {
      dirtyRef.current = true;
      store.preserveHeldDraft(noteId, valueRef.current);
      store.holdNote(noteId);
      return;
    }
    store.releaseNote(noteId);
    store.clearHeldDraft(noteId);
    dirtyRef.current = false;
    // Best effort on the caret: the local text is unedited, so a raw index is
    // still meaningful — hold it where it is, clamped to the new body.
    pendingCaretRef.current = Math.min(textareaRef.current?.selectionStart ?? 0, content.length);
    setValue(content);
    lastSavedContentRef.current = content;
  }, [content, noteId]);

  useEffect(() => {
    return () => {
      const id = noteIdRef.current;
      const store = useGitSyncStore.getState();
      if (!store.isHeld(id) && !store.isWriteBlocked(id, vaultPathRef.current)) return;
      if (dirtyRef.current || store.isHeld(id)) store.preserveHeldDraft(id, valueRef.current);
      store.releaseNote(id);
    };
  }, []);

  // Runs before paint so the caret never visibly jumps. No-ops for ordinary
  // typing, where the browser already keeps the caret in place.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `value` is the trigger, not an input — the caret must be reapplied on the render that paints the adopted content
  useLayoutEffect(() => {
    const caret = pendingCaretRef.current;
    if (caret === null) return;
    pendingCaretRef.current = null;
    textareaRef.current?.setSelectionRange(caret, caret);
  }, [value]);

  // Read the caret through a ref so the mount effect and the imperative handle
  // always measure against the text currently in the box, not the mounted value.
  const valueForCursorRef = useRef(value);
  valueForCursorRef.current = value;

  // Moving the caret does not fire `change`, so restoring a cursor can never
  // wake the debounced auto-save.
  const setCursorTextOffset = useCallback((offset: number) => {
    const el = textareaRef.current;
    if (!el) return;
    const index = textOffsetToMarkdownIndex(valueForCursorRef.current, offset);
    // Order matters: set the selection *before* focusing. Focusing a text control
    // reveals its cached selection, which scrolls the caret into view; focusing
    // first and then setting the selection leaves it off-screen (measured in
    // Chromium: scrollTop stayed 0 with the caret 2587px down a 3375px note).
    // When a scroll fraction is also being restored it overrides this, but this
    // is what keeps the caret on screen when there is no fraction to restore.
    el.setSelectionRange(index, index);
    el.focus();
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      get textarea() {
        return textareaRef.current;
      },
      replaceContent(newContent: string) {
        if (lockedRef.current) return;
        setValue(newContent);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          saveTimer.current = null;
          commitSave(newContent);
        }, 1000);
      },
      getCursorTextOffset: () => {
        const el = textareaRef.current;
        if (!el) return null;
        return markdownIndexToTextOffset(valueForCursorRef.current, el.selectionStart);
      },
      setCursorTextOffset,
      // The textarea scrolls internally — it, not the MainPanel wrapper, is the
      // element that actually moves in markdown mode.
      getScrollFraction: () =>
        textareaRef.current ? getScrollFraction(textareaRef.current) : null,
    }),
    [commitSave, setCursorTextOffset],
  );

  // Carry the cursor and the scroll position over from the rich-text editor. The
  // textarea mounts fresh on every toggle, so this happens exactly once.
  //
  // Order is load-bearing, and was measured rather than assumed:
  //   1. restore the reading position while the textarea is still unfocused
  //   2. set the selection, then focus
  // Focusing a text control reveals its cached selection with a *minimal* scroll,
  // so step 2 leaves the view exactly where step 1 put it when the caret is
  // already visible, and rescues the caret when it is not. That is what keeps the
  // invariant — caret visible after a restore — even if the mapping drifted.
  //
  // The "done" guard is set inside the frame so that a re-render which cancels
  // the frame reschedules the restore instead of dropping it.
  const restoreDoneRef = useRef(false);
  useEffect(() => {
    if (restoreDoneRef.current) return;
    if (initialCursorOffset === null || initialCursorOffset === undefined) return;
    // Wait for layout: scrollHeight is meaningless until the textarea has one.
    const frame = requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      restoreDoneRef.current = true;
      applyScrollFraction(el, initialScrollFraction);
      setCursorTextOffset(initialCursorOffset);
    });
    return () => cancelAnimationFrame(frame);
  }, [initialCursorOffset, initialScrollFraction, setCursorTextOffset]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={flush}
      readOnly={locked}
      spellCheck={false}
      className={`flex-1 resize-none bg-transparent px-12 py-6 outline-none ${locked ? "opacity-75 cursor-not-allowed" : ""}`}
      style={{
        fontFamily: "var(--editor-font-family)",
        fontSize: "var(--editor-font-size)",
        lineHeight: "var(--editor-line-height)",
        color: "var(--color-text)",
      }}
    />
  );
});

/**
 * Apply one header edit after any earlier edit for this panel has finished.
 * renameNote keeps the note it was given until both disk steps finish, then
 * replaces the store entry with that snapshot. A checkbox click during the
 * rename used to write the old path and title, and the snapshot then dropped
 * the checkbox. Waiting lets the checkbox save onto the renamed note.
 */
async function persistFrontmatterChange(
  noteId: string,
  updates: Partial<NoteFrontmatter>,
): Promise<void> {
  const note = useNoteStore.getState().notes.find((item) => item.id === noteId);
  if (!note) return;
  if (note.frontmatter.locked && Object.keys(updates).some((key) => key !== "locked")) return;
  const vaultPath = useNoteStore.getState().vaults.find((vault) => vault.id === note.vaultId)?.path;
  if (useGitSyncStore.getState().isWriteBlocked(noteId, vaultPath ?? null)) return;

  if (typeof updates.title === "string" && Object.keys(updates).length === 1) {
    try {
      await useNoteStore.getState().renameNote(note, updates.title);
    } catch (error) {
      reportError("Failed to rename note", error);
    }
    return;
  }

  const current = useNoteStore.getState().notes.find((item) => item.id === noteId);
  if (!current) return;
  // An empty tag list is a real edit. Reading a note unions frontmatter with
  // inline `#tag`s, so a tag left in the body would be parsed back in and the
  // last one would look like it could not be removed. Strip only the tags
  // the field dropped; a child the field still lists stays in the body.
  const content = Array.isArray(updates.tags)
    ? dropRemovedInlineTags(current.content, current.frontmatter.tags, updates.tags)
    : current.content;
  const updated = {
    ...current,
    content,
    frontmatter: {
      ...current.frontmatter,
      ...updates,
      updated: nowTimestamp(),
    },
  };
  useNoteStore.getState().updateNote(updated);
  // A tag edit can delete body text, including a list or task line that held
  // only that tag. Snapshot the file that is still on disk before overwriting
  // it. The snapshot is awaited so it lands first, and a failure must not block
  // the write. Frontmatter-only edits leave the body alone and skip this.
  if (content !== current.content && vaultPath) {
    await tauriCommands.snapshotNote(vaultPath, current.id, current.filePath).catch(() => {
      /* snapshotting must never block a save */
    });
  }
  try {
    await tauriCommands.writeNote(updated.filePath, serializeNote(updated));
  } catch (error) {
    reportError("Failed to save frontmatter", error);
  }
}

/** True when the open note is a trash snapshot rather than a live file. */
function viewingDeletedNote(): boolean {
  const id = useNoteStore.getState().selectedNoteId;
  if (!id) return false;
  if (useNoteStore.getState().notes.some((note) => note.id === id)) return false;
  return useTrashStore.getState().items.some((item) => item.note.id === id);
}

export function MainPanel() {
  const { activeView, markdownMode, setMarkdownMode, toggleMarkdownMode, navigate } = useUIStore();
  const { notes, vaults, selectedNoteId, removeNote, selectNote, addNote } = useNoteStore();
  const trashItems = useTrashStore((state) => state.items);
  const { settings } = useSettingsStore();
  const enableProjects = settings.enableProjects;
  const projects = useProjectStore((state) => state.projects);
  const liveNote = notes.find((n) => n.id === selectedNoteId);
  const deletedItem = liveNote
    ? undefined
    : trashItems.find((item) => item.note.id === selectedNoteId);
  const selectedNote = liveNote ?? deletedItem?.note;
  const viewingDeleted = deletedItem !== undefined;
  // Deleted and locked notes stay read-only. Find may open; Replace may not.
  const canReplace =
    selectedNote !== undefined && !viewingDeleted && !selectedNote.frontmatter.locked;
  const editorRef = useRef<NoteEditorHandle>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findExpanded, setFindExpanded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { job: pdfJob, start: startPdfExport, handleReady: handlePdfReady } = usePdfExport();
  const markdownTextareaRef = useRef<MarkdownTextareaHandle>(null);
  // Header edits (title rename, then a checkbox in the same click) must not overlap.
  const frontmatterWrites = useRef(Promise.resolve());
  // Cursor and scroll position handed from the outgoing surface to the incoming
  // one across a markdown/editor toggle, tagged with the note it came from so a
  // note switch can never resurrect a stale position.
  const [pendingCursor, setPendingCursor] = useState<{
    noteId: string;
    offset: number;
    scrollFraction: number | null;
  } | null>(null);
  const selectedVaultPath = selectedNote
    ? (vaults.find((v) => v.id === selectedNote.vaultId)?.path ?? null)
    : null;

  // Reset mode to default when switching notes
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedNoteId is intentionally included — the view mode and find bar must reset on every note switch
  useEffect(() => {
    setMarkdownMode(settings.defaultNoteView === "markdown");
    setFindOpen(false);
    setFindExpanded(false);
    setHistoryOpen(false);
    // Switching notes starts clean — never reuse the previous note's cursor,
    // and never re-apply this note's cursor if the user navigates back to it.
    setPendingCursor(null);
  }, [selectedNoteId, settings.defaultNoteView, setMarkdownMode]);

  // Keep the caret *and* the reading position where the user left them when
  // flipping between the rich-text editor and the raw markdown view. The two
  // surfaces are separate mount trees with incompatible position spaces, so we
  // hand over two view-independent numbers: a plain-text offset for the caret
  // (src/lib/cursor-position.ts) and a scroll fraction for the viewport
  // (src/lib/scroll-fraction.ts). The incoming surface translates both.
  //
  // They ride in as mount-time props rather than being pushed through an
  // imperative handle from an effect: the incoming component is brand new, its
  // handle does not exist yet at toggle time, and a prop keeps the restore inside
  // the component that owns the caret.
  const handleToggleMarkdown = useCallback(() => {
    const outgoing = markdownMode ? markdownTextareaRef.current : editorRef.current;
    const offset = outgoing?.getCursorTextOffset();
    setPendingCursor(
      selectedNoteId && offset !== null && offset !== undefined
        ? { noteId: selectedNoteId, offset, scrollFraction: outgoing?.getScrollFraction() ?? null }
        : null,
    );
    toggleMarkdownMode();
  }, [markdownMode, selectedNoteId, toggleMarkdownMode]);

  const restoring = pendingCursor && pendingCursor.noteId === selectedNoteId ? pendingCursor : null;
  const initialCursorOffset = restoring ? restoring.offset : null;
  const initialScrollFraction = restoring ? restoring.scrollFraction : null;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        if (!selectedNote) return;
        e.preventDefault();
        setFindOpen((open) => {
          if (!open) {
            setFindExpanded(false);
            return true;
          }
          // A second Cmd/Ctrl+F reveals Replace. Skip that while the note
          // cannot be edited, so the bar stays find-only.
          if (canReplace) setFindExpanded(true);
          return true;
        });
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [selectedNote, canReplace]);

  useEffect(() => {
    if (!canReplace) setFindExpanded(false);
  }, [canReplace]);

  useEffect(() => {
    const unlisteners: Array<() => void> = [];
    (async () => {
      unlisteners.push(
        await listen<number>("format-heading", (event) => {
          if (viewingDeletedNote()) return;
          const level = event.payload as 1 | 2 | 3 | 4 | 5 | 6;
          editorRef.current?.getEditor()?.chain().focus().setHeading({ level }).run();
        }),
      );
      unlisteners.push(
        await listen("format-paragraph", () => {
          if (viewingDeletedNote()) return;
          editorRef.current?.getEditor()?.chain().focus().setParagraph().run();
        }),
      );
      unlisteners.push(
        await listen("export-pdf", () => {
          const { selectedNoteId: id } = useNoteStore.getState();
          if (id && useUIStore.getState().activeView === "notes") startPdfExport(id);
        }),
      );
    })();
    return () => {
      for (const fn of unlisteners) fn();
    };
  }, [startPdfExport]);

  useEffect(() => bindNotePdfExport(startPdfExport), [startPdfExport]);

  async function handleSave(content: string) {
    if (!selectedNote || viewingDeleted) return;
    await saveNoteContent(selectedNote, content);
  }

  const openProject =
    enableProjects && selectedNote
      ? (projects.find(
          (project) =>
            project.mainPageId === selectedNote.id &&
            isProjectMember(selectedNote.filePath, project.rootPath),
        ) ?? null)
      : null;

  async function handleProjectMeta(
    project: Project,
    patch: { status?: Project["status"]; repository?: string | null },
  ) {
    const next = { ...project, ...patch };
    useProjectStore.getState().upsert(next);
    try {
      await tauriCommands.writeTextFile(next.metaPath, serializeProjectMeta(next));
    } catch (error) {
      reportError("Failed to save project", error);
    }
  }

  function handleFrontmatterChange(updates: Partial<NoteFrontmatter>): Promise<void> {
    if (!selectedNote || viewingDeleted) return Promise.resolve();
    const noteId = selectedNote.id;
    const run = frontmatterWrites.current.then(() => persistFrontmatterChange(noteId, updates));
    frontmatterWrites.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function handleArchiveToggle() {
    if (!selectedNote || viewingDeleted || selectedNote.frontmatter.locked) return;
    // Archive in place: only the flag changes. Id, path, content, tags, links,
    // history, and workflow fields stay as they are.
    await handleFrontmatterChange({ archived: !isArchived(selectedNote.frontmatter) });
  }

  async function handleRestoreDeleted() {
    if (!deletedItem) return;
    const occupied = useNoteStore.getState().notes.map((note) => note.filePath);
    const { held } = planTrashRestore([deletedItem], occupied);
    if (held.length > 0) {
      reportPathCollisions(held);
      return;
    }
    try {
      await tauriCommands.writeNote(deletedItem.note.filePath, serializeNote(deletedItem.note));
      useTrashStore.getState().removeFromTrash(deletedItem.note.id);
      addNote(deletedItem.note);
    } catch (e) {
      reportError("Failed to restore note", e);
    }
  }

  async function handlePermanentDelete() {
    if (!deletedItem) return;
    const confirmed = await confirm(
      `Permanently delete "${deletedItem.note.frontmatter.title || "Untitled"}"? This cannot be undone.`,
      { title: "Delete", kind: "warning" },
    );
    if (!confirmed) return;
    useTrashStore.getState().permanentlyDelete(deletedItem.note.id);
    selectNote(null);
  }

  async function handleDelete() {
    if (!selectedNote || viewingDeleted || selectedNote.frontmatter.locked) return;
    if (useGitSyncStore.getState().isBarrierActive(selectedVaultPath ?? "")) return;
    const confirmed = await confirm(
      `Move "${selectedNote.frontmatter.title || "Untitled"}" to Trash?`,
      { title: "Move to Trash", kind: "warning" },
    );
    if (!confirmed) return;
    useTrashStore.getState().addToTrash(selectedNote);
    selectNote(null);
    removeNote(selectedNote.id);
    try {
      await tauriCommands.deleteNote(selectedNote.filePath);
    } catch (e) {
      reportError("Failed to delete note", e);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden min-w-0">
      {activeView === "notes" &&
        (selectedNote ? (
          <div className="relative flex flex-1 flex-col overflow-y-auto">
            {viewingDeleted && (
              <div className="flex flex-wrap items-center gap-2 border-b border-base-300 px-12 py-2">
                <span className="badge badge-ghost badge-sm">Deleted</span>
                <span className="text-sm text-[var(--color-text-muted)]">
                  This note is in Trash.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void handleRestoreDeleted();
                  }}
                  className="btn btn-ghost btn-xs"
                >
                  Restore
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handlePermanentDelete();
                  }}
                  className="btn btn-ghost btn-xs text-error hover:text-error"
                >
                  Delete
                </button>
              </div>
            )}
            <PropertyPanel
              frontmatter={selectedNote.frontmatter}
              filePath={selectedNote.filePath}
              onChange={handleFrontmatterChange}
              onDelete={
                viewingDeleted || selectedNote.frontmatter.locked ? undefined : handleDelete
              }
              onArchive={
                viewingDeleted || selectedNote.frontmatter.locked ? undefined : handleArchiveToggle
              }
              readOnly={viewingDeleted}
              markdownMode={markdownMode}
              onToggleMarkdown={handleToggleMarkdown}
              onShowHistory={
                viewingDeleted || !selectedVaultPath ? undefined : () => setHistoryOpen(true)
              }
              onExportPdf={viewingDeleted ? undefined : () => startPdfExport(selectedNote.id)}
              exportingPdf={pdfJob !== null}
            />
            {openProject && (
              <ProjectOverview
                project={openProject}
                notes={notes}
                frontmatter={selectedNote.frontmatter}
                locked={viewingDeleted || selectedNote.frontmatter.locked}
                onChange={(patch) => {
                  void handleFrontmatterChange(patch);
                }}
                onMetaChange={(patch) => {
                  void handleProjectMeta(openProject, patch);
                }}
                onOpenView={(view) =>
                  navigate({
                    view,
                    selectedNoteId: selectedNote.id,
                    selectedGrouping: { type: "folder", id: openProject.rootPath },
                  })
                }
              />
            )}
            {historyOpen && selectedVaultPath && (
              <NoteHistoryModal
                note={selectedNote}
                vaultPath={selectedVaultPath}
                onClose={() => setHistoryOpen(false)}
                onRestore={handleSave}
              />
            )}
            {markdownMode ? (
              <MarkdownTextarea
                key={selectedNote.id}
                ref={markdownTextareaRef}
                noteId={selectedNote.id}
                vaultPath={selectedVaultPath}
                content={selectedNote.content}
                onSave={handleSave}
                locked={viewingDeleted || selectedNote.frontmatter.locked}
                initialCursorOffset={initialCursorOffset}
                initialScrollFraction={initialScrollFraction}
              />
            ) : (
              <NoteEditor
                ref={editorRef}
                note={selectedNote}
                onSave={handleSave}
                locked={viewingDeleted || selectedNote.frontmatter.locked}
                findOpen={findOpen}
                initialCursorOffset={initialCursorOffset}
                initialScrollFraction={initialScrollFraction}
              />
            )}
            {findOpen && (
              <FindReplaceBar
                mode={markdownMode ? "markdown" : "editor"}
                editor={markdownMode ? null : (editorRef.current?.getEditor() ?? null)}
                textareaHandle={markdownMode ? markdownTextareaRef.current : null}
                expanded={findExpanded}
                allowReplace={canReplace}
                onExpand={() => {
                  if (canReplace) setFindExpanded(true);
                }}
                onClose={() => {
                  setFindOpen(false);
                  setFindExpanded(false);
                }}
              />
            )}
            <BacklinksPanel note={selectedNote} />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-[var(--color-text-muted)]">
            Select a note to start editing
          </div>
        ))}
      {activeView === "graph" && <GraphView />}
      {activeView === "eisenhower" && <EisenhowerView />}
      {activeView === "kanban" && <KanbanView />}
      {activeView === "dashboard" && <DashboardView />}
      {pdfJob && <NotePrintView key={pdfJob.path} note={pdfJob.note} onReady={handlePdfReady} />}
    </div>
  );
}
