import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TagNode } from "../../store/notes";
import type { Note } from "../../types/note";
import { TagTree } from "./TagTree";

function makeNote(id: string, title: string, tags: string[]): Note {
  return {
    id,
    filePath: `/notes/${id}.md`,
    fileName: `${id}.md`,
    content: "",
    vaultId: "",
    frontmatter: {
      id,
      title,
      created: "2026-03-13",
      updated: "2026-03-13",
      tags,
      urgent: false,
      important: false,
      state: "Doing",
      blocked: false,
    },
  };
}

const mockTree: Record<string, TagNode> = {
  rl: {
    notes: [makeNote("01", "Rule Builder", ["rl", "ce"])],
    children: {},
  },
  ce: {
    notes: [makeNote("01", "Rule Builder", ["rl", "ce"])],
    children: {},
  },
};

const nestedTree: Record<string, TagNode> = {
  work: {
    notes: [],
    children: {
      project: {
        notes: [makeNote("02", "Project Note", ["work/project"])],
        children: {},
      },
    },
  },
};

describe("TagTree", () => {
  it("renders top-level tags", () => {
    render(<TagTree tree={mockTree} onSelectTag={vi.fn()} activeTag={null} showCount={false} />);
    expect(screen.getByText("#rl")).toBeInTheDocument();
    expect(screen.getByText("#ce")).toBeInTheDocument();
  });

  it("does not render notes — only tags", () => {
    render(<TagTree tree={mockTree} onSelectTag={vi.fn()} activeTag={null} showCount={false} />);
    expect(screen.queryByText("Rule Builder")).not.toBeInTheDocument();
  });

  it("calls onSelectTag with the tag path when a tag is clicked", () => {
    const onSelect = vi.fn();
    render(<TagTree tree={mockTree} onSelectTag={onSelect} activeTag={null} showCount={false} />);
    fireEvent.click(screen.getByText("#rl"));
    expect(onSelect).toHaveBeenCalledWith("rl");
  });

  it("highlights the active tag", () => {
    render(<TagTree tree={mockTree} onSelectTag={vi.fn()} activeTag="rl" showCount={false} />);
    const tagBtn = screen.getByText("#rl").closest("button");
    expect(tagBtn?.className).toContain("bg-[var(--color-surface)]");
  });

  it("shows child tags expanded when parent expand button is clicked", () => {
    render(<TagTree tree={nestedTree} onSelectTag={vi.fn()} activeTag={null} showCount={false} />);
    expect(screen.queryByText("#project")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("▶"));
    expect(screen.getByText("#project")).toBeInTheDocument();
  });

  it("collapses child tags when expand button is clicked again", () => {
    render(<TagTree tree={nestedTree} onSelectTag={vi.fn()} activeTag={null} showCount={false} />);
    fireEvent.click(screen.getByText("▶"));
    expect(screen.getByText("#project")).toBeInTheDocument();
    fireEvent.click(screen.getByText("▼"));
    expect(screen.queryByText("#project")).not.toBeInTheDocument();
  });

  it("shows note count badge when showCount is true", () => {
    render(<TagTree tree={mockTree} onSelectTag={vi.fn()} activeTag={null} showCount={true} />);
    const counts = screen.getAllByText("1");
    expect(counts.length).toBeGreaterThan(0);
  });

  it("hides note count badge when showCount is false", () => {
    render(<TagTree tree={mockTree} onSelectTag={vi.fn()} activeTag={null} showCount={false} />);
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });
});
