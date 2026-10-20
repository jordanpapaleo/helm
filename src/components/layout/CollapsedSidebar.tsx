import { Icon } from "@iconify/react";
import { COLLAPSED_NAV_WIDTH } from "../../lib/workspace-layout";
import { useNoteStore } from "../../store/notes";
import { useUIStore, type View } from "../../store/ui";

const VIEWS: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "uil:dashboard" },
  { id: "eisenhower", label: "Eisenhower", icon: "uil:apps" },
  { id: "kanban", label: "Kanban", icon: "uil:columns" },
  { id: "graph", label: "Link", icon: "uil:link" },
];

/**
 * Narrow icon nav that stays when the left panel is toggled closed.
 * Choosing a view switches the main panel and leaves the rail collapsed.
 */
export function CollapsedSidebar() {
  const { activeView, selectedGrouping, navigate, setSettingsOpen } = useUIStore();
  const selectedNoteId = useNoteStore((s) => s.selectedNoteId);

  return (
    <nav
      aria-label="Sidebar"
      style={{ width: COLLAPSED_NAV_WIDTH }}
      className="flex h-full shrink-0 flex-col border-r border-base-300 bg-base-100"
    >
      <div className="flex flex-col py-2">
        {VIEWS.map((view) => {
          const current = activeView === view.id;
          return (
            <button
              key={view.id}
              type="button"
              title={view.label}
              aria-label={view.label}
              aria-current={current ? "page" : undefined}
              onClick={() => navigate({ view: view.id, selectedNoteId, selectedGrouping })}
              className={`btn btn-ghost btn-xs btn-square w-full rounded-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
                current ? "text-base-content" : "opacity-40 hover:opacity-100"
              }`}
            >
              <Icon icon={view.icon} className="h-4 w-4" aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <div className="flex-1" />
      <div className="flex flex-col border-t border-base-300 py-2">
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          aria-label="Settings"
          className="btn btn-ghost btn-xs btn-square w-full rounded-none opacity-60 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
        >
          <Icon icon="uil:setting" className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
