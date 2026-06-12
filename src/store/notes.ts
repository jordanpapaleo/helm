/**
 * Notes store — manages all notes, selection, tagging, and search.
 * Maintains a hierarchical tag tree for efficient filtering and a
 * full-text search index for note discovery.
 */
import { create } from "zustand";
import { buildIndex, type NoteIndex, searchNotes } from "../lib/search";
import type { Note, VaultConfig } from "../types/note";

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
 * Recursively ensure a tag path exists in the tree, creating missing nodes.
 * @internal
 */
function ensureNode(parts: string[], current: Record<string, TagNode>): TagNode {
  const [head, ...rest] = parts;
  if (!current[head]) current[head] = { notes: [], children: {} };
  if (rest.length === 0) return current[head];
  return ensureNode(rest, current[head].children);
}

/**
 * Build the hierarchical tag tree from all notes.
 * Each note is indexed in the tree by all its tags.
 * @internal
 */
function buildTagTree(notes: Note[]): Record<string, TagNode> {
  const tree: Record<string, TagNode> = {};
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
  /** All loaded notes across all vaults */
  notes: Note[];
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
  /** Update an existing note and rebuild indexes */
  updateNote: (note: Note) => void;
  /** Add a new note and rebuild indexes */
  addNote: (note: Note) => void;
  /** Remove a note by ID and rebuild indexes */
  removeNote: (id: string) => void;
  /** Search for notes matching a query (rebuilds search index if needed) */
  search: (query: string) => void;
  /** Replace the known folder paths (called on vault load and dir change events) */
  setKnownFolderPaths: (paths: string[]) => void;
}

/**
 * Global notes store using Zustand.
 * Manages all note operations, selection, tagging, and search.
 */
export const useNoteStore = create<NoteStore>((set, get) => ({
  notes: [],
  selectedNoteId: null,
  vaults: [],
  activeVaultId: null,
  tagTree: {},
  searchIndex: null,
  searchQuery: "",
  searchResults: [],
  knownFolderPaths: [],

  setNotes: (notes) => {
    const searchIndex = buildIndex(notes);
    set({ notes, tagTree: buildTagTree(notes), searchIndex });
  },
  appendNotes: (incoming) => {
    const existing = get().notes.filter((n) => !incoming.some((i) => i.filePath === n.filePath));
    const notes = [...existing, ...incoming];
    const searchIndex = buildIndex(notes);
    set({ notes, tagTree: buildTagTree(notes), searchIndex });
  },
  setVaults: (vaults) => set({ vaults }),
  addVaultConfig: (vault) => set((s) => ({ vaults: [...s.vaults, vault] })),
  removeVaultConfig: (id) => set((s) => ({ vaults: s.vaults.filter((v) => v.id !== id) })),
  setActiveVaultId: (id) => set({ activeVaultId: id }),
  selectNote: (id) => set({ selectedNoteId: id }),
  updateNote: (updated) =>
    set((state) => {
      const notes = state.notes.map((n) => (n.id === updated.id ? updated : n));
      const searchIndex = buildIndex(notes);
      return { notes, tagTree: buildTagTree(notes), searchIndex };
    }),
  addNote: (note) =>
    set((state) => {
      // Skip if a note with the same filePath is already in the store to prevent
      // duplicate entries from concurrent watcher callbacks or StrictMode runs.
      if (state.notes.some((n) => n.filePath === note.filePath)) return state;
      const notes = [...state.notes, note];
      return { notes, tagTree: buildTagTree(notes) };
    }),
  removeNote: (id) =>
    set((state) => {
      const notes = state.notes.filter((n) => n.id !== id);
      return { notes, tagTree: buildTagTree(notes) };
    }),
  search: (query) => {
    const { notes, searchIndex } = get();
    if (!searchIndex || !query.trim()) {
      set({ searchQuery: query, searchResults: [] });
      return;
    }
    const results = searchNotes(searchIndex, notes, query);
    set({ searchQuery: query, searchResults: results });
  },
  setKnownFolderPaths: (paths) => set({ knownFolderPaths: paths }),
}));
