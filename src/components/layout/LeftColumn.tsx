import { useState } from "react";
import { addVault, removeVault } from "../../hooks/useVault";
import { tauriCommands } from "../../lib/tauri-commands";
import { THEMES } from "../../lib/themes";
import { useNoteStore } from "../../store/notes";
import { useThemeStore } from "../../store/theme";
import { useUIStore, type View } from "../../store/ui";
import { SettingsModal } from "../settings/SettingsModal";
import { FileTree } from "../sidebar/FileTree";

const VIEWS: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "eisenhower", label: "Eisenhower", icon: "🎯" },
  { id: "kanban", label: "Kanban", icon: "📋" },
  { id: "graph", label: "Graph", icon: "🕸️" },
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
  const { theme, setTheme } = useThemeStore();

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
      <div className="flex w-10 flex-col justify-end border-r border-[var(--color-border)]">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="p-3 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          title="Expand sidebar"
        >
          →
        </button>
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
              <span>{v.icon}</span>
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
                <span className="shrink-0">📁</span>
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
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
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

      {/* Footer: theme picker + settings + collapse */}
      <div className="border-t border-[var(--color-border)] px-3 py-2 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-1.5">
          {THEMES.map((t) => (
            <button
              type="button"
              key={t.id}
              title={t.name}
              onClick={() => setTheme(t.id)}
              className="rounded-full transition-transform hover:scale-110"
              style={{
                width: 14,
                height: 14,
                background: t.swatch,
                outline: theme.id === t.id ? `2px solid ${t.swatch}` : "none",
                outlineOffset: 2,
              }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          title="Settings"
          className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="Collapse sidebar"
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          ←
        </button>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
