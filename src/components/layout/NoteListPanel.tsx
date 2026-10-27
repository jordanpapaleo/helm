import { Icon } from "@iconify/react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { useMemo, useState } from "react";
import { isArchived } from "../../lib/archive";
import { UNMANAGED_CLEARED_FIELDS } from "../../lib/constants";
import { createNote, creationTargetFromUI } from "../../lib/create-note";
import { buildTree, getAllFolderPaths } from "../../lib/file-tree";
import { writeNoteDrag } from "../../lib/note-drag";
import { moveNoteToFolder } from "../../lib/note-drop";
import { notesForList, trashForList } from "../../lib/note-list";
import { serializeNote } from "../../lib/note-parser";
import { moveNoteToCategory } from "../../lib/project-actions";
import { moveDestinations, PROJECT_CATEGORIES, projectForPath } from "../../lib/projects";
import { planTrashRestore, reportPathCollisions } from "../../lib/restore-trash";
import { tauriCommands } from "../../lib/tauri-commands";
import { nowTimestamp, timestampDate } from "../../lib/timestamps";
import { useNoteStore } from "../../store/notes";
import { useProjectStore } from "../../store/projects";
import { useSettingsStore } from "../../store/settings";
import { reportError } from "../../store/toast";
import { useTrashStore } from "../../store/trash";
import { useUIStore } from "../../store/ui";
import type { Note } from "../../types/note";
import { ContextMenu, type ContextMenuItem } from "../sidebar/ContextMenu";
import { NewNoteMenu } from "../sidebar/NewNoteMenu";
import { RenameInput } from "../sidebar/RenameInput";

type MenuState = { x: number; y: number; items: ContextMenuItem[] } | null;

export function NoteListPanel() {
  const { selectedGrouping, navigate } = useUIStore();
  const {
    notes,
    selectedNoteId,
    selectNote,
    vaults,
    activeVaultId,
    addNote,
    updateNote,
    removeNote,
    knownFolderPaths,
    renameNote,
  } = useNoteStore();
  const { items: trashItems, removeFromTrash, permanentlyDelete, addToTrash } = useTrashStore();
  const showArchivedNotes = useSettingsStore((s) => s.settings.showArchivedNotes);
  const enableProjects = useSettingsStore((s) => s.settings.enableProjects);
  const projects = useProjectStore((s) => s.projects);
  const [menu, setMenu] = useState<MenuState>(null);
  // A query belongs to the list you typed it in. Archive and Trash start unfiltered.
  const groupingKey = `${selectedGrouping.type}:${selectedGrouping.id ?? ""}`;
  const [searches, setSearches] = useState<Record<string, string>>({});
  const search = searches[groupingKey] ?? "";
  function setSearch(value: string) {
    setSearches((current) => ({ ...current, [groupingKey]: value }));
  }
  // null means no note is being renamed inline
  const [renamingNoteId, setRenamingNoteId] = useState<string | null>(null);

  const vault = vaults.find((v) => v.id === activeVaultId) ?? vaults[0];

  const allFolders = useMemo(() => {
    if (!vault) return [];
    const vaultFolderPaths = knownFolderPaths.filter((fp) => fp.startsWith(`${vault.path}/`));
    const tree = buildTree(notes, vault.path, vaultFolderPaths);
    const folders = getAllFolderPaths(tree, vault.path);
    if (!enableProjects) return folders;
    return moveDestinations(
      folders,
      projects.filter((project) => project.vaultId === vault.id),
      vault.path,
    );
  }, [enableProjects, knownFolderPaths, notes, projects, vault]);

  const listed = useMemo(
    () =>
      notesForList({
        notes,
        trash: trashItems,
        grouping: selectedGrouping,
        activeVaultId,
        showArchived: showArchivedNotes,
        query: search,
      }),
    [notes, trashItems, selectedGrouping, activeVaultId, showArchivedNotes, search],
  );
  const visibleTrash = useMemo(() => trashForList(trashItems, search), [trashItems, search]);

  function handleNewNote(templateId: string | null) {
    void createNote({ ...creationTargetFromUI(), templateId });
  }

  function openNote(noteId: string) {
    navigate({ view: "notes", selectedNoteId: noteId, selectedGrouping });
  }

  async function handleRestore(noteId: string) {
    const item = trashItems.find((entry) => entry.note.id === noteId);
    if (!item) return;
    const occupied = notes.map((note) => note.filePath);
    const { held } = planTrashRestore([item], occupied);
    if (held.length > 0) {
      reportPathCollisions(held);
      return;
    }
    try {
      await tauriCommands.writeNote(item.note.filePath, serializeNote(item.note));
      removeFromTrash(noteId);
      addNote(item.note);
    } catch (e) {
      reportError("Failed to restore note", e);
    }
  }

  async function handlePinToggle(note: Note) {
    const updated = {
      ...note,
      frontmatter: { ...note.frontmatter, pinned: !note.frontmatter.pinned },
    };
    try {
      await tauriCommands.writeNote(note.filePath, serializeNote(updated));
      updateNote(updated);
    } catch (e) {
      reportError("Failed to toggle pin", e);
    }
  }

  async function handleMoveToCategory(
    note: Note,
    category: (typeof PROJECT_CATEGORIES)[number]["id"],
  ) {
    const project = projectForPath(note.filePath, projects);
    if (!project) return;
    try {
      await moveNoteToCategory(note, project, category);
    } catch (e) {
      reportError("Failed to move note", e);
    }
  }

  function handleMoveNote(note: Note, targetFolderPath: string) {
    void moveNoteToFolder(note, targetFolderPath);
  }

  function openNoteMenu(note: Note, x: number, y: number) {
    setMenu({
      x,
      y,
      items: [
        {
          kind: "action",
          label: note.frontmatter.pinned ? "Unpin" : "Pin",
          onClick: () => handlePinToggle(note),
        },
        {
          kind: "action",
          label: "Rename",
          onClick: () => setRenamingNoteId(note.id),
        },
        {
          kind: "action",
          label: note.frontmatter.locked ? "Unlock" : "Lock",
          onClick: () => handleFrontmatterToggle(note, "locked"),
        },
        {
          kind: "action",
          label: note.frontmatter.unmanaged ? "Mark Managed" : "Mark Unmanaged",
          onClick: () => handleFrontmatterToggle(note, "unmanaged"),
        },
        {
          kind: "submenu",
          label: "Move to…",
          items: allFolders.map((f) => ({
            label: f.label,
            onClick: () => handleMoveNote(note, f.path),
          })),
        },
        ...(enableProjects &&
        projectForPath(note.filePath, projects) &&
        projectForPath(note.filePath, projects)?.mainPageId !== note.id
          ? [
              {
                kind: "submenu" as const,
                label: "Move to category",
                items: PROJECT_CATEGORIES.map((category) => ({
                  label: category.label,
                  onClick: () => {
                    void handleMoveToCategory(note, category.id);
                  },
                })),
              },
            ]
          : []),
        ...(note.frontmatter.locked
          ? []
          : [
              { kind: "separator" as const },
              {
                kind: "action" as const,
                label: isArchived(note.frontmatter) ? "Unarchive" : "Archive",
                onClick: () => handleArchiveToggle(note),
              },
              {
                kind: "action" as const,
                label: "Delete",
                danger: true,
                onClick: () => handleDeleteNote(note),
              },
            ]),
      ],
    });
  }

  async function handleFrontmatterToggle(note: Note, field: "locked" | "unmanaged") {
    const next = !note.frontmatter[field];
    // Marking a note unmanaged clears the workflow fields it no longer uses.
    // Unmarking only flips the flag — the values are already cleared.
    const cleared = field === "unmanaged" && next ? UNMANAGED_CLEARED_FIELDS : {};
    const updated = {
      ...note,
      frontmatter: { ...note.frontmatter, [field]: next, ...cleared },
    };
    try {
      await tauriCommands.writeNote(note.filePath, serializeNote(updated));
      updateNote(updated);
    } catch (e) {
      reportError(`Failed to toggle ${field}`, e);
    }
  }

  async function handleRenameNote(note: Note, newTitle: string) {
    try {
      await renameNote(note, newTitle);
    } catch (e) {
      reportError("Failed to rename note", e);
    }
    setRenamingNoteId(null);
  }

  async function handleArchiveToggle(note: Note) {
    if (note.frontmatter.locked) {
      reportError("Unlock the note before archiving it", new Error("Note is locked"));
      return;
    }
    const updated = {
      ...note,
      frontmatter: {
        ...note.frontmatter,
        archived: !isArchived(note.frontmatter),
        updated: nowTimestamp(),
      },
    };
    try {
      await tauriCommands.writeNote(note.filePath, serializeNote(updated));
      updateNote(updated);
    } catch (e) {
      reportError("Failed to update archive state", e);
    }
  }

  async function handleDeleteNote(note: Note) {
    if (note.frontmatter.locked) {
      reportError("Unlock the note before deleting it", new Error("Note is locked"));
      return;
    }
    const ok = await confirm(`Move "${note.frontmatter.title || "Untitled"}" to Trash?`, {
      title: "Move to Trash",
      kind: "warning",
    });
    if (!ok) return;
    addToTrash(note);
    if (note.id === selectedNoteId) selectNote(null);
    removeNote(note.id);
    try {
      await tauriCommands.deleteNote(note.filePath);
    } catch (e) {
      reportError("Failed to delete note", e);
    }
  }

  // Trash view
  if (selectedGrouping.type === "trash") {
    return (
      <div
        className="flex flex-col border-r border-base-300"
        style={{ width: "100%", height: "100%", minWidth: 0 }}
      >
        <div className="flex items-center gap-2 border-b border-base-300 px-2 py-2">
          <span className="text-sm font-semibold">Trash</span>
          <span className="text-xs opacity-40">{visibleTrash.length}</span>
          <NoteSearch value={search} onChange={setSearch} />
        </div>
        <div className="flex-1 overflow-y-auto">
          {trashItems.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm opacity-40">Trash is empty</p>
          ) : visibleTrash.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm opacity-40">No notes</p>
          ) : (
            <ul className="py-1">
              {visibleTrash.map(({ note, deletedAt }) => (
                <li key={note.id}>
                  <div
                    className={`flex flex-col gap-1 px-3 py-2.5 ${
                      note.id === selectedNoteId ? "bg-base-300" : "hover:bg-base-200"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => openNote(note.id)}
                      className="flex w-full flex-col items-start gap-0.5 text-left"
                    >
                      <span className="w-full truncate text-sm font-medium">
                        {note.frontmatter.title || "Untitled"}
                      </span>
                      <span className="text-xs opacity-40">
                        Deleted {new Date(deletedAt).toLocaleDateString()}
                      </span>
                    </button>
                    <div className="mt-1 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleRestore(note.id)}
                        className="btn btn-ghost btn-xs"
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          permanentlyDelete(note.id);
                          if (note.id === selectedNoteId) selectNote(null);
                        }}
                        className="btn btn-ghost btn-xs text-error hover:text-error"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col border-r border-base-300"
      style={{ width: "100%", height: "100%", minWidth: 0 }}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-base-300 px-2 py-2">
        <NoteSearch value={search} onChange={setSearch} />
        <NewNoteMenu
          ariaLabel="New note"
          title="New note"
          icon="uil:file-medical"
          disabled={!vault}
          className="btn btn-ghost btn-xs btn-square"
          onSelect={handleNewNote}
        />
      </div>

      {/* Note list — onContextMenu is on each button to avoid conflicts with the toolbar */}
      <div className="flex-1 overflow-y-auto">
        {listed.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm opacity-40">
            {selectedGrouping.type === "archive" ? "No archived notes" : "No notes"}
          </p>
        ) : (
          <ul className="py-1">
            {listed.map(({ note, deletedAt }) =>
              deletedAt ? (
                <li key={note.id}>
                  <div
                    className={`flex flex-col gap-1 px-3 py-2.5 ${
                      note.id === selectedNoteId ? "bg-base-300" : "hover:bg-base-200"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => openNote(note.id)}
                      className="flex w-full flex-col items-start gap-0.5 text-left"
                    >
                      <span className="w-full truncate text-sm font-medium">
                        {note.frontmatter.title || "Untitled"}
                      </span>
                      <span className="flex items-center gap-1 text-xs">
                        <span className="badge badge-ghost badge-xs">Deleted</span>
                        <span className="opacity-40">
                          Deleted {new Date(deletedAt).toLocaleDateString()}
                        </span>
                      </span>
                    </button>
                    <div className="mt-1 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleRestore(note.id)}
                        className="btn btn-ghost btn-xs"
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          permanentlyDelete(note.id);
                          if (note.id === selectedNoteId) selectNote(null);
                        }}
                        className="btn btn-ghost btn-xs text-error hover:text-error"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              ) : (
                <li key={note.id}>
                  {renamingNoteId === note.id ? (
                    // Inline rename — takes over the row; clicking away commits
                    <div className="px-3 py-2.5">
                      <RenameInput
                        initial={note.frontmatter.title}
                        onCommit={(v) => handleRenameNote(note, v)}
                        onCancel={() => setRenamingNoteId(null)}
                        className="w-full rounded bg-base-100 px-1 text-sm font-medium text-base-content outline outline-1 outline-primary"
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      draggable
                      aria-haspopup="menu"
                      aria-keyshortcuts="Shift+F10"
                      onClick={() => openNote(note.id)}
                      onDragStart={(event) => {
                        if (!event.dataTransfer) return;
                        writeNoteDrag(event.dataTransfer, note.id);
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openNoteMenu(note, event.clientX, event.clientY);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10"))
                          return;
                        event.preventDefault();
                        const rect = event.currentTarget.getBoundingClientRect();
                        openNoteMenu(note, rect.left, rect.bottom);
                      }}
                      className={`flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left transition-colors ${
                        note.id === selectedNoteId ? "bg-base-300" : "hover:bg-base-200"
                      }`}
                    >
                      <span className="w-full truncate text-sm font-medium">
                        {note.frontmatter.title || "Untitled"}
                      </span>
                      <span className="flex items-center gap-1 text-xs">
                        {note.frontmatter.pinned && (
                          <Icon
                            icon="uil:map-pin"
                            className="h-3.5 w-3.5 text-[var(--color-primary)]"
                            aria-label="Pinned"
                          />
                        )}
                        {isArchived(note.frontmatter) && (
                          <span className="badge badge-ghost badge-xs">Archived</span>
                        )}
                        {/* Dense list — just the day. The full stored timestamp
                          is in the tooltip and in the property panel. */}
                        <span className="opacity-40" title={note.frontmatter.updated}>
                          {timestampDate(note.frontmatter.updated)}
                        </span>
                      </span>
                      {note.frontmatter.tags.length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {note.frontmatter.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="badge badge-ghost badge-xs">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  )}
                </li>
              ),
            )}
          </ul>
        )}
      </div>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}

function NoteSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <input
      placeholder="Search..."
      aria-label="Search notes"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="input input-sm flex-1 border border-base-300 bg-base-200"
    />
  );
}
