import { Icon } from "@iconify/react";
import { useEffect, useId, useRef, useState } from "react";
import { isArchived } from "../../lib/archive";
import {
  isProjectMember,
  type OverviewKey,
  overviewValue,
  PROJECT_OVERVIEW_FIELDS,
  PROJECT_STATUSES,
  type Project,
  type ProjectStatus,
  repositoryHref,
} from "../../lib/projects";
import type { Note, NoteFrontmatter } from "../../types/note";

interface ProjectOverviewProps {
  project: Project;
  notes: Note[];
  frontmatter: NoteFrontmatter;
  /** Main page is read-only. Overview fields write that note, so they lock too. */
  locked?: boolean;
  onChange: (patch: Partial<NoteFrontmatter>) => void;
  onMetaChange: (patch: { status?: ProjectStatus; repository?: string | null }) => void;
  onOpenView: (view: "dashboard" | "kanban" | "eisenhower") => void;
}

function statusLabel(status: ProjectStatus): string {
  if (status === "paused") return "Paused";
  if (status === "done") return "Done";
  return "Active";
}

function openRepository(url: string) {
  const tauri = (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  const openInBrowser = () => {
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // jsdom and a missing popup blocker both leave the href on the link.
    }
  };
  if (!tauri) {
    openInBrowser();
    return;
  }
  void import("@tauri-apps/plugin-opener").then(({ openUrl }) => openUrl(url)).catch(openInBrowser);
}

function readFields(frontmatter: NoteFrontmatter): Record<OverviewKey, string> {
  return {
    purpose: overviewValue(frontmatter, "purpose"),
    plan: overviewValue(frontmatter, "plan"),
    nextAction: overviewValue(frontmatter, "nextAction"),
    leftOff: overviewValue(frontmatter, "leftOff"),
    blockers: overviewValue(frontmatter, "blockers"),
  };
}

export function ProjectOverview({
  project,
  notes,
  frontmatter,
  locked = false,
  onChange,
  onMetaChange,
  onOpenView,
}: ProjectOverviewProps) {
  const repoId = useId();
  const statusId = useId();
  const [draft, setDraft] = useState(() => readFields(frontmatter));
  const [repository, setRepository] = useState(project.repository ?? "");
  const [editingRepository, setEditingRepository] = useState(false);
  const skipRepositoryCommit = useRef(false);
  const editRepositoryRef = useRef<HTMLButtonElement>(null);
  const repositoryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(readFields(frontmatter));
  }, [frontmatter]);

  useEffect(() => {
    setRepository(project.repository ?? "");
    setEditingRepository(false);
  }, [project.repository]);

  useEffect(() => {
    if (editingRepository) repositoryInputRef.current?.focus();
  }, [editingRepository]);

  const members = notes.filter(
    (note) => !isArchived(note.frontmatter) && isProjectMember(note.filePath, project.rootPath),
  );
  const managed = members.filter((note) => !note.frontmatter.unmanaged);
  const doing = managed.filter((note) => note.frontmatter.state === "Doing").length;
  const blocked = managed.filter(
    (note) => note.frontmatter.blocked && note.frontmatter.state !== "Done",
  ).length;

  function commitField(key: OverviewKey) {
    if (locked) return;
    if (draft[key] === overviewValue(frontmatter, key)) return;
    onChange({ [key]: draft[key] });
  }

  function commitRepository() {
    if (skipRepositoryCommit.current) {
      skipRepositoryCommit.current = false;
      return;
    }
    const next = repository.trim() ? repository.trim() : null;
    if (next !== project.repository) onMetaChange({ repository: next });
    setEditingRepository(false);
  }

  function cancelRepositoryEdit() {
    skipRepositoryCommit.current = true;
    setRepository(project.repository ?? "");
    setEditingRepository(false);
    requestAnimationFrame(() => editRepositoryRef.current?.focus());
  }

  const repositoryLink = repositoryHref(project.repository);

  return (
    <section
      aria-label={`${project.name} overview`}
      data-testid="project-overview"
      className="border-b border-base-300 px-4 py-4"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Icon icon="uil:briefcase" className="h-4 w-4 shrink-0" aria-hidden="true" />
        <h2 className="text-sm font-semibold">{project.name}</h2>
        <label htmlFor={statusId} className="sr-only">
          Project status
        </label>
        <select
          id={statusId}
          value={project.status}
          onChange={(event) => onMetaChange({ status: event.target.value as ProjectStatus })}
          className="select select-bordered select-xs"
        >
          {PROJECT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {statusLabel(status)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {PROJECT_OVERVIEW_FIELDS.map((field) => (
          <label key={field.key} className="flex min-w-0 flex-col gap-1 text-xs">
            <span className="font-medium opacity-70">{field.label}</span>
            <textarea
              value={draft[field.key]}
              rows={field.key === "nextAction" ? 2 : 3}
              readOnly={locked}
              disabled={locked}
              onChange={(event) =>
                setDraft((current) => ({ ...current, [field.key]: event.target.value }))
              }
              onBlur={() => commitField(field.key)}
              className={`w-full resize-y rounded-lg border border-base-300 bg-base-100 px-2 py-1 text-sm text-base-content ${locked ? "cursor-not-allowed opacity-60" : ""}`}
            />
          </label>
        ))}
      </div>

      <div className="mt-3 flex min-w-0 flex-col gap-1 text-xs">
        <span className="font-medium opacity-70" id={`${repoId}-label`}>
          Repository
        </span>
        {editingRepository ? (
          <input
            ref={repositoryInputRef}
            id={repoId}
            aria-labelledby={`${repoId}-label`}
            value={repository}
            onChange={(event) => setRepository(event.target.value)}
            onBlur={commitRepository}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelRepositoryEdit();
              } else if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            placeholder="Optional — this project works offline without one"
            className="input input-bordered input-sm w-full"
          />
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            {repositoryLink ? (
              <a
                href={repositoryLink}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 truncate text-sm text-[var(--color-accent)] underline"
                onClick={(event) => {
                  if (
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey ||
                    event.button !== 0
                  ) {
                    return;
                  }
                  event.preventDefault();
                  openRepository(repositoryLink);
                }}
              >
                {project.repository}
              </a>
            ) : (
              <span className="min-w-0 truncate text-sm opacity-70">
                {project.repository || "Optional — this project works offline without one"}
              </span>
            )}
            <button
              ref={editRepositoryRef}
              type="button"
              aria-label="Edit repository"
              className="btn btn-ghost btn-xs shrink-0"
              onClick={() => {
                skipRepositoryCommit.current = false;
                setRepository(project.repository ?? "");
                setEditingRepository(true);
              }}
            >
              Edit
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="badge badge-ghost badge-sm">Doing {doing}</span>
        <span className="badge badge-ghost badge-sm">Blocked {blocked}</span>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => onOpenView("dashboard")}
        >
          Dashboard
        </button>
        <button type="button" className="btn btn-ghost btn-xs" onClick={() => onOpenView("kanban")}>
          Kanban
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => onOpenView("eisenhower")}
        >
          Eisenhower
        </button>
      </div>
    </section>
  );
}
