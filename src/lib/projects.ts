/**
 * Opt-in projects. A project is a folder with `helm-project.json` at its root
 * (stable id + main page id). The main page is an ordinary note.
 *
 * KEEP IN SYNC with mcp-server/projects.ts — membership, categories, workflow
 * defaults, overlap rules, and the metadata schema must match the MCP server.
 */
import { slugify } from "./note-parser";

export const PROJECT_META_FILENAME = "helm-project.json";

export const PROJECT_CATEGORIES = [
  { id: "thinking", dir: "thinking", label: "Thinking" },
  { id: "features", dir: "features", label: "Features" },
  { id: "bugs", dir: "bugs", label: "Bugs" },
  { id: "context", dir: "context", label: "Context / Docs" },
] as const;

export type ProjectCategoryId = (typeof PROJECT_CATEGORIES)[number]["id"];

export const PROJECT_STATUSES = ["active", "paused", "done"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_OVERVIEW_FIELDS = [
  { key: "purpose", label: "Purpose" },
  { key: "plan", label: "Plan / milestone" },
  { key: "nextAction", label: "Next action" },
  { key: "leftOff", label: "Where you left off" },
  { key: "blockers", label: "Blockers / decisions" },
] as const;

export type OverviewKey = (typeof PROJECT_OVERVIEW_FIELDS)[number]["key"];

export interface ProjectMeta {
  id: string;
  name: string;
  mainPageId: string;
  status: ProjectStatus;
  repository: string | null;
}

export interface Project extends ProjectMeta {
  /** Absolute path of the project folder. Not an identity — the id is. */
  rootPath: string;
  /** Absolute path of helm-project.json. */
  metaPath: string;
  vaultId: string;
  vaultPath: string;
}

export interface PlannedPage {
  id: string;
  filePath: string;
  fileName: string;
  title: string;
  content: string;
}

export type PlanResult =
  | { ok: true; project: Project; folders: string[]; mainPage: PlannedPage }
  | { ok: false; error: string };

export interface CreateProjectInput {
  vaultId: string;
  vaultPath: string;
  parentPath: string;
  name: string;
  repository: string | null;
  existingFolderPaths: string[];
  existingFilePaths: string[];
  projects: Project[];
  projectId: string;
  mainPageId: string;
  now: string;
}

export interface PromoteFolderInput {
  vaultId: string;
  vaultPath: string;
  folderPath: string;
  name?: string;
  repository: string | null;
  existingFilePaths: string[];
  projects: Project[];
  projectId: string;
  mainPageId: string;
  now: string;
}

/** Collapse `.` and `..` so a path cannot pretend to sit inside a vault. */
export function normalizePath(path: string): string {
  const absolute = path.startsWith("/");
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length > 0) parts.pop();
      continue;
    }
    parts.push(part);
  }
  const joined = parts.join("/");
  if (absolute) return joined ? `/${joined}` : "/";
  return joined;
}

export function isSameOrInside(path: string, root: string): boolean {
  const child = normalizePath(path);
  const parent = normalizePath(root);
  return child === parent || child.startsWith(`${parent}/`);
}

export function pathsOverlap(a: string, b: string): boolean {
  return isSameOrInside(a, b) || isSameOrInside(b, a);
}

/** Longest containing root wins if stored data ever overlaps. */
export function projectForPath(path: string, projects: Project[]): Project | null {
  const matches = projects.filter((project) => isSameOrInside(path, project.rootPath));
  matches.sort((a, b) => b.rootPath.length - a.rootPath.length);
  return matches[0] ?? null;
}

export function isProjectMember(filePath: string, rootPath: string): boolean {
  return isSameOrInside(filePath, rootPath);
}

export function categoryOf(
  fileOrFolder: string,
  rootPath: string,
): ProjectCategoryId | "root" | "other" | null {
  if (!isSameOrInside(fileOrFolder, rootPath)) return null;
  const rel = normalizePath(fileOrFolder).slice(normalizePath(rootPath).length).replace(/^\//, "");
  if (!rel) return "root";
  const first = rel.split("/")[0] ?? "";
  const category = PROJECT_CATEGORIES.find((item) => item.dir === first);
  if (category) return category.id;
  return rel.includes("/") ? "other" : "root";
}

export function categoryDirectory(id: ProjectCategoryId): string {
  const found = PROJECT_CATEGORIES.find((item) => item.id === id);
  return found?.dir ?? id;
}

export function folderDisplayName(
  folderPath: string,
  folderName: string,
  projects: Project[],
  enabled: boolean,
): string {
  if (!enabled) return folderName;
  const parent = folderPath.split("/").slice(0, -1).join("/");
  if (!projects.some((project) => normalizePath(project.rootPath) === normalizePath(parent))) {
    return folderName;
  }
  return PROJECT_CATEGORIES.find((item) => item.dir === folderName)?.label ?? folderName;
}

/**
 * Workflow applied when a note is created in a folder. Thinking and Context
 * start unmanaged so they stay off boards and the briefing. Features and Bugs
 * stay on the normal new-note default (Prepare, managed) — never Doing.
 * Absent means "no project default".
 */
export function creationDefaultsForFolder(
  folderPath: string,
  projects: Project[],
): { unmanaged: true; state: "" } | undefined {
  const project = projectForPath(folderPath, projects);
  if (!project) return undefined;
  const category = categoryOf(folderPath, project.rootPath);
  if (category === "thinking" || category === "context") {
    return { unmanaged: true, state: "" };
  }
  return undefined;
}

export function overviewValue(frontmatter: { [key: string]: unknown }, key: OverviewKey): string {
  const value = frontmatter[key];
  return typeof value === "string" ? value : "";
}

export function emptyRepository(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function openableHttpUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname) return null;
  url.username = "";
  url.password = "";
  return url.toString();
}

/**
 * Browser URL for a repository value. https and http open as written.
 * A git remote (scp, ssh, or git) opens as https. Anything else stays text.
 */
export function repositoryHref(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return openableHttpUrl(raw);
  if (/^(?:ssh|git):\/\//i.test(raw)) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    if (!url.hostname) return null;
    const path = url.pathname.replace(/\.git$/i, "") || "/";
    // ssh: and git: are not special schemes, so assigning protocol does not
    // switch them to https. Build a new URL instead.
    return openableHttpUrl(`https://${url.hostname}${path.startsWith("/") ? path : `/${path}`}`);
  }
  const scp = /^[\w.+-]+@([^:\s/]+):([^\s]+)$/.exec(raw);
  if (!scp) return null;
  const host = scp[1];
  const path = scp[2]?.replace(/\.git$/i, "").replace(/^\/+/, "");
  if (!host || !path || path.split("/").some((part) => part === "." || part === "..")) return null;
  return openableHttpUrl(`https://${host}/${path}`);
}

/**
 * Move-to destinations. Existing folders stay as they are. Each project is
 * added with its standard folders when those paths are not already listed.
 */
export function moveDestinations(
  folders: Array<{ label: string; path: string }>,
  projects: Project[],
  vaultPath: string,
): Array<{ label: string; path: string }> {
  const vault = normalizePath(vaultPath);
  const seen = new Set(folders.map((folder) => normalizePath(folder.path)));
  const extra: Array<{ label: string; path: string }> = [];
  const ordered = [...projects].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  for (const project of ordered) {
    if (normalizePath(project.vaultPath) !== vault) continue;
    const root = normalizePath(project.rootPath);
    const paths = [root, ...PROJECT_CATEGORIES.map((item) => `${root}/${item.dir}`)];
    for (const path of paths) {
      if (seen.has(path)) continue;
      if (!isSameOrInside(path, vault) || path === vault) continue;
      seen.add(path);
      extra.push({ label: path.slice(vault.length + 1), path });
    }
  }
  return [...folders, ...extra];
}

export function parseProjectMeta(raw: string): ProjectMeta | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id.trim()) return null;
  if (typeof record.name !== "string" || !record.name.trim()) return null;
  if (typeof record.mainPageId !== "string" || !record.mainPageId.trim()) return null;
  const status = PROJECT_STATUSES.includes(record.status as ProjectStatus)
    ? (record.status as ProjectStatus)
    : "active";
  return {
    id: record.id.trim(),
    name: record.name.trim(),
    mainPageId: record.mainPageId.trim(),
    status,
    repository: emptyRepository(typeof record.repository === "string" ? record.repository : null),
  };
}

export function serializeProjectMeta(meta: ProjectMeta): string {
  return `${JSON.stringify(
    {
      id: meta.id,
      name: meta.name,
      mainPageId: meta.mainPageId,
      status: meta.status,
      repository: meta.repository,
    },
    null,
    2,
  )}\n`;
}

export function projectFromMetaFile(
  metaPath: string,
  content: string,
  vaultId: string,
  vaultPath: string,
): Project | null {
  const meta = parseProjectMeta(content);
  if (!meta) return null;
  const rootPath = metaPath.slice(0, metaPath.lastIndexOf("/"));
  if (!rootPath) return null;
  return { ...meta, rootPath, metaPath, vaultId, vaultPath };
}

export function overlapError(candidate: string, existing: Project): string {
  if (normalizePath(candidate) === normalizePath(existing.rootPath)) {
    return `"${existing.name}" is already a project.`;
  }
  if (isSameOrInside(candidate, existing.rootPath)) {
    return `That folder is inside the project "${existing.name}". Nested projects aren't supported.`;
  }
  return `That folder contains the project "${existing.name}". Nested projects aren't supported.`;
}

function conflictingProject(candidate: string, projects: Project[]): Project | null {
  return projects.find((project) => pathsOverlap(candidate, project.rootPath)) ?? null;
}

export function collectFolderPaths(notePaths: string[], known: string[]): string[] {
  const paths = new Set<string>(known.map(normalizePath));
  for (const filePath of notePaths) {
    const parts = normalizePath(filePath).split("/");
    for (let i = 1; i < parts.length - 1; i++) {
      paths.add(parts.slice(0, i + 1).join("/"));
    }
  }
  return [...paths];
}

function standardFolders(rootPath: string): string[] {
  const root = normalizePath(rootPath);
  return PROJECT_CATEGORIES.map((item) => `${root}/${item.dir}`);
}

function allocateNoteFile(folder: string, title: string, taken: Set<string>): string {
  const base = slugify(title) || "note";
  let name = `${base}.md`;
  let i = 2;
  const dir = normalizePath(folder);
  while (taken.has(`${dir}/${name}`)) {
    name = `${base}-${i}.md`;
    i += 1;
  }
  return name;
}

function planMainPage(
  rootPath: string,
  title: string,
  mainPageId: string,
  existingFilePaths: string[],
): PlannedPage {
  const taken = new Set(existingFilePaths.map(normalizePath));
  const fileName = allocateNoteFile(rootPath, title, taken);
  const filePath = `${normalizePath(rootPath)}/${fileName}`;
  return {
    id: mainPageId,
    filePath,
    fileName,
    title,
    content: `# ${title}\n`,
  };
}

function buildProject(
  input: {
    vaultId: string;
    vaultPath: string;
    projectId: string;
    name: string;
    mainPageId: string;
    repository: string | null;
  },
  rootPath: string,
): Project {
  const root = normalizePath(rootPath);
  return {
    id: input.projectId,
    name: input.name.trim(),
    mainPageId: input.mainPageId,
    status: "active",
    repository: emptyRepository(input.repository),
    rootPath: root,
    metaPath: `${root}/${PROJECT_META_FILENAME}`,
    vaultId: input.vaultId,
    vaultPath: normalizePath(input.vaultPath),
  };
}

export function planCreateProject(input: CreateProjectInput): PlanResult {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Enter a project name." };
  const slug = slugify(name);
  if (!slug) return { ok: false, error: "Use a project name that can become a folder." };
  const parent = normalizePath(input.parentPath);
  const vault = normalizePath(input.vaultPath);
  if (!isSameOrInside(parent, vault)) {
    return { ok: false, error: "Choose a folder inside the vault." };
  }
  const rootPath = `${parent}/${slug}`;
  const folders = new Set(input.existingFolderPaths.map(normalizePath));
  if (folders.has(rootPath)) {
    return {
      ok: false,
      error: `A folder named "${slug}" already exists. Promote that folder instead.`,
    };
  }
  const conflict = conflictingProject(rootPath, input.projects);
  if (conflict) return { ok: false, error: overlapError(rootPath, conflict) };
  const project = buildProject(input, rootPath);
  return {
    ok: true,
    project,
    folders: [rootPath, ...standardFolders(rootPath)],
    mainPage: planMainPage(rootPath, name, input.mainPageId, input.existingFilePaths),
  };
}

export function planPromoteFolder(input: PromoteFolderInput): PlanResult {
  const folderPath = normalizePath(input.folderPath);
  const vault = normalizePath(input.vaultPath);
  if (!isSameOrInside(folderPath, vault) || folderPath === vault) {
    return { ok: false, error: "Choose a folder inside the vault." };
  }
  const metaPath = `${folderPath}/${PROJECT_META_FILENAME}`;
  if (input.existingFilePaths.map(normalizePath).includes(metaPath)) {
    return { ok: false, error: "That folder already has project metadata." };
  }
  const conflict = conflictingProject(folderPath, input.projects);
  if (conflict) return { ok: false, error: overlapError(folderPath, conflict) };
  const name = (input.name ?? folderPath.split("/").pop() ?? "").trim();
  if (!name) return { ok: false, error: "Enter a project name." };
  const project = buildProject({ ...input, name }, folderPath);
  return {
    ok: true,
    project,
    folders: standardFolders(folderPath),
    mainPage: planMainPage(folderPath, name, input.mainPageId, input.existingFilePaths),
  };
}

export function uniqueFilePath(
  folder: string,
  fileName: string,
  taken: Set<string>,
  except?: string,
): string {
  const dir = normalizePath(folder);
  const ext = fileName.toLowerCase().endsWith(".md") ? ".md" : "";
  const stem = ext ? fileName.slice(0, -ext.length) : fileName;
  const initial = `${dir}/${fileName}`;
  if (initial === except || !taken.has(initial)) return initial;
  let i = 2;
  while (taken.has(`${dir}/${stem}-${i}${ext}`)) i += 1;
  return `${dir}/${stem}-${i}${ext}`;
}

/**
 * Category move changes the file path only. Callers must not rewrite
 * frontmatter: id, history, links, and workflow commitment stay as they are.
 */
export function planCategoryMove(input: {
  noteId: string;
  filePath: string;
  fileName: string;
  project: Project;
  category: ProjectCategoryId;
  takenPaths: string[];
}): { ok: true; from: string; to: string } | { ok: false; error: string } {
  if (!isProjectMember(input.filePath, input.project.rootPath)) {
    return { ok: false, error: "That note is not in this project." };
  }
  if (input.noteId === input.project.mainPageId) {
    return { ok: false, error: "The project main page stays at the project root." };
  }
  const destDir = `${normalizePath(input.project.rootPath)}/${categoryDirectory(input.category)}`;
  const taken = new Set(input.takenPaths.map(normalizePath));
  const to = uniqueFilePath(destDir, input.fileName, taken, normalizePath(input.filePath));
  return { ok: true, from: normalizePath(input.filePath), to };
}

export function retargetProject(project: Project, oldPath: string, newPath: string): Project {
  const old = normalizePath(oldPath);
  const next = normalizePath(newPath);
  const root = normalizePath(project.rootPath);
  if (root !== old && !root.startsWith(`${old}/`)) return project;
  const rootPath = root === old ? next : `${next}${root.slice(old.length)}`;
  const renamedRoot = root === old;
  return {
    ...project,
    rootPath,
    metaPath: `${rootPath}/${PROJECT_META_FILENAME}`,
    name: renamedRoot ? (rootPath.split("/").pop() ?? project.name) : project.name,
  };
}
