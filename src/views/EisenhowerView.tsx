import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useEffect, useMemo, useState } from "react";
import { ulid } from "ulid";
import { EISENHOWER_QUADRANTS } from "../lib/constants";
import { noteFilePath, serializeNote } from "../lib/note-parser";
import { tauriCommands } from "../lib/tauri-commands";
import { useNoteStore } from "../store/notes";
import { useUIStore } from "../store/ui";
import type { Note } from "../types/note";
import { type EisenhowerQuadrant, getQuadrant } from "../types/note";

const ALL_QUADRANTS: EisenhowerQuadrant[] = ["do", "schedule", "delegate", "eliminate"];

interface NoteCardProps {
  note: Note;
}

function NoteCard({ note }: NoteCardProps) {
  const { selectNote } = useNoteStore();
  const { setView } = useUIStore();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: note.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: dnd-kit spreads role, tabIndex, and onKeyDown via {...attributes} and {...listeners}
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handler provided by dnd-kit {...listeners}
    <div
      ref={setNodeRef}
      style={style}
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
  noteIds: string[];
  onCreate: () => void;
}

function Quadrant({ id, notes, noteIds, onCreate }: QuadrantProps) {
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
      <SortableContext items={noteIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {notes.map((n) => (
            <NoteCard key={n.id} note={n} />
          ))}
        </div>
      </SortableContext>
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

  const activeNotes = useMemo(
    () => notes.filter((n) => n.frontmatter.state === "Prepare" || n.frontmatter.state === "Doing"),
    [notes],
  );

  // Local state for within-quadrant ordering (persisted via eisenhowerOrder frontmatter field)
  const [quadrantOrder, setQuadrantOrder] = useState<Record<EisenhowerQuadrant, string[]>>(() => {
    const sortByOrder = (a: Note, b: Note) =>
      (a.frontmatter.eisenhowerOrder ?? Infinity) - (b.frontmatter.eisenhowerOrder ?? Infinity);
    return {
      do: activeNotes.filter((n) => getQuadrant(n) === "do").sort(sortByOrder).map((n) => n.id),
      schedule: activeNotes.filter((n) => getQuadrant(n) === "schedule").sort(sortByOrder).map((n) => n.id),
      delegate: activeNotes.filter((n) => getQuadrant(n) === "delegate").sort(sortByOrder).map((n) => n.id),
      eliminate: activeNotes.filter((n) => getQuadrant(n) === "eliminate").sort(sortByOrder).map((n) => n.id),
    };
  });

  // Sync order when notes are added, removed, or reassigned externally
  useEffect(() => {
    setQuadrantOrder((prev) => {
      const byId = new Map(activeNotes.map((n) => [n.id, n]));
      const byQuadrant: Record<EisenhowerQuadrant, Set<string>> = {
        do: new Set(activeNotes.filter((n) => getQuadrant(n) === "do").map((n) => n.id)),
        schedule: new Set(activeNotes.filter((n) => getQuadrant(n) === "schedule").map((n) => n.id)),
        delegate: new Set(activeNotes.filter((n) => getQuadrant(n) === "delegate").map((n) => n.id)),
        eliminate: new Set(activeNotes.filter((n) => getQuadrant(n) === "eliminate").map((n) => n.id)),
      };
      const next = { ...prev };
      for (const q of ALL_QUADRANTS) {
        const kept = prev[q].filter((id) => byQuadrant[q].has(id));
        const added = [...byQuadrant[q]]
          .filter((id) => !prev[q].includes(id))
          .sort((a, b) => {
            const noteA = byId.get(a);
            const noteB = byId.get(b);
            return (noteA?.frontmatter.eisenhowerOrder ?? Infinity) - (noteB?.frontmatter.eisenhowerOrder ?? Infinity);
          });
        next[q] = [...kept, ...added];
      }
      return next;
    });
  }, [activeNotes]);

  // Derive ordered note arrays from quadrantOrder (order state is source of truth for display)
  const quadrantNotes = useMemo(() => {
    const byId = new Map(notes.map((n) => [n.id, n]));
    const result = {} as Record<EisenhowerQuadrant, Note[]>;
    for (const q of ALL_QUADRANTS) {
      result[q] = quadrantOrder[q].map((id) => byId.get(id)).filter((n): n is Note => !!n);
    }
    return result;
  }, [notes, quadrantOrder]);

  async function createNoteInQuadrant(quadrant: EisenhowerQuadrant) {
    if (!vault) return;
    const q = EISENHOWER_QUADRANTS[quadrant];
    const id = ulid();
    const filePath = noteFilePath(vault.path, `untitled-${id.slice(-8).toLowerCase()}`);
    const note: Note = {
      id,
      filePath,
      fileName: filePath.split("/").at(-1) ?? "",
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

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeNoteId = String(active.id);
    const overId = String(over.id);

    // Determine which quadrant the dragged note came from
    const sourceQuadrant = ALL_QUADRANTS.find((q) => quadrantOrder[q].includes(activeNoteId));
    if (!sourceQuadrant) return;

    // over.id is either a quadrant id (dropped on empty container) or a note id
    const isDropOnQuadrant = (ALL_QUADRANTS as string[]).includes(overId);
    const targetQuadrant: EisenhowerQuadrant = isDropOnQuadrant
      ? (overId as EisenhowerQuadrant)
      : (ALL_QUADRANTS.find((q) => quadrantOrder[q].includes(overId)) ?? sourceQuadrant);

    const byId = new Map(notes.map((n) => [n.id, n]));

    async function saveNote(note: Note) {
      updateNote(note);
      try {
        await tauriCommands.writeNote(note.filePath, serializeNote(note));
      } catch (e) {
        console.error("Failed to save note:", e);
      }
    }

    if (sourceQuadrant === targetQuadrant) {
      // Same quadrant — reorder in place
      if (isDropOnQuadrant) return;
      const oldIndex = quadrantOrder[sourceQuadrant].indexOf(activeNoteId);
      const newIndex = quadrantOrder[targetQuadrant].indexOf(overId);
      if (oldIndex === newIndex || newIndex < 0) return;

      const newQuadOrder = arrayMove(quadrantOrder[sourceQuadrant], oldIndex, newIndex);
      setQuadrantOrder((prev) => ({ ...prev, [sourceQuadrant]: newQuadOrder }));

      // Persist eisenhowerOrder for notes whose position changed
      for (let i = 0; i < newQuadOrder.length; i++) {
        const note = byId.get(newQuadOrder[i]);
        if (!note || note.frontmatter.eisenhowerOrder === i) continue;
        await saveNote({ ...note, frontmatter: { ...note.frontmatter, eisenhowerOrder: i } });
      }
      return;
    }

    // Cross-quadrant move — update frontmatter and order
    const q = EISENHOWER_QUADRANTS[targetQuadrant];

    const newSourceOrder = quadrantOrder[sourceQuadrant].filter((id) => id !== activeNoteId);
    const newTargetOrder = quadrantOrder[targetQuadrant].filter((id) => id !== activeNoteId);
    const insertAt = !isDropOnQuadrant ? quadrantOrder[targetQuadrant].indexOf(overId) + 1 : -1;
    if (insertAt > 0) {
      newTargetOrder.splice(insertAt, 0, activeNoteId);
    } else {
      newTargetOrder.push(activeNoteId);
    }

    setQuadrantOrder((prev) => ({
      ...prev,
      [sourceQuadrant]: newSourceOrder,
      [targetQuadrant]: newTargetOrder,
    }));

    // Persist source quadrant order changes
    for (let i = 0; i < newSourceOrder.length; i++) {
      const note = byId.get(newSourceOrder[i]);
      if (!note || note.frontmatter.eisenhowerOrder === i) continue;
      await saveNote({ ...note, frontmatter: { ...note.frontmatter, eisenhowerOrder: i } });
    }

    // Persist target quadrant — moved note gets urgent/important + order, others get order only
    for (let i = 0; i < newTargetOrder.length; i++) {
      const note = byId.get(newTargetOrder[i]);
      if (!note) continue;
      if (note.id === activeNoteId) {
        if (note.frontmatter.urgent !== q.urgent || note.frontmatter.important !== q.important || note.frontmatter.eisenhowerOrder !== i) {
          await saveNote({
            ...note,
            frontmatter: {
              ...note.frontmatter,
              urgent: q.urgent,
              important: q.important,
              eisenhowerOrder: i,
              updated: new Date().toISOString().split("T")[0],
            },
          });
        }
      } else if (note.frontmatter.eisenhowerOrder !== i) {
        await saveNote({ ...note, frontmatter: { ...note.frontmatter, eisenhowerOrder: i } });
      }
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
          <Quadrant
            id="do"
            notes={quadrantNotes.do}
            noteIds={quadrantOrder.do}
            onCreate={() => createNoteInQuadrant("do")}
          />
          <Quadrant
            id="schedule"
            notes={quadrantNotes.schedule}
            noteIds={quadrantOrder.schedule}
            onCreate={() => createNoteInQuadrant("schedule")}
          />
          <Quadrant
            id="delegate"
            notes={quadrantNotes.delegate}
            noteIds={quadrantOrder.delegate}
            onCreate={() => createNoteInQuadrant("delegate")}
          />
          <Quadrant
            id="eliminate"
            notes={quadrantNotes.eliminate}
            noteIds={quadrantOrder.eliminate}
            onCreate={() => createNoteInQuadrant("eliminate")}
          />
        </div>
        <DragOverlay>{activeNote ? <NoteCard note={activeNote} /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}
