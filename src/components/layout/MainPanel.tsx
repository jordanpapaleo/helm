import { confirm } from "@tauri-apps/plugin-dialog";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { extractInlineTags, extractWikiLinks, serializeNote } from "../../lib/note-parser";
import { tauriCommands } from "../../lib/tauri-commands";
import { useNoteStore } from "../../store/notes";
import { useSettingsStore } from "../../store/settings";
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
import { PropertyPanel } from "../editor/PropertyPanel";

interface MarkdownTextareaHandle {
  textarea: HTMLTextAreaElement | null;
  replaceContent: (newContent: string) => void;
}

const MarkdownTextarea = forwardRef<
  MarkdownTextareaHandle,
  { content: string; onSave: (md: string) => void; locked?: boolean }
>(function MarkdownTextarea({ content, onSave, locked }, ref) {
  const [value, setValue] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    onSave(value);
  }, [onSave, value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (locked) return;
    const next = e.target.value;
    setValue(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onSave(next), 1000);
  };

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      get textarea() { return textareaRef.current; },
      replaceContent(newContent: string) {
        setValue(newContent);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => onSave(newContent), 1000);
      },
    }),
    [onSave],
  );

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={handleChange}
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
  const { activeView } = useUIStore();
  const { notes, selectedNoteId, updateNote, removeNote, selectNote } = useNoteStore();
  const { settings } = useSettingsStore();
  const selectedNote = notes.find((n) => n.id === selectedNoteId);
  const editorRef = useRef<NoteEditorHandle>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findExpanded, setFindExpanded] = useState(false);
  const markdownTextareaRef = useRef<MarkdownTextareaHandle>(null);

  const [markdownMode, setMarkdownMode] = useState(
    () => settings.defaultNoteView === "markdown",
  );

  // Reset mode to default when switching notes
  useEffect(() => {
    setMarkdownMode(settings.defaultNoteView === "markdown");
    setFindOpen(false);
    setFindExpanded(false);
  }, [selectedNoteId, settings.defaultNoteView]);

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
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNote]);

  async function handleSave(content: string) {
    if (!selectedNote) return;
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
        updated: new Date().toISOString().split("T")[0],
      },
    };
    updateNote(updated);
    try {
      await tauriCommands.writeNote(updated.filePath, serializeNote(updated));
    } catch (e) {
      console.error("Failed to save note:", e);
    }

    // Delete any asset files removed from this note since the last save
    const oldPaths = extractAssetPaths(selectedNote.content);
    const newPaths = extractAssetPaths(content);
    for (const path of oldPaths) {
      if (!newPaths.has(path)) {
        tauriCommands.deleteNote(path).catch(() => {
          /* already gone, ignore */
        });
      }
    }
  }

  async function handleFrontmatterChange(updates: Partial<NoteFrontmatter>) {
    if (!selectedNote) return;
    const updated = {
      ...selectedNote,
      frontmatter: {
        ...selectedNote.frontmatter,
        ...updates,
        updated: new Date().toISOString().split("T")[0],
      },
    };
    updateNote(updated);
    try {
      await tauriCommands.writeNote(updated.filePath, serializeNote(updated));
    } catch (e) {
      console.error("Failed to save frontmatter:", e);
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
      console.error("Failed to delete note:", e);
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
              onTitleTab={() => editorRef.current?.focus()}
              onDelete={selectedNote.frontmatter.locked ? undefined : handleDelete}
              markdownMode={markdownMode}
              onToggleMarkdown={() => setMarkdownMode((v) => !v)}
            />
            {markdownMode ? (
              <MarkdownTextarea
                key={selectedNote.id}
                ref={markdownTextareaRef}
                content={selectedNote.content}
                onSave={handleSave}
                locked={selectedNote.frontmatter.locked}
              />
            ) : (
              <NoteEditor
                ref={editorRef}
                note={selectedNote}
                onSave={handleSave}
                locked={selectedNote.frontmatter.locked}
                findOpen={findOpen}
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
