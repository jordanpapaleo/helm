/**
 * Core note data types and utilities.
 * Notes are the fundamental unit in Helm — markdown files with YAML frontmatter
 * containing metadata like tags, state, deadlines, and links.
 */

/**
 * Configuration for a single vault (a folder of .md files).
 */
export interface VaultConfig {
  /** Stable ULID — survives renames */
  id: string;
  /** Display name (folder's basename) */
  name: string;
  /** Absolute path on disk */
  path: string;
}

/** Kanban/workflow state of a note */
export type NoteState = "Prepare" | "Doing" | "Maintain" | "Done";

/**
 * YAML frontmatter metadata for a note.
 * Stored in the `---`-delimited header of markdown files.
 */
export interface NoteFrontmatter {
  /** Unique identifier (ULID) */
  id: string;
  /** Display title */
  title: string;
  /** ISO date string when note was created */
  created: string;
  /** ISO date string when note was last updated */
  updated: string;
  /** Bear-style tags (e.g., ["work", "work/project", "personal"]) */
  tags: string[];
  /** Eisenhower urgent flag (high priority) */
  urgent: boolean;
  /** Eisenhower important flag (strategic value) */
  important: boolean;
  /** Current workflow state for Kanban board */
  state: NoteState;
  /** Whether this note is currently blocked from progress */
  blocked: boolean;
  /** Optional deadline (ISO date string) */
  deadline?: string;
  /** Optional list of team member names responsible for this note */
  team?: string[];
  /** Optional ULIDs of linked notes (from [[wiki links]]) */
  links?: string[];
  /** Whether the note is read-only */
  locked?: boolean;
  /** Whether the note is pinned to the top of lists */
  pinned?: boolean;
  /** Excludes the note from Kanban and Eisenhower views */
  unmanaged?: boolean;
  /** Position index within a Kanban column (persists drag-and-drop order) */
  kanbanOrder?: number;
  /** Position index within an Eisenhower quadrant (persists drag-and-drop order) */
  eisenhowerOrder?: number;
  /** Allow arbitrary extra fields in frontmatter */
  [key: string]: unknown;
}

/**
 * A complete note object combining metadata and content.
 */
export interface Note {
  /** Same as frontmatter.id — the ULID */
  id: string;
  /** YAML frontmatter metadata */
  frontmatter: NoteFrontmatter;
  /** Markdown body content (without frontmatter) */
  content: string;
  /** Absolute file path on disk */
  filePath: string;
  /** Filename only (e.g., "rule-builder.md") */
  fileName: string;
  /** ID of the vault this note belongs to */
  vaultId: string;
}

/**
 * Eisenhower matrix quadrant categories based on urgent/important flags.
 */
export type EisenhowerQuadrant =
  | "do" // urgent + important (top priority)
  | "schedule" // not urgent + important (plan for later)
  | "delegate" // urgent + not important (pass to someone else)
  | "eliminate"; // not urgent + not important (skip)

/**
 * Calculate which Eisenhower quadrant a note belongs to based on
 * its urgent and important flags.
 *
 * @param note - The note to classify
 * @returns The quadrant: "do", "schedule", "delegate", or "eliminate"
 * @example
 * const quadrant = getQuadrant(note);
 * if (quadrant === "do") { /* high priority * / }
 */
export function getQuadrant(note: Note): EisenhowerQuadrant {
  const { urgent, important } = note.frontmatter;
  if (urgent && important) return "do";
  if (!urgent && important) return "schedule";
  if (urgent && !important) return "delegate";
  return "eliminate";
}
