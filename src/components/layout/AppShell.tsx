import { useEffect, useRef, useState } from "react";
import { type Panel, workspaceGeometry } from "../../lib/workspace-layout";
import { useLayoutStore } from "../../store/layout";
import { useUIStore } from "../../store/ui";
import { SettingsModal } from "../settings/SettingsModal";
import { GlobalNewNoteMenu } from "../sidebar/NewNoteMenu";
import { AppToolbar } from "./AppToolbar";
import { LeftColumn } from "./LeftColumn";
import { MainPanel } from "./MainPanel";
import { NoteListPanel } from "./NoteListPanel";
import { PanelSeparator } from "./PanelSeparator";
import { RightPanel } from "./RightPanel";

const SKIPPED_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function AppShell() {
  const { activeView, goBack, goForward, settingsOpen, setSettingsOpen } = useUIStore();
  const { preferences, priority, resize } = useLayoutStore();
  const workspace = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(window.innerWidth);
  const [preview, setPreview] = useState<Partial<Record<Panel, number>>>({});
  useEffect(() => {
    const element = workspace.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const geometry = workspaceGeometry(
    width,
    activeView === "notes",
    {
      ...preferences,
      widths: { ...preferences.widths, ...preview },
    },
    priority,
  );
  function separator(panel: Panel) {
    return (
      <PanelSeparator
        panel={panel}
        width={geometry.widths[panel]}
        max={geometry.widths[panel] + Math.max(0, geometry.center - 320)}
        onCommit={(value) => resize(panel, value)}
        onPreview={(value) =>
          setPreview((previous) => {
            const next = { ...previous };
            if (value === null) delete next[panel];
            else next[panel] = value;
            return next;
          })
        }
      />
    );
  }

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
    <div className="flex h-screen min-w-0 flex-col overflow-hidden bg-[var(--color-bg)]">
      <AppToolbar left={geometry.left} right={geometry.right} />
      <div ref={workspace} className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div
          id="workspace-left"
          hidden={!geometry.left}
          className="flex min-h-0 shrink-0 overflow-hidden"
        >
          {geometry.left && (
            <>
              <div style={{ width: geometry.widths.navigation }} className="min-h-0 shrink-0">
                <LeftColumn />
              </div>
              {separator("navigation")}
              {activeView === "notes" && (
                <>
                  <div
                    style={{ width: geometry.widths.notes }}
                    className="min-h-0 shrink-0 overflow-hidden"
                  >
                    <NoteListPanel />
                  </div>
                  {separator("notes")}
                </>
              )}
            </>
          )}
        </div>
        <MainPanel />
        {geometry.right && separator("right")}
        <aside
          id="workspace-right"
          aria-label="Extension panel"
          hidden={!geometry.right}
          style={{ width: geometry.right ? geometry.widths.right : 0 }}
          className="min-h-0 shrink-0 overflow-hidden bg-base-100"
        >
          <RightPanel />
        </aside>
      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      <GlobalNewNoteMenu />
    </div>
  );
}
