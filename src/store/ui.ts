import { create } from "zustand";
import { useNoteStore } from "./notes";

export type View = "notes" | "dashboard" | "eisenhower" | "kanban" | "graph";
export type GroupingType = "all" | "folder" | "tag" | "trash";

export interface Grouping {
  type: GroupingType;
  id: string | null; // folder path for "folder", null for "all"
}

export interface NavEntry {
  view: View;
  selectedNoteId: string | null;
  selectedGrouping: Grouping;
}

const MAX_HISTORY = 100;

function entriesAreEqual(a: NavEntry, b: NavEntry): boolean {
  return (
    a.view === b.view &&
    a.selectedNoteId === b.selectedNoteId &&
    a.selectedGrouping.type === b.selectedGrouping.type &&
    a.selectedGrouping.id === b.selectedGrouping.id
  );
}

interface UIStore {
  activeView: View;
  setView: (view: View) => void;
  selectedGrouping: Grouping;
  setSelectedGrouping: (grouping: Grouping) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;

  navHistory: NavEntry[];
  navIndex: number;
  navigate: (entry: NavEntry) => void;
  goBack: () => void;
  goForward: () => void;
}

const initialEntry: NavEntry = {
  view: "dashboard",
  selectedNoteId: null,
  selectedGrouping: { type: "all", id: null },
};

export const useUIStore = create<UIStore>((set, get) => ({
  activeView: "dashboard",
  setView: (view) => set({ activeView: view }),
  selectedGrouping: { type: "all", id: null },
  setSelectedGrouping: (grouping) => set({ selectedGrouping: grouping }),
  sidebarCollapsed: false,
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),

  navHistory: [initialEntry],
  navIndex: 0,

  navigate: (entry) => {
    const { navHistory, navIndex } = get();
    const current = navHistory[navIndex];

    // Skip duplicate pushes — just apply the state change and return
    if (current && entriesAreEqual(current, entry)) {
      set({
        activeView: entry.view,
        selectedGrouping: entry.selectedGrouping,
      });
      useNoteStore.getState().selectNote(entry.selectedNoteId);
      return;
    }

    // Slice off forward history, push new entry, cap at max
    const trimmed = navHistory.slice(0, navIndex + 1);
    trimmed.push(entry);
    const capped = trimmed.length > MAX_HISTORY ? trimmed.slice(-MAX_HISTORY) : trimmed;

    set({
      activeView: entry.view,
      selectedGrouping: entry.selectedGrouping,
      navHistory: capped,
      navIndex: capped.length - 1,
    });
    useNoteStore.getState().selectNote(entry.selectedNoteId);
  },

  goBack: () => {
    const { navHistory, navIndex } = get();
    if (navIndex <= 0) return;
    const newIndex = navIndex - 1;
    const entry = navHistory[newIndex];
    set({
      navIndex: newIndex,
      activeView: entry.view,
      selectedGrouping: entry.selectedGrouping,
    });
    useNoteStore.getState().selectNote(entry.selectedNoteId);
  },

  goForward: () => {
    const { navHistory, navIndex } = get();
    if (navIndex >= navHistory.length - 1) return;
    const newIndex = navIndex + 1;
    const entry = navHistory[newIndex];
    set({
      navIndex: newIndex,
      activeView: entry.view,
      selectedGrouping: entry.selectedGrouping,
    });
    useNoteStore.getState().selectNote(entry.selectedNoteId);
  },
}));
