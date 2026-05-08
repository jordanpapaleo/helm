import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { AppShell } from "./components/layout/AppShell";
import { McpSetupModal } from "./components/McpSetupModal";
import { useVault } from "./hooks/useVault";

export default function App() {
  const { loading, error } = useVault();
  const [showMcpSetup, setShowMcpSetup] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("show-mcp-setup", () => setShowMcpSetup(true)).then((fn) => {
      unlisten = fn;
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
    <>
      <AppShell />
      {showMcpSetup && <McpSetupModal onClose={() => setShowMcpSetup(false)} />}
    </>
  );
}
