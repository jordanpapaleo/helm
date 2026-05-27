import { useUIStore } from "../../store/ui";
import { LeftColumn } from "./LeftColumn";
import { MainPanel } from "./MainPanel";
import { NoteListPanel } from "./NoteListPanel";

export function AppShell() {
  const { activeView, sidebarCollapsed } = useUIStore();

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">
      <LeftColumn />
      {activeView === "notes" && !sidebarCollapsed && <NoteListPanel />}
      <MainPanel />
    </div>
  );
}
