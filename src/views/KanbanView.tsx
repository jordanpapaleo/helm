import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useState } from "react";
import { ulid } from "ulid";
import { NOTE_STATES } from "../lib/constants";
import { noteFilePath, serializeNote } from "../lib/note-parser";
import { tauriCommands } from "../lib/tauri-commands";
import { useNoteStore } from "../store/notes";
import { useUIStore } from "../store/ui";
import type { Note, NoteState } from "../types/note";

function KanbanCard({ note }: { note: Note }) {
  const { selectNote } = useNoteStore();
  const { setView } = useUIStore();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: note.id });

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: dnd-kit spreads role, tabIndex, and onKeyDown via {...attributes} and {...listeners}
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handler provided by dnd-kit {...listeners}
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => {
        selectNote(note.id);
        setView("notes");
      }}
      className={`rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 cursor-pointer select-none transition-opacity ${
        isDragging ? "opacity-40" : "hover:border-[var(--color-accent)]/50"
      }`}
    >
      <p className="text-sm font-medium text-[var(--color-text)]">
        {note.frontmatter.title || "Untitled"}
      </p>
      {note.frontmatter.blocked && <p className="mt-0.5 text-xs text-red-400">⊘ Blocked</p>}
      <div className="mt-2 flex flex-wrap gap-1">
        {note.frontmatter.tags.slice(0, 2).map((t) => (
          <span
            key={t}
            className="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function KanbanColumn({
  state,
  notes,
  onCreate,
}: {
  state: string;
  notes: Note[];
  onCreate: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: state });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-1 flex-col rounded-xl border p-4 gap-3 overflow-y-auto min-h-0 transition-colors ${
        isOver
          ? "border-[var(--color-accent)] bg-blue-500/5"
          : "border-[var(--color-border)] bg-[var(--color-surface)]"
      }`}
    >
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-[var(--color-text)]">{state}</p>
          <span className="text-xs text-[var(--color-text-muted)]">{notes.length}</span>
        </div>
        <button
          type="button"
          onClick={onCreate}
          title={`New note in ${state}`}
          className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-border)]/50 hover:text-[var(--color-text)] transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {notes.map((n) => (
          <KanbanCard key={n.id} note={n} />
        ))}
      </div>
    </div>
  );
}

export function KanbanView() {
  const { notes, updateNote, addNote, selectNote, vaults, activeVaultId } = useNoteStore();
  const { setView } = useUIStore();
  const [activeId, setActiveId] = useState<string | null>(null);

  const vault = vaults.find((v) => v.id === activeVaultId) ?? vaults[0];

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function createNoteInColumn(state: NoteState) {
    if (!vault) return;
    const id = ulid();
    const filePath = noteFilePath(vault.path, `untitled-${id.slice(-8).toLowerCase()}`);
    const note: Note = {
      id,
      filePath,
      fileName: filePath.split("/").pop()!,
      content: "",
      vaultId: vault.id,
      frontmatter: {
        id,
        title: "Untitled",
        created: new Date().toISOString().split("T")[0],
        updated: new Date().toISOString().split("T")[0],
        tags: [],
        urgent: false,
        important: false,
        state,
        blocked: false,
        links: [],
      },
    };
    try {
      await tauriCommands.writeNote(filePath, serializeNote(note));
      addNote(note);
      selectNote(id);
      setView("notes");
    } catch (e) {
      console.error("Failed to create note:", e);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const newState = over.id as NoteState;
    const note = notes.find((n) => n.id === String(active.id));
    if (!note || note.frontmatter.state === newState) return;

    const updated = {
      ...note,
      frontmatter: {
        ...note.frontmatter,
        state: newState,
        updated: new Date().toISOString().split("T")[0],
      },
    };
    updateNote(updated);
    try {
      await tauriCommands.writeNote(updated.filePath, serializeNote(updated));
    } catch (e) {
      console.error("Failed to save note:", e);
    }
  }

  const activeNote = activeId ? notes.find((n) => n.id === activeId) : null;

  return (
    <div className="flex flex-col h-full p-6 gap-4 overflow-hidden">
      <h2 className="shrink-0 text-xl font-bold text-[var(--color-text)]">Kanban</h2>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 gap-4 min-h-0">
          {NOTE_STATES.map((state) => (
            <KanbanColumn
              key={state}
              state={state}
              notes={notes.filter((n) => n.frontmatter.state === state)}
              onCreate={() => createNoteInColumn(state as NoteState)}
            />
          ))}
        </div>
        <DragOverlay>{activeNote ? <KanbanCard note={activeNote} /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}
