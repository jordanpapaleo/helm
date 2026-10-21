import { describe, expect, it } from "vitest";
import type { Note } from "../types/note";
import { buildBriefing } from "./briefing";
import { buildTree, type TreeNode } from "./file-tree";
import { notesInProjectScope } from "./project-scope";
import {
  categoryOf,
  collectFolderPaths,
  creationDefaultsForFolder,
  customChildFolders,
  moveDestinations,
  omitProjectFolders,
  type Project,
  parseProjectMeta,
  planCategoryMove,
  planCreateProject,
  planPromoteFolder,
  projectForPath,
  repositoryHref,
  retargetProject,
  serializeProjectMeta,
} from "./projects";

const NOW = "2026-04-01T00:00:00Z";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "01PROJECT0000000000000001",
    name: "Kitchen",
    mainPageId: "01MAINPAGE000000000000001",
    status: "active",
    repository: null,
    rootPath: "/vault/kitchen",
    metaPath: "/vault/kitchen/helm-project.json",
    vaultId: "v1",
    vaultPath: "/vault",
    ...overrides,
  };
}

function note(id: string, filePath: string, extra: Partial<Note["frontmatter"]> = {}): Note {
  return {
    id,
    filePath,
    fileName: filePath.split("/").pop() ?? "",
    content: "",
    vaultId: "v1",
    frontmatter: {
      id,
      title: id,
      created: NOW,
      updated: NOW,
      tags: [],
      urgent: false,
      important: false,
      state: "Prepare",
      blocked: false,
      ...extra,
    },
  };
}

const baseCreate = {
  vaultId: "v1",
  vaultPath: "/vault",
  parentPath: "/vault",
  name: "Kitchen",
  repository: null,
  existingFolderPaths: [] as string[],
  existingFilePaths: [] as string[],
  projects: [] as Project[],
  projectId: "01PROJECT0000000000000001",
  mainPageId: "01MAINPAGE000000000000001",
  now: NOW,
};

describe("project metadata", () => {
  it("round-trips the stable id, main page, status, and repository", () => {
    const raw = serializeProjectMeta({
      id: "01PROJECT0000000000000001",
      name: "Kitchen",
      mainPageId: "01MAINPAGE000000000000001",
      status: "paused",
      repository: "https://example.com/kitchen.git",
    });
    expect(parseProjectMeta(raw)).toEqual({
      id: "01PROJECT0000000000000001",
      name: "Kitchen",
      mainPageId: "01MAINPAGE000000000000001",
      status: "paused",
      repository: "https://example.com/kitchen.git",
    });
  });

  it("defaults a missing status to active and an empty repository to null", () => {
    expect(
      parseProjectMeta(
        JSON.stringify({
          id: "01PROJECT0000000000000001",
          name: "Kitchen",
          mainPageId: "01MAINPAGE000000000000001",
          repository: "  ",
        }),
      ),
    ).toMatchObject({ status: "active", repository: null });
  });

  it("rejects a file that is not project metadata", () => {
    expect(parseProjectMeta("{")).toBeNull();
    expect(parseProjectMeta(JSON.stringify({ name: "Kitchen" }))).toBeNull();
  });
});

describe("planCreateProject", () => {
  it("creates one structure and a main page for every project", () => {
    const plan = planCreateProject(baseCreate);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.project.id).toBe(baseCreate.projectId);
    expect(plan.project.rootPath).toBe("/vault/kitchen");
    expect(plan.project.repository).toBeNull();
    expect(plan.folders).toEqual([
      "/vault/kitchen",
      "/vault/kitchen/thinking",
      "/vault/kitchen/features",
      "/vault/kitchen/bugs",
      "/vault/kitchen/context",
    ]);
    expect(plan.mainPage.id).toBe(baseCreate.mainPageId);
    expect(plan.mainPage.filePath).toBe("/vault/kitchen/kitchen.md");
    expect(plan.mainPage.title).toBe("Kitchen");
  });

  it("refuses a name whose folder already exists", () => {
    const plan = planCreateProject({
      ...baseCreate,
      existingFolderPaths: ["/vault/kitchen"],
    });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toMatch(/Convert/);
  });

  it("refuses a project nested inside another project", () => {
    const plan = planCreateProject({
      ...baseCreate,
      parentPath: "/vault/kitchen/features",
      name: "Nested",
      projects: [project()],
    });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toMatch(/Nested projects/);
  });
});

describe("omitProjectFolders", () => {
  function paths(nodes: TreeNode[]): string[] {
    return nodes.flatMap((node) =>
      node.kind === "folder" ? [node.path, ...paths(node.children)] : [node.note.filePath],
    );
  }

  it("drops a project root and the folders inside it, and keeps other folders", () => {
    const tree = buildTree(
      [
        note("ideas", "/vault/kitchen/ideas.md"),
        note("specs", "/vault/kitchen/context/specs.md"),
        note("loose", "/vault/archive/loose.md"),
        note("root", "/vault/readme.md"),
      ],
      "/vault",
    );
    expect(paths(omitProjectFolders(tree, [project()]))).toEqual([
      "/vault/archive",
      "/vault/archive/loose.md",
      "/vault/readme.md",
    ]);
  });

  it("keeps a parent and a folder that only shares the project name as a prefix", () => {
    const tree = buildTree(
      [
        note("ideas", "/vault/home/kitchen/ideas.md"),
        note("recipes", "/vault/home/recipes.md"),
        note("list", "/vault/kitchen-notes/list.md"),
      ],
      "/vault",
    );
    expect(
      paths(
        omitProjectFolders(tree, [
          project({
            rootPath: "/vault/home/kitchen",
            metaPath: "/vault/home/kitchen/helm-project.json",
          }),
        ]),
      ),
    ).toEqual([
      "/vault/home",
      "/vault/home/recipes.md",
      "/vault/kitchen-notes",
      "/vault/kitchen-notes/list.md",
    ]);
  });

  it("resolves .. before deciding a folder is the project root", () => {
    const listed = omitProjectFolders(
      [
        {
          kind: "folder",
          name: "kitchen-notes",
          path: "/vault/kitchen/../kitchen-notes",
          children: [],
        },
        {
          kind: "folder",
          name: "kitchen",
          path: "/vault/kitchen/../kitchen",
          children: [
            {
              kind: "folder",
              name: "thinking",
              path: "/vault/kitchen/thinking",
              children: [],
            },
          ],
        },
      ],
      [project({ rootPath: "/vault/foo/../kitchen" })],
    );
    expect(paths(listed)).toEqual(["/vault/kitchen/../kitchen-notes"]);
  });
});

describe("customChildFolders", () => {
  it("lists only direct folders that are not the standard project categories", () => {
    expect(
      customChildFolders("/vault/kitchen", [
        "/vault/kitchen",
        "/vault/kitchen/thinking",
        "/vault/kitchen/thinking/later",
        "/vault/kitchen/features",
        "/vault/kitchen/bugs",
        "/vault/kitchen/context",
        "/vault/kitchen/samples",
        "/vault/kitchen/samples/tile",
        "/vault/kitchen-notes",
        "/vault/archive",
        "/vault/kitchen/../archive",
      ]),
    ).toEqual(["/vault/kitchen/samples"]);
  });
});

describe("planPromoteFolder", () => {
  it("adds the standard folders and a main page without listing existing notes as writes", () => {
    const plan = planPromoteFolder({
      vaultId: "v1",
      vaultPath: "/vault",
      folderPath: "/vault/renovation",
      repository: null,
      existingFilePaths: ["/vault/renovation/old-ideas.md", "/vault/renovation/renovation.md"],
      projects: [],
      projectId: "01PROJECT0000000000000002",
      mainPageId: "01MAINPAGE000000000000002",
      now: NOW,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.folders).toEqual([
      "/vault/renovation/thinking",
      "/vault/renovation/features",
      "/vault/renovation/bugs",
      "/vault/renovation/context",
    ]);
    expect(plan.mainPage.filePath).not.toBe("/vault/renovation/old-ideas.md");
    expect(plan.mainPage.filePath).not.toBe("/vault/renovation/renovation.md");
    expect(plan.mainPage.filePath).toBe("/vault/renovation/renovation-2.md");
    expect(plan.project.id).toBe("01PROJECT0000000000000002");
  });

  it("treats a path that climbs out of the vault as outside it", () => {
    const plan = planPromoteFolder({
      vaultId: "v1",
      vaultPath: "/vault",
      folderPath: "/vault/../outside",
      repository: null,
      existingFilePaths: [],
      projects: [],
      projectId: "01P",
      mainPageId: "01M",
      now: NOW,
    });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toMatch(/inside the vault/);
  });

  it("refuses to promote over an existing metadata file", () => {
    const plan = planPromoteFolder({
      vaultId: "v1",
      vaultPath: "/vault",
      folderPath: "/vault/renovation",
      repository: null,
      existingFilePaths: ["/vault/renovation/helm-project.json"],
      projects: [],
      projectId: "01P",
      mainPageId: "01M",
      now: NOW,
    });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toMatch(/project metadata/);
  });

  it("refuses the vault root and a folder that contains a project", () => {
    expect(
      planPromoteFolder({
        vaultId: "v1",
        vaultPath: "/vault",
        folderPath: "/vault",
        repository: null,
        existingFilePaths: [],
        projects: [],
        projectId: "01P",
        mainPageId: "01M",
        now: NOW,
      }).ok,
    ).toBe(false);
    const nested = planPromoteFolder({
      vaultId: "v1",
      vaultPath: "/vault",
      folderPath: "/vault/kitchen",
      repository: null,
      existingFilePaths: [],
      projects: [project({ rootPath: "/vault/kitchen/features" })],
      projectId: "01P",
      mainPageId: "01M",
      now: NOW,
    });
    expect(nested.ok).toBe(false);
  });
});

describe("workflow defaults and category moves", () => {
  const kitchen = project();

  it("starts Thinking and Context notes unmanaged and leaves Features managed but not Doing", () => {
    expect(creationDefaultsForFolder("/vault/kitchen/thinking", [kitchen])).toEqual({
      unmanaged: true,
      state: "",
    });
    expect(creationDefaultsForFolder("/vault/kitchen/context/specs", [kitchen])).toEqual({
      unmanaged: true,
      state: "",
    });
    expect(creationDefaultsForFolder("/vault/kitchen/features", [kitchen])).toBeUndefined();
    expect(creationDefaultsForFolder("/vault/kitchen/bugs/open", [kitchen])).toBeUndefined();
    expect(categoryOf("/vault/kitchen/bugs/open/leak.md", kitchen.rootPath)).toBe("bugs");
  });

  it("moves a note by path only and does not invent a new id", () => {
    const plan = planCategoryMove({
      noteId: "01NOTE0000000000000000001",
      filePath: "/vault/kitchen/thinking/idea.md",
      fileName: "idea.md",
      project: kitchen,
      category: "features",
      takenPaths: ["/vault/kitchen/thinking/idea.md"],
    });
    expect(plan).toEqual({
      ok: true,
      from: "/vault/kitchen/thinking/idea.md",
      to: "/vault/kitchen/features/idea.md",
    });
  });

  it("does not overwrite a file that already occupies the destination", () => {
    const plan = planCategoryMove({
      noteId: "01NOTE0000000000000000001",
      filePath: "/vault/kitchen/thinking/idea.md",
      fileName: "idea.md",
      project: kitchen,
      category: "bugs",
      takenPaths: ["/vault/kitchen/thinking/idea.md", "/vault/kitchen/bugs/idea.md"],
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.to).toBe("/vault/kitchen/bugs/idea-2.md");
  });

  it("refuses to move the main page out of the project root", () => {
    const plan = planCategoryMove({
      noteId: kitchen.mainPageId,
      filePath: "/vault/kitchen/kitchen.md",
      fileName: "kitchen.md",
      project: kitchen,
      category: "context",
      takenPaths: [],
    });
    expect(plan.ok).toBe(false);
  });
});

describe("identity survives a folder rename", () => {
  it("keeps the project id and main page id when the folder is renamed", () => {
    const next = retargetProject(project(), "/vault/kitchen", "/vault/renovation");
    expect(next.id).toBe("01PROJECT0000000000000001");
    expect(next.mainPageId).toBe("01MAINPAGE000000000000001");
    expect(next.rootPath).toBe("/vault/renovation");
    expect(next.metaPath).toBe("/vault/renovation/helm-project.json");
    expect(next.name).toBe("renovation");
  });

  it("rewrites a nested project path when a parent folder is renamed", () => {
    const next = retargetProject(project(), "/vault", "/notes");
    expect(next.id).toBe("01PROJECT0000000000000001");
    expect(next.rootPath).toBe("/notes/kitchen");
    expect(next.name).toBe("Kitchen");
  });
});

describe("repositoryHref", () => {
  it("keeps http and https URLs that can be opened", () => {
    expect(repositoryHref("https://github.com/org/repo")).toBe("https://github.com/org/repo");
    expect(repositoryHref("  http://example.com/repo.git ")).toBe("http://example.com/repo.git");
  });

  it("turns a git remote into an https page and drops embedded credentials", () => {
    expect(repositoryHref("git@github.com:org/repo.git")).toBe("https://github.com/org/repo");
    expect(repositoryHref("ssh://git@github.com/org/repo.git")).toBe("https://github.com/org/repo");
    expect(repositoryHref("git://github.com/org/repo.git")).toBe("https://github.com/org/repo");
    expect(repositoryHref("https://user:token@github.com/org/repo")).toBe(
      "https://github.com/org/repo",
    );
  });

  it("does not link an empty value or a value that is not a URL", () => {
    expect(repositoryHref(null)).toBeNull();
    expect(repositoryHref("")).toBeNull();
    expect(repositoryHref("  ")).toBeNull();
    expect(repositoryHref("kitchen notes")).toBeNull();
    expect(repositoryHref("javascript:alert(1)")).toBeNull();
    expect(repositoryHref("file:///tmp/repo")).toBeNull();
  });
});

describe("moveDestinations", () => {
  it("adds a project and its standard folders without duplicating paths already listed", () => {
    const folders = [
      { label: "/ (root)", path: "/vault" },
      { label: "kitchen", path: "/vault/kitchen" },
    ];
    const destinations = moveDestinations(folders, [project()], "/vault");
    expect(destinations.filter((item) => item.path === "/vault/kitchen")).toEqual([
      { label: "kitchen", path: "/vault/kitchen" },
    ]);
    expect(destinations.map((item) => item.path)).toEqual([
      "/vault",
      "/vault/kitchen",
      "/vault/kitchen/thinking",
      "/vault/kitchen/features",
      "/vault/kitchen/bugs",
      "/vault/kitchen/context",
    ]);
  });

  it("lists a project that is not already a folder in the tree", () => {
    const destinations = moveDestinations(
      [{ label: "/ (root)", path: "/vault" }],
      [
        project({
          name: "Garden",
          rootPath: "/vault/garden",
          metaPath: "/vault/garden/helm-project.json",
        }),
      ],
      "/vault",
    );
    expect(destinations.map((item) => item.label)).toContain("garden");
    expect(destinations.map((item) => item.label)).toContain("garden/features");
  });
});

describe("scoped workflow notes", () => {
  const kitchen = project();
  const notes = [
    note("in", "/vault/kitchen/features/tile.md", { state: "Doing", title: "Tile" }),
    note("think", "/vault/kitchen/thinking/idea.md", {
      unmanaged: true,
      state: "",
      title: "Idea",
    }),
    note("out", "/vault/other/task.md", { state: "Doing", title: "Elsewhere" }),
  ];

  it("limits a project folder to member notes and leaves All Notes global", () => {
    const scoped = notesInProjectScope(
      notes,
      { type: "folder", id: "/vault/kitchen/features" },
      [kitchen],
      true,
    );
    expect(scoped.project?.id).toBe(kitchen.id);
    expect(scoped.notes.map((item) => item.id)).toEqual(["in", "think"]);

    const global = notesInProjectScope(notes, { type: "all", id: null }, [kitchen], true);
    expect(global.project).toBeNull();
    expect(global.notes).toHaveLength(3);
  });

  it("keeps every note when Projects is off, even inside a project folder", () => {
    const scoped = notesInProjectScope(
      notes,
      { type: "folder", id: "/vault/kitchen" },
      [kitchen],
      false,
    );
    expect(scoped.notes).toHaveLength(3);
    expect(scoped.project).toBeNull();
  });

  it("keeps unmanaged thinking notes out of the briefing and includes managed project work", () => {
    const scoped = notesInProjectScope(
      notes,
      { type: "folder", id: "/vault/kitchen" },
      [kitchen],
      true,
    );
    const briefing = buildBriefing(scoped.notes, "2026-04-02");
    expect(briefing.doing.map((item) => item.id)).toEqual(["in"]);
  });

  it("does not treat a similarly prefixed folder as the project", () => {
    expect(projectForPath("/vault/kitchen-plans/note.md", [kitchen])).toBeNull();
    expect(collectFolderPaths(["/vault/kitchen/features/tile.md"], [])).toContain(
      "/vault/kitchen/features",
    );
  });
});
