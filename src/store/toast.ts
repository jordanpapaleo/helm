/**
 * Toast store — transient user-facing notifications, primarily for surfacing
 * file-operation failures that would otherwise be silent console errors.
 */
import { create } from "zustand";

export type ToastKind = "error" | "info";

export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

/** How long each kind stays on screen before auto-dismissing (ms). */
const TOAST_DURATION: Record<ToastKind, number> = {
  error: 8000,
  info: 4000,
};

interface ToastStore {
  toasts: Toast[];
  /** Show a toast; returns its id. Auto-dismisses unless `persist` is set. */
  showToast: (message: string, kind: ToastKind, options?: { persist?: boolean }) => number;
  /** Remove a toast immediately (close button). */
  dismissToast: (id: number) => void;
}

let nextId = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  showToast: (message, kind, options) => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts, { id, message, kind }] }));
    if (!options?.persist) {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      }, TOAST_DURATION[kind]);
    }
    return id;
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/** Convenience for error paths: log for devtools and show a user-visible toast. */
export function reportError(message: string, error: unknown): void {
  console.error(message, error);
  const detail = error instanceof Error ? error.message : String(error);
  useToastStore.getState().showToast(detail ? `${message}: ${detail}` : message, "error");
}
