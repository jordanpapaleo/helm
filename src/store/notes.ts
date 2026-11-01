/**
 * Notes store — manages all notes, selection, tagging, and search.
 * Maintains a hierarchical tag tree for efficient filtering and a
 * full-text search index for note discovery.
 */
import { create } from "zustand";
import { type DuplicateGroup, partitionDuplicateIds } from "../lib/duplicate-ids";
import { notesToRewrite, replaceWikiLinkTitle } from "../lib/note-links";
import { serializeNote, slugify } from "../lib/note-parser";
import { buildIndex, type NoteIndex, noteMatchesQuery, searchNotes } from "../lib/search";
import {
  isValidTagName,
  normalizeTagName,
  noteMatchesTag,
  removeInlineTag,
  removeTagFromList,
  renameInlineTag,
  renameTagInList,
} from "../lib/tags";
import { tauriCommands } from "../lib/tauri-commands";
import { nowTimestamp } from "../lib/timestamps";
import type { Note, VaultConfig } from "../types/note";
import { useProjectStore } from "./projects";
import { reportError } from "./toast";
import { useTrashStore } from "./trash";

/**
 * A node in the hierarchical tag tree structure.
 * Supports nested tags like "work/project/alpha" via children.
 */
export interface TagNode {
  /** All notes tagged with this tag */
  notes: Note[];
  /** Child tags (for hierarchical Bear-style tags) */
  children: Record<string, TagNode>;
}

/**
 * A tag-name-keyed map. Always null-prototype: tag names come from user files,
 * so a tag like `constructor` or `__proto__` would otherwise resolve to an
 * inherited Object.prototype member instead of a node — `ensureNode` would hand
 * back a non-node and the whole vault load would die on `.notes.push`.
 * @internal
 */
function emptyTagMap(): Record<string, TagNode> {
  return Object.create(null);
}

/**
 * Recursively ensure a tag path exists in the tree, creating missing nodes.
 * @internal
 */
function ensureNode(parts: string[], current: Record<string, TagNode>): TagNode {
  const [head, ...rest] = parts;
  if (!current[head]) current[head] = { notes: [], children: emptyTagMap() };
  if (rest.length === 0) return current[head];
  return ensureNode(rest, current[head].children);
}

/**
 * Build the hierarchical tag tree from all notes.
 * Each note is indexed in the tree by all its tags.
 * @internal
 */
export function buildTagTree(notes: Note[]): Record<string, TagNode> {
  const tree: Record<string, TagNode> = emptyTagMap();
  for (const note of notes) {
    for (const tag of note.frontmatter.tags ?? []) {
      const parts = tag.split("/").filter(Boolean);
      const leaf = ensureNode(parts, tree);
      leaf.notes.push(note);
    }
  }
  return tree;
}

/**
 * Notes store state and actions.
 */
interface NoteStore {
  /** All loaded notes across all vaults, one per id */
  notes: Note[];
  /**
   * Ids carried by more than one file. Each group's keeper is in `notes`; its
   * other copies are held only here until the user resolves them.
   */
  duplicateGroups: DuplicateGroup<Note>[];
  /** ID of currently selected note, or null if none selected */
  selectedNoteId: string | null;
  /** All configured vaults */
  vaults: VaultConfig[];
  /** Currently active vault filter (null = show all vaults) */
  activeVaultId: string | null;
  /** Hierarchical tree of tags with associated notes */
  tagTree: Record<string, TagNode>;
  /** Full-text search index for fast lookups */
  searchIndex: NoteIndex | null;
  /** Current search query string */
  searchQuery: string;
  /** Notes matching the current search query */
  searchResults: Note[];
  /** All known folder paths across all vaults (includes empty folders) */
  knownFolderPaths: string[];

  /** Replace all notes and rebuild indexes */
  setNotes: (notes: Note[]) => void;
  /** Append notes from a new vault without replacing existing ones */
  appendNotes: (notes: Note[]) => void;
  /** Replace all vault configs and persist */
  setVaults: (vaults: VaultConfig[]) => void;
  /** Add a single vault config */
  addVaultConfig: (vault: VaultConfig) => void;
  /** Remove a vault config by ID */
  removeVaultConfig: (id: string) => void;
  /** Set the active vault filter (null = show all) */
  setActiveVaultId: (id: string | null) => void;
  /** Select a note by ID (or null to deselect) */
  selectNote: (id: string | null) => void;
  /**
   * Update an existing note and rebuild indexes. Matches the loaded note at
   * the same file path (including a duplicate copy), else the note with the
   * same id (a rename).
   */
  updateNote: (note: Note) => void;
  /**
   * Live title update for in-progress editing: patches only the note's
   * frontmatter title in place, rebuilding NO indexes. The tag tree is
   * unaffected by a title, and the search index self-heals on the next
   * updateNote (blur-time save). Use for per-keystroke title typing;
   * use updateNote for the persisted change.
   */
  setNoteTitleLive: (id: string, title: string) => void;
  /** Add a new note and rebuild indexes */
  addNote: (note: Note) => void;
  /**
   * Remove the note that owns this id and rebuild indexes. A duplicate copy of
   * the id, if any, takes its place.
   */
  removeNote: (id: string) => void;
  /** Remove whichever loaded note (or duplicate copy) lives at this path. */
  removeNoteAtPath: (filePath: string) => void;
  /** Search for notes matching a query (rebuilds search index if needed) */
  search: (query: string) => void;
  /** Replace the known folder paths (called on vault load and dir change events) */
  setKnownFolderPaths: (paths: string[]) => void;
  /**
   * Rename a note: updates the title in frontmatter, re-slugifies the filename,
   * calls Tauri to rename + rewrite the file, then updates the store.
   * No-ops if newTitle is empty or unchanged.
   */
  renameNote: (note: Note, newTitle: string) => Promise<void>;
  /**
   * Rename a folder: calls Tauri to move the directory on disk, then rewrites the
   * `<oldPath>/` prefix on every affected note path and known folder path in the
   * store. Folder names are used raw (no slugify). No-ops if newName is empty or
   * unchanged.
   */
  renameFolder: (oldPath: string, newName: string) => Promise<void>;
  /**
   * Rename a tag across every note that carries it, including its descendants
   * (`work` → `client` also moves `work/project` → `client/project`).
   * Rewrites the inline `#tag` occurrences in each body as well as the
   * frontmatter list — the editor derives `frontmatter.tags` from the body on
   * every save, so a frontmatter-only rewrite would be reverted.
   * No-ops when the new name is empty, unchanged, or not a representable tag.
   */
  renameTag: (oldTag: string, newTag: string) => Promise<void>;
  /**
   * Delete a tag and all its descendants from every note that carries it,
   * rewriting bodies as well as frontmatter (see renameTag).
   */
  deleteTag: (tag: string) => Promise<void>;
}

/**
 * Write every rewritten note to disk, returning the ones that made it. A failed
 * write never aborts the batch — the remaining notes are still processed and
 * one toast summarizes the failures.
 *
 * Each note is snapshotted to `.helm-history/` before it is overwritten, the
 * same guarantee the editor's save path gives, so a bulk rewrite is always
 * recoverable from the time machine. The snapshot is awaited (it must land
 * before the overwrite) but never blocks the write: a failure is swallowed, and
 * a note whose vault path can't be resolved is simply written without one.
 * Rust coalesces to one snapshot per note per 5 minutes and prunes to 50.
 * @internal
 */
async function writeRewrittenNotes(
  updates: Note[],
  vaults: VaultConfig[],
  operation: string,
): Promise<Note[]> {
  const written: Note[] = [];
  let lastError: unknown;
  for (const note of updates) {
    const vaultPath = vaults.find((v) => v.id === note.vaultId)?.path;
    if (vaultPath) {
      await tauriCommands.snapshotNote(vaultPath, note.id, note.filePath).catch(() => {
        /* snapshotting must never block a save */
      });
    }
    try {
      await tauriCommands.writeNote(note.filePath, serializeNote(note));
      written.push(note);
    } catch (e) {
      lastError = e;
    }
  }
  const failed = updates.length - written.length;
  if (failed > 0) {
    reportError(`${operation}: ${failed} of ${updates.length} notes could not be saved`, lastError);
  }
  return written;
}

/** Every loaded file: the keepers in `notes` plus the duplicate copies. */
function allNotes(state: Pick<NoteStore, "notes" | "duplicateGroups">): Note[] {
  if (state.duplicateGroups.length === 0) return state.notes;
  return [...state.notes, ...state.duplicateGroups.flatMap((group) => group.copies)];
}

/**
 * The one place loaded files become store state: one note per id in `notes`,
 * the rest in `duplicateGroups`, and both indexes rebuilt from `notes`.
 */
function derive(files: Note[]) {
  const { unique, groups } = partitionDuplicateIds(files, (n) => ({
    id: n.id,
    filePath: n.filePath,
    created: n.frontmatter.created ?? "",
  }));
  return {
    notes: unique,
    duplicateGroups: groups,
    tagTree: buildTagTree(unique),
    searchIndex: buildIndex(unique),
  };
}

function replaceByPath(files: Note[], written: Note[]): Note[] {
  const byPath = new Map(written.map((n) => [n.filePath, n]));
  return files.map((n) => byPath.get(n.filePath) ?? n);
}

/**
 * Global notes store using Zustand.
 * Manages all note operations, selection, tagging, and search.
 */
export const useNoteStore = create<NoteStore>((set, get) => ({
  notes: [],
  duplicateGroups: [],
  selectedNoteId: null,
  vaults: [],
  activeVaultId: null,
  tagTree: {},
  searchIndex: null,
  searchQuery: "",
  searchResults: [],
  knownFolderPaths: [],

  setNotes: (notes) => set(derive(notes)),
  appendNotes: (incoming) => {
    const incomingPaths = new Set(incoming.map((n) => n.filePath));
    const existing = allNotes(get()).filter((n) => !incomingPaths.has(n.filePath));
    set(derive([...existing, ...incoming]));
  },
  setVaults: (vaults) => set({ vaults }),
  addVaultConfig: (vault) => set((s) => ({ vaults: [...s.vaults, vault] })),
  removeVaultConfig: (id) => set((s) => ({ vaults: s.vaults.filter((v) => v.id !== id) })),
  setActiveVaultId: (id) => set({ activeVaultId: id }),
  selectNote: (id) => set({ selectedNoteId: id }),
  updateNote: (updated) =>
    set((state) => {
      const files = allNotes(state);
      let index = files.findIndex((n) => n.filePath === updated.filePath);
      // `files` lists keepers first, so a rename resolves to the id's keeper.
      if (index < 0) index = files.findIndex((n) => n.id === updated.id);
      if (index < 0) return state;
      return derive(files.map((n, i) => (i === index ? updated : n)));
    }),
  setNoteTitleLive: (id, title) =>
    set((state) => ({
      notes: state.notes.map((n) =>
        n.id === id ? { ...n, frontmatter: { ...n.frontmatter, title } } : n,
      ),
    })),
  addNote: (note) =>
    set((state) => {
      // Skip if a note with the same filePath is already in the store to prevent
      // duplicate entries from concurrent watcher callbacks or StrictMode runs.
      const files = allNotes(state);
      if (files.some((n) => n.filePath === note.filePath)) return state;
      return derive([...files, note]);
    }),
  removeNote: (id) =>
    set((state) => {
      const keeper = state.notes.find((n) => n.id === id);
      return {
        ...derive(allNotes(state).filter((n) => n !== keeper)),
        selectedNoteId: state.selectedNoteId === id ? null : state.selectedNoteId,
      };
    }),
  removeNoteAtPath: (filePath) =>
    set((state) => {
      const files = allNotes(state);
      const removed = files.find((n) => n.filePath === filePath);
      if (!removed) return state;
      const next = derive(files.filter((n) => n !== removed));
      const selectionGone =
        state.selectedNoteId === removed.id && !next.notes.some((n) => n.id === removed.id);
      return { ...next, selectedNoteId: selectionGone ? null : state.selectedNoteId };
    }),
  search: (query) => {
    const { notes, searchIndex } = get();
    if (!searchIndex || !query.trim()) {
      set({ searchQuery: query, searchResults: [] });
      return;
    }
    const indexed = searchNotes(searchIndex, notes, query);
    const seen = new Set(indexed.map((note) => note.id));
    const deleted = useTrashStore
      .getState()
      .items.map((item) => item.note)
      .filter((note) => !seen.has(note.id) && noteMatchesQuery(note, query));
    set({ searchQuery: query, searchResults: [...indexed, ...deleted].slice(0, 20) });
  },
  setKnownFolderPaths: (paths) => set({ knownFolderPaths: paths }),

  renameNote: async (note, newTitle) => {
    if (!newTitle || newTitle === note.frontmatter.title) return;
    const oldTitle = note.frontmatter.title;
    // Resolve [[Old Title]] against titles as they are now. updateNote below
    // replaces this note's title, which would make the wiki link look like it
    // belonged to a different note that still has the old title.
    const catalog = get().notes;
    const folder = note.filePath.split("/").slice(0, -1).join("/");
    const newFileName = `${slugify(newTitle)}.md`;
    const newFilePath = `${folder}/${newFileName}`;
    const updated: Note = {
      ...note,
      filePath: newFilePath,
      fileName: newFileName,
      frontmatter: { ...note.frontmatter, title: newTitle },
    };
    // Write the updated content to the old path first, then rename. Both steps
    // are individually atomic, so a crash between them leaves a fully intact
    // note (with a stale filename at worst) — never a truncated or missing file.
    await tauriCommands.writeNote(note.filePath, serializeNote(updated));
    await tauriCommands.renameNote(note.filePath, newFilePath);
    get().updateNote(updated);

    // Rewrite [[Old Title]] only where that wiki link resolved to this note.
    // Locked notes are left untouched: no snapshot and no write. Saved link
    // ids stay in place either way.
    const stamp = nowTimestamp();
    const rewrites = notesToRewrite(catalog, note.id, oldTitle).flatMap((item) => {
      const content = replaceWikiLinkTitle(item.content, oldTitle, newTitle);
      if (content === item.content) return [];
      return [
        {
          ...item,
          content,
          frontmatter: { ...item.frontmatter, updated: stamp },
        },
      ];
    });
    if (rewrites.length === 0) return;

    const written = await writeRewrittenNotes(
      rewrites,
      get().vaults,
      "Failed to update links after rename",
    );
    if (written.length === 0) return;
    set((state) => derive(replaceByPath(allNotes(state), written)));
  },

  renameFolder: async (oldPath, newName) => {
    const trimmed = newName.trim();
    const parent = oldPath.split("/").slice(0, -1).join("/");
    const newPath = `${parent}/${trimmed}`;
    if (!trimmed || newPath === oldPath) return;

    await tauriCommands.renameFolder(oldPath, newPath);
    await useProjectStore.getState().retarget(oldPath, newPath);

    const oldPrefix = `${oldPath}/`;
    set((state) => {
      const files = allNotes(state).map((n) => {
        if (!n.filePath.startsWith(oldPrefix)) return n;
        const newFilePath = `${newPath}/${n.filePath.slice(oldPrefix.length)}`;
        return {
          ...n,
          filePath: newFilePath,
          fileName: newFilePath.split("/").at(-1) ?? n.fileName,
        };
      });
      const knownFolderPaths = state.knownFolderPaths.map((fp) =>
        fp === oldPath
          ? newPath
          : fp.startsWith(oldPrefix)
            ? `${newPath}/${fp.slice(oldPrefix.length)}`
            : fp,
      );
      return { ...derive(files), knownFolderPaths };
    });
  },

  renameTag: async (oldTagInput, newTagInput) => {
    const oldTag = normalizeTagName(oldTagInput);
    const newTag = normalizeTagName(newTagInput);
    if (!oldTag || !newTag || oldTag === newTag) return;
    if (!isValidTagName(newTag)) {
      reportError(
        "Cannot rename tag",
        new Error(
          `"${newTag}" is not a valid tag name — use letters, digits, "-", "_" and "/" only, starting with a letter`,
        ),
      );
      return;
    }

    const stamp = nowTimestamp();
    const updates = get()
      .notes.filter((n) => noteMatchesTag(n, oldTag))
      .map<Note>((n) => ({
        ...n,
        content: renameInlineTag(n.content, oldTag, newTag),
        frontmatter: {
          ...n.frontmatter,
          tags: renameTagInList(n.frontmatter.tags ?? [], oldTag, newTag),
          updated: stamp,
        },
      }));

    const written = await writeRewrittenNotes(updates, get().vaults, `Failed to rename #${oldTag}`);
    if (written.length === 0) return;
    set((state) => derive(replaceByPath(allNotes(state), written)));
  },

  deleteTag: async (tagInput) => {
    const tag = normalizeTagName(tagInput);
    if (!tag) return;

    const stamp = nowTimestamp();
    const updates = get()
      .notes.filter((n) => noteMatchesTag(n, tag))
      .map<Note>((n) => ({
        ...n,
        content: removeInlineTag(n.content, tag),
        frontmatter: {
          ...n.frontmatter,
          tags: removeTagFromList(n.frontmatter.tags ?? [], tag),
          updated: stamp,
        },
      }));

    const written = await writeRewrittenNotes(updates, get().vaults, `Failed to delete #${tag}`);
    if (written.length === 0) return;
    set((state) => derive(replaceByPath(allNotes(state), written)));
  },
}));
