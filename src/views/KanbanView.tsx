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
import { NOTE_STATES } from "../lib/constants";
import { noteFilePath, serializeNote } from "../lib/note-parser";
import { tauriCommands } from "../lib/tauri-commands";
import { useNoteStore } from "../store/notes";
import { useUIStore } from "../store/ui";
import type { Note, NoteState } from "../types/note";

function KanbanCard({ note }: { note: Note }) {
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
    // biome-ignore lint/a11y/noStaticElementInteractions: dnd-kit spreads role, tabIndex, and onKeyDown via {...attributes} and {@listeners}
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
  noteIds,
  onCreate,
}: {
  state: string;
  notes: Note[];
  noteIds: string[];
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
      <SortableContext items={noteIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {notes.map((n) => (
            <KanbanCard key={n.id} note={n} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

export function KanbanView() {
  const { notes, updateNote, addNote, selectNote, vaults, activeVaultId } = useNoteStore();
  const { setView } = useUIStore();
  const [activeId, setActiveId] = useState<string | null>(null);

  const vault = vaults.find((v) => v.id === activeVaultId) ?? vaults[0];

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Local state for within-column ordering (persisted via kanbanOrder frontmatter field)
  const [columnOrder, setColumnOrder] = useState<Record<NoteState, string[]>>(() => {
    const init = {} as Record<NoteState, string[]>;
    for (const s of NOTE_STATES) {
      init[s as NoteState] = notes
        .filter((n) => n.frontmatter.state === s)
        .sort((a, b) => (a.frontmatter.kanbanOrder ?? Infinity) - (b.frontmatter.kanbanOrder ?? Infinity))
        .map((n) => n.id);
    }
    return init;
  });

  // Sync order when notes are added, removed, or moved externally
  useEffect(() => {
    setColumnOrder((prev) => {
      const byId = new Map(notes.map((n) => [n.id, n]));
      const next = { ...prev };
      for (const s of NOTE_STATES) {
        const colIds = new Set(notes.filter((n) => n.frontmatter.state === s).map((n) => n.id));
        const kept = (prev[s as NoteState] ?? []).filter((id) => colIds.has(id));
        const added = [...colIds]
          .filter((id) => !kept.includes(id))
          .sort((a, b) => {
            const noteA = byId.get(a);
            const noteB = byId.get(b);
            return (noteA?.frontmatter.kanbanOrder ?? Infinity) - (noteB?.frontmatter.kanbanOrder ?? Infinity);
          });
        next[s as NoteState] = [...kept, ...added];
      }
      return next;
    });
  }, [notes]);

  // Derive ordered note arrays from columnOrder
  const columnNotes = useMemo(() => {
    const byId = new Map(notes.map((n) => [n.id, n]));
    const result = {} as Record<NoteState, Note[]>;
    for (const s of NOTE_STATES) {
      result[s as NoteState] = (columnOrder[s as NoteState] ?? [])
        .map((id) => byId.get(id))
        .filter((n): n is Note => !!n);
    }
    return result;
  }, [notes, columnOrder]);

  async function createNoteInColumn(state: NoteState) {
    if (!vault) return;
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

    const activeNoteId = String(active.id);
    const overId = String(over.id);

    // Find which column the dragged card came from
    const sourceCol = NOTE_STATES.find((s) =>
      (columnOrder[s as NoteState] ?? []).includes(activeNoteId),
    ) as NoteState | undefined;
    if (!sourceCol) return;

    // over.id is either a column state name or a note id
    const isDropOnColumn = (NOTE_STATES as string[]).includes(overId);
    const targetCol: NoteState = isDropOnColumn
      ? (overId as NoteState)
      : ((NOTE_STATES.find((s) =>
          (columnOrder[s as NoteState] ?? []).includes(overId),
        ) as NoteState | undefined) ?? sourceCol);

    const byId = new Map(notes.map((n) => [n.id, n]));

    async function saveNote(note: Note) {
      updateNote(note);
      try {
        await tauriCommands.writeNote(note.filePath, serializeNote(note));
      } catch (e) {
        console.error("Failed to save note:", e);
      }
    }

    if (sourceCol === targetCol) {
      // Same column — reorder in place
      if (isDropOnColumn) return;
      const oldIndex = columnOrder[sourceCol].indexOf(activeNoteId);
      const newIndex = columnOrder[targetCol].indexOf(overId);
      if (oldIndex === newIndex || newIndex < 0) return;

      const newColOrder = arrayMove(columnOrder[sourceCol], oldIndex, newIndex);
      setColumnOrder((prev) => ({ ...prev, [sourceCol]: newColOrder }));

      // Persist kanbanOrder for notes whose position changed
      for (let i = 0; i < newColOrder.length; i++) {
        const note = byId.get(newColOrder[i]);
        if (!note || note.frontmatter.kanbanOrder === i) continue;
        await saveNote({ ...note, frontmatter: { ...note.frontmatter, kanbanOrder: i } });
      }
      return;
    }

    // Cross-column move — update state and order
    const newSourceOrder = columnOrder[sourceCol].filter((id) => id !== activeNoteId);
    const newTargetOrder = columnOrder[targetCol].filter((id) => id !== activeNoteId);
    const insertAt = !isDropOnColumn ? columnOrder[targetCol].indexOf(overId) + 1 : -1;
    if (insertAt > 0) {
      newTargetOrder.splice(insertAt, 0, activeNoteId);
    } else {
      newTargetOrder.push(activeNoteId);
    }

    setColumnOrder((prev) => ({
      ...prev,
      [sourceCol]: newSourceOrder,
      [targetCol]: newTargetOrder,
    }));

    // Persist source column order changes
    for (let i = 0; i < newSourceOrder.length; i++) {
      const note = byId.get(newSourceOrder[i]);
      if (!note || note.frontmatter.kanbanOrder === i) continue;
      await saveNote({ ...note, frontmatter: { ...note.frontmatter, kanbanOrder: i } });
    }

    // Persist target column — moved note gets state + order, others get order only
    for (let i = 0; i < newTargetOrder.length; i++) {
      const note = byId.get(newTargetOrder[i]);
      if (!note) continue;
      if (note.id === activeNoteId) {
        if (note.frontmatter.state !== targetCol || note.frontmatter.kanbanOrder !== i) {
          await saveNote({
            ...note,
            frontmatter: {
              ...note.frontmatter,
              state: targetCol,
              kanbanOrder: i,
              updated: new Date().toISOString().split("T")[0],
            },
          });
        }
      } else if (note.frontmatter.kanbanOrder !== i) {
        await saveNote({ ...note, frontmatter: { ...note.frontmatter, kanbanOrder: i } });
      }
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
              notes={columnNotes[state as NoteState] ?? []}
              noteIds={columnOrder[state as NoteState] ?? []}
              onCreate={() => createNoteInColumn(state as NoteState)}
            />
          ))}
        </div>
        <DragOverlay>{activeNote ? <KanbanCard note={activeNote} /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}
