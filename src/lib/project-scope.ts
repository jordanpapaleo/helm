import type { Grouping } from "../store/ui";
import type { Note } from "../types/note";
import { type Project, projectForPath } from "./projects";

/**
 * Workflow views (Dashboard, Kanban, Eisenhower, briefing) use this filter.
 * A folder inside a project scopes to that whole project. All Notes, tags,
 * and folders outside any project stay global. The setting off means global.
 */
export function notesInProjectScope(
  notes: Note[],
  grouping: Grouping,
  projects: Project[],
  enabled: boolean,
): { notes: Note[]; project: Project | null } {
  if (!enabled || grouping.type !== "folder" || !grouping.id) {
    return { notes, project: null };
  }
  const project = projectForPath(grouping.id, projects);
  if (!project) return { notes, project: null };
  return {
    project,
    notes: notes.filter((note) => projectForPath(note.filePath, [project]) !== null),
  };
}
