import { create } from "zustand";
import type { WriterMode, WriterProvider } from "../tools/writer";

const KEY = "helm-tools";
interface Preferences {
  writerEnabled: boolean;
  provider: WriterProvider;
  mode: WriterMode;
  apiModels: Record<WriterProvider, string>;
  subscriptionModels: Record<WriterProvider, string>;
}
export function validateToolPreferences(value: unknown): Preferences {
  const saved = value && typeof value === "object" ? (value as Partial<Preferences>) : {};
  const model = (
    provider: WriterProvider,
    mode: "apiModels" | "subscriptionModels" = "apiModels",
  ) => {
    const value = saved[mode]?.[provider];
    return typeof value === "string" && value.length <= 160 && !/\s/.test(value) ? value : "";
  };
  return {
    mode: saved.mode === "api" ? "api" : "subscription",
    apiModels: { codex: model("codex"), claude: model("claude") },
    subscriptionModels: {
      codex: model("codex", "subscriptionModels"),
      claude: model("claude", "subscriptionModels"),
    },
    writerEnabled: saved.writerEnabled === true,
    provider: saved.provider === "claude" ? "claude" : "codex",
  };
}
function load() {
  try {
    return validateToolPreferences(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return validateToolPreferences(null);
  }
}
export const useToolsStore = create<
  Preferences & {
    configure: (patch: Partial<Preferences>) => void;
    settingsSection: "typography" | "tools";
    showToolsSettings: () => void;
    resetSettingsSection: () => void;
  }
>((set, get) => ({
  ...load(),
  settingsSection: "typography",
  configure: (patch) => {
    const next = validateToolPreferences({ ...get(), ...patch });
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* In-memory preferences remain usable. */
    }
    set(next);
  },
  showToolsSettings: () => set({ settingsSection: "tools" }),
  resetSettingsSection: () => set({ settingsSection: "typography" }),
}));
