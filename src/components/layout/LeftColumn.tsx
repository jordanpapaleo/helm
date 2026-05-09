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
      <div className="flex w-10 flex-col items-center border-r border-[var(--color-border)] py-2">
        {VIEWS.map((v) => (
          <button
            type="button"
            key={v.id}
            onClick={() => setView(v.id)}
            title={v.label}
            className={`mb-1 rounded p-2 transition-colors ${
              activeView === v.id
                ? "bg-[var(--color-surface)] text-[var(--color-text)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <Icon icon={v.icon} className="h-4 w-4" aria-hidden="true" />
          </button>
        ))}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          title="Settings"
          className="rounded p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
        >
          <Icon icon="uil:setting" className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="rounded p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          title="Expand sidebar"
        >
          <Icon icon="uil:arrow-right" className="h-4 w-4" aria-hidden="true" />
        </button>
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      </div>
    );
  }

  const vaultNavCls = (id: string) =>
    `group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
      activeVaultId === id
        ? "bg-[var(--color-surface)] text-[var(--color-text)]"
        : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
    }`;

  return (
    <div
      className="flex flex-col border-r border-[var(--color-border)]"
      style={{ width: "var(--sidebar-width)", minWidth: "var(--sidebar-width)" }}
    >
      {/* Search */}
      <div className="relative border-b border-[var(--color-border)] p-3">
        <input
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => search(e.target.value)}
          className="w-full rounded-md bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none"
        />
        {searchQuery && (
          <div className="absolute left-3 right-3 top-full z-50 mt-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] shadow-xl">
            {searchResults.length === 0 ? (
              <p className="px-3 py-2 text-sm text-[var(--color-text-muted)]">No results</p>
            ) : (
              searchResults.map((n) => (
                <button
                  type="button"
                  key={n.id}
                  onClick={() => {
                    selectNote(n.id);
                    setView("notes");
                    search("");
                  }}
                  className="flex w-full flex-col px-3 py-2 text-left hover:bg-[var(--color-surface)]"
                >
                  <span className="text-sm text-[var(--color-text)]">{n.frontmatter.title}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {n.frontmatter.tags.join(", ")}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col overflow-hidden p-2">
        {/* View nav */}
        <div className="mb-2">
          {VIEWS.map((v) => (
            <button
              type="button"
              key={v.id}
              onClick={() => setView(v.id)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                activeView === v.id
                  ? "bg-[var(--color-surface)] text-[var(--color-text)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              <Icon icon={v.icon} className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{v.label}</span>
            </button>
          ))}
        </div>

        {/* Vaults section */}
        <div className="mb-2 border-t border-[var(--color-border)] pt-2">
          <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] opacity-60">
            Vaults
          </p>
          {vaults.map((vault) => (
            <div key={vault.id} className={vaultNavCls(vault.id)}>
              <button
                type="button"
                className="flex flex-1 min-w-0 items-center gap-2 text-left"
                onClick={() => handleVaultClick(vault.id)}
              >
                <Icon
                  icon="uil:folder"
                  className="h-4 w-4 shrink-0 opacity-70"
                  aria-hidden="true"
                />
                <span className="flex-1 truncate">{vault.name}</span>
                <span className="text-xs opacity-40">
                  {notes.filter((n) => n.vaultId === vault.id).length}
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => handleRemoveVault(vault.id, e)}
                title="Remove vault"
                className="ml-1 shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
              >
                <Icon icon="uil:times" className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={handleAddVault}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <span className="text-base leading-none">+</span>
            <span>Add Vault</span>
          </button>
        </div>

        {/* File tree */}
        <div className="flex-1 overflow-hidden min-h-0 border-t border-[var(--color-border)] pt-2">
          {(() => {
            const activeVault = vaults.find((v) => v.id === activeVaultId) ?? vaults[0];
            return activeVault?.path ? (
              <FileTree notes={vaultFilteredNotes} vault={activeVault} />
            ) : null;
          })()}
        </div>
      </div>

      {/* Footer: settings + collapse */}
      <div className="border-t border-[var(--color-border)] px-3 py-2 flex items-center gap-2">
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          title="Settings"
          className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
        >
          <Icon icon="uil:setting" className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="Collapse sidebar"
          className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
        >
          <Icon icon="uil:arrow-left" className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
