import { create } from "zustand";
import type { Note } from "../types/note";

const STORAGE_KEY = "helm-trash";

export interface TrashItem {
  note: Note;
  deletedAt: string;
}

interface TrashStore {
  items: TrashItem[];
  addToTrash: (note: Note) => void;
  removeFromTrash: (noteId: string) => TrashItem | undefined;
  permanentlyDelete: (noteId: string) => void;
}

function load(): TrashItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persist(items: TrashItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export const useTrashStore = create<TrashStore>((set, get) => ({
  items: load(),

  addToTrash: (note) => {
    const items = [{ note, deletedAt: new Date().toISOString() }, ...get().items];
    persist(items);
    set({ items });
  },

  removeFromTrash: (noteId) => {
    const item = get().items.find((i) => i.note.id === noteId);
    if (!item) return undefined;
    const items = get().items.filter((i) => i.note.id !== noteId);
    persist(items);
    set({ items });
    return item;
  },

  permanentlyDelete: (noteId) => {
    const items = get().items.filter((i) => i.note.id !== noteId);
    persist(items);
    set({ items });
  },
}));
