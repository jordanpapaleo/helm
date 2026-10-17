import { Icon } from "@iconify/react";
import { useLayoutStore } from "../../store/layout";
import { useUIStore } from "../../store/ui";

// Outline window/divider glyphs match the workspace they control and work offline.
function PanelIcon({ side }: { side: "left" | "right" }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d={side === "left" ? "M9 4v16" : "M15 4v16"} />
    </svg>
  );
}

export function AppToolbar({ left, right }: { left: boolean; right: boolean }) {
  const { goBack, goForward, navIndex, navHistory } = useUIStore();
  const toggle = useLayoutStore((s) => s.toggle);
  const macOS = /Mac/.test(navigator.platform);
  return (
    <div
      role="toolbar"
      aria-label="Workspace"
      data-tauri-drag-region
      className={`workspace-toolbar flex h-10 shrink-0 select-none items-center gap-1 border-b border-base-300 pr-2 ${macOS ? "pl-[84px]" : "pl-2"}`}
    >
      <button
        type="button"
        title="Toggle left panel"
        aria-label="Toggle left panel"
        aria-pressed={left}
        aria-controls="workspace-left"
        onClick={() => toggle("left", left)}
        className="workspace-toolbar-button mr-2"
      >
        <PanelIcon side="left" />
      </button>
      <button
        type="button"
        title="Back (⌘←)"
        aria-label="Back"
        disabled={navIndex <= 0}
        onClick={goBack}
        className="workspace-toolbar-button"
      >
        <Icon icon="uil:arrow-left" width={24} height={24} aria-hidden="true" />
      </button>
      <button
        type="button"
        title="Forward (⌘→)"
        aria-label="Forward"
        disabled={navIndex >= navHistory.length - 1}
        onClick={goForward}
        className="workspace-toolbar-button"
      >
        <Icon icon="uil:arrow-right" width={24} height={24} aria-hidden="true" />
      </button>
      <div data-tauri-drag-region className="h-full flex-1" />
      <button
        type="button"
        title="Toggle right panel"
        aria-label="Toggle right panel"
        aria-pressed={right}
        aria-controls="workspace-right"
        onClick={() => toggle("right", right)}
        className="workspace-toolbar-button"
      >
        <PanelIcon side="right" />
      </button>
    </div>
  );
}
