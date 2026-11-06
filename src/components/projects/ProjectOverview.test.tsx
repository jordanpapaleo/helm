import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Project } from "../../lib/projects";
import type { Note, NoteFrontmatter } from "../../types/note";
import { ProjectOverview } from "./ProjectOverview";

const project: Project = {
  id: "01PROJECT0000000000000001",
  name: "Kitchen",
  mainPageId: "01MAIN",
  status: "active",
  repository: null,
  links: [],
  rootPath: "/vault/kitchen",
  metaPath: "/vault/kitchen/helm-project.json",
  vaultId: "v1",
  vaultPath: "/vault",
};

function frontmatter(extra: Partial<NoteFrontmatter> = {}): NoteFrontmatter {
  return {
    id: "01MAIN",
    title: "Kitchen",
    created: "2026-04-01T00:00:00Z",
    updated: "2026-04-01T00:00:00Z",
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
    ...extra,
  };
}

function note(id: string, filePath: string, extra: Partial<NoteFrontmatter> = {}): Note {
  return {
    id,
    filePath,
    fileName: filePath.split("/").pop() ?? "",
    content: "",
    vaultId: "v1",
    frontmatter: frontmatter({ id, title: id, ...extra }),
  };
}

describe("ProjectOverview", () => {
  it("edits the overview fields and shows only this project's managed work", () => {
    const onChange = vi.fn();
    const onOpenView = vi.fn();
    render(
      <ProjectOverview
        project={project}
        frontmatter={frontmatter()}
        onChange={onChange}
        onMetaChange={vi.fn()}
        onOpenView={onOpenView}
        notes={[
          note("doing", "/vault/kitchen/features/tile.md", { state: "Doing", unmanaged: false }),
          note("idea", "/vault/kitchen/thinking/idea.md", { unmanaged: true, state: "" }),
          note("outside", "/vault/other.md", { state: "Doing" }),
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Kitchen" })).toBeInTheDocument();
    expect(screen.getByText("Doing 1")).toBeInTheDocument();
    expect(screen.getByText("Blocked 0")).toBeInTheDocument();

    const purpose = screen.getByLabelText("Purpose");
    fireEvent.change(purpose, { target: { value: "A brighter kitchen" } });
    fireEvent.blur(purpose);
    expect(onChange).toHaveBeenCalledWith({ purpose: "A brighter kitchen" });

    fireEvent.click(screen.getByRole("button", { name: "Kanban" }));
    expect(onOpenView).toHaveBeenCalledWith("kanban");
  });

  it("links an http or git repository and edits it from a separate button", () => {
    const onMetaChange = vi.fn();
    const { rerender } = render(
      <ProjectOverview
        project={{ ...project, repository: "git@github.com:org/kitchen.git" }}
        frontmatter={frontmatter()}
        onChange={vi.fn()}
        onMetaChange={onMetaChange}
        onOpenView={vi.fn()}
        notes={[]}
      />,
    );

    const link = screen.getByRole("link", { name: "git@github.com:org/kitchen.git" });
    expect(link).toHaveAttribute("href", "https://github.com/org/kitchen");
    expect(screen.queryByRole("textbox", { name: "Repository" })).not.toBeInTheDocument();

    fireEvent.click(link);
    expect(onMetaChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "Repository" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit repository" }));
    const input = screen.getByRole("textbox", { name: "Repository" });
    expect(input).toHaveValue("git@github.com:org/kitchen.git");
    fireEvent.change(input, { target: { value: "  https://github.com/org/kitchen  " } });
    fireEvent.blur(input);
    expect(onMetaChange).toHaveBeenCalledWith({ repository: "https://github.com/org/kitchen" });

    rerender(
      <ProjectOverview
        project={{ ...project, repository: "https://github.com/org/kitchen" }}
        frontmatter={frontmatter()}
        onChange={vi.fn()}
        onMetaChange={onMetaChange}
        onOpenView={vi.fn()}
        notes={[]}
      />,
    );
    expect(screen.getByRole("link", { name: "https://github.com/org/kitchen" })).toHaveAttribute(
      "href",
      "https://github.com/org/kitchen",
    );
  });

  it("keeps edit available when the repository is empty or not a URL", () => {
    const onMetaChange = vi.fn();
    const { rerender } = render(
      <ProjectOverview
        project={project}
        frontmatter={frontmatter()}
        onChange={vi.fn()}
        onMetaChange={onMetaChange}
        onOpenView={vi.fn()}
        notes={[]}
      />,
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.getByText("Optional — this project works offline without one"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit repository" }));
    const emptyInput = screen.getByRole("textbox", { name: "Repository" });
    fireEvent.change(emptyInput, { target: { value: "  https://example.com/kitchen  " } });
    fireEvent.blur(emptyInput);
    expect(onMetaChange).toHaveBeenCalledWith({ repository: "https://example.com/kitchen" });

    rerender(
      <ProjectOverview
        project={{ ...project, repository: "kitchen notes" }}
        frontmatter={frontmatter()}
        onChange={vi.fn()}
        onMetaChange={onMetaChange}
        onOpenView={vi.fn()}
        notes={[]}
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("kitchen notes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit repository" }));
    const input = screen.getByRole("textbox", { name: "Repository" });
    fireEvent.change(input, { target: { value: "still notes" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onMetaChange).toHaveBeenCalledTimes(1);
    expect(screen.getByText("kitchen notes")).toBeInTheDocument();

    rerender(
      <ProjectOverview
        project={{ ...project, repository: "https://example.com/kitchen" }}
        frontmatter={frontmatter()}
        onChange={vi.fn()}
        onMetaChange={onMetaChange}
        onOpenView={vi.fn()}
        notes={[]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit repository" }));
    const clearing = screen.getByRole("textbox", { name: "Repository" });
    fireEvent.change(clearing, { target: { value: "  " } });
    fireEvent.blur(clearing);
    expect(onMetaChange).toHaveBeenCalledWith({ repository: null });
  });

  it("does not edit overview fields when the main page is locked", () => {
    const onChange = vi.fn();
    render(
      <ProjectOverview
        project={project}
        frontmatter={frontmatter({ locked: true, purpose: "Keep this" })}
        locked
        onChange={onChange}
        onMetaChange={vi.fn()}
        onOpenView={vi.fn()}
        notes={[]}
      />,
    );

    const purpose = screen.getByLabelText("Purpose");
    expect(purpose).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add link" })).toBeEnabled();
    fireEvent.change(purpose, { target: { value: "Changed anyway" } });
    fireEvent.blur(purpose);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("adds several links, opens them, and keeps the repository link", () => {
    const onMetaChange = vi.fn();
    const repository = "https://github.com/org/kitchen";
    const { rerender } = render(
      <ProjectOverview
        project={{ ...project, repository }}
        frontmatter={frontmatter()}
        onChange={vi.fn()}
        onMetaChange={onMetaChange}
        onOpenView={vi.fn()}
        notes={[]}
      />,
    );

    expect(screen.queryByRole("textbox", { name: "Label" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: repository })).toHaveAttribute("href", repository);

    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Label" }), {
      target: { value: "  Designs  " },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "URL" }), {
      target: { value: "figma.com/file/kitchen" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    expect(onMetaChange).toHaveBeenCalledWith({
      links: [{ label: "Designs", url: "https://figma.com/file/kitchen" }],
    });
    expect(onMetaChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ repository: expect.anything() }),
    );

    const withDesigns = {
      ...project,
      repository,
      links: [{ label: "Designs", url: "https://figma.com/file/kitchen" }],
    };
    rerender(
      <ProjectOverview
        project={withDesigns}
        frontmatter={frontmatter()}
        onChange={vi.fn()}
        onMetaChange={onMetaChange}
        onOpenView={vi.fn()}
        notes={[]}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Label" }), {
      target: { value: "Docs" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "URL" }), {
      target: { value: "https://example.com/docs" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    expect(onMetaChange).toHaveBeenLastCalledWith({
      links: [
        { label: "Designs", url: "https://figma.com/file/kitchen" },
        { label: "Docs", url: "https://example.com/docs" },
      ],
    });

    rerender(
      <ProjectOverview
        project={{
          ...withDesigns,
          links: [
            { label: "Designs", url: "https://figma.com/file/kitchen" },
            { label: "Docs", url: "https://example.com/docs" },
          ],
        }}
        frontmatter={frontmatter()}
        onChange={vi.fn()}
        onMetaChange={onMetaChange}
        onOpenView={vi.fn()}
        notes={[]}
      />,
    );

    const designs = screen.getByRole("link", { name: "Designs" });
    expect(designs).toHaveAttribute("href", "https://figma.com/file/kitchen");
    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute(
      "href",
      "https://example.com/docs",
    );
    expect(screen.getByRole("link", { name: repository })).toBeInTheDocument();
    fireEvent.click(designs);
    expect(onMetaChange).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "Remove Designs" }));
    expect(onMetaChange).toHaveBeenLastCalledWith({
      links: [{ label: "Docs", url: "https://example.com/docs" }],
    });
  });

  it("does not save a link without a label or an openable URL", () => {
    const onMetaChange = vi.fn();
    render(
      <ProjectOverview
        project={project}
        frontmatter={frontmatter()}
        onChange={vi.fn()}
        onMetaChange={onMetaChange}
        onOpenView={vi.fn()}
        notes={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    fireEvent.change(screen.getByRole("textbox", { name: "URL" }), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    expect(onMetaChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a label and an http or https URL.");

    fireEvent.change(screen.getByRole("textbox", { name: "Label" }), {
      target: { value: "Notes" },
    });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "URL" }), { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: "Label" })).not.toBeInTheDocument();
    expect(onMetaChange).not.toHaveBeenCalled();
  });
});
