import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Project } from "../../lib/projects";
import { useNoteStore } from "../../store/notes";
import type { Note, VaultConfig } from "../../types/note";
import { ProjectsSidebar } from "./ProjectsSidebar";

const VAULT: VaultConfig = { id: "v1", name: "Work", path: "/vault" };

const kitchen: Project = {
  id: "01PROJECT0000000000000001",
  name: "Kitchen",
  mainPageId: "01MAINPAGE000000000000001",
  status: "active",
  repository: null,
  rootPath: "/vault/kitchen",
  metaPath: "/vault/kitchen/helm-project.json",
  vaultId: "v1",
  vaultPath: "/vault",
};

function templateNote(): Note {
  return {
    id: "tmpl",
    filePath: "/vault/bug.md",
    fileName: "bug.md",
    content: "Steps to reproduce.",
    vaultId: "v1",
    frontmatter: {
      id: "tmpl",
      title: "Bug report",
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
      tags: [],
      urgent: false,
      important: false,
      state: "Prepare",
      blocked: false,
      template: true,
    },
  };
}

function renderSidebar(
  onCreateSectionNote = vi.fn(),
  extras: Partial<Parameters<typeof ProjectsSidebar>[0]> = {},
) {
  return render(
    <ProjectsSidebar
      projects={[kitchen]}
      selectedFolder={null}
      folderPaths={["/vault/kitchen", "/vault/kitchen/samples"]}
      onOpenProject={vi.fn()}
      onOpenFolder={vi.fn()}
      onCreate={vi.fn()}
      onCreateSectionNote={onCreateSectionNote}
      onContextMenu={vi.fn()}
      renamingFolderPath={null}
      onRenameCommit={vi.fn()}
      onRenameCancel={vi.fn()}
      newFolderParent={null}
      onCreateFolder={vi.fn()}
      {...extras}
    />,
  );
}

describe("ProjectsSidebar section notes", () => {
  it("offers Blank and templates on every project section and creates in that folder", () => {
    useNoteStore.setState({
      notes: [templateNote()],
      vaults: [VAULT],
      activeVaultId: "v1",
    });
    const onCreateSectionNote = vi.fn();
    renderSidebar(onCreateSectionNote);

    expect(
      screen.queryByRole("button", { name: "New note in Kitchen Thinking" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand Kitchen" }));

    const projectsNav = screen.getByTestId("projects-nav");
    const sections = ["Thinking", "Features", "Bugs", "Context / Docs"] as const;

    for (const label of sections) {
      const trigger = within(projectsNav).getByRole("button", {
        name: `New note in Kitchen ${label}`,
      });
      expect(trigger).toHaveAttribute("aria-haspopup", "menu");
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    }

    expect(
      within(projectsNav).queryByRole("button", { name: "New note in Kitchen samples" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(projectsNav).getByRole("button", { name: "New note in Kitchen Features" }),
    );
    const menu = screen.getByRole("menu", { name: "New note in Kitchen Features" });
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Blank", "Bug report"]);

    fireEvent.click(within(menu).getByRole("menuitem", { name: "Bug report" }));
    expect(onCreateSectionNote).toHaveBeenCalledWith("/vault/kitchen/features", "tmpl");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    const bugs = within(projectsNav).getByRole("button", { name: "New note in Kitchen Bugs" });
    fireEvent.keyDown(bugs, { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("menuitem", { name: "Blank" }));
    expect(onCreateSectionNote).toHaveBeenLastCalledWith("/vault/kitchen/bugs", null);
  });

  it("keeps New project as its own action", () => {
    const onCreate = vi.fn();
    renderSidebar(vi.fn(), { onCreate });
    fireEvent.click(screen.getByRole("button", { name: "New project" }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
