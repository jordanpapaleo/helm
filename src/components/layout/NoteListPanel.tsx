import { Icon } from "@iconify/react";
import { useMemo, useState } from "react";
import { ulid } from "ulid";
import { serializeNote } from "../../lib/note-parser";
import { tauriCommands } from "../../lib/tauri-commands";
import { useNoteStore } from "../../store/notes";
import { useTrashStore } from "../../store/trash";
import { useUIStore } from "../../store/ui";
import type { Note } from "../../types/note";

export function NoteListPanel() {
  const { selectedGrouping, setView } = useUIStore();
  const { notes, selectedNoteId, selectNote, vaults, activeVaultId, addNote } = useNoteStore();
  const { items: trashItems, removeFromTrash, permanentlyDelete } = useTrashStore();
  const [search, setSearch] = useState("");

  const vault = vaults.find((v) => v.id === activeVaultId) ?? vaults[0];

  const filteredNotes = useMemo(() => {
    let result = activeVaultId
      ? notes.filter((n) => n.vaultId === activeVaultId)
      : notes;

    if (selectedGrouping.type === "folder" && selectedGrouping.id) {
      const prefix = `${selectedGrouping.id}/`;
      result = result.filter((n) => n.filePath.startsWith(prefix));
    } else if (selectedGrouping.type === "tag" && selectedGrouping.id) {
      const tag = selectedGrouping.id;
      const tagPrefix = `${tag}/`;
      result = result.filter((n) =>
        n.frontmatter.tags.some((t) => t === tag || t.startsWith(tagPrefix)),
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (n) =>
          n.frontmatter.title.toLowerCase().includes(q) ||
          n.frontmatter.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    return [...result].sort((a, b) => {
      if (a.frontmatter.pinned && !b.frontmatter.pinned) return -1;
      if (!a.frontmatter.pinned && b.frontmatter.pinned) return 1;
      return b.frontmatter.updated.localeCompare(a.frontmatter.updated);
    });
  }, [notes, selectedGrouping, activeVaultId, search]);

  async function handleNewNote() {
    if (!vault) return;
    const folderPath =
      selectedGrouping.type === "folder" && selectedGrouping.id
        ? selectedGrouping.id
        : vault.path;
    const id = ulid();
    const today = new Date().toISOString().split("T")[0];
    const slug = `untitled-${id.slice(-8).toLowerCase()}`;
    const filePath = `${folderPath}/${slug}.md`;
    const note: Note = {
      id,
      filePath,
      fileName: `${slug}.md`,
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

  async function handleRestore(noteId: string) {
    const item = removeFromTrash(noteId);
    if (!item) return;
    try {
      await tauriCommands.writeNote(item.note.filePath, serializeNote(item.note));
      addNote(item.note);
    } catch (e) {
      console.error("Failed to restore note:", e);
    }
  }

  // Trash view
  if (selectedGrouping.type === "trash") {
    return (
      <div
        className="flex flex-col border-r border-base-300"
        style={{ width: "var(--notelist-width)", minWidth: "var(--notelist-width)" }}
      >
        <div className="flex items-center border-b border-base-300 px-3 py-2.5">
          <span className="text-sm font-semibold">Trash</span>
          <span className="ml-2 text-xs opacity-40">{trashItems.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {trashItems.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm opacity-40">Trash is empty</p>
          ) : (
            <ul className="py-1">
              {trashItems.map(({ note, deletedAt }) => (
                <li key={note.id} className="flex flex-col gap-1 px-3 py-2.5 hover:bg-base-200">
                  <span className="truncate text-sm font-medium">
                    {note.frontmatter.title || "Untitled"}
                  </span>
                  <span className="text-xs opacity-40">
                    Deleted {new Date(deletedAt).toLocaleDateString()}
                  </span>
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
                      onClick={() => permanentlyDelete(note.id)}
                      className="btn btn-ghost btn-xs text-error hover:text-error"
                    >
                      Delete
                    </button>
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
      style={{ width: "var(--notelist-width)", minWidth: "var(--notelist-width)" }}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-base-300 px-2 py-2">
        <input
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input input-sm flex-1 border border-base-300 bg-base-200"
        />
        <button
          type="button"
          onClick={handleNewNote}
          title="New note"
          className="btn btn-ghost btn-xs btn-square"
        >
          <Icon icon="uil:file-medical" className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Note list */}
      <div className="flex-1 overflow-y-auto">
        {filteredNotes.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm opacity-40">No notes</p>
        ) : (
          <ul className="py-1">
            {filteredNotes.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => {
                    selectNote(note.id);
                    setView("notes");
                  }}
                  className={`flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left transition-colors ${
                    note.id === selectedNoteId ? "bg-base-300" : "hover:bg-base-200"
                  }`}
                >
                  <span className="w-full truncate text-sm font-medium">
                    {note.frontmatter.title || "Untitled"}
                  </span>
                  <span className="text-xs opacity-40">{note.frontmatter.updated}</span>
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
