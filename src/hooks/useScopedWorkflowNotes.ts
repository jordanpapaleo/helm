import { useMemo } from "react";
import { visibleNotes } from "../lib/archive";
import { notesInProjectScope } from "../lib/project-scope";
import type { Project } from "../lib/projects";
import { useNoteStore } from "../store/notes";
import { useProjectStore } from "../store/projects";
import { useSettingsStore } from "../store/settings";
import { useUIStore } from "../store/ui";
import type { Note } from "../types/note";

/** Notes for Dashboard, Kanban, and Eisenhower, scoped when a project is open. */
export function useScopedWorkflowNotes(): { notes: Note[]; project: Project | null } {
  const allNotes = useNoteStore((state) => state.notes);
  const showArchivedNotes = useSettingsStore((state) => state.settings.showArchivedNotes);
  const enableProjects = useSettingsStore((state) => state.settings.enableProjects);
  const projects = useProjectStore((state) => state.projects);
  const selectedGrouping = useUIStore((state) => state.selectedGrouping);

  return useMemo(() => {
    const visible = visibleNotes(allNotes, showArchivedNotes);
    return notesInProjectScope(visible, selectedGrouping, projects, enableProjects);
  }, [allNotes, showArchivedNotes, enableProjects, projects, selectedGrouping]);
}
