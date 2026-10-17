import { create } from "zustand";
import {
  clampWidth,
  type LayoutPreferences,
  type Panel,
  validateLayout,
} from "../lib/workspace-layout";

const KEY = "helm-layout";
function load() {
  try {
    return validateLayout(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return validateLayout(null);
  }
}
interface LayoutStore {
  preferences: LayoutPreferences;
  priority: "left" | "right";
  toggle: (side: "left" | "right", visible: boolean) => void;
  resize: (panel: Panel, width: number) => void;
}
function persist(preferences: LayoutPreferences) {
  try {
    localStorage.setItem(KEY, JSON.stringify(preferences));
  } catch {
    /* Layout remains usable when storage is unavailable. */
  }
}
export const useLayoutStore = create<LayoutStore>((set, get) => ({
  preferences: load(),
  priority: "left",
  toggle: (side, visible) => {
    const preferences = {
      ...get().preferences,
      [side === "left" ? "leftOpen" : "rightOpen"]: !visible,
    };
    persist(preferences);
    set({ preferences, priority: side });
  },
  resize: (panel, width) => {
    const preferences = {
      ...get().preferences,
      widths: { ...get().preferences.widths, [panel]: clampWidth(panel, width) },
    };
    persist(preferences);
    set({ preferences });
  },
}));
