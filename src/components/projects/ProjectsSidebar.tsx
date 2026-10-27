import { Icon } from "@iconify/react";
import type React from "react";
import { useEffect, useState } from "react";
import { folderDropId } from "../../lib/note-drag";
import {
  customChildFolders,
  normalizePath,
  PROJECT_CATEGORIES,
  type Project,
  type ProjectCategoryId,
} from "../../lib/projects";
import { NoteDropSurface } from "../layout/NoteDropSurface";
import { NewFolderRow } from "../sidebar/NewFolderRow";
import { NewNoteMenu } from "../sidebar/NewNoteMenu";
import { RenameInput } from "../sidebar/RenameInput";

const CATEGORY_ICONS: Record<ProjectCategoryId, string> = {
  thinking: "uil:comment-dots",
  features: "uil:lightbulb",
  bugs: "uil:bug",
  context: "uil:book-open",
};

interface ProjectsSidebarProps {
  projects: Project[];
  selectedFolder: string | null;
  folderPaths: string[];
  onOpenProject: (project: Project) => void;
  onOpenFolder: (folderPath: string) => void;
  onCreate: () => void;
  /** Blank or a template, written into that section folder. */
  onCreateSectionNote: (folderPath: string, templateId: string | null) => void;
  onContextMenu: (event: React.MouseEvent, folderPath: string) => void;
  onDropNote: (noteId: string, folderPath: string) => void;
  renamingFolderPath: string | null;
  onRenameCommit: (oldPath: string, newName: string) => void;
  onRenameCancel: () => void;
  newFolderParent: string | null;
  onCreateFolder: (parentPath: string, name: string) => void;
}

function leafName(folderPath: string): string {
  return normalizePath(folderPath).split("/").pop() ?? folderPath;
}

export function ProjectsSidebar({
  projects,
  selectedFolder,
  folderPaths,
  onOpenProject,
  onOpenFolder,
  onCreate,
  onCreateSectionNote,
  onContextMenu,
  onDropNote,
  renamingFolderPath,
  onRenameCommit,
  onRenameCancel,
  newFolderParent,
  onCreateFolder,
}: ProjectsSidebarProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // A new subfolder or a rename of a child has to stay visible after the input
  // closes. Expanding here keeps that row on the project instead of the Folders list.
  useEffect(() => {
    const target = newFolderParent ? normalizePath(newFolderParent) : null;
    const renaming = renamingFolderPath ? normalizePath(renamingFolderPath) : null;
    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const project of projects) {
        const root = normalizePath(project.rootPath);
        const hit =
          target === root || target?.startsWith(`${root}/`) || renaming?.startsWith(`${root}/`);
        if (hit && !next.has(project.id)) {
          next.add(project.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [newFolderParent, renamingFolderPath, projects]);

  return (
    <div className="mb-3" data-testid="projects-nav">
      <div className="mb-1 flex items-center px-2">
        <span className="flex-1 text-xs font-semibold uppercase tracking-wider opacity-40">
          Projects
        </span>
        <button
          type="button"
          aria-label="New project"
          title="New project"
          onClick={onCreate}
          className="btn btn-ghost btn-xs btn-square opacity-40 hover:opacity-100"
        >
          <Icon icon="uil:plus" className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {projects.length === 0 ? (
        <p className="px-2 py-1 text-xs opacity-40">No projects yet</p>
      ) : (
        <ul>
          {projects.map((project) => {
            const root = normalizePath(project.rootPath);
            const addingHere = newFolderParent != null && normalizePath(newFolderParent) === root;
            const addingInside =
              newFolderParent != null && normalizePath(newFolderParent).startsWith(`${root}/`);
            const renamingHere =
              renamingFolderPath != null && normalizePath(renamingFolderPath) === root;
            const renamingInside =
              renamingFolderPath != null &&
              normalizePath(renamingFolderPath).startsWith(`${root}/`);
            const open = expanded.has(project.id) || addingHere || addingInside || renamingInside;
            const projectActive = selectedFolder != null && normalizePath(selectedFolder) === root;
            const extras = customChildFolders(root, folderPaths);
            return (
              <li key={project.id}>
                <NoteDropSurface
                  dropId={folderDropId(project.rootPath)}
                  className={`flex items-center gap-1 py-1 text-sm ${
                    projectActive
                      ? "bg-base-300 text-base-content"
                      : "text-base-content/70 hover:bg-base-200"
                  }`}
                  onContextMenu={(event) => onContextMenu(event, project.rootPath)}
                  onDropNote={(noteId) => onDropNote(noteId, project.rootPath)}
                >
                  <button
                    type="button"
                    className="flex h-5 w-5 shrink-0 items-center justify-center"
                    aria-label={open ? `Collapse ${project.name}` : `Expand ${project.name}`}
                    aria-expanded={open}
                    onClick={() => {
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(project.id)) next.delete(project.id);
                        else next.add(project.id);
                        return next;
                      });
                    }}
                  >
                    <Icon
                      icon="uil:angle-right"
                      className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                  {renamingHere ? (
                    <div className="flex min-w-0 flex-1 items-center gap-1.5 pr-2">
                      <Icon
                        icon="uil:briefcase"
                        className="h-3.5 w-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      <RenameInput
                        initial={leafName(project.rootPath)}
                        onCommit={(value) => onRenameCommit(project.rootPath, value)}
                        onCancel={onRenameCancel}
                        className="flex-1 rounded bg-base-100 px-1 text-sm text-base-content outline outline-1 outline-primary"
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpenProject(project)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 pr-2 text-left"
                    >
                      <Icon
                        icon="uil:briefcase"
                        className="h-3.5 w-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="truncate">{project.name}</span>
                    </button>
                  )}
                </NoteDropSurface>
                {open && (
                  <ul>
                    {addingHere && (
                      <li>
                        <NewFolderRow onCommit={(name) => onCreateFolder(project.rootPath, name)} />
                      </li>
                    )}
                    {PROJECT_CATEGORIES.map((category) => {
                      const folderPath = `${root}/${category.dir}`;
                      const active =
                        selectedFolder != null && normalizePath(selectedFolder) === folderPath;
                      return (
                        <li key={category.id} className="flex items-center pr-1">
                          <NoteDropSurface
                            dropId={folderDropId(folderPath)}
                            className="min-w-0 flex-1"
                            onDropNote={(noteId) => onDropNote(noteId, folderPath)}
                          >
                            <button
                              type="button"
                              onClick={() => onOpenFolder(folderPath)}
                              className={`flex w-full min-w-0 items-center gap-1.5 py-1 text-left text-sm ${
                                active
                                  ? "bg-base-300 text-base-content"
                                  : "text-base-content/60 hover:bg-base-200 hover:text-base-content"
                              }`}
                              style={{ paddingLeft: 28 }}
                            >
                              <Icon
                                icon={CATEGORY_ICONS[category.id]}
                                className="h-3.5 w-3.5 shrink-0 opacity-70"
                                aria-hidden="true"
                              />
                              <span className="truncate">{category.label}</span>
                            </button>
                          </NoteDropSurface>
                          <NewNoteMenu
                            ariaLabel={`New note in ${project.name} ${category.label}`}
                            title={`New note in ${category.label}`}
                            className="btn btn-ghost btn-xs btn-square opacity-50 hover:opacity-100"
                            onSelect={(templateId) => onCreateSectionNote(folderPath, templateId)}
                          >
                            <Icon icon="uil:plus" className="h-3 w-3" aria-hidden="true" />
                          </NewNoteMenu>
                        </li>
                      );
                    })}
                    {extras.map((folderPath) => {
                      const child = normalizePath(folderPath);
                      const active =
                        selectedFolder != null && normalizePath(selectedFolder) === child;
                      const renaming =
                        renamingFolderPath != null && normalizePath(renamingFolderPath) === child;
                      const adding =
                        newFolderParent != null && normalizePath(newFolderParent) === child;
                      return (
                        <li key={folderPath}>
                          <NoteDropSurface
                            dropId={folderDropId(folderPath)}
                            className={`flex items-center py-1 text-sm ${
                              active
                                ? "bg-base-300 text-base-content"
                                : "text-base-content/60 hover:bg-base-200 hover:text-base-content"
                            }`}
                            style={{ paddingLeft: 28 }}
                            onContextMenu={(event) => onContextMenu(event, folderPath)}
                            onDropNote={(noteId) => onDropNote(noteId, folderPath)}
                          >
                            {renaming ? (
                              <div className="flex min-w-0 flex-1 items-center gap-1.5 pr-2">
                                <Icon
                                  icon="uil:folder"
                                  className="h-3.5 w-3.5 shrink-0 opacity-70"
                                  aria-hidden="true"
                                />
                                <RenameInput
                                  initial={leafName(folderPath)}
                                  onCommit={(value) => onRenameCommit(folderPath, value)}
                                  onCancel={onRenameCancel}
                                  className="flex-1 rounded bg-base-100 px-1 text-sm text-base-content outline outline-1 outline-primary"
                                />
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onOpenFolder(folderPath)}
                                className="flex min-w-0 flex-1 items-center gap-1.5 pr-2 text-left"
                              >
                                <Icon
                                  icon="uil:folder"
                                  className="h-3.5 w-3.5 shrink-0 opacity-70"
                                  aria-hidden="true"
                                />
                                <span className="truncate">{leafName(folderPath)}</span>
                              </button>
                            )}
                          </NoteDropSurface>
                          {adding && (
                            <NewFolderRow onCommit={(name) => onCreateFolder(folderPath, name)} />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
