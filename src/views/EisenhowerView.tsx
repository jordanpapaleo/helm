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
import { EISENHOWER_QUADRANTS } from "../lib/constants";
import { noteFilePath, serializeNote } from "../lib/note-parser";
import { tauriCommands } from "../lib/tauri-commands";
import { useNoteStore } from "../store/notes";
import { useUIStore } from "../store/ui";
import type { Note } from "../types/note";
import { type EisenhowerQuadrant, getQuadrant } from "../types/note";

interface NoteCardProps {
  note: Note;
}

function NoteCard({ note }: NoteCardProps) {
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
      <p className="truncate text-sm font-medium text-[var(--color-text)]">
        {note.frontmatter.title || "Untitled"}
      </p>
      {note.frontmatter.blocked && <p className="mt-0.5 text-xs text-red-400">⊘ Blocked</p>}
      <div className="mt-1.5 flex flex-wrap gap-1">
        {note.frontmatter.tags.slice(0, 3).map((t) => (
          <span key={t} className="text-xs text-[var(--color-text-muted)]">
            #{t}
          </span>
        ))}
      </div>
    </div>
  );
}

interface QuadrantProps {
  id: EisenhowerQuadrant;
  notes: Note[];
  onCreate: () => void;
}

function Quadrant({ id, notes, onCreate }: QuadrantProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const q = EISENHOWER_QUADRANTS[id];

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-xl border p-4 gap-2 transition-colors overflow-y-auto min-h-0 ${
        isOver
          ? "border-[var(--color-accent)] bg-blue-500/5"
          : "border-[var(--color-border)] bg-[var(--color-surface)]"
      }`}
    >
      <div className="shrink-0 mb-1 flex items-start justify-between">
        <div>
          <p className="font-semibold text-[var(--color-text)]">{q.label}</p>
          <p className="text-xs text-[var(--color-text-muted)]">{q.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          title="New note in this quadrant"
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
          <NoteCard key={n.id} note={n} />
        ))}
      </div>
      {notes.length === 0 && (
        <p className="text-xs text-[var(--color-text-muted)] opacity-50 mt-auto">Drop here</p>
      )}
    </div>
  );
}

export function EisenhowerView() {
  const { notes, updateNote, addNote, selectNote, vaults, activeVaultId } = useNoteStore();
  const { setView } = useUIStore();
  const [activeId, setActiveId] = useState<string | null>(null);

  const vault = vaults.find((v) => v.id === activeVaultId) ?? vaults[0];

  async function createNoteInQuadrant(quadrant: EisenhowerQuadrant) {
    if (!vault) return;
    const q = EISENHOWER_QUADRANTS[quadrant];
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
        urgent: q.urgent,
        important: q.important,
        state: "Prepare",
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

  // Require 5px movement before drag starts so clicks still register
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const activeNotes = notes.filter(
    (n) => n.frontmatter.state === "Prepare" || n.frontmatter.state === "Doing",
  );

  const quadrantNotes: Record<EisenhowerQuadrant, Note[]> = {
    do: activeNotes.filter((n) => getQuadrant(n) === "do"),
    schedule: activeNotes.filter((n) => getQuadrant(n) === "schedule"),
    delegate: activeNotes.filter((n) => getQuadrant(n) === "delegate"),
    eliminate: activeNotes.filter((n) => getQuadrant(n) === "eliminate"),
  };

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const quadrant = over.id as EisenhowerQuadrant;
    const q = EISENHOWER_QUADRANTS[quadrant];
    const note = notes.find((n) => n.id === String(active.id));
    if (!note) return;

    if (note.frontmatter.urgent === q.urgent && note.frontmatter.important === q.important) return;

    const updated = {
      ...note,
      frontmatter: {
        ...note.frontmatter,
        urgent: q.urgent,
        important: q.important,
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
      <h2 className="shrink-0 text-xl font-bold text-[var(--color-text)]">Eisenhower Matrix</h2>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-2 grid-rows-2 gap-4 flex-1 min-h-0">
          <Quadrant id="do" notes={quadrantNotes.do} onCreate={() => createNoteInQuadrant("do")} />
          <Quadrant
            id="schedule"
            notes={quadrantNotes.schedule}
            onCreate={() => createNoteInQuadrant("schedule")}
          />
          <Quadrant
            id="delegate"
            notes={quadrantNotes.delegate}
            onCreate={() => createNoteInQuadrant("delegate")}
          />
          <Quadrant
            id="eliminate"
            notes={quadrantNotes.eliminate}
            onCreate={() => createNoteInQuadrant("eliminate")}
          />
        </div>
        <DragOverlay>{activeNote ? <NoteCard note={activeNote} /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}
