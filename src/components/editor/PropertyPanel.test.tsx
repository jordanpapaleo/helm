import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NOTE_STATES } from "../../lib/constants";
import { DEFAULT_LAYOUT } from "../../lib/workspace-layout";
import { useLayoutStore } from "../../store/layout";
import { usePinnedPanelStore, WRITER_TAB } from "../../store/pinned-panel";
import type { NoteFrontmatter } from "../../types/note";
import { PropertyPanel } from "./PropertyPanel";

function makeFrontmatter(overrides: Partial<NoteFrontmatter> = {}): NoteFrontmatter {
  return {
    id: "01JPMXYZ123",
    title: "Untitled",
    created: "2026-07-10",
    updated: "2026-07-10",
    tags: [],
    urgent: false,
    important: false,
    state: "Prepare",
    blocked: false,
    ...overrides,
  };
}

describe("PropertyPanel title", () => {
  function startEdit() {
    fireEvent.click(screen.getByRole("button", { name: "Edit title" }));
    return screen.getByRole("textbox", { name: "Note title" });
  }

  it("shows the title with an edit button until the pencil is clicked", () => {
    render(<PropertyPanel frontmatter={makeFrontmatter({ title: "Old" })} onChange={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Old" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Note title" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit title" })).toBeEnabled();
  });

  it("saves the trimmed title on blur, Enter, and the save icon", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <PropertyPanel frontmatter={makeFrontmatter({ title: "Old" })} onChange={onChange} />,
    );

    fireEvent.change(startEdit(), { target: { value: "  From blur  " } });
    fireEvent.blur(screen.getByRole("textbox", { name: "Note title" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ title: "From blur" });

    rerender(<PropertyPanel frontmatter={makeFrontmatter({ title: "Old" })} onChange={onChange} />);
    const byEnter = startEdit();
    fireEvent.change(byEnter, { target: { value: "From enter" } });
    fireEvent.keyDown(byEnter, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith({ title: "From enter" });

    rerender(<PropertyPanel frontmatter={makeFrontmatter({ title: "Old" })} onChange={onChange} />);
    fireEvent.change(startEdit(), { target: { value: "From save" } });
    fireEvent.click(screen.getByRole("button", { name: "Save title" }));
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenLastCalledWith({ title: "From save" });
  });

  it("does not save while typing, and Escape restores the original title", () => {
    const onChange = vi.fn();
    render(<PropertyPanel frontmatter={makeFrontmatter({ title: "Old" })} onChange={onChange} />);

    const input = startEdit();
    fireEvent.change(input, { target: { value: "Halfway" } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Old" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Note title" })).not.toBeInTheDocument();
  });

  it("ignores an empty title and a title that did not change", () => {
    const onChange = vi.fn();
    render(<PropertyPanel frontmatter={makeFrontmatter({ title: "Old" })} onChange={onChange} />);

    fireEvent.change(startEdit(), { target: { value: "   " } });
    fireEvent.blur(screen.getByRole("textbox", { name: "Note title" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Old" })).toBeInTheDocument();

    fireEvent.change(startEdit(), { target: { value: "Old" } });
    fireEvent.blur(screen.getByRole("textbox", { name: "Note title" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("resyncs the heading when the title changes in the store (e.g. renamed from the list)", () => {
    const { rerender } = render(
      <PropertyPanel frontmatter={makeFrontmatter({ title: "Old" })} onChange={vi.fn()} />,
    );

    rerender(<PropertyPanel frontmatter={makeFrontmatter({ title: "New" })} onChange={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "New" })).toBeInTheDocument();
  });

  it("hides the edit button when the note is locked or read-only", () => {
    const { rerender } = render(
      <PropertyPanel frontmatter={makeFrontmatter({ locked: true })} onChange={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: "Edit title" })).not.toBeInTheDocument();

    rerender(<PropertyPanel frontmatter={makeFrontmatter()} onChange={vi.fn()} readOnly />);
    expect(screen.queryByRole("button", { name: "Edit title" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Untitled" })).toBeInTheDocument();
  });
});

describe("PropertyPanel header tags", () => {
  it("does not render tag chips in the header", () => {
    render(
      <PropertyPanel
        frontmatter={makeFrontmatter({ tags: ["ai-skills/skill", "work"] })}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByText("#ai-skills/skill")).not.toBeInTheDocument();
    expect(screen.queryByText("#work")).not.toBeInTheDocument();
    expect(screen.queryByText("ai-skills/skill")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Properties/ }));
    expect(screen.getByDisplayValue("ai-skills/skill, work")).toBeInTheDocument();
  });
});

describe("PropertyPanel unmanaged notes", () => {
  it("shows the workflow controls for a managed note", () => {
    render(<PropertyPanel frontmatter={makeFrontmatter()} onChange={vi.fn()} />);

    expect(screen.getByText("State")).toBeInTheDocument();
    expect(screen.getByLabelText("Urgent")).toBeInTheDocument();
    expect(screen.getByLabelText("Important")).toBeInTheDocument();
    expect(screen.getByLabelText("Blocked")).toBeInTheDocument();
  });

  it("hides State / Urgent / Important / Blocked when the note is unmanaged", () => {
    render(<PropertyPanel frontmatter={makeFrontmatter({ unmanaged: true })} onChange={vi.fn()} />);

    expect(screen.queryByText("State")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Urgent")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Important")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Blocked")).not.toBeInTheDocument();

    // Everything else in the metadata row stays put.
    expect(screen.getByLabelText("Pinned")).toBeInTheDocument();
    expect(screen.getByLabelText("Locked")).toBeInTheDocument();
    expect(screen.getByLabelText("Unmanaged")).toBeInTheDocument();
    expect(screen.getByText("Properties")).toBeInTheDocument();
  });

  it("clears the workflow fields in a single onChange when Unmanaged is switched on", () => {
    const onChange = vi.fn();
    render(
      <PropertyPanel
        frontmatter={makeFrontmatter({
          state: "Doing",
          urgent: true,
          important: true,
          blocked: true,
        })}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("Unmanaged"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      unmanaged: true,
      state: "",
      urgent: false,
      important: false,
      blocked: false,
    });
  });

  it("only sets unmanaged: false when Unmanaged is switched off", () => {
    const onChange = vi.fn();
    render(
      <PropertyPanel
        frontmatter={makeFrontmatter({ unmanaged: true, state: "" })}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("Unmanaged"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ unmanaged: false });
  });

  it("shows a cleared state as None instead of Prepare", () => {
    // A note that was unmanaged and got flipped back to managed still has state: "".
    render(<PropertyPanel frontmatter={makeFrontmatter({ state: "" })} onChange={vi.fn()} />);

    const button = screen.getByRole("button", { name: "State" });
    expect(button).toHaveTextContent("None");
    expect(button).not.toHaveTextContent("Prepare");
  });

  it("opens state choices as a menu and applies the chosen state", () => {
    const onChange = vi.fn();
    render(
      <PropertyPanel frontmatter={makeFrontmatter({ state: "Prepare" })} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "State" }));
    const menu = screen.getByRole("menu", { name: "Note state" });
    expect(menu.className).toContain("fixed");
    expect(
      within(menu)
        .getAllByRole("menuitemradio")
        .map((item) => item.textContent),
    ).toEqual(["None", ...NOTE_STATES]);

    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Done" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ state: "Done" });
    expect(screen.queryByRole("menu", { name: "Note state" })).not.toBeInTheDocument();
  });
});

describe("PropertyPanel timestamp display", () => {
  function renderExpanded(fm: Partial<NoteFrontmatter>) {
    render(<PropertyPanel frontmatter={makeFrontmatter(fm)} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Properties/ }));
  }

  it("renders a full timestamp as a readable local date and time", () => {
    renderExpanded({ updated: "2026-07-31T18:23:05Z" });

    // Locale and timezone vary by machine, so assert on shape: the raw stored
    // value must not leak into the UI, but must survive as the tooltip.
    const cell = screen.getByTitle("2026-07-31T18:23:05Z");
    expect(cell.textContent).not.toBe("2026-07-31T18:23:05Z");
    expect(cell.textContent).toMatch(/2026/);
    expect(cell.textContent).toMatch(/\d{1,2}:\d{2}/);
  });

  it("renders a legacy date-only value without inventing a midnight time", () => {
    renderExpanded({ created: "2026-07-01", updated: "2026-07-01" });

    const cells = screen.getAllByTitle("2026-07-01");
    expect(cells).toHaveLength(2);
    for (const cell of cells) {
      expect(cell.textContent).toMatch(/2026/);
      expect(cell.textContent).not.toMatch(/\d{1,2}:\d{2}/);
    }
  });
});

describe("PropertyPanel template flag", () => {
  it("marks and unmarks the note as a template", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <PropertyPanel frontmatter={makeFrontmatter()} onChange={onChange} />,
    );

    fireEvent.click(screen.getByLabelText("Template"));
    expect(onChange).toHaveBeenCalledWith({ template: true });

    rerender(
      <PropertyPanel frontmatter={makeFrontmatter({ template: true })} onChange={onChange} />,
    );
    fireEvent.click(screen.getByLabelText("Template"));
    expect(onChange).toHaveBeenLastCalledWith({ template: false });
  });

  it("does not surface template as an extra frontmatter field", () => {
    render(<PropertyPanel frontmatter={makeFrontmatter({ template: true })} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Properties/ }));
    expect(screen.queryByText("template")).not.toBeInTheDocument();
  });
});

describe("PropertyPanel export to PDF", () => {
  it("offers a labelled export button that calls onExportPdf", () => {
    const onExportPdf = vi.fn();
    render(
      <PropertyPanel
        frontmatter={makeFrontmatter()}
        onChange={vi.fn()}
        onExportPdf={onExportPdf}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Export to PDF" }));
    expect(onExportPdf).toHaveBeenCalledTimes(1);
  });

  it("disables the button while an export is running", () => {
    render(
      <PropertyPanel
        frontmatter={makeFrontmatter()}
        onChange={vi.fn()}
        onExportPdf={vi.fn()}
        exportingPdf
      />,
    );
    expect(screen.getByRole("button", { name: "Export to PDF" })).toBeDisabled();
  });

  it("hides the button when export is unavailable", () => {
    render(<PropertyPanel frontmatter={makeFrontmatter()} onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Export to PDF" })).not.toBeInTheDocument();
  });
});

describe("PropertyPanel pin to side", () => {
  beforeEach(() => {
    localStorage.clear();
    usePinnedPanelStore.setState({ noteIds: [], activeId: WRITER_TAB });
    useLayoutStore.setState({ preferences: DEFAULT_LAYOUT, priority: "left" });
  });

  it("pins this note in the right panel without changing the list-pin flag", () => {
    const onChange = vi.fn();
    render(<PropertyPanel frontmatter={makeFrontmatter({ pinned: true })} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Pin to side" }));

    expect(usePinnedPanelStore.getState().noteIds).toEqual(["01JPMXYZ123"]);
    expect(useLayoutStore.getState().preferences.rightOpen).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Pinned")).toBeChecked();
    const unpin = screen.getByRole("button", { name: "Unpin from side" });
    expect(unpin).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(unpin);
    expect(usePinnedPanelStore.getState().noteIds).toEqual([]);
    expect(screen.getByLabelText("Pinned")).toBeChecked();
  });
});

describe("PropertyPanel archive", () => {
  it("offers Archive beside delete, with an accessible name", () => {
    const onArchive = vi.fn();
    render(
      <PropertyPanel frontmatter={makeFrontmatter()} onChange={vi.fn()} onArchive={onArchive} />,
    );
    const archive = screen.getByRole("button", { name: "Archive note" });
    expect(archive).toHaveAttribute("title", "Archive note");
    expect(screen.queryByText("Archived")).not.toBeInTheDocument();
    fireEvent.click(archive);
    expect(onArchive).toHaveBeenCalledTimes(1);
  });

  it("labels an archived note and offers Unarchive", () => {
    const onArchive = vi.fn();
    render(
      <PropertyPanel
        frontmatter={makeFrontmatter({ archived: true, state: "Doing", tags: ["work"] })}
        onChange={vi.fn()}
        onArchive={onArchive}
      />,
    );
    const badge = screen.getByText("Archived");
    const titleRow = screen.getByRole("heading", { name: "Untitled" }).parentElement;
    expect(titleRow).toContainElement(badge);
    expect(
      screen.getByRole("button", { name: "Unarchive note" }).parentElement,
    ).not.toContainElement(badge);
    expect(screen.getByText("Doing")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Unarchive note" }));
    expect(onArchive).toHaveBeenCalledTimes(1);
  });

  it("hides the archive action when it is not provided (locked notes)", () => {
    render(<PropertyPanel frontmatter={makeFrontmatter({ archived: true })} onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Unarchive note" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive note" })).not.toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });
});

function rowOf(element: HTMLElement): HTMLElement {
  const row = element.parentElement;
  if (!row) throw new Error("expected the header control to sit in a row");
  return row;
}

const HEADER_ACTIONS = [
  "Copy file path",
  "Pin to side",
  "Note history",
  "Export to PDF",
  "Switch to Markdown",
  "Archive note",
  "Delete note",
] as const;

describe("PropertyPanel header layout", () => {
  function renderCrowdedHeader() {
    render(
      <PropertyPanel
        frontmatter={makeFrontmatter({
          title: "A long title that would crowd the action icons",
        })}
        filePath="/vault/rule.md"
        onChange={vi.fn()}
        onDelete={vi.fn()}
        onArchive={vi.fn()}
        onToggleMarkdown={vi.fn()}
        onShowHistory={vi.fn()}
        onExportPdf={vi.fn()}
      />,
    );
  }

  it("puts the action icons on their own line under the title", () => {
    renderCrowdedHeader();

    const titleRow = rowOf(
      screen.getByRole("heading", { name: "A long title that would crowd the action icons" }),
    );
    const buttons = HEADER_ACTIONS.map((name) => screen.getByRole("button", { name }));
    const actionRow = rowOf(buttons[0]);

    expect(actionRow).not.toBe(titleRow);
    expect(
      titleRow.compareDocumentPosition(actionRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    for (const button of buttons) {
      expect(actionRow).toContainElement(button);
      expect(titleRow).not.toContainElement(button);
    }

    const labels = [...actionRow.querySelectorAll("button")].map(
      (button) => button.getAttribute("aria-label") ?? button.getAttribute("title"),
    );
    expect(labels).toEqual([...HEADER_ACTIONS]);

    const locked = screen.getByLabelText("Locked");
    expect(titleRow).not.toContainElement(locked);
    expect(actionRow).not.toContainElement(locked);
    expect(
      actionRow.compareDocumentPosition(locked) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps every action keyboard accessible with its existing label", async () => {
    const user = userEvent.setup();
    renderCrowdedHeader();

    // Action buttons sit between the title and the metadata controls.
    screen.getByLabelText("State").focus();

    for (const name of [...HEADER_ACTIONS].reverse()) {
      await user.tab({ shift: true });
      const button = screen.getByRole("button", { name });
      expect(button).toHaveFocus();
      expect(button).toBeEnabled();
    }
  });
});
