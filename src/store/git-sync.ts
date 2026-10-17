import { create } from "zustand";
import type { GitSyncOutcome } from "../lib/tauri-commands";

interface GitSyncStore {
  byVaultId: Record<string, GitSyncOutcome>;
  barrierPaths: string[];
  heldNoteIds: string[];
  /** Unsaved editor text kept when a sync hold is released by leaving the note. */
  heldDrafts: Record<string, string>;
  setOutcome: (vaultId: string, outcome: GitSyncOutcome) => void;
  beginBarrier: (path: string) => void;
  endBarrier: (path: string) => void;
  isBarrierActive: (path: string) => boolean;
  holdNote: (id: string) => void;
  releaseNote: (id: string) => void;
  isHeld: (id: string) => boolean;
  preserveHeldDraft: (id: string, markdown: string) => void;
  clearHeldDraft: (id: string) => void;
  heldDraft: (id: string) => string | undefined;
  isWriteBlocked: (noteId: string, vaultPath: string | null) => boolean;
}

export const useGitSyncStore = create<GitSyncStore>((set, get) => ({
  byVaultId: {},
  barrierPaths: [],
  heldNoteIds: [],
  heldDrafts: {},
  setOutcome: (vaultId, outcome) =>
    set((state) => ({ byVaultId: { ...state.byVaultId, [vaultId]: outcome } })),
  beginBarrier: (path) =>
    set((state) => ({
      barrierPaths: state.barrierPaths.includes(path)
        ? state.barrierPaths
        : [...state.barrierPaths, path],
    })),
  endBarrier: (path) =>
    set((state) => ({ barrierPaths: state.barrierPaths.filter((item) => item !== path) })),
  isBarrierActive: (path) => get().barrierPaths.includes(path),
  holdNote: (id) =>
    set((state) => ({
      heldNoteIds: state.heldNoteIds.includes(id) ? state.heldNoteIds : [...state.heldNoteIds, id],
    })),
  releaseNote: (id) =>
    set((state) => ({ heldNoteIds: state.heldNoteIds.filter((item) => item !== id) })),
  isHeld: (id) => get().heldNoteIds.includes(id),
  preserveHeldDraft: (id, markdown) =>
    set((state) => ({ heldDrafts: { ...state.heldDrafts, [id]: markdown } })),
  clearHeldDraft: (id) =>
    set((state) => {
      if (!(id in state.heldDrafts)) return state;
      const heldDrafts = { ...state.heldDrafts };
      delete heldDrafts[id];
      return { heldDrafts };
    }),
  heldDraft: (id) => get().heldDrafts[id],
  isWriteBlocked: (noteId, vaultPath) =>
    get().heldNoteIds.includes(noteId) ||
    (vaultPath !== null && get().barrierPaths.includes(vaultPath)),
}));
