import { listen } from "@tauri-apps/api/event";
import { confirm } from "@tauri-apps/plugin-dialog";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { markdownIndexToTextOffset, textOffsetToMarkdownIndex } from "../../lib/cursor-position";
import {
  extractInlineTags,
  extractWikiLinks,
  normalizeContent,
  serializeNote,
} from "../../lib/note-parser";
import { registerSaveFlusher, unregisterSaveFlusher } from "../../lib/pending-saves";
import { applyScrollFraction, getScrollFraction } from "../../lib/scroll-fraction";
import { mergeTagsOnSave } from "../../lib/tags";
import { tauriCommands } from "../../lib/tauri-commands";
import { nowTimestamp } from "../../lib/timestamps";
import { useNoteStore } from "../../store/notes";
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
import { PropertyPanel } from "../editor/PropertyPanel";

interface MarkdownTextareaHandle {
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

const MarkdownTextarea = forwardRef<
  MarkdownTextareaHandle,
  {
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
  { content, onSave, locked, initialCursorOffset = null, initialScrollFraction = null },
  ref,
) {
  const [value, setValue] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flusherId = useId();

  const flush = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    onSave(value);
  }, [onSave, value]);

  // Read latest state through refs so the flusher registered on mount never
  // captures stale values.
  const valueRef = useRef(value);
  valueRef.current = value;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Flush edits still inside the debounce window if the window closes.
  useEffect(() => {
    registerSaveFlusher(flusherId, {
      isPending: () => saveTimer.current !== null,
      flush: () => {
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
          saveTimer.current = null;
        }
        return onSaveRef.current(valueRef.current);
      },
    });
    return () => unregisterSaveFlusher(flusherId);
  }, [flusherId]);

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

    if (!wrap) return;
    e.preventDefault();

    const [prefix, suffix] = wrap;
    const selected = val.slice(start, end);
    const next = val.slice(0, start) + prefix + selected + suffix + val.slice(end);
    setValue(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      onSave(next);
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
    setValue(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      onSave(next);
    }, 1000);
  };

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

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
        setValue(newContent);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          saveTimer.current = null;
          onSave(newContent);
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
    [onSave, setCursorTextOffset],
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
        fontFamily: "var(--font-mono)",
        fontSize: "var(--editor-font-size)",
        lineHeight: "var(--editor-line-height)",
        color: "var(--color-text)",
      }}
    />
  );
});

// Extract absolute file paths from asset:// URLs embedded in markdown image tags.
// http://asset.localhost/Users/foo/notes/assets/img.png → /Users/foo/notes/assets/img.png
function extractAssetPaths(content: string): Set<string> {
  const paths = new Set<string>();
  for (const match of content.matchAll(/!\[.*?\]\(([^)]+)\)/g)) {
    const src = match[1];
    try {
      const url = new URL(src);
      if (url.hostname === "asset.localhost") {
        paths.add(decodeURIComponent(url.pathname));
      }
    } catch {
      /* not a URL, skip */
    }
  }
  return paths;
}

export function MainPanel() {
  const { activeView, markdownMode, setMarkdownMode, toggleMarkdownMode } = useUIStore();
  const { notes, vaults, selectedNoteId, updateNote, setNoteTitleLive, removeNote, selectNote } =
    useNoteStore();
  const { settings } = useSettingsStore();
  const selectedNote = notes.find((n) => n.id === selectedNoteId);
  const editorRef = useRef<NoteEditorHandle>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findExpanded, setFindExpanded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const markdownTextareaRef = useRef<MarkdownTextareaHandle>(null);
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
          setFindExpanded(true);
          return true;
        });
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [selectedNote]);

  useEffect(() => {
    const unlisteners: Array<() => void> = [];
    (async () => {
      unlisteners.push(
        await listen<number>("format-heading", (event) => {
          const level = event.payload as 1 | 2 | 3 | 4 | 5 | 6;
          editorRef.current?.getEditor()?.chain().focus().setHeading({ level }).run();
        }),
      );
      unlisteners.push(
        await listen("format-paragraph", () => {
          editorRef.current?.getEditor()?.chain().focus().setParagraph().run();
        }),
      );
    })();
    return () => {
      for (const fn of unlisteners) fn();
    };
  }, []);

  async function handleSave(content: string) {
    if (!selectedNote) return;

    // Opening, focusing, or blurring a note is not a modification. Bail before
    // touching disk so viewing a note never bumps `updated`. Edge newlines are
    // normalized away because gray-matter reintroduces a leading "\n" on parse,
    // so a strict === would let those phantom saves through.
    if (normalizeContent(content) === normalizeContent(selectedNote.content)) return;

    // Time machine: snapshot the current on-disk content before overwriting.
    // Rust coalesces rapid autosaves (min 5 min between snapshots) and prunes
    // old versions, so this is safe to fire on every save.
    if (selectedVaultPath) {
      tauriCommands
        .snapshotNote(selectedVaultPath, selectedNote.id, selectedNote.filePath)
        .catch(() => {
          /* snapshotting must never block a save */
        });
    }

    // Tags are merged, never recomputed. Reading a note unions the frontmatter
    // list with the body's inline tags, so recomputing from the body alone
    // would delete every tag set from the property panel and never typed as
    // `#tag`. Comparing the pre-save body with the incoming one tells us which
    // tags the user actually removed. See mergeTagsOnSave.
    const mergedTags = mergeTagsOnSave(
      selectedNote.frontmatter.tags,
      extractInlineTags(selectedNote.content),
      extractInlineTags(content),
    );
    const wikiTitles = extractWikiLinks(content);
    const linkedIds = wikiTitles
      .map(
        (title) => notes.find((n) => n.frontmatter.title.toLowerCase() === title.toLowerCase())?.id,
      )
      .filter((id): id is string => id !== undefined && id !== selectedNote.id);

    const updated = {
      ...selectedNote,
      content,
      frontmatter: {
        ...selectedNote.frontmatter,
        tags: mergedTags,
        links: linkedIds.length > 0 ? linkedIds : undefined,
        updated: nowTimestamp(),
      },
    };
    updateNote(updated);
    try {
      await tauriCommands.writeNote(updated.filePath, serializeNote(updated));
    } catch (e) {
      reportError("Failed to save note", e);
    }

    // Delete any asset files removed from this note since the last save
    const oldPaths = extractAssetPaths(selectedNote.content);
    const newPaths = extractAssetPaths(content);
    for (const path of oldPaths) {
      if (!newPaths.has(path)) {
        tauriCommands.deleteAsset(path).catch(() => {
          /* already gone, ignore */
        });
      }
    }
  }

  // Live title update while typing in the property panel — patches only the
  // title in the store (so the note list reflects it immediately) with no disk
  // write and no index rebuild per keystroke. Persistence + index refresh happen
  // on blur/Tab via handleFrontmatterChange → updateNote.
  function handleTitleInput(title: string) {
    if (!selectedNote) return;
    setNoteTitleLive(selectedNote.id, title);
  }

  async function handleFrontmatterChange(updates: Partial<NoteFrontmatter>) {
    if (!selectedNote) return;
    const updated = {
      ...selectedNote,
      frontmatter: {
        ...selectedNote.frontmatter,
        ...updates,
        updated: nowTimestamp(),
      },
    };
    updateNote(updated);
    try {
      await tauriCommands.writeNote(updated.filePath, serializeNote(updated));
    } catch (e) {
      reportError("Failed to save frontmatter", e);
    }
  }

  async function handleDelete() {
    if (!selectedNote || selectedNote.frontmatter.locked) return;
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
            <PropertyPanel
              frontmatter={selectedNote.frontmatter}
              filePath={selectedNote.filePath}
              onChange={handleFrontmatterChange}
              onTitleInput={handleTitleInput}
              onTitleTab={() => editorRef.current?.focus()}
              onDelete={selectedNote.frontmatter.locked ? undefined : handleDelete}
              markdownMode={markdownMode}
              onToggleMarkdown={handleToggleMarkdown}
              onShowHistory={selectedVaultPath ? () => setHistoryOpen(true) : undefined}
            />
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
                content={selectedNote.content}
                onSave={handleSave}
                locked={selectedNote.frontmatter.locked}
                initialCursorOffset={initialCursorOffset}
                initialScrollFraction={initialScrollFraction}
              />
            ) : (
              <NoteEditor
                ref={editorRef}
                note={selectedNote}
                onSave={handleSave}
                locked={selectedNote.frontmatter.locked}
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
                onExpand={() => setFindExpanded(true)}
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
    </div>
  );
}
