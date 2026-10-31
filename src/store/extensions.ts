import { create } from "zustand";

const KEY = "helm-extensions";

/** Built-in extensions in toolbar order. */
export const EXTENSION_IDS = ["openai-assistant", "claude-assistant"] as const;
export type ExtensionId = (typeof EXTENSION_IDS)[number];
export type ExtensionConnectionMode = "subscription" | "api";

export interface ExtensionSettings {
  mode: ExtensionConnectionMode;
  /** Blank means the client's default model. */
  model: string;
}

export interface ChatMessage {
  id: string;
  content: string;
  /** Title of the open note attached to this message, if any. */
  noteTitle?: string;
}

export interface ExtensionChat {
  draft: string;
  useOpenNote: boolean;
  messages: ChatMessage[];
}

interface Persisted {
  enabled: ExtensionId[];
  settings: Record<ExtensionId, ExtensionSettings>;
}

interface ExtensionsState extends Persisted {
  /** In memory for this session. Connecting never touches the network. */
  connected: Record<ExtensionId, boolean>;
  chats: Record<ExtensionId, ExtensionChat>;
  setEnabled: (id: ExtensionId, enabled: boolean) => void;
  configure: (id: ExtensionId, patch: Partial<ExtensionSettings>) => void;
  connect: (id: ExtensionId) => void;
  patchChat: (id: ExtensionId, patch: Partial<ExtensionChat>) => void;
  /** Records the message locally. No model is called. */
  send: (id: ExtensionId, noteTitle?: string) => void;
}

export const EMPTY_CHAT: ExtensionChat = { draft: "", useOpenNote: true, messages: [] };

function isExtensionId(value: unknown): value is ExtensionId {
  return EXTENSION_IDS.includes(value as ExtensionId);
}

function validModel(value: unknown): string {
  return typeof value === "string" && value.length <= 160 && !/\s/.test(value) ? value : "";
}

export function validateExtensionPreferences(value: unknown): Persisted {
  const saved = value && typeof value === "object" ? (value as Partial<Persisted>) : {};
  const enabled = Array.isArray(saved.enabled) ? saved.enabled.filter(isExtensionId) : [];
  const settings = {} as Record<ExtensionId, ExtensionSettings>;
  for (const id of EXTENSION_IDS) {
    const entry = saved.settings?.[id];
    settings[id] = {
      mode: entry?.mode === "api" ? "api" : "subscription",
      model: validModel(entry?.model),
    };
  }
  return { enabled: EXTENSION_IDS.filter((id) => enabled.includes(id)), settings };
}

function load(): Persisted {
  try {
    return validateExtensionPreferences(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return validateExtensionPreferences(null);
  }
}

function persist(state: Persisted) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* In-memory preferences remain usable. */
  }
}

export const useExtensionsStore = create<ExtensionsState>((set, get) => {
  function commit(patch: Partial<Persisted>) {
    const next = validateExtensionPreferences({
      enabled: get().enabled,
      settings: get().settings,
      ...patch,
    });
    persist(next);
    set(next);
  }
  return {
    ...load(),
    connected: { "openai-assistant": true, "claude-assistant": false },
    chats: { "openai-assistant": EMPTY_CHAT, "claude-assistant": EMPTY_CHAT },
    setEnabled: (id, enabled) => {
      const others = get().enabled.filter((item) => item !== id);
      commit({ enabled: enabled ? [...others, id] : others });
    },
    configure: (id, patch) =>
      commit({ settings: { ...get().settings, [id]: { ...get().settings[id], ...patch } } }),
    connect: (id) => set({ connected: { ...get().connected, [id]: true } }),
    patchChat: (id, patch) =>
      set({ chats: { ...get().chats, [id]: { ...get().chats[id], ...patch } } }),
    send: (id, noteTitle) => {
      const chat = get().chats[id];
      const content = chat.draft.trim();
      if (!content) return;
      const message: ChatMessage = { id: crypto.randomUUID(), content, noteTitle };
      get().patchChat(id, { draft: "", messages: [...chat.messages, message] });
    },
  };
});
