import { Icon } from "@iconify/react";
import { useState } from "react";
import { addVault, removeVault } from "../../hooks/useVault";
import { tauriCommands } from "../../lib/tauri-commands";
import { useNoteStore } from "../../store/notes";
import { useUIStore, type View } from "../../store/ui";
import { SettingsModal } from "../settings/SettingsModal";
import { FileTree } from "../sidebar/FileTree";

const VIEWS: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "uil:dashboard" },
  { id: "eisenhower", label: "Eisenhower", icon: "uil:apps" },
  { id: "kanban", label: "Kanban", icon: "uil:columns" },
  { id: "graph", label: "Link", icon: "uil:link" },
];

export function LeftColumn() {
  const [collapsed, setCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { activeView, setView } = useUIStore();
  const {
    notes,
    searchQuery,
    searchResults,
    search,
    vaults,
    activeVaultId,
    setActiveVaultId,
    selectNote,
  } = useNoteStore();

  const vaultFilteredNotes = activeVaultId
    ? notes.filter((n) => n.vaultId === activeVaultId)
    : notes;

  function handleVaultClick(id: string) {
    setActiveVaultId(activeVaultId === id ? null : id);
  }

  async function handleAddVault() {
    try {
      const path = await tauriCommands.openFolderDialog();
      if (path) await addVault(path);
    } catch (e) {
      console.error("Failed to add vault:", e);
    }
  }

  async function handleRemoveVault(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const { confirm } = await import("@tauri-apps/plugin-dialog");
    const vault = vaults.find((v) => v.id === id);
    const confirmed = await confirm(`Remove vault "${vault?.name}"? Notes on disk are untouched.`, {
      title: "Remove Vault",
      kind: "warning",
    });
    if (!confirmed) return;
    await removeVault(id);
  }

  if (collapsed) {
    return (
      <div className="flex w-10 flex-col items-center border-r border-base-300 py-2">
        <ul className="menu menu-xs px-0">
          {VIEWS.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => setView(v.id)}
                title={v.label}
                className={activeView === v.id ? "active" : ""}
              >
                <Icon icon={v.icon} className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          title="Settings"
          className="btn btn-ghost btn-xs btn-square"
        >
          <Icon icon="uil:setting" className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Expand sidebar"
          className="btn btn-ghost btn-xs btn-square"
        >
          <Icon icon="uil:arrow-right" className="h-4 w-4" aria-hidden="true" />
        </button>
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col border-r border-base-300"
      style={{ width: "var(--sidebar-width)", minWidth: "var(--sidebar-width)" }}
    >
      {/* Search */}
      <div className="relative border-b border-base-300 p-3">
        <input
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => search(e.target.value)}
          className="input input-ghost input-sm w-full"
        />
        {searchQuery && (
          <div className="absolute left-3 right-3 top-full z-50 mt-1 rounded-md border border-base-300 bg-base-100 shadow-xl">
            {searchResults.length === 0 ? (
              <p className="px-3 py-2 text-sm opacity-50">No results</p>
            ) : (
              <ul className="menu menu-sm">
                {searchResults.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        selectNote(n.id);
                        setView("notes");
                        search("");
                      }}
                      className="flex-col items-start"
                    >
                      <span className="text-sm">{n.frontmatter.title}</span>
                      {n.frontmatter.tags.length > 0 && (
                        <span className="text-xs opacity-50">{n.frontmatter.tags.join(", ")}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col overflow-hidden p-2">
        {/* View nav */}
        <ul className="menu menu-sm mb-2 px-0">
          {VIEWS.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => setView(v.id)}
                className={activeView === v.id ? "active" : ""}
              >
                <Icon icon={v.icon} className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{v.label}</span>
              </button>
            </li>
          ))}
        </ul>

        {/* Vaults section */}
        <div className="mb-2 border-t border-base-300 pt-2">
          <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider opacity-40">
            Vaults
          </p>
          <ul className="menu menu-sm px-0">
            {vaults.map((vault) => (
              <li key={vault.id} className="group">
                <div className={activeVaultId === vault.id ? "active" : ""}>
                  <button
                    type="button"
                    className="flex flex-1 min-w-0 items-center gap-2 text-left"
                    onClick={() => handleVaultClick(vault.id)}
                  >
                    <Icon icon="uil:folder" className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" />
                    <span className="flex-1 truncate">{vault.name}</span>
                    <span className="text-xs opacity-40">
                      {notes.filter((n) => n.vaultId === vault.id).length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleRemoveVault(vault.id, e)}
                    title="Remove vault"
                    className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100 hover:text-error"
                  >
                    <Icon icon="uil:times" className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
            <li>
              <button type="button" onClick={handleAddVault} className="opacity-50 hover:opacity-100">
                <span className="text-base leading-none">+</span>
                <span>Add Vault</span>
              </button>
            </li>
          </ul>
        </div>

        {/* File tree */}
        <div className="flex-1 overflow-hidden min-h-0 border-t border-base-300 pt-2">
          {(() => {
            const activeVault = vaults.find((v) => v.id === activeVaultId) ?? vaults[0];
            return activeVault?.path ? (
              <FileTree notes={vaultFilteredNotes} vault={activeVault} />
            ) : null;
          })()}
        </div>
      </div>

      {/* Footer: settings + collapse */}
      <div className="border-t border-base-300 px-3 py-2 flex items-center gap-2">
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          title="Settings"
          className="btn btn-ghost btn-xs btn-square"
        >
          <Icon icon="uil:setting" className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="Collapse sidebar"
          className="btn btn-ghost btn-xs btn-square"
        >
          <Icon icon="uil:arrow-left" className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
