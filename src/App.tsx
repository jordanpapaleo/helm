import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { message } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { useEffect, useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppShell } from "./components/layout/AppShell";
import { McpSetupModal } from "./components/McpSetupModal";
import { ToastContainer } from "./components/ToastContainer";
import { addVault, useVault } from "./hooks/useVault";
import {
  checkAndInstallUpdate,
  compareVersions,
  downloadInstallAndRelaunch,
  type UpdateFlowResult,
} from "./lib/check-for-updates";
import { applyEditorShortcut, isEditorShortcutId } from "./lib/editor-shortcuts";
import { flushPendingSaves } from "./lib/pending-saves";
import { DEFAULT_SETTINGS } from "./lib/settings";
import { tauriCommands } from "./lib/tauri-commands";
import { createCloseHandler } from "./lib/window-close";
import { useSettingsStore } from "./store/settings";
import { useThemeStore } from "./store/theme";
import { reportError, useToastStore } from "./store/toast";
import { useUIStore } from "./store/ui";

const FONT_MIN = 12;
const FONT_MAX = 24;

/** Ignore overlapping Check for Updates clicks. */
let checkForUpdatesInFlight = false;

async function presentUpdateResult(result: UpdateFlowResult) {
  if (result.status === "up-to-date") {
    await message(`You're up to date (v${result.current}).`, { title: "Check for Updates" });
    return;
  }
  if (result.status === "installed") {
    await message(
      `Helm v${result.latest} is installed. Quit and reopen Helm if it is still running.`,
      { title: "Check for Updates" },
    );
    return;
  }
  await message(result.message, { title: "Check for Updates", kind: "error" });
}

/** Download the signed release the updater manifest offers, then relaunch. */
async function installSignedRelease(available: { latest: string }) {
  const update = await check();
  if (!update) {
    throw new Error("the updater did not offer a newer signed release.");
  }
  if (compareVersions(update.version, available.latest) !== 0) {
    const offered = update.version;
    await update.close();
    throw new Error(`the updater offered ${offered}, not v${available.latest}.`);
  }
  await downloadInstallAndRelaunch(update, flushPendingSaves, relaunch);
}

async function handleCheckForUpdates() {
  if (checkForUpdatesInFlight) return;
  checkForUpdatesInFlight = true;
  const { showToast, dismissToast } = useToastStore.getState();
  const toastId = showToast("Checking for updates…", "info", { persist: true });
  try {
    const result = await checkAndInstallUpdate(getVersion, async (available) => {
      dismissToast(toastId);
      const installingId = showToast(`Downloading Helm v${available.latest}…`, "info", {
        persist: true,
      });
      try {
        await installSignedRelease(available);
      } finally {
        dismissToast(installingId);
      }
    });
    dismissToast(toastId);
    await presentUpdateResult(result);
  } finally {
    dismissToast(toastId);
    checkForUpdatesInFlight = false;
  }
}

export default function App() {
  const { loading, error } = useVault();
  const [showMcpSetup, setShowMcpSetup] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let teardown: (() => void) | undefined;

    const setup = async () => {
      const fns: Array<() => void> = [];

      fns.push(await listen("show-mcp-setup", () => setShowMcpSetup(true)));
      fns.push(
        await listen<string>("editor-shortcut", (event) => {
          if (isEditorShortcutId(event.payload)) applyEditorShortcut(event.payload);
        }),
      );
      fns.push(await listen("new-note", () => useUIStore.getState().openNewNoteMenu()));
      fns.push(await listen("open-settings", () => useUIStore.getState().setSettingsOpen(true)));
      fns.push(await listen("quick-open", () => useUIStore.getState().setQuickOpenOpen(true)));
      fns.push(await listen("toggle-markdown", () => useUIStore.getState().toggleMarkdownMode()));
      fns.push(
        await listen("check-for-updates", () => {
          void handleCheckForUpdates().catch((e) => reportError("Failed to check for updates", e));
        }),
      );
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
  // alive after the first ⌘⇧Space use. See src/lib/window-close.ts for why the
  // flush is time-bounded — a wedged save must never trap the user in the app.
  useEffect(() => {
    let unlistenClose: (() => void) | undefined;
    let unlistenQuit: (() => void) | undefined;

    // Shared handler so menu quit / Ctrl+Q go through the same flush →
    // exit sequence (and the same non-latching guard) as window close.
    const handleCloseRequested = createCloseHandler({
      flush: flushPendingSaves,
      exit: tauriCommands.exitApp,
      onError: reportError,
    });

    getCurrentWindow()
      .onCloseRequested(handleCloseRequested)
      .then((fn) => {
        unlistenClose = fn;
      })
      .catch(() => {
        // Not running inside a Tauri window (tests, plain browser dev)
      });

    listen("quit-app", () => {
      void handleCloseRequested({ preventDefault: () => {} });
    })
      .then((fn) => {
        unlistenQuit = fn;
      })
      .catch(() => {
        // Not running inside a Tauri window (tests, plain browser dev)
      });

    return () => {
      unlistenClose?.();
      unlistenQuit?.();
    };
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
