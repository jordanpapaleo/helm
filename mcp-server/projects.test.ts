import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { beforeEach, describe, expect, it } from "vitest";
import {
  captureThinkingNote,
  createProjectDir,
  moveNoteToCategoryFile,
  promoteProjectDir,
  readProjects,
  walkMarkdownFiles,
} from "./projects";

let vault: string;

beforeEach(() => {
  vault = fs.mkdtempSync(path.join(os.tmpdir(), "helm-mcp-projects-"));
});

const ref = () => ({ name: "vault", path: vault });

describe("project files", () => {
  it("creates the standard structure and rediscovers it by id", () => {
    const created = createProjectDir(ref(), "Kitchen Remodel", null);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(fs.existsSync(path.join(created.project.rootPath, "thinking"))).toBe(true);
    expect(fs.existsSync(path.join(created.project.rootPath, "features"))).toBe(true);
    expect(fs.existsSync(path.join(created.project.rootPath, "bugs"))).toBe(true);
    expect(fs.existsSync(path.join(created.project.rootPath, "context"))).toBe(true);
    expect(fs.existsSync(created.mainPagePath)).toBe(true);
    expect(created.project.repository).toBeNull();

    const found = readProjects([ref()]);
    expect(found.map((project) => project.id)).toEqual([created.project.id]);
    expect(found[0]?.mainPageId).toBe(created.project.mainPageId);

    const page = matter(fs.readFileSync(created.mainPagePath, "utf8"));
    expect(page.data.unmanaged).toBe(true);
    expect(page.data.id).toBe(created.project.mainPageId);
  });

  it("promotes a folder without overwriting an existing note", () => {
    const folder = path.join(vault, "renovation");
    fs.mkdirSync(folder, { recursive: true });
    const existing = path.join(folder, "old-ideas.md");
    fs.writeFileSync(existing, "---\nid: keep-me\ntitle: Old\n---\n\nleave this\n");

    const promoted = promoteProjectDir(ref(), folder, null);
    expect(promoted.ok).toBe(true);
    if (!promoted.ok) return;
    expect(fs.readFileSync(existing, "utf8")).toContain("leave this");
    expect(promoted.mainPagePath).not.toBe(existing);
    expect(fs.existsSync(path.join(folder, "bugs"))).toBe(true);
  });

  it("rejects a nested project", () => {
    const parent = createProjectDir(ref(), "House", null);
    expect(parent.ok).toBe(true);
    if (!parent.ok) return;
    const nested = promoteProjectDir(ref(), path.join(parent.project.rootPath, "features"), null);
    expect(nested.ok).toBe(false);
  });

  it("captures into Thinking as unmanaged and moves without changing bytes or id", () => {
    const created = createProjectDir(ref(), "House", "https://example.com/house.git");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const captured = captureThinkingNote(created.project, "Skylight", "Maybe a skylight.");
    const before = fs.readFileSync(captured.filePath);
    const parsed = matter(before.toString("utf8"));
    expect(parsed.data.id).toBe(captured.id);
    expect(parsed.data.unmanaged).toBe(true);
    expect(parsed.data.state).not.toBe("Doing");

    const moved = moveNoteToCategoryFile({
      noteId: captured.id,
      filePath: captured.filePath,
      fileName: path.basename(captured.filePath),
      project: created.project,
      category: "features",
      takenPaths: [captured.filePath],
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(fs.readFileSync(moved.to).equals(before)).toBe(true);
    expect(matter(fs.readFileSync(moved.to, "utf8")).data.id).toBe(captured.id);
    expect(moved.to).toContain(`${path.sep}features${path.sep}`);
  });

  it("lists nested markdown and skips hidden directories", () => {
    const hidden = path.join(vault, ".git");
    fs.mkdirSync(path.join(vault, "docs"), { recursive: true });
    fs.mkdirSync(hidden, { recursive: true });
    fs.writeFileSync(path.join(vault, "docs", "note.md"), "# hi");
    fs.writeFileSync(path.join(hidden, "secret.md"), "# no");
    expect(walkMarkdownFiles(vault)).toEqual([path.join(vault, "docs", "note.md")]);
  });
});
