import { Icon } from "@iconify/react";
import type { KeyboardEvent } from "react";
import { useNoteStore } from "../../store/notes";
import { unpinNoteFromSide, usePinnedPanelStore, WRITER_TAB } from "../../store/pinned-panel";
import { useToolsStore } from "../../store/tools";
import type { Note } from "../../types/note";
import { ToolHost } from "../tools/ToolHost";
import { PinnedNoteView } from "./PinnedNoteView";
import { PinToSideButton } from "./PinToSideButton";

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
        className={`max-w-40 truncate px-2 py-1 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-primary)] ${
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
        className="mr-1 rounded px-1 text-[var(--color-text)] opacity-60 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-primary)]"
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
 * Right panel. With nothing pinned it is the tool host. Pinned notes become
 * tabs beside Writer and stay on screen while a different note is edited.
 */
export function RightPanel() {
  const noteIds = usePinnedPanelStore((state) => state.noteIds);
  const activeId = usePinnedPanelStore((state) => state.activeId);
  const select = usePinnedPanelStore((state) => state.select);
  const notes = useNoteStore((state) => state.notes);
  const selectedNoteId = useNoteStore((state) => state.selectedNoteId);
  const writerEnabled = useToolsStore((state) => state.writerEnabled);
  const pinned = noteIds
    .map((id) => notes.find((note) => note.id === id))
    .filter((note): note is Note => Boolean(note));

  if (pinned.length === 0) return <ToolHost />;

  const writerSelected = writerEnabled && activeId === WRITER_TAB;
  const activeNote = writerSelected
    ? undefined
    : (pinned.find((note) => note.id === activeId) ?? pinned[0]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-base-300 px-1">
        <div
          role="tablist"
          aria-label="Right panel"
          aria-orientation="horizontal"
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
          onKeyDown={onTabsKeyDown}
        >
          {pinned.map((note) => (
            <NoteTab key={note.id} note={note} selected={note.id === activeNote?.id} />
          ))}
          {writerEnabled && (
            <button
              type="button"
              role="tab"
              id="pinned-tab-writer"
              aria-selected={writerSelected}
              aria-controls="pinned-panel-writer"
              tabIndex={writerSelected ? 0 : -1}
              className={`shrink-0 border-b-2 px-2 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-primary)] ${
                writerSelected
                  ? "border-[var(--color-primary)] bg-base-200 font-medium text-[var(--color-text)]"
                  : "border-transparent text-[var(--color-text)] opacity-70 hover:opacity-100"
              }`}
              onClick={() => select(WRITER_TAB)}
            >
              Writer
            </button>
          )}
        </div>
        <PinToSideButton noteId={selectedNoteId} variant="toolbar" />
      </div>
      {writerSelected ? (
        <div
          role="tabpanel"
          id="pinned-panel-writer"
          aria-labelledby="pinned-tab-writer"
          className="min-h-0 flex-1"
        >
          <ToolHost showPinAction={false} />
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
      ) : null}
    </div>
  );
}
