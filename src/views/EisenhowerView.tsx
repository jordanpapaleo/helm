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
import { EISENHOWER_QUADRANTS } from "../lib/constants";
import { noteFilePath, serializeNote } from "../lib/note-parser";
import { tauriCommands } from "../lib/tauri-commands";
import { useNoteStore } from "../store/notes";
import { useUIStore } from "../store/ui";
import type { Note } from "../types/note";
import { type EisenhowerQuadrant, getQuadrant } from "../types/note";

const ALL_QUADRANTS: EisenhowerQuadrant[] = ["do", "schedule", "delegate", "eliminate"];

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

function NoteCard({
  note,
  index,
  quadrant,
}: {
  note: Note;
  index: number;
  quadrant: EisenhowerQuadrant;
}) {
  const { navigate, selectedGrouping } = useUIStore();
  const { ref, isDragSource } = useSortable({
    id: note.id,
    index,
    group: quadrant,
    type: "card",
    accept: "card",
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
        <p className="card-title text-sm font-medium truncate">
          {note.frontmatter.title || "Untitled"}
        </p>
        {note.frontmatter.blocked && (
          <span className="badge badge-error badge-soft badge-sm">⊘ Blocked</span>
        )}
        <div className="flex flex-wrap gap-1">
          {note.frontmatter.tags.slice(0, 3).map((t) => (
            <span key={t} className="badge badge-ghost badge-sm">#{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Quadrant({
  id,
  notes,
  onCreate,
}: {
  id: EisenhowerQuadrant;
  notes: Note[];
  onCreate: () => void;
}) {
  const { ref, isDropTarget } = useDroppable({
    id,
    type: "quadrant",
    accept: "card",
    collisionPriority: CollisionPriority.Low,
  });
  const q = EISENHOWER_QUADRANTS[id];

  return (
    <div
      ref={ref}
      className={`card bg-base-200 flex flex-col gap-2 overflow-y-auto min-h-0 transition-colors ${
        isDropTarget ? "border-accent bg-accent/5" : ""
      }`}
    >
      <div className="card-body p-4 gap-2 flex flex-col min-h-0">
        <div className="shrink-0 flex items-start justify-between">
          <div>
            <p className="card-title text-sm">{q.label}</p>
            <p className="text-xs opacity-50">{q.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onCreate}
            title="New note in this quadrant"
            className="btn btn-ghost btn-sm btn-square"
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
            <NoteCard key={n.id} note={n} index={index} quadrant={id} />
          ))}
        </div>
        {notes.length === 0 && (
          <p className="text-xs opacity-30 mt-auto">Drop here</p>
        )}
      </div>
    </div>
  );
}

export function EisenhowerView() {
  const { notes, updateNote, addNote, vaults, activeVaultId } = useNoteStore();
  const { navigate, selectedGrouping } = useUIStore();
  const vault = vaults.find((v) => v.id === activeVaultId) ?? vaults[0];

  const activeNotes = useMemo(
    () => notes.filter((n) => !n.frontmatter.unmanaged && (n.frontmatter.state === "Prepare" || n.frontmatter.state === "Doing")),
    [notes],
  );

  const [items, setItems] = useState<Record<string, string[]>>(() => {
    const sortByOrder = (a: Note, b: Note) =>
      (a.frontmatter.eisenhowerOrder ?? Infinity) - (b.frontmatter.eisenhowerOrder ?? Infinity);
    const init: Record<string, string[]> = {};
    for (const q of ALL_QUADRANTS) {
      init[q] = activeNotes
        .filter((n) => getQuadrant(n) === q)
        .sort(sortByOrder)
        .map((n) => n.id);
    }
    return init;
  });

  // Always-current ref — safe to read in callbacks without stale closures
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const snapshot = useRef<Record<string, string[]>>(structuredClone(items));

  // Sync when notes are added, removed, or reassigned externally
  useEffect(() => {
    setItems((prev) => {
      const byId = new Map(activeNotes.map((n) => [n.id, n]));
      let changed = false;
      const next = { ...prev };
      for (const q of ALL_QUADRANTS) {
        const colIds = new Set(activeNotes.filter((n) => getQuadrant(n) === q).map((n) => n.id));
        const kept = (prev[q] ?? []).filter((id) => colIds.has(id));
        const added = [...colIds]
          .filter((id) => !kept.includes(id))
          .sort((a, b) => {
            const noteA = byId.get(a);
            const noteB = byId.get(b);
            return (
              (noteA?.frontmatter.eisenhowerOrder ?? Infinity) -
              (noteB?.frontmatter.eisenhowerOrder ?? Infinity)
            );
          });
        const newCol = [...kept, ...added];
        const prevCol = prev[q] ?? [];
        if (newCol.length !== prevCol.length || newCol.some((id, i) => id !== prevCol[i])) {
          next[q] = newCol;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activeNotes]);

  const quadrantNotes = useMemo(() => {
    const byId = new Map(notes.map((n) => [n.id, n]));
    const result: Record<string, Note[]> = {};
    for (const q of ALL_QUADRANTS) {
      result[q] = (items[q] ?? []).map((id) => byId.get(id)).filter((n): n is Note => !!n);
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
    const today = new Date().toISOString().split("T")[0];
    const writes: Promise<void>[] = [];
    for (const q of ALL_QUADRANTS) {
      const qConfig = EISENHOWER_QUADRANTS[q];
      const order = currentItems[q] ?? [];
      for (let i = 0; i < order.length; i++) {
        const note = byId.get(order[i]);
        if (!note) continue;
        const quadrantChanged =
          note.frontmatter.urgent !== qConfig.urgent ||
          note.frontmatter.important !== qConfig.important;
        const orderChanged = note.frontmatter.eisenhowerOrder !== i;
        if (!quadrantChanged && !orderChanged) continue;
        const updated: Note = {
          ...note,
          frontmatter: {
            ...note.frontmatter,
            urgent: qConfig.urgent,
            important: qConfig.important,
            eisenhowerOrder: i,
            ...(quadrantChanged ? { updated: today } : {}),
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
    await Promise.all(writes);
  }

  async function createNoteInQuadrant(quadrant: EisenhowerQuadrant) {
    if (!vault) return;
    const q = EISENHOWER_QUADRANTS[quadrant];
    const id = ulid();
    const filePath = noteFilePath(vault.path, id.toLowerCase());
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
      navigate({ view: "notes", selectedNoteId: id, selectedGrouping });
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
        <h2 className="shrink-0 text-xl font-bold">Eisenhower Matrix</h2>
        <div className="grid grid-cols-2 grid-rows-2 gap-4 flex-1 min-h-0">
          {ALL_QUADRANTS.map((q) => (
            <Quadrant
              key={q}
              id={q}
              notes={quadrantNotes[q] ?? []}
              onCreate={() => createNoteInQuadrant(q)}
            />
          ))}
        </div>
      </div>
    </DragDropProvider>
  );
}
