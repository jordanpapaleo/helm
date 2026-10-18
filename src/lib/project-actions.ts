/**
 * Disk writes for projects. Planning lives in projects.ts; this module is the
 * only place those plans are applied, and every write goes through tauri-commands.
 */
import { ulid } from "ulid";
import { useNoteStore } from "../store/notes";
import { useProjectStore } from "../store/projects";
import type { Note, NoteFrontmatter } from "../types/note";
import { serializeNote } from "./note-parser";
import {
  type CreateProjectInput,
  collectFolderPaths,
  emptyRepository,
  type PlannedPage,
  type Project,
  type ProjectCategoryId,
  planCategoryMove,
  planCreateProject,
  planPromoteFolder,
  serializeProjectMeta,
} from "./projects";
import { tauriCommands } from "./tauri-commands";
import { nowTimestamp } from "./timestamps";

export function noteFromPlannedPage(page: PlannedPage, vaultId: string, now: string): Note {
  const frontmatter: NoteFrontmatter = {
    id: page.id,
    title: page.title,
    created: now,
    updated: now,
    tags: [],
    urgent: false,
    important: false,
    state: "",
    blocked: false,
    unmanaged: true,
    purpose: "",
    plan: "",
    nextAction: "",
    leftOff: "",
    blockers: "",
  };
  return {
    id: page.id,
    filePath: page.filePath,
    fileName: page.fileName,
    content: page.content,
    vaultId,
    frontmatter,
  };
}

function snapshotInputs(): Pick<
  CreateProjectInput,
  "existingFolderPaths" | "existingFilePaths" | "projects"
> {
  const { notes, knownFolderPaths } = useNoteStore.getState();
  return {
    existingFilePaths: notes.map((note) => note.filePath),
    existingFolderPaths: collectFolderPaths(
      notes.map((note) => note.filePath),
      knownFolderPaths,
    ),
    projects: useProjectStore.getState().projects,
  };
}

async function applyPlan(
  folders: string[],
  mainPage: Note,
  project: Project,
): Promise<{ project: Project; mainPage: Note }> {
  for (const folder of folders) {
    await tauriCommands.createFolder(folder);
  }
  await tauriCommands.writeNote(mainPage.filePath, serializeNote(mainPage));
  await tauriCommands.writeTextFile(project.metaPath, serializeProjectMeta(project));

  const store = useNoteStore.getState();
  store.addNote(mainPage);
  const known = new Set(useNoteStore.getState().knownFolderPaths);
  for (const folder of folders) known.add(folder);
  store.setKnownFolderPaths([...known]);
  useProjectStore.getState().upsert(project);
  return { project, mainPage };
}

export async function createProject(input: {
  vaultId: string;
  vaultPath: string;
  parentPath: string;
  name: string;
  repository?: string | null;
}): Promise<{ project: Project; mainPage: Note }> {
  const now = nowTimestamp();
  const plan = planCreateProject({
    ...snapshotInputs(),
    vaultId: input.vaultId,
    vaultPath: input.vaultPath,
    parentPath: input.parentPath,
    name: input.name,
    repository: emptyRepository(input.repository),
    projectId: ulid(),
    mainPageId: ulid(),
    now,
  });
  if (!plan.ok) throw new Error(plan.error);
  const mainPage = noteFromPlannedPage(plan.mainPage, input.vaultId, now);
  return applyPlan(plan.folders, mainPage, plan.project);
}

export async function promoteFolder(input: {
  vaultId: string;
  vaultPath: string;
  folderPath: string;
  name?: string;
  repository?: string | null;
}): Promise<{ project: Project; mainPage: Note }> {
  const now = nowTimestamp();
  const plan = planPromoteFolder({
    ...snapshotInputs(),
    vaultId: input.vaultId,
    vaultPath: input.vaultPath,
    folderPath: input.folderPath,
    name: input.name,
    repository: emptyRepository(input.repository),
    projectId: ulid(),
    mainPageId: ulid(),
    now,
  });
  if (!plan.ok) throw new Error(plan.error);
  const mainPage = noteFromPlannedPage(plan.mainPage, input.vaultId, now);
  return applyPlan(plan.folders, mainPage, plan.project);
}

/**
 * Move a note into a project category. The file is renamed; frontmatter is not
 * rewritten, so workflow state, links, and the note id stay put. History is
 * keyed by that id and is left where it is.
 */
export async function moveNoteToCategory(
  note: Note,
  project: Project,
  category: ProjectCategoryId,
): Promise<Note> {
  const taken = useNoteStore.getState().notes.map((item) => item.filePath);
  const plan = planCategoryMove({
    noteId: note.id,
    filePath: note.filePath,
    fileName: note.fileName,
    project,
    category,
    takenPaths: taken,
  });
  if (!plan.ok) throw new Error(plan.error);
  if (plan.to === plan.from) return note;
  await tauriCommands.renameNote(plan.from, plan.to);
  const moved: Note = {
    ...note,
    filePath: plan.to,
    fileName: plan.to.split("/").pop() ?? note.fileName,
  };
  useNoteStore.getState().updateNote(moved);
  return moved;
}
