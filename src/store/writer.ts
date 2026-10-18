import { create } from "zustand";
import { tauriCommands } from "../lib/tauri-commands";
import {
  buildWriterPrompt,
  type WriterMessage,
  type WriterMode,
  type WriterProvider,
} from "../tools/writer";
import { reportError } from "./toast";

interface Session {
  messages: WriterMessage[];
  draft: string;
  followNote: boolean;
  error: string | null;
}
export interface WriterStore {
  sessions: Record<string, Session>;
  running: { id: string; scope: string } | null;
  patch: (scope: string, patch: Partial<Session>) => void;
  clear: (scope: string) => void;
  send: (
    scope: string,
    provider: WriterProvider,
    context?: { title: string; content: string },
    mode?: WriterMode,
    model?: string,
  ) => Promise<void>;
  stop: () => Promise<void>;
}
export const EMPTY_WRITER_SESSION: Session = {
  messages: [],
  draft: "",
  followNote: true,
  error: null,
};
export const useWriterStore = create<WriterStore>((set, get) => ({
  sessions: {},
  running: null,
  patch: (scope, patch) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [scope]: { ...EMPTY_WRITER_SESSION, ...state.sessions[scope], ...patch },
      },
    })),
  clear: (scope) => {
    if (get().running?.scope !== scope) get().patch(scope, { ...EMPTY_WRITER_SESSION });
  },
  send: async (scope, provider, context, mode = "subscription", model = "") => {
    const session = get().sessions[scope] ?? EMPTY_WRITER_SESSION;
    if (get().running || !session.draft.trim()) return;
    const user: WriterMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: session.draft.trim(),
      noteContext: context ? { title: context.title, markdown: context.content } : undefined,
    };
    const messages = [...session.messages, user];
    let prompt: string;
    try {
      prompt = buildWriterPrompt(messages, context);
    } catch (error) {
      get().patch(scope, {
        error: error instanceof Error ? error.message : "Could not prepare message",
      });
      return;
    }
    const id = crypto.randomUUID();
    get().patch(scope, {
      messages: [...messages, { id: crypto.randomUUID(), role: "assistant", content: "" }],
      draft: "",
      error: null,
    });
    set({ running: { id, scope } });
    let terminal = false;
    try {
      await tauriCommands.writerSend(
        id,
        provider,
        prompt,
        (event) => {
          if (terminal || event.requestId !== id || get().running?.id !== id) return;
          if (event.kind === "text") {
            const current = get().sessions[scope];
            const next = current.messages.slice();
            const last = next[next.length - 1];
            next[next.length - 1] = { ...last, content: last.content + event.text };
            get().patch(scope, { messages: next });
          } else {
            terminal = true;
            if (event.kind !== "completed")
              get().patch(scope, {
                error: event.text || "Reply stopped. Partial text is preserved.",
              });
          }
        },
        mode,
        model,
      );
      if (!terminal)
        get().patch(scope, { error: "The client ended without a complete reply. Please retry." });
    } catch (error) {
      get().patch(scope, {
        error:
          typeof error === "string"
            ? error
            : "Could not reach the writing client. Check Settings → Tools.",
      });
    } finally {
      if (get().running?.id === id) set({ running: null });
    }
  },
  stop: async () => {
    const running = get().running;
    if (!running) return;
    try {
      await tauriCommands.writerCancel(running.id);
    } catch (error) {
      reportError("Could not stop Writer", error);
    }
  },
}));
