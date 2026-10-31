import { Icon } from "@iconify/react";
import type { KeyboardEvent } from "react";
import { openEditorNote } from "../../lib/open-editor-note";
import { useNoteStore } from "../../store/notes";
import { unpinNoteFromSide, usePinnedPanelStore } from "../../store/pinned-panel";
import { useToolsStore } from "../../store/tools";
import { useUIStore } from "../../store/ui";
import type { Note } from "../../types/note";
import { type ToolExtension, useExtensions } from "../tools/extensions";
import { PinnedNoteView } from "./PinnedNoteView";
import { PinToSideButton } from "./PinToSideButton";

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-primary)]";

function onTabsKeyDown(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0) return;
  event.preventDefault();
  const direction = event.key === "ArrowRight" ? 1 : -1;
  const next = tabs[(index + direction + tabs.length) % tabs.length];
  next.focus();
  next.click();
}

function openToolsSettings() {
  useToolsStore.getState().showToolsSettings();
  useUIStore.getState().setSettingsOpen(true);
}

function ToolTab({ tool, selected }: { tool: ToolExtension; selected: boolean }) {
  const select = usePinnedPanelStore((state) => state.select);
  return (
    <button
      type="button"
      role="tab"
      id={`right-tab-${tool.id}`}
      aria-selected={selected}
      aria-controls={`right-panel-${tool.id}`}
      aria-label={tool.name}
      title={tool.name}
      tabIndex={selected ? 0 : -1}
      className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center border-b-2 ${FOCUS_RING} ${
        selected
          ? "border-[var(--color-primary)] bg-base-200 text-[var(--color-text)]"
          : "border-transparent text-[var(--color-text)] opacity-70 hover:opacity-100"
      }`}
      onClick={() => select(tool.id)}
    >
      <Icon icon={tool.icon} className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

function NoteTab({ note, selected }: { note: Note; selected: boolean }) {
  const title = note.frontmatter.title || "Untitled";
  const select = usePinnedPanelStore((state) => state.select);
  return (
    <div
      className={`flex shrink-0 items-center border-b-2 ${
        selected ? "border-[var(--color-primary)] bg-base-200" : "border-transparent"
      }`}
    >
      <button
        type="button"
        role="tab"
        id={`pinned-tab-${note.id}`}
        aria-selected={selected}
        aria-controls={`pinned-panel-${note.id}`}
        tabIndex={selected ? 0 : -1}
        title={title}
        className={`max-w-40 truncate px-2 py-1 text-left text-sm ${FOCUS_RING} ${
          selected
            ? "font-medium text-[var(--color-text)]"
            : "text-[var(--color-text)] opacity-70 hover:opacity-100"
        }`}
        onClick={() => select(note.id)}
      >
        {title}
      </button>
      <button
        type="button"
        className={`mr-1 rounded px-1 text-[var(--color-text)] opacity-60 hover:opacity-100 ${FOCUS_RING}`}
        aria-label={`Unpin ${title}`}
        title={`Unpin ${title}`}
        onClick={() => unpinNoteFromSide(note.id)}
      >
        <Icon icon="uil:times" className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Right panel. Enabled tools appear as icon tabs, followed by pinned notes.
 * One tool panel or pinned note is visible at a time.
 */
export function RightPanel() {
  const noteIds = usePinnedPanelStore((state) => state.noteIds);
  const activeId = usePinnedPanelStore((state) => state.activeId);
  const notes = useNoteStore((state) => state.notes);
  const selectedNoteId = useNoteStore((state) => state.selectedNoteId);
  const activeView = useUIStore((state) => state.activeView);
  const selectedGrouping = useUIStore((state) => state.selectedGrouping);
  const openNoteId =
    openEditorNote(notes, selectedNoteId, activeView, selectedGrouping)?.id ?? null;
  const tools = useExtensions().filter((tool) => tool.enabled);
  const pinned = noteIds
    .map((id) => notes.find((note) => note.id === id))
    .filter((note): note is Note => Boolean(note));

  const selectedTool = tools.find((tool) => tool.id === activeId);
  const selectedNote = selectedTool ? undefined : pinned.find((note) => note.id === activeId);
  const activeTool = selectedTool ?? (selectedNote ? undefined : tools[0]);
  const activeNote = selectedNote ?? (activeTool ? undefined : pinned[0]);
  const hasTabs = tools.length > 0 || pinned.length > 0;
  const Panel = activeTool?.panel;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-base-300 px-1">
        {hasTabs ? (
          <div
            role="tablist"
            aria-label="Right panel"
            aria-orientation="horizontal"
            className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
            onKeyDown={onTabsKeyDown}
          >
            {tools.map((tool) => (
              <ToolTab key={tool.id} tool={tool} selected={tool.id === activeTool?.id} />
            ))}
            {pinned.map((note) => (
              <NoteTab key={note.id} note={note} selected={note.id === activeNote?.id} />
            ))}
          </div>
        ) : (
          <span className="flex-1" />
        )}
        <PinToSideButton noteId={openNoteId} variant="toolbar" />
        <button
          type="button"
          className="workspace-toolbar-button"
          aria-label="Manage tools"
          title="Manage tools"
          onClick={openToolsSettings}
        >
          <Icon icon="uil:wrench" className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {activeTool && Panel ? (
        <div
          role="tabpanel"
          id={`right-panel-${activeTool.id}`}
          aria-labelledby={`right-tab-${activeTool.id}`}
          className="min-h-0 flex-1"
        >
          <Panel extension={activeTool} />
        </div>
      ) : activeNote ? (
        <div
          role="tabpanel"
          id={`pinned-panel-${activeNote.id}`}
          aria-labelledby={`pinned-tab-${activeNote.id}`}
          className="flex min-h-0 flex-1 flex-col"
        >
          <PinnedNoteView noteId={activeNote.id} />
        </div>
      ) : (
        <div className="p-4 text-sm">
          <p className="font-medium">No tools enabled</p>
          <p className="mt-1 opacity-60">Turn on a tool in Settings → Tools to use it here.</p>
          <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={openToolsSettings}>
            Manage tools
          </button>
        </div>
      )}
    </div>
  );
}
