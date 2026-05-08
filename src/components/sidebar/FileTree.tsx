import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import React, { useMemo, useState } from "react";
import { ulid } from "ulid";
import { buildTree, getAllFolderPaths, type TreeNode } from "../../lib/file-tree";
import { serializeNote, slugify } from "../../lib/note-parser";
import { tauriCommands } from "../../lib/tauri-commands";
import { useNoteStore } from "../../store/notes";
import { useUIStore } from "../../store/ui";
import type { Note, VaultConfig } from "../../types/note";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";

interface Props {
  notes: Note[];
  vault: VaultConfig;
}

function NewFolderInput({ onCommit }: { onCommit: (name: string) => void }) {
  const committed = React.useRef(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);
  return (
    <div style={{ paddingLeft: 8 }} className="flex items-center gap-1.5 py-1 pr-2">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-3.5 w-3.5 shrink-0 opacity-60"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
      <input
        ref={inputRef}
        placeholder="folder name"
        className="flex-1 rounded bg-[var(--color-bg)] px-1 text-sm text-[var(--color-text)] outline outline-1 outline-[var(--color-accent)]"
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

function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const committed = React.useRef(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  return (
    <input
      ref={inputRef}
      defaultValue={initial}
      className="flex-1 rounded bg-[var(--color-bg)] px-1 text-sm text-[var(--color-text)] outline outline-1 outline-[var(--color-accent)]"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          committed.current = true;
          onCommit((e.target as HTMLInputElement).value.trim());
        }
        if (e.key === "Escape") {
          committed.current = true;
          onCancel();
        }
        e.stopPropagation();
      }}
      onBlur={(e) => {
        if (!committed.current) onCommit(e.target.value.trim());
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

// Standalone component so useDraggable can be called as a proper React hook.
function NoteItem({
  note,
  depth,
  isSelected,
  isRenaming,
  onOpen,
  onContextMenu,
  onRenameCommit,
  onRenameCancel,
}: {
  note: Note;
  depth: number;
  isSelected: boolean;
  isRenaming: boolean;
  onOpen: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onRenameCommit: (v: string) => void;
  onRenameCancel: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: note.filePath, // filePaths are always unique; note.id can be empty
    data: { note },
  });

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: dnd-kit spreads role, tabIndex, and onKeyDown via {...attributes} and {...listeners}
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handler provided by dnd-kit {...listeners}
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ paddingLeft: depth * 12 + 8, opacity: isDragging ? 0.4 : 1 }}
      className={`group flex items-center gap-1.5 rounded-md py-1 pr-2 text-sm transition-colors cursor-pointer ${
        isSelected
          ? "bg-[var(--color-surface)] text-[var(--color-text)]"
          : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
      }`}
      onClick={() => {
        if (!isRenaming) onOpen();
      }}
      onContextMenu={onContextMenu}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-3.5 w-3.5 shrink-0 opacity-50"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      {isRenaming ? (
        <RenameInput
          initial={note.frontmatter.title}
          onCommit={onRenameCommit}
          onCancel={onRenameCancel}
        />
      ) : (
        <span className="flex-1 truncate">{note.frontmatter.title || note.fileName}</span>
      )}
      {note.frontmatter.pinned && !isRenaming && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-3 w-3 shrink-0 opacity-40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <line x1="12" y1="17" x2="12" y2="22" />
          <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
        </svg>
      )}
    </div>
  );
}

// Standalone component so useDroppable can be called as a proper React hook.
function FolderItem({
  node,
  depth,
  isOpen,
  isRenaming,
  onToggle,
  onContextMenu,
  onRenameCommit,
  onRenameCancel,
  children,
}: {
  node: Extract<TreeNode, { kind: "folder" }>;
  depth: number;
  isOpen: boolean;
  isRenaming: boolean;
  onToggle: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onRenameCommit: (v: string) => void;
  onRenameCancel: () => void;
  children?: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `folder-${node.path}`,
    data: { folderPath: node.path },
  });

  return (
    <div ref={setNodeRef}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: folder row is a nav element; keyboard users use context menu via keyboard shortcut */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: folder toggle is pointer-driven navigation within the file tree */}
      <div
        style={{ paddingLeft: depth * 12 + 8 }}
        className={`group flex items-center gap-1.5 rounded-md py-1 pr-2 text-sm cursor-pointer transition-colors ${
          isOver
            ? "bg-[var(--color-accent)] text-white"
            : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
        }`}
        onClick={onToggle}
        onContextMenu={onContextMenu}
      >
        {/* Chevron rotates 90° when the folder is open */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-3 w-3 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-3.5 w-3.5 shrink-0 opacity-60"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        {isRenaming ? (
          <RenameInput initial={node.name} onCommit={onRenameCommit} onCancel={onRenameCancel} />
        ) : (
          <span className="flex-1 truncate">{node.name}</span>
        )}
      </div>
      {isOpen && children}
    </div>
  );
}

// Drop target for the vault root — dropping here moves a note out of any subfolder.
function VaultRootDrop({ vaultPath, children }: { vaultPath: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `folder-${vaultPath}`,
    data: { folderPath: vaultPath },
  });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 overflow-y-auto py-1 min-h-0 rounded transition-colors ${isOver ? "ring-1 ring-[var(--color-accent)]" : ""}`}
    >
      {children}
    </div>
  );
}

type MenuState = { x: number; y: number; items: ContextMenuItem[] } | null;

export function FileTree({ notes, vault }: Props) {
  const { selectedNoteId, selectNote, knownFolderPaths } = useNoteStore();
  const { setView } = useUIStore();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);

  // Only pass folder paths that belong to this vault
  const vaultFolderPaths = useMemo(
    () => knownFolderPaths.filter((fp) => fp.startsWith(`${vault.path}/`)),
    [knownFolderPaths, vault.path],
  );

  const tree = useMemo(
    () => buildTree(notes, vault.path, vaultFolderPaths),
    [notes, vault.path, vaultFolderPaths],
  );
  const allFolders = useMemo(() => getAllFolderPaths(tree, vault.path), [tree, vault.path]);

  async function handleCreateNote(folderPath: string) {
    const id = ulid();
    const slug = `untitled-${id.slice(-8).toLowerCase()}`;
    const filePath = `${folderPath}/${slug}.md`;
    const fileName = `${slug}.md`;
    const today = new Date().toISOString().split("T")[0];

    const note: Note = {
      id,
      filePath,
      fileName,
      content: "",
      vaultId: vault.id,
      frontmatter: {
        id,
        title: "Untitled",
        created: today,
        updated: today,
        tags: [],
        urgent: false,
        important: false,
        state: "Prepare",
        blocked: false,
      },
    };

    try {
      await tauriCommands.writeNote(filePath, serializeNote(note));
      useNoteStore.getState().addNote(note);
      selectNote(id);
      setView("notes");
    } catch (e) {
      console.error("Failed to create note:", e);
    }
  }

  async function handlePinToggle(note: Note) {
    const updated: Note = {
      ...note,
      frontmatter: { ...note.frontmatter, pinned: !note.frontmatter.pinned },
    };
    try {
      await tauriCommands.writeNote(note.filePath, serializeNote(updated));
      useNoteStore.getState().updateNote(updated);
    } catch (e) {
      console.error("Failed to toggle pin:", e);
    }
  }

  async function handleRenameNote(note: Note, newTitle: string) {
    if (!newTitle || newTitle === note.frontmatter.title) {
      setRenamingPath(null);
      return;
    }
    const folder = note.filePath.split("/").slice(0, -1).join("/");
    const newFileName = `${slugify(newTitle)}.md`;
    const newFilePath = `${folder}/${newFileName}`;
    const updated: Note = {
      ...note,
      filePath: newFilePath,
      fileName: newFileName,
      frontmatter: { ...note.frontmatter, title: newTitle },
    };
    try {
      await tauriCommands.renameNote(note.filePath, newFilePath);
      await tauriCommands.writeNote(newFilePath, serializeNote(updated));
      useNoteStore.getState().updateNote(updated);
    } catch (e) {
      console.error("Failed to rename note:", e);
    }
    setRenamingPath(null);
  }

  async function handleDeleteNote(note: Note) {
    const ok = await confirm(
      `Delete "${note.frontmatter.title || "Untitled"}"? This cannot be undone.`,
      { title: "Delete Note", kind: "warning" },
    );
    if (!ok) return;
    if (note.id === selectedNoteId) selectNote(null);
    useNoteStore.getState().removeNote(note.id);
    try {
      await tauriCommands.deleteNote(note.filePath);
    } catch (e) {
      console.error("Failed to delete note:", e);
    }
  }

  async function handleRenameFolder(folderPath: string, newName: string) {
    if (!newName) {
      setRenamingPath(null);
      return;
    }
    const parent = folderPath.split("/").slice(0, -1).join("/");
    const newPath = `${parent}/${newName}`;
    try {
      await tauriCommands.renameFolder(folderPath, newPath);
      // Update filePaths of all affected notes in the store
      const { notes: allNotes } = useNoteStore.getState();
      for (const n of allNotes) {
        if (n.filePath.startsWith(`${folderPath}/`)) {
          const updatedNote = {
            ...n,
            filePath: newPath + n.filePath.slice(folderPath.length),
          };
          useNoteStore.getState().updateNote(updatedNote);
        }
      }
      // Update collapsed set: replace old path with new path (preserving collapsed state)
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(folderPath)) {
          next.delete(folderPath);
          next.add(newPath);
        }
        return next;
      });
    } catch (e) {
      console.error("Failed to rename folder:", e);
    }
    setRenamingPath(null);
  }

  async function handleDeleteFolder(folderPath: string) {
    const name = folderPath.split("/").pop();
    const ok = await confirm(
      `Delete folder "${name}" and all its contents? This cannot be undone.`,
      { title: "Delete Folder", kind: "warning" },
    );
    if (!ok) return;
    // Remove notes in this folder from store
    const { notes: allNotes } = useNoteStore.getState();
    for (const n of allNotes) {
      if (n.filePath.startsWith(`${folderPath}/`)) {
        if (n.id === selectedNoteId) selectNote(null);
        useNoteStore.getState().removeNote(n.id);
      }
    }
    try {
      await tauriCommands.deleteFolder(folderPath);
    } catch (e) {
      console.error("Failed to delete folder:", e);
    }
  }

  async function handleMoveNote(note: Note, targetFolderPath: string) {
    const newFilePath = `${targetFolderPath}/${note.fileName}`;
    if (newFilePath === note.filePath) return;
    try {
      await tauriCommands.renameNote(note.filePath, newFilePath);
      useNoteStore.getState().updateNote({ ...note, filePath: newFilePath });
    } catch (e) {
      console.error("Failed to move note:", e);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const note = active.data.current?.note as Note | undefined;
    const targetFolderPath = over.data.current?.folderPath as string | undefined;
    if (!note || !targetFolderPath) return;
    // Avoid a no-op move when the note is already in the target folder
    const currentFolder = note.filePath.split("/").slice(0, -1).join("/");
    if (currentFolder === targetFolderPath) return;
    await handleMoveNote(note, targetFolderPath);
  }

  function toggleFolder(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }

  function openNote(note: Note) {
    selectNote(note.id);
    setView("notes");
  }

  // Thin wrapper — NoteItem is a proper component so useDraggable works inside it.
  function renderNote(note: Note, depth: number) {
    return (
      <NoteItem
        note={note}
        depth={depth}
        isSelected={note.id === selectedNoteId}
        isRenaming={renamingPath === note.filePath}
        onOpen={() => openNote(note)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenu({
            x: e.clientX,
            y: e.clientY,
            items: [
              { kind: "action", label: "Open", onClick: () => openNote(note) },
              {
                kind: "action",
                label: "New Note Here",
                onClick: () => {
                  const folder = note.filePath.split("/").slice(0, -1).join("/");
                  handleCreateNote(folder);
                },
              },
              {
                kind: "action",
                label: note.frontmatter.pinned ? "Unpin" : "Pin",
                onClick: () => handlePinToggle(note),
              },
              { kind: "action", label: "Rename", onClick: () => setRenamingPath(note.filePath) },
              {
                kind: "submenu",
                label: "Move to\u2026",
                items: allFolders.map((f) => ({
                  label: f.label,
                  onClick: () => handleMoveNote(note, f.path),
                })),
              },
              { kind: "separator" },
              {
                kind: "action",
                label: "Delete",
                danger: true,
                onClick: () => handleDeleteNote(note),
              },
            ],
          });
        }}
        onRenameCommit={(v) => handleRenameNote(note, v)}
        onRenameCancel={() => setRenamingPath(null)}
      />
    );
  }

  // Thin wrapper — FolderItem is a proper component so useDroppable works inside it.
  function renderFolder(node: Extract<TreeNode, { kind: "folder" }>, depth: number) {
    const isOpen = !collapsed.has(node.path);
    return (
      <FolderItem
        node={node}
        depth={depth}
        isOpen={isOpen}
        isRenaming={renamingPath === node.path}
        onToggle={() => toggleFolder(node.path)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenu({
            x: e.clientX,
            y: e.clientY,
            items: [
              {
                kind: "action",
                label: "New Note Here",
                onClick: () => handleCreateNote(node.path),
              },
              {
                kind: "action",
                label: "New Subfolder",
                onClick: () => {
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    next.delete(node.path); // ensure parent is open
                    return next;
                  });
                  setNewFolderParent(node.path);
                },
              },
              { kind: "action", label: "Rename", onClick: () => setRenamingPath(node.path) },
              { kind: "separator" },
              {
                kind: "action",
                label: "Delete",
                danger: true,
                onClick: () => handleDeleteFolder(node.path),
              },
            ],
          });
        }}
        onRenameCommit={(v) => handleRenameFolder(node.path, v)}
        onRenameCancel={() => setRenamingPath(null)}
      >
        {newFolderParent === node.path && (
          <NewFolderInput
            onCommit={async (name) => {
              if (name) {
                try {
                  await tauriCommands.createFolder(`${node.path}/${name}`);
                } catch (e) {
                  console.error("Failed to create folder:", e);
                }
              }
              setNewFolderParent(null);
            }}
          />
        )}
        {node.children.map((child) => renderNode(child, depth + 1))}
      </FolderItem>
    );
  }

  function renderNode(node: TreeNode, depth = 0): React.ReactNode {
    if (node.kind === "folder") {
      return <React.Fragment key={node.path}>{renderFolder(node, depth)}</React.Fragment>;
    }
    return <React.Fragment key={node.note.filePath}>{renderNote(node.note, depth)}</React.Fragment>;
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="relative flex flex-col min-h-0 h-full">
        {/* Toolbar — New Note and New Folder buttons */}
        <div className="flex items-center justify-between px-2 py-1.5 border-b border-[var(--color-border)]">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] opacity-60">
            Files
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              title="New Note"
              className="rounded p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
              onClick={() => handleCreateNote(vault.path)}
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
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            </button>
            <button
              type="button"
              title="New Folder"
              className="rounded p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
              onClick={() => setNewFolderParent(vault.path)}
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
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                <line x1="12" y1="11" x2="12" y2="17" />
                <line x1="9" y1="14" x2="15" y2="14" />
              </svg>
            </button>
          </div>
        </div>

        <VaultRootDrop vaultPath={vault.path}>
          {newFolderParent === vault.path && (
            <NewFolderInput
              onCommit={async (name) => {
                if (name) {
                  try {
                    await tauriCommands.createFolder(`${vault.path}/${name}`);
                  } catch (e) {
                    console.error("Failed to create folder:", e);
                  }
                }
                setNewFolderParent(null);
              }}
            />
          )}
          {tree.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[var(--color-text-muted)]">No notes</p>
          ) : (
            tree.map((node) => renderNode(node))
          )}
        </VaultRootDrop>

        {/* Context Menu — rendered at fixed position within this container */}
        {menu && (
          <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
        )}
      </div>
    </DndContext>
  );
}
