import { create } from "zustand";
import { useLayoutStore } from "./layout";

const KEY = "helm-pinned-panel";
/** Enough tabs to keep a few references open; older pins drop off the front. */
export const MAX_PINNED_NOTES = 12;
/** Right-panel tab id for the Writer tool. Never a note id. */
export const WRITER_TAB = "writer";

interface PinnedPanelState {
  noteIds: string[];
  /** A pinned note id, or `WRITER_TAB` when Writer is the selected tab. */
  activeId: string;
  pin: (id: string) => void;
  unpin: (id: string) => void;
  select: (id: string) => void;
}

function validate(value: unknown): { noteIds: string[]; activeId: string } {
  const data = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const raw = Array.isArray(data.noteIds) ? data.noteIds : [];
  const noteIds: string[] = [];
  for (const id of raw) {
    if (typeof id !== "string" || !id || id === WRITER_TAB || noteIds.includes(id)) continue;
    noteIds.push(id);
    if (noteIds.length >= MAX_PINNED_NOTES) break;
  }
  const activeId = typeof data.activeId === "string" && data.activeId ? data.activeId : WRITER_TAB;
  return { noteIds, activeId };
}

function load(): { noteIds: string[]; activeId: string } {
  try {
    return validate(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return { noteIds: [], activeId: WRITER_TAB };
  }
}

function persist(state: { noteIds: string[]; activeId: string }) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* The panel stays usable when storage is unavailable. */
  }
}

function commit(
  set: (partial: Pick<PinnedPanelState, "noteIds" | "activeId">) => void,
  next: { noteIds: string[]; activeId: string },
) {
  persist(next);
  set(next);
}

export const usePinnedPanelStore = create<PinnedPanelState>((set, get) => ({
  ...load(),
  pin: (id) => {
    if (!id || id === WRITER_TAB) return;
    const current = get().noteIds;
    const noteIds = current.includes(id) ? current : [...current, id].slice(-MAX_PINNED_NOTES);
    commit(set, { noteIds, activeId: id });
  },
  unpin: (id) => {
    const current = get().noteIds;
    const index = current.indexOf(id);
    if (index < 0) return;
    const noteIds = current.filter((item) => item !== id);
    const activeId =
      get().activeId === id ? (noteIds[index] ?? noteIds[index - 1] ?? WRITER_TAB) : get().activeId;
    commit(set, { noteIds, activeId });
  },
  select: (id) => {
    if (!id) return;
    commit(set, { noteIds: get().noteIds, activeId: id });
  },
}));

/** Open the right panel without closing it when it is already the user's choice. */
export function showRightPanel() {
  const { preferences, toggle } = useLayoutStore.getState();
  if (!preferences.rightOpen) toggle("right", false);
  else useLayoutStore.setState({ priority: "right" });
}

export function pinNoteToSide(id: string) {
  usePinnedPanelStore.getState().pin(id);
  if (usePinnedPanelStore.getState().noteIds.includes(id)) showRightPanel();
}

export function unpinNoteFromSide(id: string) {
  usePinnedPanelStore.getState().unpin(id);
}
