/**
 * Kanban and Eisenhower membership. Unmanaged notes are outside both boards.
 * An empty state is not Prepare: `??` leaves `""` off the columns, and `||`
 * would put a cleared note back into Prepare.
 */

export const KANBAN_STATES = ["Prepare", "Doing", "Maintain", "Done"] as const;
export type KanbanState = (typeof KANBAN_STATES)[number];

export interface WorkflowFrontmatter {
  unmanaged?: boolean;
  state?: string;
}

export function groupKanban<T extends { frontmatter: WorkflowFrontmatter }>(
  notes: T[],
): Record<KanbanState, T[]> {
  const columns: Record<KanbanState, T[]> = {
    Prepare: [],
    Doing: [],
    Maintain: [],
    Done: [],
  };
  for (const note of notes) {
    if (note.frontmatter.unmanaged === true) continue;
    const state = note.frontmatter.state ?? "Prepare";
    if (state in columns) columns[state as KanbanState].push(note);
  }
  return columns;
}

export function groupEisenhower<T extends { frontmatter: WorkflowFrontmatter }>(notes: T[]): T[] {
  return notes.filter(
    (note) =>
      note.frontmatter.unmanaged !== true &&
      (note.frontmatter.state === "Prepare" || note.frontmatter.state === "Doing"),
  );
}
