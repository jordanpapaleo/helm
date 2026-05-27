import { create } from "zustand";

export type View = "notes" | "dashboard" | "eisenhower" | "kanban" | "graph";

export type GroupingType = "all" | "folder" | "tag" | "trash";

export interface Grouping {
  type: GroupingType;
  id: string | null; // folder path for "folder", null for "all"
}

interface UIStore {
  activeView: View;
  setView: (view: View) => void;
  selectedGrouping: Grouping;
  setSelectedGrouping: (grouping: Grouping) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  activeView: "dashboard",
  setView: (view) => set({ activeView: view }),
  selectedGrouping: { type: "all", id: null },
  setSelectedGrouping: (grouping) => set({ selectedGrouping: grouping }),
  sidebarCollapsed: false,
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
}));
