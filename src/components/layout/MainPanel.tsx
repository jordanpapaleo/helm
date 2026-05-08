import { confirm } from "@tauri-apps/plugin-dialog";
import { useRef } from "react";
import { extractInlineTags, extractWikiLinks, serializeNote } from "../../lib/note-parser";
import { tauriCommands } from "../../lib/tauri-commands";
import { useNoteStore } from "../../store/notes";
import { useUIStore } from "../../store/ui";
import type { NoteFrontmatter } from "../../types/note";
import { DashboardView } from "../../views/DashboardView";
import { EisenhowerView } from "../../views/EisenhowerView";
import { GraphView } from "../../views/GraphView";
import { KanbanView } from "../../views/KanbanView";
import { BacklinksPanel } from "../editor/BacklinksPanel";
import { NoteEditor, type NoteEditorHandle } from "../editor/NoteEditor";
import { PropertyPanel } from "../editor/PropertyPanel";

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
  const selectedNote = notes.find((n) => n.id === selectedNoteId);
  const editorRef = useRef<NoteEditorHandle>(null);

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
    if (!selectedNote) return;
    const confirmed = await confirm(
      `Delete "${selectedNote.frontmatter.title || "Untitled"}"? This cannot be undone.`,
      { title: "Delete Note", kind: "warning" },
    );
    if (!confirmed) return;
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
          <div className="flex flex-1 flex-col overflow-y-auto">
            <PropertyPanel
              frontmatter={selectedNote.frontmatter}
              filePath={selectedNote.filePath}
              onChange={handleFrontmatterChange}
              onTitleTab={() => editorRef.current?.focus()}
              onDelete={handleDelete}
            />
            <NoteEditor
              ref={editorRef}
              note={selectedNote}
              onSave={handleSave}
              locked={selectedNote.frontmatter.locked}
            />
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
