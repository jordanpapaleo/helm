/**
 * Filesystem side of Helm projects.
 *
 * Membership, categories, workflow defaults, and the metadata schema live in
 * src/lib/projects.ts so this server cannot drift from the app.
 */
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { ulid } from "ulid";
import {
  creationDefaultsForFolder,
  isProjectMember,
  PROJECT_META_FILENAME,
  type Project,
  type ProjectCategoryId,
  planCategoryMove,
  planCreateProject,
  planPromoteFolder,
  projectForPath,
  projectFromMetaFile,
  serializeProjectMeta,
} from "../src/lib/projects";
import { nowTimestamp } from "./timestamps";

export type { Project, ProjectCategoryId };

export interface VaultRef {
  name: string;
  path: string;
}

function skipDir(name: string): boolean {
  return name.startsWith(".") || name === "assets";
}

export function walkMarkdownFiles(root: string): string[] {
  const out: string[] = [];
  const visit = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (entry.name === "assets") continue;
        visit(full);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        out.push(full);
      }
    }
  };
  visit(root);
  return out;
}

function walkDirectories(root: string): string[] {
  const out: string[] = [];
  const visit = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (skipDir(entry.name) || entry.isSymbolicLink() || !entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      out.push(full);
      visit(full);
    }
  };
  visit(root);
  return out;
}

export function readProjects(vaults: VaultRef[]): Project[] {
  const projects: Project[] = [];
  for (const vault of vaults) {
    if (!fs.existsSync(vault.path)) continue;
    const markers = [path.join(vault.path, PROJECT_META_FILENAME)];
    for (const dir of walkDirectories(vault.path)) {
      markers.push(path.join(dir, PROJECT_META_FILENAME));
    }
    for (const metaPath of markers) {
      if (!fs.existsSync(metaPath)) continue;
      try {
        const project = projectFromMetaFile(
          metaPath,
          fs.readFileSync(metaPath, "utf8"),
          "",
          vault.path,
        );
        if (project) projects.push(project);
      } catch {
        // Unreadable metadata is skipped; the folder stays an ordinary folder.
      }
    }
  }
  return projects;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function writeMainPage(
  project: Project,
  filePath: string,
  title: string,
  content: string,
  now: string,
): void {
  const frontmatter = {
    id: project.mainPageId,
    title,
    created: now,
    updated: now,
    tags: [] as string[],
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
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, matter.stringify(content, frontmatter));
}

function applyPlan(
  folders: string[],
  project: Project,
  page: { filePath: string; fileName: string; title: string; content: string },
  now: string,
): Project {
  for (const folder of folders) ensureDir(folder);
  writeMainPage(project, page.filePath, page.title, page.content, now);
  ensureDir(path.dirname(project.metaPath));
  fs.writeFileSync(project.metaPath, serializeProjectMeta(project));
  return project;
}

export function createProjectDir(
  vault: VaultRef,
  name: string,
  repository: string | null,
): { ok: true; project: Project; mainPagePath: string } | { ok: false; error: string } {
  const now = nowTimestamp();
  const projects = readProjects([vault]);
  const notePaths = fs.existsSync(vault.path) ? walkMarkdownFiles(vault.path) : [];
  const plan = planCreateProject({
    vaultId: "",
    vaultPath: vault.path,
    parentPath: vault.path,
    name,
    repository,
    existingFolderPaths: fs.existsSync(vault.path) ? walkDirectories(vault.path) : [],
    existingFilePaths: notePaths,
    projects,
    projectId: ulid(),
    mainPageId: ulid(),
    now,
  });
  if (!plan.ok) return plan;
  applyPlan(plan.folders, plan.project, plan.mainPage, now);
  return { ok: true, project: plan.project, mainPagePath: plan.mainPage.filePath };
}

export function promoteProjectDir(
  vault: VaultRef,
  folderPath: string,
  repository: string | null,
): { ok: true; project: Project; mainPagePath: string } | { ok: false; error: string } {
  const now = nowTimestamp();
  // path.join keeps `..`, so `/vault/../outside` would look like a child of the
  // vault to a string-prefix check. Resolve first, then test containment.
  const absolute = path.resolve(vault.path, folderPath);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) {
    return { ok: false, error: `Folder not found: ${folderPath}` };
  }
  const existingFilePaths = walkMarkdownFiles(vault.path);
  const marker = path.join(absolute, PROJECT_META_FILENAME);
  if (fs.existsSync(marker)) existingFilePaths.push(marker);
  const plan = planPromoteFolder({
    vaultId: "",
    vaultPath: vault.path,
    folderPath: absolute,
    repository,
    existingFilePaths,
    projects: readProjects([vault]),
    projectId: ulid(),
    mainPageId: ulid(),
    now,
  });
  if (!plan.ok) return plan;
  applyPlan(plan.folders, plan.project, plan.mainPage, now);
  return { ok: true, project: plan.project, mainPagePath: plan.mainPage.filePath };
}

export function captureThinkingNote(
  project: Project,
  title: string,
  content: string,
): { id: string; filePath: string } {
  const id = ulid();
  const now = nowTimestamp();
  const defaults = creationDefaultsForFolder(path.join(project.rootPath, "thinking"), [project]);
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  const filePath = path.join(
    project.rootPath,
    "thinking",
    `${slug || "note"}-${id.slice(-6).toLowerCase()}.md`,
  );
  ensureDir(path.dirname(filePath));
  const frontmatter = {
    id,
    title,
    created: now,
    updated: now,
    tags: [] as string[],
    urgent: false,
    important: false,
    state: defaults?.state ?? "",
    blocked: false,
    unmanaged: defaults?.unmanaged ?? true,
    links: [] as string[],
  };
  fs.writeFileSync(filePath, matter.stringify(content, frontmatter));
  return { id, filePath };
}

export function moveNoteToCategoryFile(input: {
  noteId: string;
  filePath: string;
  fileName: string;
  project: Project;
  category: ProjectCategoryId;
  takenPaths: string[];
}): { ok: true; from: string; to: string } | { ok: false; error: string } {
  const plan = planCategoryMove(input);
  if (!plan.ok) return plan;
  if (plan.to !== plan.from) {
    ensureDir(path.dirname(plan.to));
    fs.renameSync(plan.from, plan.to);
  }
  return plan;
}

export function membersOf<T extends { filePath: string }>(notes: T[], project: Project): T[] {
  return notes.filter((note) => isProjectMember(note.filePath, project.rootPath));
}

export function projectIdForPath(filePath: string, projects: Project[]): string | undefined {
  return projectForPath(filePath, projects)?.id;
}
