import { Icon } from "@iconify/react";
import { useState } from "react";
import { PROJECT_CATEGORIES, type Project, type ProjectCategoryId } from "../../lib/projects";

const CATEGORY_ICONS: Record<ProjectCategoryId, string> = {
  thinking: "uil:comment-dots",
  features: "uil:lightbulb",
  bugs: "uil:bug",
  context: "uil:book-open",
};

interface ProjectsSidebarProps {
  projects: Project[];
  selectedFolder: string | null;
  onOpenProject: (project: Project) => void;
  onOpenFolder: (folderPath: string) => void;
  onCreate: () => void;
  onCaptureThinking: (project: Project) => void;
}

export function ProjectsSidebar({
  projects,
  selectedFolder,
  onOpenProject,
  onOpenFolder,
  onCreate,
  onCaptureThinking,
}: ProjectsSidebarProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
            const open = expanded.has(project.id);
            const projectActive = selectedFolder === project.rootPath;
            return (
              <li key={project.id}>
                <div
                  className={`flex items-center gap-1 py-1 text-sm ${
                    projectActive
                      ? "bg-base-300 text-base-content"
                      : "text-base-content/70 hover:bg-base-200"
                  }`}
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
                </div>
                {open && (
                  <ul>
                    {PROJECT_CATEGORIES.map((category) => {
                      const folderPath = `${project.rootPath}/${category.dir}`;
                      const active = selectedFolder === folderPath;
                      return (
                        <li key={category.id} className="flex items-center pr-1">
                          <button
                            type="button"
                            onClick={() => onOpenFolder(folderPath)}
                            className={`flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-sm ${
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
                          {category.id === "thinking" && (
                            <button
                              type="button"
                              aria-label={`Capture into ${project.name} Thinking`}
                              title="Capture into Thinking"
                              onClick={() => onCaptureThinking(project)}
                              className="btn btn-ghost btn-xs btn-square opacity-50 hover:opacity-100"
                            >
                              <Icon icon="uil:plus" className="h-3 w-3" aria-hidden="true" />
                            </button>
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
