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
  }
>(function MarkdownTextarea({ content, onSave, locked, initialCursorOffset = null }, ref) {
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
    el.focus();
    el.setSelectionRange(index, index);
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
    }),
    [onSave, setCursorTextOffset],
  );

  // Carry a cursor over from the rich-text editor. The textarea mounts fresh on
  // every toggle, so this runs exactly once.
  const restoredCursorRef = useRef(false);
  useEffect(() => {
    if (restoredCursorRef.current) return;
    if (initialCursorOffset === null || initialCursorOffset === undefined) return;
    restoredCursorRef.current = true;
    setCursorTextOffset(initialCursorOffset);
  }, [initialCursorOffset, setCursorTextOffset]);

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
  // Cursor handed from the outgoing surface to the incoming one across a
  // markdown/editor toggle, tagged with the note it came from so a note switch
  // can never resurrect a stale position.
  const [pendingCursor, setPendingCursor] = useState<{ noteId: string; offset: number } | null>(
    null,
  );
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

  // Keep the caret where the user left it when flipping between the rich-text
  // editor and the raw markdown view. The two surfaces are separate mount trees
  // with incompatible position spaces, so we hand over a plain-text offset (see
  // src/lib/cursor-position.ts) and let the incoming surface translate it.
  //
  // The offset rides in as a mount-time prop rather than being pushed through an
  // imperative handle from an effect: the incoming component is brand new, its
  // handle does not exist yet at toggle time, and a prop keeps the restore inside
  // the component that owns the caret.
  const handleToggleMarkdown = useCallback(() => {
    const offset = markdownMode
      ? markdownTextareaRef.current?.getCursorTextOffset()
      : editorRef.current?.getCursorTextOffset();
    setPendingCursor(
      selectedNoteId && offset !== null && offset !== undefined
        ? { noteId: selectedNoteId, offset }
        : null,
    );
    toggleMarkdownMode();
  }, [markdownMode, selectedNoteId, toggleMarkdownMode]);

  const initialCursorOffset =
    pendingCursor && pendingCursor.noteId === selectedNoteId ? pendingCursor.offset : null;

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

    const inlineTags = extractInlineTags(content);
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
        tags: inlineTags,
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
              />
            ) : (
              <NoteEditor
                ref={editorRef}
                note={selectedNote}
                onSave={handleSave}
                locked={selectedNote.frontmatter.locked}
                findOpen={findOpen}
                initialCursorOffset={initialCursorOffset}
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
