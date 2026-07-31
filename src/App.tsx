import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppShell } from "./components/layout/AppShell";
import { McpSetupModal } from "./components/McpSetupModal";
import { ToastContainer } from "./components/ToastContainer";
import { addVault, useVault } from "./hooks/useVault";
import { flushPendingSaves } from "./lib/pending-saves";
import { DEFAULT_SETTINGS } from "./lib/settings";
import { tauriCommands } from "./lib/tauri-commands";
import { useSettingsStore } from "./store/settings";
import { useThemeStore } from "./store/theme";
import { reportError } from "./store/toast";
import { useUIStore } from "./store/ui";

const FONT_MIN = 12;
const FONT_MAX = 24;

export default function App() {
  const { loading, error } = useVault();
  const [showMcpSetup, setShowMcpSetup] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let teardown: (() => void) | undefined;

    const setup = async () => {
      const fns: Array<() => void> = [];

      fns.push(await listen("show-mcp-setup", () => setShowMcpSetup(true)));
      fns.push(await listen("open-settings", () => useUIStore.getState().setSettingsOpen(true)));
      fns.push(await listen("toggle-markdown", () => useUIStore.getState().toggleMarkdownMode()));
      fns.push(
        await listen("add-vault", async () => {
          try {
            const path = await tauriCommands.openFolderDialog();
            if (path) await addVault(path);
          } catch (e) {
            reportError("Failed to add vault", e);
          }
        }),
      );
      fns.push(
        await listen<string>("set-theme", (e) => useThemeStore.getState().setTheme(e.payload)),
      );
      fns.push(
        await listen<string>("font-size-change", (e) => {
          const { settings, updateSettings } = useSettingsStore.getState();
          if (e.payload === "reset") updateSettings({ fontSize: DEFAULT_SETTINGS.fontSize });
          else if (e.payload === "increase")
            updateSettings({ fontSize: Math.min(FONT_MAX, settings.fontSize + 1) });
          else if (e.payload === "decrease")
            updateSettings({ fontSize: Math.max(FONT_MIN, settings.fontSize - 1) });
        }),
      );

      if (cancelled) {
        for (const fn of fns) fn();
      } else {
        teardown = () => {
          for (const fn of fns) fn();
        };
      }
    };

    setup();
    return () => {
      cancelled = true;
      teardown?.();
    };
  }, []);

  // Flush debounced autosaves, then exit the whole process. Destroying only
  // the main window leaves the hidden quick-capture window (and the process)
  // alive after the first ⌘⇧Space use.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let closing = false;

    getCurrentWindow()
      .onCloseRequested(async (event) => {
        event.preventDefault();
        if (closing) return;
        closing = true;
        try {
          await flushPendingSaves();
          await tauriCommands.exitApp();
        } catch (e) {
          closing = false;
          reportError("Failed to quit Helm", e);
        }
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {
        // Not running inside a Tauri window (tests, plain browser dev)
      });

    return () => unlisten?.();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-bg)]">
        <p className="text-[var(--color-text-muted)]">Loading vault...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[var(--color-bg)]">
        <p className="text-red-400">Error: {error}</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <AppShell />
      {showMcpSetup && <McpSetupModal onClose={() => setShowMcpSetup(false)} />}
      <ToastContainer />
    </ErrorBoundary>
  );
}
