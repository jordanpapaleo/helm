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
import { NewNoteMenu } from "../components/sidebar/NewNoteMenu";
import { useScopedWorkflowNotes } from "../hooks/useScopedWorkflowNotes";
import { isArchived } from "../lib/archive";
import { NOTE_STATES } from "../lib/constants";
import { createNote } from "../lib/create-note";
import { serializeNote } from "../lib/note-parser";
import { tauriCommands } from "../lib/tauri-commands";
import { nowTimestamp } from "../lib/timestamps";
import { useNoteStore } from "../store/notes";
import { reportError } from "../store/toast";
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
  const { navigate, selectedGrouping } = useUIStore();
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
      onClick={() => navigate({ view: "notes", selectedNoteId: note.id, selectedGrouping })}
      className={`card card-compact bg-base-100 cursor-pointer select-none transition-opacity ${
        isDragSource ? "opacity-40" : "hover:border-accent/50"
      }`}
    >
      <div className="card-body">
        <p className="card-title text-sm font-medium">{note.frontmatter.title || "Untitled"}</p>
        {note.frontmatter.blocked && (
          <span className="badge badge-error badge-soft badge-sm">⊘ Blocked</span>
        )}
        {isArchived(note.frontmatter) && (
          <span className="badge badge-ghost badge-sm">Archived</span>
        )}
        <div className="flex flex-wrap gap-1">
          {note.frontmatter.tags.slice(0, 2).map((t) => (
            <span key={t} className="badge badge-ghost badge-sm">
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function KanbanColumn({
  state,
  notes,
  disabled,
  onCreate,
}: {
  state: NoteState;
  notes: Note[];
  disabled?: boolean;
  onCreate: (templateId: string | null) => void;
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
      className={`card bg-base-200 flex-1 flex flex-col overflow-y-auto min-h-0 transition-colors ${
        isDropTarget ? "border-accent bg-accent/5" : ""
      }`}
    >
      <div className="card-body p-4 gap-3 flex flex-col min-h-0">
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <p className="card-title text-sm">{state}</p>
            <span className="badge badge-ghost badge-sm">{notes.length}</span>
          </div>
          <NewNoteMenu
            ariaLabel={`New note in ${state}`}
            icon="uil:plus"
            disabled={disabled}
            className="btn btn-ghost btn-sm btn-square"
            onSelect={onCreate}
          />
        </div>
        <div className="flex flex-col gap-2">
          {notes.map((n, index) => (
            <KanbanCard key={n.id} note={n} index={index} column={state} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function KanbanView() {
  const { updateNote, vaults, activeVaultId } = useNoteStore();
  const { notes, project } = useScopedWorkflowNotes();
  const vault = vaults.find((v) => v.id === activeVaultId) ?? vaults[0];

  const [items, setItems] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const s of NOTE_STATES) {
      init[s] = notes
        .filter((n) => n.frontmatter.state === s && !n.frontmatter.unmanaged)
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
        const colIds = new Set(
          notes
            .filter((n) => n.frontmatter.state === s && !n.frontmatter.unmanaged)
            .map((n) => n.id),
        );
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
      result[s] = (items[s] ?? [])
        .map((id) => byId.get(id))
        .filter((n): n is Note => !!n && !n.frontmatter.unmanaged);
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
              updated: nowTimestamp(),
            },
          };
          updateNote(updated);
          writes.push(
            tauriCommands.writeNote(updated.filePath, serializeNote(updated)).catch((e) => {
              reportError("Failed to save note", e);
            }),
          );
        }
      }
    }
    await Promise.all(writes);
  }

  function createNoteInColumn(state: NoteState, templateId: string | null) {
    void createNote({
      templateId,
      recordNavigation: true,
      folderPath: project?.rootPath,
      vaultId: vault?.id,
      overrides: { state },
    });
  }

  return (
    <DragDropProvider
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full p-6 gap-4 overflow-hidden">
        <h2 className="shrink-0 text-xl font-bold">
          {project ? `${project.name} — Kanban` : "Kanban"}
        </h2>
        <div className="flex flex-1 gap-4 min-h-0">
          {NOTE_STATES.map((state) => (
            <KanbanColumn
              key={state}
              state={state as NoteState}
              notes={columnNotes[state] ?? []}
              disabled={!vault}
              onCreate={(templateId) => createNoteInColumn(state as NoteState, templateId)}
            />
          ))}
        </div>
      </div>
    </DragDropProvider>
  );
}
