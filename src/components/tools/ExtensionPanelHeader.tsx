import { Icon } from "@iconify/react";
import { useRef, useState } from "react";
import { useExtensionsStore } from "../../store/extensions";
import { useToolsStore } from "../../store/tools";
import { useUIStore } from "../../store/ui";
import { ContextMenu } from "../sidebar/ContextMenu";
import { ConnectionStatus } from "./ConnectionStatus";
import type { ToolExtension } from "./extensions";

/** Meta chrome shared by every extension panel. The panel body below it is extension-specific. */
export function ExtensionPanelHeader({ extension }: { extension: ToolExtension }) {
  const { id, name, icon } = extension;
  const connected = useExtensionsStore((state) => state.connected[id]);
  const { mode, model } = useExtensionsStore((state) => state.settings[id]);
  const trigger = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  function openMenu() {
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) setMenu({ x: rect.left, y: rect.bottom });
  }

  function closeMenu() {
    setMenu(null);
    trigger.current?.focus();
  }

  return (
    <div className="flex shrink-0 items-start gap-2 border-b border-base-300 px-3 py-2">
      <Icon icon={icon} className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-medium">{name}</h2>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs opacity-70">
          <ConnectionStatus connected={connected} /> <span aria-hidden="true">·</span>{" "}
          <span>{mode === "api" ? "API key" : "Subscription"}</span>{" "}
          <span aria-hidden="true">·</span>{" "}
          <span className="min-w-0 break-all">{model || "client default model"}</span>
        </p>
      </div>
      <button
        ref={trigger}
        type="button"
        className="workspace-toolbar-button -mr-1"
        aria-label={`${name} options`}
        title={`${name} options`}
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        onMouseDown={(event) => {
          // Keep the menu's outside-click handler from closing it before this click toggles it.
          if (menu) event.stopPropagation();
        }}
        onClick={() => (menu ? closeMenu() : openMenu())}
      >
        <Icon icon="uil:ellipsis-v" className="h-4 w-4" aria-hidden="true" />
      </button>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
          items={[
            {
              kind: "action",
              label: "Tool settings",
              onClick: () => {
                useToolsStore.getState().showToolsSettings(id);
                useUIStore.getState().setSettingsOpen(true);
              },
            },
            {
              kind: "action",
              label: "Hide from toolbar",
              onClick: () => useExtensionsStore.getState().setEnabled(id, false),
            },
          ]}
        />
      )}
    </div>
  );
}
