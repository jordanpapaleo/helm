import type { DragEndEvent } from "@dnd-kit/dom";
import { KeyboardSensor, PointerActivationConstraints, PointerSensor } from "@dnd-kit/dom";
import { DragDropProvider, useDraggable, useDroppable } from "@dnd-kit/react";
import { Icon } from "@iconify/react";
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

const sensors = [
  PointerSensor.configure({
    activationConstraints(event) {
      if (event.pointerType === "touch") {
        return [new PointerActivationConstraints.Delay({ value: 250, tolerance: 5 })];
      }
      return [new PointerActivationConstraints.Distance({ value: 5 })];
    },
  }),
  KeyboardSensor,
];

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
      <Icon icon="uil:folder" className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
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
  const { ref, isDragSource } = useDraggable({
    id: note.filePath, // filePaths are always unique; note.id can be empty
    data: { note },
  });

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: drag-and-drop file tree item
    // biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop file tree item
    <div
      ref={ref}
      style={{ paddingLeft: depth * 12 + 8, opacity: isDragSource ? 0.4 : 1 }}
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
      <Icon icon="uil:file" className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
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
        <Icon icon="uil:map-pin" className="h-3 w-3 shrink-0 opacity-40" aria-hidden="true" />
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
  const { ref, isDropTarget } = useDroppable({
    id: `folder-${node.path}`,
    data: { folderPath: node.path },
  });

  return (
    <div ref={ref}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: folder row is a nav element; keyboard users use context menu via keyboard shortcut */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: folder toggle is pointer-driven navigation within the file tree */}
      <div
        style={{ paddingLeft: depth * 12 + 8 }}
        className={`group flex items-center gap-1.5 rounded-md py-1 pr-2 text-sm cursor-pointer transition-colors ${
          isDropTarget
            ? "bg-[var(--color-accent)] text-white"
            : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
        }`}
        onClick={onToggle}
        onContextMenu={onContextMenu}
      >
        {/* Chevron rotates 90° when the folder is open */}
        <Icon
          icon="uil:angle-right"
          className={`h-3 w-3 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
          aria-hidden="true"
        />
        <Icon icon="uil:folder" className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
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
  const { ref, isDropTarget } = useDroppable({
    id: `folder-${vaultPath}`,
    data: { folderPath: vaultPath },
  });
  return (
    <div
      ref={ref}
      className={`flex-1 overflow-y-auto py-1 min-h-0 rounded transition-colors ${isDropTarget ? "ring-1 ring-[var(--color-accent)]" : ""}`}
    >
      {children}
    </div>
  );
}

type MenuState = { x: number; y: number; items: ContextMenuItem[] } | null;

function isNote(value: unknown): value is Note {
  return (
    typeof value === "object" &&
    value !== null &&
    "filePath" in value &&
    "id" in value &&
    "frontmatter" in value
  );
}

export function FileTree({ notes, vault }: Props) {
  const { selectedNoteId, selectNote, knownFolderPaths, addNote, updateNote, removeNote } =
    useNoteStore();
  const { setView } = useUIStore();
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
    const slug = id.toLowerCase();
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
      addNote(note);
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
      updateNote(updated);
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
      updateNote(updated);
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
    removeNote(note.id);
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
          updateNote(updatedNote);
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
        removeNote(n.id);
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
      updateNote({ ...note, filePath: newFilePath });
    } catch (e) {
      console.error("Failed to move note:", e);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    if (event.canceled) return;
    const { source, target } = event.operation;
    const note = source?.data?.note;
    const targetFolderPath = target?.data?.folderPath;
    if (!isNote(note) || typeof targetFolderPath !== "string") return;
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
    <DragDropProvider sensors={sensors} onDragEnd={handleDragEnd}>
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
              <Icon icon="uil:file-medical" className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              title="New Folder"
              className="rounded p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
              onClick={() => setNewFolderParent(vault.path)}
            >
              <Icon icon="uil:folder-plus" className="h-3.5 w-3.5" aria-hidden="true" />
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
    </DragDropProvider>
  );
}
