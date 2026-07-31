import { Icon } from "@iconify/react";
import { confirm } from "@tauri-apps/plugin-dialog";
import React, { useMemo, useState } from "react";
import { ulid } from "ulid";
import { addVault, removeVault } from "../../hooks/useVault";
import { buildTree, type TreeNode } from "../../lib/file-tree";
import { serializeNote } from "../../lib/note-parser";
import { normalizeTagName, noteMatchesTag, tagMatches } from "../../lib/tags";
import { tauriCommands } from "../../lib/tauri-commands";
import { type TagNode, useNoteStore } from "../../store/notes";
import { reportError } from "../../store/toast";
import { useTrashStore } from "../../store/trash";
import { type Grouping, useUIStore, type View } from "../../store/ui";
import { SettingsModal } from "../settings/SettingsModal";
import { ContextMenu, type ContextMenuItem } from "../sidebar/ContextMenu";
import { RenameInput } from "../sidebar/RenameInput";

const VIEWS: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "uil:dashboard" },
  { id: "eisenhower", label: "Eisenhower", icon: "uil:apps" },
  { id: "kanban", label: "Kanban", icon: "uil:columns" },
  { id: "graph", label: "Link", icon: "uil:link" },
];

function FolderGroupings({
  depth = 0,
  nodes,
  noteCount,
  onContextMenu,
  onNavigate,
  newFolderParent,
  onCreateFolder,
  renamingFolderPath,
  onRenameCommit,
  onRenameCancel,
}: {
  depth?: number;
  nodes: TreeNode[];
  noteCount: (path: string) => number;
  onContextMenu: (e: React.MouseEvent, folderPath: string) => void;
  onNavigate: (grouping: Grouping) => void;
  newFolderParent: string | null;
  onCreateFolder: (parentPath: string, name: string) => void;
  renamingFolderPath: string | null;
  onRenameCommit: (oldPath: string, newName: string) => void;
  onRenameCancel: () => void;
}) {
  const { selectedGrouping } = useUIStore();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const folderNodes = nodes.filter(
    (n): n is Extract<TreeNode, { kind: "folder" }> => n.kind === "folder",
  );

  if (folderNodes.length === 0) return null;

  return (
    <>
      {folderNodes.map((node) => {
        const hasSubfolders = node.children.some((c) => c.kind === "folder");
        const isAddingChild = newFolderParent === node.path;
        // Expand a folder when it is the target of a new-subfolder input so the
        // input is visible, even if the folder currently has no subfolders.
        const isOpen = !collapsed.has(node.path) || isAddingChild;
        const isActive = selectedGrouping.type === "folder" && selectedGrouping.id === node.path;
        const count = noteCount(node.path);
        const isRenaming = renamingFolderPath === node.path;

        return (
          <React.Fragment key={node.path}>
            <li>
              {/* biome-ignore lint/a11y/noStaticElementInteractions: onContextMenu is a supplementary affordance; all primary actions are reachable via the buttons inside this row */}
              <div
                className={`flex w-full items-center gap-1 py-1 text-sm transition-colors ${
                  isActive
                    ? "bg-base-300 text-base-content"
                    : "text-base-content/60 hover:bg-base-200 hover:text-base-content"
                }`}
                style={{ paddingLeft: depth * 12 + 8 }}
                onContextMenu={(e) => onContextMenu(e, node.path)}
              >
                <button
                  type="button"
                  onClick={() => {
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      next.has(node.path) ? next.delete(node.path) : next.add(node.path);
                      return next;
                    });
                  }}
                  className="flex h-5 w-5 shrink-0 items-center justify-center"
                  aria-label={isOpen ? "Collapse" : "Expand"}
                >
                  {hasSubfolders && (
                    <Icon
                      icon="uil:angle-right"
                      className={`h-3 w-3 transition-transform ${isOpen ? "rotate-90" : ""}`}
                      aria-hidden="true"
                    />
                  )}
                </button>
                {isRenaming ? (
                  <div className="flex flex-1 min-w-0 items-center gap-1.5 pr-2">
                    <Icon
                      icon="uil:folder"
                      className="h-3.5 w-3.5 shrink-0 opacity-60"
                      aria-hidden="true"
                    />
                    <RenameInput
                      initial={node.name}
                      onCommit={(value) => onRenameCommit(node.path, value)}
                      onCancel={onRenameCancel}
                      className="flex-1 rounded bg-base-100 px-1 text-sm text-base-content outline outline-1 outline-primary"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onNavigate({ type: "folder", id: node.path })}
                    className="flex flex-1 min-w-0 items-center gap-1.5 pr-2"
                  >
                    <Icon
                      icon="uil:folder"
                      className="h-3.5 w-3.5 shrink-0 opacity-60"
                      aria-hidden="true"
                    />
                    <span className="flex-1 truncate text-left">{node.name}</span>
                    {count > 0 && <span className="shrink-0 text-xs opacity-40">{count}</span>}
                  </button>
                )}
              </div>
            </li>
            {isOpen && isAddingChild && (
              <li>
                <NewFolderRow onCommit={(name) => onCreateFolder(node.path, name)} />
              </li>
            )}
            {isOpen && hasSubfolders && (
              <FolderGroupings
                depth={depth + 1}
                nodes={node.children}
                noteCount={noteCount}
                onContextMenu={onContextMenu}
                onNavigate={onNavigate}
                newFolderParent={newFolderParent}
                onCreateFolder={onCreateFolder}
                renamingFolderPath={renamingFolderPath}
                onRenameCommit={onRenameCommit}
                onRenameCancel={onRenameCancel}
              />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}

function TagGroupings({
  tags,
  parentPath = "",
  depth = 0,
  onNavigate,
  onContextMenu,
  renamingTag,
  onRenameCommit,
  onRenameCancel,
}: {
  tags: Record<string, TagNode>;
  parentPath?: string;
  depth?: number;
  onNavigate: (grouping: Grouping) => void;
  onContextMenu: (e: React.MouseEvent, tagPath: string) => void;
  renamingTag: string | null;
  /** `newName` is the leaf name; the parent path is preserved by the caller. */
  onRenameCommit: (tagPath: string, newName: string) => void;
  onRenameCancel: () => void;
}) {
  const { selectedGrouping } = useUIStore();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const entries = Object.entries(tags).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return null;

  function totalNotes(node: TagNode): number {
    const childCount = Object.values(node.children).reduce(
      (sum, child) => sum + totalNotes(child),
      0,
    );
    return node.notes.length + childCount;
  }

  return (
    <>
      {entries.map(([name, node]) => {
        const fullPath = parentPath ? `${parentPath}/${name}` : name;
        const isActive = selectedGrouping.type === "tag" && selectedGrouping.id === fullPath;
        const hasChildren = Object.keys(node.children).length > 0;
        const isOpen = !collapsed.has(fullPath);
        const count = totalNotes(node);

        const isRenaming = renamingTag === fullPath;

        return (
          <React.Fragment key={fullPath}>
            <li>
              {/* biome-ignore lint/a11y/noStaticElementInteractions: onContextMenu is a supplementary affordance; all primary actions are reachable via the buttons inside this row */}
              <div
                className={`flex w-full items-center gap-1 py-1 text-sm transition-colors ${
                  isActive
                    ? "bg-base-300 text-base-content"
                    : "text-base-content/60 hover:bg-base-200 hover:text-base-content"
                }`}
                style={{ paddingLeft: depth * 12 + 8 }}
                onContextMenu={(e) => onContextMenu(e, fullPath)}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (hasChildren) {
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        next.has(fullPath) ? next.delete(fullPath) : next.add(fullPath);
                        return next;
                      });
                    }
                  }}
                  className="flex h-5 w-5 shrink-0 items-center justify-center"
                  aria-label={isOpen ? "Collapse" : "Expand"}
                >
                  {hasChildren && (
                    <Icon
                      icon="uil:angle-right"
                      className={`h-3 w-3 transition-transform ${isOpen ? "rotate-90" : ""}`}
                      aria-hidden="true"
                    />
                  )}
                </button>
                {isRenaming ? (
                  <div className="flex flex-1 min-w-0 items-center gap-1.5 pr-2">
                    <span className="text-base-content/40">#</span>
                    <RenameInput
                      initial={name}
                      onCommit={(value) => onRenameCommit(fullPath, value)}
                      onCancel={onRenameCancel}
                      className="flex-1 rounded bg-base-100 px-1 text-sm text-base-content outline outline-1 outline-primary"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onNavigate({ type: "tag", id: fullPath })}
                    className="flex flex-1 min-w-0 items-center gap-1.5 pr-2"
                  >
                    <span className="text-base-content/40">#</span>
                    <span className="flex-1 truncate text-left">{name}</span>
                    {count > 0 && <span className="shrink-0 text-xs opacity-40">{count}</span>}
                  </button>
                )}
              </div>
            </li>
            {isOpen && hasChildren && (
              <TagGroupings
                tags={node.children}
                parentPath={fullPath}
                depth={depth + 1}
                onNavigate={onNavigate}
                onContextMenu={onContextMenu}
                renamingTag={renamingTag}
                onRenameCommit={onRenameCommit}
                onRenameCancel={onRenameCancel}
              />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}

function NewFolderRow({ onCommit }: { onCommit: (name: string) => void }) {
  const committed = React.useRef(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);
  return (
    <div className="flex items-center gap-1.5 py-1" style={{ paddingLeft: 28 }}>
      <Icon icon="uil:folder" className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
      <input
        ref={inputRef}
        placeholder="folder name"
        className="flex-1 rounded bg-base-100 px-1 text-sm outline outline-1 outline-accent"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            committed.current = true;
            onCommit((e.target as HTMLInputElement).value.trim());
          }
          if (e.key === "Escape") {
            committed.current = true;
            onCommit("");
          }
          e.stopPropagation();
        }}
        onBlur={(e) => {
          if (!committed.current) onCommit(e.target.value.trim());
        }}
      />
    </div>
  );
}

type MenuState = { x: number; y: number; items: ContextMenuItem[] } | null;

export function LeftColumn() {
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);
  const [renamingFolderPath, setRenamingFolderPath] = useState<string | null>(null);
  const [renamingTag, setRenamingTag] = useState<string | null>(null);
  const [folderMenu, setFolderMenu] = useState<MenuState>(null);
  const {
    activeView,
    setView,
    selectedGrouping,
    setSelectedGrouping,
    sidebarCollapsed,
    setSidebarCollapsed,
    settingsOpen,
    setSettingsOpen,
    navigate,
  } = useUIStore();
  const {
    notes,
    vaults,
    activeVaultId,
    setActiveVaultId,
    knownFolderPaths,
    tagTree,
    selectedNoteId,
  } = useNoteStore();
  const trashCount = useTrashStore((s) => s.items.length);

  const activeVault = vaults.find((v) => v.id === activeVaultId) ?? vaults[0];

  const vaultFolderPaths = useMemo(
    () =>
      activeVault ? knownFolderPaths.filter((fp) => fp.startsWith(`${activeVault.path}/`)) : [],
    [knownFolderPaths, activeVault],
  );

  const vaultNotes = useMemo(
    () => (activeVaultId ? notes.filter((n) => n.vaultId === activeVaultId) : notes),
    [notes, activeVaultId],
  );

  const tree = useMemo(
    () => (activeVault ? buildTree(vaultNotes, activeVault.path, vaultFolderPaths) : []),
    [vaultNotes, activeVault, vaultFolderPaths],
  );

  function noteCount(folderPath: string) {
    const prefix = `${folderPath}/`;
    return vaultNotes.filter((n) => n.filePath.startsWith(prefix)).length;
  }

  function handleVaultClick(id: string) {
    setActiveVaultId(activeVaultId === id ? null : id);
    setSelectedGrouping({ type: "all", id: null });
    setView("notes");
  }

  async function handleAddVault() {
    try {
      const path = await tauriCommands.openFolderDialog();
      if (path) await addVault(path);
    } catch (e) {
      reportError("Failed to add vault", e);
    }
  }

  async function handleRemoveVault(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const vault = vaults.find((v) => v.id === id);
    const confirmed = await confirm(`Remove vault "${vault?.name}"? Notes on disk are untouched.`, {
      title: "Remove Vault",
      kind: "warning",
    });
    if (!confirmed) return;
    await removeVault(id);
  }

  async function handleCreateNoteInFolder(folderPath: string) {
    if (!activeVault) return;
    const id = ulid();
    const today = new Date().toISOString().split("T")[0];
    const slug = id.toLowerCase();
    const filePath = `${folderPath}/${slug}.md`;
    const note = {
      id,
      filePath,
      fileName: `${slug}.md`,
      content: "",
      vaultId: activeVault.id,
      frontmatter: {
        id,
        title: "Untitled",
        created: today,
        updated: today,
        tags: [],
        urgent: false,
        important: false,
        state: "Prepare" as const,
        blocked: false,
      },
    };
    try {
      await tauriCommands.writeNote(filePath, serializeNote(note));
      useNoteStore.getState().addNote(note);
      useNoteStore.getState().selectNote(id);
      setView("notes");
    } catch (e) {
      reportError("Failed to create note", e);
    }
  }

  // Single create-folder path shared by the root "New folder" button and the
  // per-folder "New Subfolder" action. Optimistically registers the new path in
  // the store so an empty folder shows immediately instead of waiting on the
  // filesystem watcher. Folder names are used raw (no slugify).
  async function handleCreateFolder(parentPath: string, name: string) {
    if (name) {
      const newPath = `${parentPath}/${name}`;
      try {
        await tauriCommands.createFolder(newPath);
        const { knownFolderPaths: known, setKnownFolderPaths } = useNoteStore.getState();
        if (!known.includes(newPath)) setKnownFolderPaths([...known, newPath]);
      } catch (e) {
        reportError("Failed to create folder", e);
      }
    }
    setNewFolderParent(null);
  }

  async function handleRenameFolder(oldPath: string, newName: string) {
    try {
      await useNoteStore.getState().renameFolder(oldPath, newName);
    } catch (e) {
      reportError("Failed to rename folder", e);
    }
    setRenamingFolderPath(null);
  }

  async function handleDeleteFolder(folderPath: string) {
    const name = folderPath.split("/").pop();
    const ok = await confirm(
      `Delete folder "${name}" and all its contents? This cannot be undone.`,
      { title: "Delete Folder", kind: "warning" },
    );
    if (!ok) return;
    const {
      notes: allNotes,
      selectedNoteId,
      selectNote: sel,
      removeNote,
    } = useNoteStore.getState();
    for (const n of allNotes) {
      if (n.filePath.startsWith(`${folderPath}/`)) {
        if (n.id === selectedNoteId) sel(null);
        removeNote(n.id);
      }
    }
    try {
      await tauriCommands.deleteFolder(folderPath);
    } catch (e) {
      reportError("Failed to delete folder", e);
    }
  }

  /**
   * Commit an inline tag rename. Like folder rename, the input holds the *leaf*
   * name, so the parent path is preserved: renaming the "project" row under
   * "work" to "alpha" produces "work/alpha". Descendants follow automatically
   * (see renameTag in the notes store).
   */
  async function handleRenameTag(tagPath: string, newLeafName: string) {
    setRenamingTag(null);
    const leaf = normalizeTagName(newLeafName);
    if (!leaf) return;
    const parent = tagPath.split("/").slice(0, -1).join("/");
    const newTag = parent ? `${parent}/${leaf}` : leaf;
    if (newTag === tagPath) return;

    try {
      await useNoteStore.getState().renameTag(tagPath, newTag);
    } catch (e) {
      reportError("Failed to rename tag", e);
      return;
    }

    // Follow the renamed tag if it (or one of its descendants) was selected.
    const current = useUIStore.getState().selectedGrouping;
    if (current.type === "tag" && current.id && tagMatches(current.id, tagPath)) {
      setSelectedGrouping({ type: "tag", id: newTag + current.id.slice(tagPath.length) });
    }
  }

  async function handleDeleteTag(tagPath: string) {
    const affected = useNoteStore.getState().notes.filter((n) => noteMatchesTag(n, tagPath)).length;
    const ok = await confirm(
      `Remove #${tagPath} — and any tags nested under it — from ${affected} note${
        affected === 1 ? "" : "s"
      }? The tag is deleted from the note text as well. This cannot be undone.`,
      { title: "Delete Tag", kind: "warning" },
    );
    if (!ok) return;

    try {
      await useNoteStore.getState().deleteTag(tagPath);
    } catch (e) {
      reportError("Failed to delete tag", e);
      return;
    }

    const current = useUIStore.getState().selectedGrouping;
    if (current.type === "tag" && current.id && tagMatches(current.id, tagPath)) {
      setSelectedGrouping({ type: "all", id: null });
    }
  }

  function handleTagContextMenu(e: React.MouseEvent, tagPath: string) {
    e.preventDefault();
    e.stopPropagation();
    setFolderMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          kind: "action",
          label: "Rename Tag",
          onClick: () => setRenamingTag(tagPath),
        },
        { kind: "separator" },
        {
          kind: "action",
          label: "Delete Tag",
          danger: true,
          onClick: () => handleDeleteTag(tagPath),
        },
      ],
    });
  }

  function handleFolderContextMenu(e: React.MouseEvent, folderPath: string) {
    e.preventDefault();
    e.stopPropagation();
    setFolderMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          kind: "action",
          label: "New Note Here",
          onClick: () => handleCreateNoteInFolder(folderPath),
        },
        {
          kind: "action",
          label: "New Subfolder",
          onClick: () => {
            setNewFolderParent(folderPath);
            setSelectedGrouping({ type: "folder", id: folderPath });
            setView("notes");
          },
        },
        {
          kind: "action",
          label: "Rename",
          onClick: () => setRenamingFolderPath(folderPath),
        },
        { kind: "separator" },
        {
          kind: "action",
          label: "Delete",
          danger: true,
          onClick: () => handleDeleteFolder(folderPath),
        },
      ],
    });
  }

  if (sidebarCollapsed) {
    return (
      <div className="flex w-10 flex-col border-r border-base-300">
        {/* View nav icons */}
        <div className="flex flex-col py-2">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                setSidebarCollapsed(false);
                navigate({ view: v.id, selectedNoteId, selectedGrouping });
              }}
              title={v.label}
              className={`btn btn-ghost btn-xs btn-square w-full rounded-none ${activeView === v.id ? "text-base-content" : "opacity-40 hover:opacity-100"}`}
            >
              <Icon icon={v.icon} className="h-4 w-4" aria-hidden="true" />
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Footer icons — same position as expanded state */}
        <div className="flex flex-col border-t border-base-300 py-2">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            className="btn btn-ghost btn-xs btn-square ml-2 opacity-60 hover:opacity-100"
          >
            <Icon icon="uil:setting" className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setSidebarCollapsed(false)}
            title="Expand sidebar"
            className="btn btn-ghost btn-xs btn-square ml-2 opacity-60 hover:opacity-100"
          >
            <Icon icon="uil:arrow-right" className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col border-r border-base-300"
      style={{ width: "var(--sidebar-width)", minWidth: "var(--sidebar-width)" }}
    >
      <div className="flex flex-1 flex-col overflow-hidden py-2">
        {/* View nav */}
        <ul className="mb-4">
          {VIEWS.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => navigate({ view: v.id, selectedNoteId, selectedGrouping })}
                className={`flex w-full items-center gap-2 px-2 py-1.5 text-sm transition-colors ${
                  activeView === v.id
                    ? "bg-base-300 text-base-content"
                    : "text-base-content/60 hover:bg-base-200 hover:text-base-content"
                }`}
              >
                <Icon icon={v.icon} className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{v.label}</span>
              </button>
            </li>
          ))}
        </ul>

        {/* Vaults */}
        <div className="mb-2 border-t border-base-300 pt-4">
          <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider opacity-40">
            Vaults
          </p>
          <ul>
            {vaults.map((vault) => (
              <li key={vault.id} className="group">
                <div
                  className={`flex items-center gap-2 px-2 py-1.5 text-sm transition-colors ${
                    activeVaultId === vault.id
                      ? "bg-base-300 text-base-content"
                      : "text-base-content/60 hover:bg-base-200 hover:text-base-content"
                  }`}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
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
                    className="btn btn-ghost btn-xs btn-square opacity-0 hover:text-error group-hover:opacity-100"
                  >
                    <Icon icon="uil:times" className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={handleAddVault}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-base-content/50 transition-colors hover:bg-base-200 hover:text-base-content"
              >
                <span className="text-base leading-none">+</span>
                <span>Add Vault</span>
              </button>
            </li>
          </ul>
        </div>

        {/* Folder groupings + Tags */}
        {activeVault && (
          <div className="flex-1 overflow-y-auto overflow-x-hidden border-t border-base-300 pt-2 min-h-0">
            {/* Folders header */}
            <div className="mb-1 flex items-center px-2">
              <span className="flex-1 text-xs font-semibold uppercase tracking-wider opacity-40">
                Folders
              </span>
              <button
                type="button"
                title="New folder"
                onClick={() => setNewFolderParent(activeVault.path)}
                className="btn btn-ghost btn-xs btn-square opacity-40 hover:opacity-100"
              >
                <Icon icon="uil:folder-plus" className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            <ul className="py-1">
              {/* All notes */}
              <li>
                <button
                  type="button"
                  onClick={() =>
                    navigate({
                      view: "notes",
                      selectedNoteId,
                      selectedGrouping: { type: "all", id: null },
                    })
                  }
                  className={`flex w-full items-center gap-2 px-2 py-1.5 text-sm transition-colors ${
                    selectedGrouping.type === "all" && activeView === "notes"
                      ? "bg-base-300 text-base-content"
                      : "text-base-content/60 hover:bg-base-200 hover:text-base-content"
                  }`}
                >
                  <span className="flex-1 text-left">All Notes</span>
                  <span className="text-xs opacity-40">{vaultNotes.length}</span>
                </button>
              </li>

              {/* New folder inline input (vault root) */}
              {newFolderParent === activeVault.path && (
                <li>
                  <NewFolderRow onCommit={(name) => handleCreateFolder(activeVault.path, name)} />
                </li>
              )}

              {/* Folder tree */}
              <FolderGroupings
                nodes={tree}
                noteCount={noteCount}
                onContextMenu={handleFolderContextMenu}
                onNavigate={(grouping) =>
                  navigate({ view: "notes", selectedNoteId, selectedGrouping: grouping })
                }
                newFolderParent={newFolderParent}
                onCreateFolder={handleCreateFolder}
                renamingFolderPath={renamingFolderPath}
                onRenameCommit={handleRenameFolder}
                onRenameCancel={() => setRenamingFolderPath(null)}
              />
            </ul>

            {/* Tags section */}
            {Object.keys(tagTree).length > 0 && (
              <>
                <p className="mb-1 mt-4 px-2 text-xs font-semibold uppercase tracking-wider opacity-40">
                  Tags
                </p>
                <ul className="py-1">
                  <TagGroupings
                    tags={tagTree}
                    onNavigate={(grouping) =>
                      navigate({ view: "notes", selectedNoteId, selectedGrouping: grouping })
                    }
                    onContextMenu={handleTagContextMenu}
                    renamingTag={renamingTag}
                    onRenameCommit={handleRenameTag}
                    onRenameCancel={() => setRenamingTag(null)}
                  />
                </ul>
              </>
            )}

            {/* Trash */}
            <div className="mt-4 border-t border-base-300 pt-2">
              <ul className="py-1">
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGrouping({ type: "trash", id: null });
                      setView("notes");
                    }}
                    className={`flex w-full items-center gap-2 px-2 py-1.5 text-sm transition-colors ${
                      selectedGrouping.type === "trash"
                        ? "bg-base-300 text-base-content"
                        : "text-base-content/60 hover:bg-base-200 hover:text-base-content"
                    }`}
                  >
                    <Icon
                      icon="uil:trash-alt"
                      className="h-4 w-4 shrink-0 opacity-60"
                      aria-hidden="true"
                    />
                    <span className="flex-1 text-left">Trash</span>
                    {trashCount > 0 && <span className="text-xs opacity-40">{trashCount}</span>}
                  </button>
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-col border-t border-base-300 py-2">
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          className="btn btn-ghost btn-xs btn-square ml-2 opacity-60 hover:opacity-100"
        >
          <Icon icon="uil:setting" className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setSidebarCollapsed(true)}
          title="Collapse sidebar"
          className="btn btn-ghost btn-xs btn-square ml-2 opacity-60 hover:opacity-100"
        >
          <Icon icon="uil:arrow-left" className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {folderMenu && (
        <ContextMenu
          x={folderMenu.x}
          y={folderMenu.y}
          items={folderMenu.items}
          onClose={() => setFolderMenu(null)}
        />
      )}
    </div>
  );
}
