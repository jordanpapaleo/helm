import { useEffect } from "react";
import { useUIStore } from "../../store/ui";
import { LeftColumn } from "./LeftColumn";
import { MainPanel } from "./MainPanel";
import { NoteListPanel } from "./NoteListPanel";

const SKIPPED_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function AppShell() {
  const { activeView, sidebarCollapsed, goBack, goForward } = useUIStore();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.metaKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

      // Don't hijack keyboard shortcuts inside editable elements
      const target = e.target as HTMLElement;
      if (target.isContentEditable) return;
      if (SKIPPED_TAGS.has(target.tagName)) return;

      e.preventDefault();
      if (e.key === "ArrowLeft") {
        goBack();
      } else {
        goForward();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [goBack, goForward]);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">
      <LeftColumn />
      {activeView === "notes" && !sidebarCollapsed && <NoteListPanel />}
      <MainPanel />
    </div>
  );
}
