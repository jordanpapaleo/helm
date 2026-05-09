import { CollisionPriority } from "@dnd-kit/abstract";
import {
  Feedback,
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
} from "@dnd-kit/dom";
import { move } from "@dnd-kit/helpers";
import { type DragDropEventHandlers, DragDropProvider, useDroppable } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ulid } from "ulid";
import { NOTE_STATES } from "../lib/constants";
import { noteFilePath, serializeNote } from "../lib/note-parser";
import { tauriCommands } from "../lib/tauri-commands";
import { useNoteStore } from "../store/notes";
import { useUIStore } from "../store/ui";
import type { Note, NoteState } from "../types/note";

const sensors = [
  PointerSensor.configure({
    activationConstraints(event) {
      if (event.pointerType === "touch") {
        return [new PointerActivationConstraints.Delay({ value: 250, tolerance: 5 })];
      }
      return [new PointerActivationConstraints.Distance({ value: 5 })];
    },
  }),
  KeyboardSensor,
];

function KanbanCard({ note, index, column }: { note: Note; index: number; column: NoteState }) {
  const { selectNote } = useNoteStore();
  const { setView } = useUIStore();
  const { ref, isDragSource } = useSortable({
    id: note.id,
    index,
    group: column,
    type: "item",
    accept: "item",
    plugins: [Feedback.configure({ feedback: "clone" })],
  });

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: drag-and-drop element managed by dnd-kit
    // biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop element managed by dnd-kit
    <div
      ref={ref}
      onClick={() => {
        selectNote(note.id);
        setView("notes");
      }}
      className={`rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 cursor-pointer select-none transition-opacity ${
        isDragSource ? "opacity-40" : "hover:border-[var(--color-accent)]/50"
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
  state: NoteState;
  notes: Note[];
  onCreate: () => void;
}) {
  const { ref, isDropTarget } = useDroppable({
    id: state,
    type: "column",
    accept: "item",
    collisionPriority: CollisionPriority.Low,
  });

  return (
    <div
      ref={ref}
      className={`flex flex-1 flex-col rounded-xl border p-4 gap-3 overflow-y-auto min-h-0 transition-colors ${
        isDropTarget
          ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
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
        {notes.map((n, index) => (
          <KanbanCard key={n.id} note={n} index={index} column={state} />
        ))}
      </div>
    </div>
  );
}

export function KanbanView() {
  const { notes, updateNote, addNote, selectNote, vaults, activeVaultId } = useNoteStore();
  const { setView } = useUIStore();
  const vault = vaults.find((v) => v.id === activeVaultId) ?? vaults[0];

  const [items, setItems] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const s of NOTE_STATES) {
      init[s] = notes
        .filter((n) => n.frontmatter.state === s)
        .sort(
          (a, b) =>
            (a.frontmatter.kanbanOrder ?? Infinity) - (b.frontmatter.kanbanOrder ?? Infinity),
        )
        .map((n) => n.id);
    }
    return init;
  });

  // Always-current ref — safe to read in callbacks without deps
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const snapshot = useRef<Record<string, string[]>>(structuredClone(items));

  // Sync when notes are added or removed externally (file watcher, create)
  useEffect(() => {
    setItems((prev) => {
      const byId = new Map(notes.map((n) => [n.id, n]));
      let changed = false;
      const next = { ...prev };
      for (const s of NOTE_STATES) {
        const colIds = new Set(notes.filter((n) => n.frontmatter.state === s).map((n) => n.id));
        const kept = (prev[s] ?? []).filter((id) => colIds.has(id));
        const added = [...colIds]
          .filter((id) => !kept.includes(id))
          .sort((a, b) => {
            const noteA = byId.get(a);
            const noteB = byId.get(b);
            return (
              (noteA?.frontmatter.kanbanOrder ?? Infinity) -
              (noteB?.frontmatter.kanbanOrder ?? Infinity)
            );
          });
        const newCol = [...kept, ...added];
        const prevCol = prev[s] ?? [];
        if (newCol.length !== prevCol.length || newCol.some((id, i) => id !== prevCol[i])) {
          next[s] = newCol;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [notes]);

  const columnNotes = useMemo(() => {
    const byId = new Map(notes.map((n) => [n.id, n]));
    const result: Record<string, Note[]> = {};
    for (const s of NOTE_STATES) {
      result[s] = (items[s] ?? []).map((id) => byId.get(id)).filter((n): n is Note => !!n);
    }
    return result;
  }, [notes, items]);

  const handleDragStart = useCallback<DragDropEventHandlers["onDragStart"]>(() => {
    snapshot.current = structuredClone(itemsRef.current);
  }, []);

  const handleDragOver = useCallback<DragDropEventHandlers["onDragOver"]>((event) => {
    setItems((current) => move(current, event));
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: persistDrop is a stable inner function; all its reactive deps (notes) are already listed
  const handleDragEnd = useCallback<DragDropEventHandlers["onDragEnd"]>(
    async (event) => {
      if (event.canceled) {
        setItems(snapshot.current);
        return;
      }
      await persistDrop(itemsRef.current, notes);
    },
    [notes],
  );

  async function persistDrop(currentItems: Record<string, string[]>, currentNotes: Note[]) {
    const byId = new Map(currentNotes.map((n) => [n.id, n]));
    const writes: Promise<void>[] = [];
    for (const col of NOTE_STATES) {
      const order = currentItems[col] ?? [];
      for (let i = 0; i < order.length; i++) {
        const note = byId.get(order[i]);
        if (!note) continue;
        if (note.frontmatter.state !== col || note.frontmatter.kanbanOrder !== i) {
          const updated: Note = {
            ...note,
            frontmatter: {
              ...note.frontmatter,
              state: col as NoteState,
              kanbanOrder: i,
              updated: new Date().toISOString().split("T")[0],
            },
          };
          updateNote(updated);
          writes.push(
            tauriCommands.writeNote(updated.filePath, serializeNote(updated)).catch((e) => {
              console.error("Failed to save note:", e);
            }),
          );
        }
      }
    }
    await Promise.all(writes);
  }

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

  return (
    <DragDropProvider
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full p-6 gap-4 overflow-hidden">
        <h2 className="shrink-0 text-xl font-bold text-[var(--color-text)]">Kanban</h2>
        <div className="flex flex-1 gap-4 min-h-0">
          {NOTE_STATES.map((state) => (
            <KanbanColumn
              key={state}
              state={state as NoteState}
              notes={columnNotes[state] ?? []}
              onCreate={() => createNoteInColumn(state as NoteState)}
            />
          ))}
        </div>
      </div>
    </DragDropProvider>
  );
}
