import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NOTE_STATES } from "../../lib/constants";
import { DEFAULT_LAYOUT } from "../../lib/workspace-layout";
import { useLayoutStore } from "../../store/layout";
import { usePinnedPanelStore, WRITER_TAB } from "../../store/pinned-panel";
import { useToastStore } from "../../store/toast";
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
  it("renders tag chips on the header and the same tags in the properties field", () => {
    render(
      <PropertyPanel
        frontmatter={makeFrontmatter({ tags: ["ai-skills/skill", "work"] })}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("#ai-skills/skill")).toBeInTheDocument();
    expect(screen.getByText("#work")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add tag" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Properties" }));
    const panel = screen.getByRole("region", { name: "Properties" });
    expect(within(panel).getByRole("textbox", { name: "tags" })).toHaveValue(
      "ai-skills/skill, work",
    );
  });
});

describe("PropertyPanel unmanaged notes", () => {
  it("shows the workflow controls for a managed note", () => {
    render(<PropertyPanel frontmatter={makeFrontmatter()} onChange={vi.fn()} />);

    expect(screen.getByRole("combobox", { name: "State" })).toHaveValue("Prepare");
    expect(screen.getByRole("button", { name: "Urgent" })).toHaveAttribute(
      "data-icon",
      "uil:clock",
    );
    expect(screen.getByRole("button", { name: "Important" })).toHaveAttribute(
      "data-icon",
      "uil:star",
    );
    fireEvent.click(screen.getByRole("button", { name: "Properties" }));
    const panel = screen.getByRole("region", { name: "Properties" });
    expect(within(panel).getByRole("checkbox", { name: "blocked" })).not.toBeChecked();
  });

  it("keeps state and urgency on the heading when the note is unmanaged", () => {
    render(
      <PropertyPanel
        frontmatter={makeFrontmatter({ unmanaged: true, state: "" })}
        onChange={vi.fn()}
      />,
    );

    const metaRow = screen.getByTestId("note-heading-meta-row");
    expect(metaRow).toContainElement(screen.getByRole("combobox", { name: "State" }));
    expect(screen.getByRole("combobox", { name: "State" })).toHaveValue("");
    expect(metaRow).toContainElement(screen.getByRole("button", { name: "Urgent" }));
    expect(metaRow).toContainElement(screen.getByRole("button", { name: "Important" }));

    expect(screen.getByRole("switch", { name: "Pinned" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Locked" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unmanaged" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Properties" }));
    const panel = screen.getByRole("region", { name: "Properties" });
    expect(within(panel).getByRole("checkbox", { name: "unmanaged" })).toBeChecked();
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

    fireEvent.click(screen.getByRole("button", { name: "Unmanaged" }));

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

    fireEvent.click(screen.getByRole("button", { name: "Unmanaged" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ unmanaged: false });
  });

  it("renders state and urgency on row 2 when the note has no state", () => {
    render(
      <PropertyPanel
        frontmatter={makeFrontmatter({ state: "", urgent: false, important: false, tags: [] })}
        onChange={vi.fn()}
      />,
    );

    const metaRow = screen.getByTestId("note-heading-meta-row");
    const state = screen.getByRole("combobox", { name: "State" });
    expect(metaRow).toContainElement(state);
    expect(state).toHaveValue("");
    expect(state).toHaveDisplayValue("State");
    expect(metaRow).toContainElement(screen.getByRole("button", { name: "Urgent" }));
    expect(metaRow).toContainElement(screen.getByRole("button", { name: "Important" }));
    expect(metaRow).toContainElement(screen.getByRole("switch", { name: "Pinned" }));
    expect(metaRow).toContainElement(screen.getByRole("switch", { name: "Locked" }));
    expect(metaRow).toContainElement(screen.getByRole("button", { name: "Template" }));
    expect(metaRow).toContainElement(screen.getByRole("button", { name: "Unmanaged" }));
    expect(metaRow).toContainElement(screen.getByRole("button", { name: "Add tag" }));
  });

  it("shows a cleared state as the State placeholder instead of Prepare", () => {
    // A note that was unmanaged and got flipped back to managed still has state: "".
    render(<PropertyPanel frontmatter={makeFrontmatter({ state: "" })} onChange={vi.fn()} />);

    const select = screen.getByRole("combobox", { name: "State" });
    expect(select).toHaveValue("");
    expect(select).toHaveDisplayValue("State");
    expect(select).not.toHaveDisplayValue("Prepare");
  });

  it("applies a state from the DaisyUI select", () => {
    const onChange = vi.fn();
    render(
      <PropertyPanel frontmatter={makeFrontmatter({ state: "Prepare" })} onChange={onChange} />,
    );

    const select = screen.getByRole("combobox", { name: "State" });
    expect(select.className).toContain("select");
    expect(select.className).toContain("select-sm");
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["State", ...NOTE_STATES]);

    fireEvent.change(select, { target: { value: "Done" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ state: "Done" });
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

    fireEvent.click(screen.getByRole("button", { name: "Template" }));
    expect(onChange).toHaveBeenCalledWith({ template: true });

    rerender(
      <PropertyPanel frontmatter={makeFrontmatter({ template: true })} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Template" }));
    expect(onChange).toHaveBeenLastCalledWith({ template: false });
  });

  it("shows template once, as the frontmatter toggle", () => {
    render(<PropertyPanel frontmatter={makeFrontmatter({ template: true })} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Properties/ }));
    const panel = screen.getByRole("region", { name: "Properties" });
    expect(within(panel).getAllByText("template")).toHaveLength(1);
    expect(within(panel).getByRole("checkbox", { name: "template" })).toBeChecked();
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

const TITLE_ROW_ACTIONS = [
  "Copy file path",
  "Pin to side",
  "Note history",
  "Export to PDF",
  "Rich",
  "Markdown",
  "Archive note",
  "Delete note",
  "Properties",
] as const;

describe("PropertyPanel header layout", () => {
  function renderHeader(
    frontmatter: Partial<NoteFrontmatter> = {},
    handlers: {
      onChange?: (updates: Partial<NoteFrontmatter>) => void;
      onToggleMarkdown?: () => void;
    } = {},
  ) {
    const onChange = handlers.onChange ?? vi.fn();
    const onToggleMarkdown = handlers.onToggleMarkdown ?? vi.fn();
    const view = render(
      <PropertyPanel
        frontmatter={makeFrontmatter({
          title: "Command",
          state: "Maintain",
          urgent: false,
          important: true,
          tags: ["ai-skills/command"],
          ...frontmatter,
        })}
        filePath="/vault/command.md"
        onChange={onChange}
        onDelete={vi.fn()}
        onArchive={vi.fn()}
        onToggleMarkdown={onToggleMarkdown}
        onShowHistory={vi.fn()}
        onExportPdf={vi.fn()}
      />,
    );
    return { onChange, onToggleMarkdown, ...view };
  }

  it("lays the open note out as a title row and a metadata row", () => {
    renderHeader();

    const titleRow = screen.getByTestId("note-heading-title-row");
    const metaRow = screen.getByTestId("note-heading-meta-row");
    expect(
      titleRow.compareDocumentPosition(metaRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(titleRow).toContainElement(screen.getByRole("heading", { name: "Command" }));
    expect(titleRow).toContainElement(screen.getByRole("button", { name: "Edit title" }));
    for (const name of TITLE_ROW_ACTIONS) {
      expect(titleRow).toContainElement(screen.getByRole("button", { name }));
    }

    const labels = [...screen.getByTestId("note-heading-actions").querySelectorAll("button")].map(
      (button) => button.getAttribute("aria-label") ?? button.getAttribute("title"),
    );
    expect(labels).toEqual([...TITLE_ROW_ACTIONS]);
    expect(screen.getByRole("button", { name: "Copy file path" }).className).toContain("btn-ghost");
    expect(screen.getByRole("button", { name: "Edit title" }).className).toContain("btn-ghost");
    const properties = screen.getByRole("button", { name: "Properties" });
    expect(titleRow).toContainElement(properties);
    expect(metaRow).not.toContainElement(properties);
    expect(properties).toHaveAttribute("aria-pressed", "false");
    expect(properties).toHaveAttribute("data-icon", "uil:info-circle");
    expect(properties).toHaveAttribute("title", "Properties");
    expect(titleRow.className).toContain("justify-between");
    expect(titleRow.className).toContain("items-center");
    expect(metaRow.className).toContain("justify-start");
    expect(metaRow.className).toContain("items-center");
    expect(screen.getByTestId("note-heading-actions").className).toContain("items-center");
    expect(screen.getByRole("heading", { name: "Command" }).parentElement?.className).not.toContain(
      "flex-1",
    );

    const state = screen.getByRole("combobox", { name: "State" });
    expect(metaRow).toContainElement(state);
    expect(state).toHaveValue("Maintain");
    expect(state.className).toContain("select");
    expect(state.className).not.toContain("rounded-full");

    const urgent = screen.getByRole("button", { name: "Urgent" });
    const important = screen.getByRole("button", { name: "Important" });
    expect(metaRow).toContainElement(urgent);
    expect(metaRow).toContainElement(important);
    expect(urgent).toHaveAttribute("title", "Urgent");
    expect(urgent).toHaveAttribute("aria-pressed", "false");
    expect(urgent).toHaveAttribute("data-icon", "uil:clock");
    expect(important).toHaveAttribute("title", "Important");
    expect(important).toHaveAttribute("aria-pressed", "true");
    expect(important).toHaveAttribute("data-icon", "uil:star");
    const rich = screen.getByRole("button", { name: "Rich" });
    expect(rich.className).toContain("join-item");
    expect(rich.parentElement?.className).toContain("note-heading-mode");
    expect(screen.getByRole("button", { name: "Markdown" }).className).toContain("join-item");

    const archive = screen.getByRole("button", { name: "Archive note" });
    const deleteNote = screen.getByRole("button", { name: "Delete note" });
    const info = screen.getByRole("button", { name: "Properties" });
    expect(
      archive.compareDocumentPosition(deleteNote) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      deleteNote.compareDocumentPosition(info) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const titleDividers = within(titleRow).getAllByTestId("heading-divider");
    expect(titleDividers).toHaveLength(3);
    for (const divider of [
      ...titleDividers,
      ...within(metaRow).getAllByTestId("heading-divider"),
    ]) {
      expect(divider.className).toContain("self-center");
    }
    expect(within(metaRow).getAllByTestId("heading-divider")).toHaveLength(2);

    const pinned = screen.getByRole("switch", { name: "Pinned" });
    expect(metaRow).toContainElement(pinned);
    expect(pinned).toHaveAttribute("data-icon", "uil:map-pin");
    const locked = screen.getByRole("switch", { name: "Locked" });
    expect(metaRow).toContainElement(locked);
    expect(locked).toHaveAttribute("data-icon", "uil:unlock");
    const template = screen.getByRole("button", { name: "Template" });
    const unmanaged = screen.getByRole("button", { name: "Unmanaged" });
    expect(metaRow).toContainElement(template);
    expect(metaRow).toContainElement(unmanaged);
    expect(template).toHaveAttribute("title", "Template");
    expect(template).toHaveAttribute("aria-pressed", "false");
    expect(template).toHaveAttribute("data-icon", "uil:clipboard-notes");
    expect(unmanaged).toHaveAttribute("title", "Unmanaged");
    expect(unmanaged).toHaveAttribute("aria-pressed", "false");
    expect(unmanaged).toHaveAttribute("data-icon", "uil:eye-slash");
    const tag = screen.getByText("#ai-skills/command");
    expect(tag.closest(".badge")).not.toBeNull();
    expect(metaRow).toContainElement(tag);
    const addTag = screen.getByRole("button", { name: "Add tag" });
    expect(metaRow).toContainElement(addTag);
    expect(addTag.className).not.toContain("badge");
    expect(addTag.className).not.toContain("rounded-full");
    expect(titleRow).not.toContainElement(state);
  });

  it("toggles urgent and important independently from the heading icons", () => {
    const onChange = vi.fn();
    renderHeader({}, { onChange });

    fireEvent.click(screen.getByRole("button", { name: "Urgent" }));
    fireEvent.click(screen.getByRole("button", { name: "Important" }));

    expect(onChange).toHaveBeenNthCalledWith(1, { urgent: true });
    expect(onChange).toHaveBeenNthCalledWith(2, { important: false });
    expect(screen.getByRole("button", { name: "Urgent" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Important" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("toggles template and unmanaged from the heading and the properties panel", () => {
    const onChange = vi.fn();
    renderHeader(
      {
        state: "Doing",
        urgent: true,
        important: true,
        blocked: true,
        template: false,
        unmanaged: false,
      },
      { onChange },
    );

    fireEvent.click(screen.getByRole("button", { name: "Template" }));
    expect(onChange).toHaveBeenCalledWith({ template: true });

    fireEvent.click(screen.getByRole("button", { name: "Unmanaged" }));
    expect(onChange).toHaveBeenCalledWith({
      unmanaged: true,
      state: "",
      urgent: false,
      important: false,
      blocked: false,
    });

    fireEvent.click(screen.getByRole("button", { name: "Properties" }));
    const panel = screen.getByRole("region", { name: "Properties" });
    expect(within(panel).getByRole("checkbox", { name: "template" })).not.toBeChecked();
    expect(within(panel).getByRole("checkbox", { name: "unmanaged" })).not.toBeChecked();
  });

  it("opens the properties editor from the info icon", () => {
    renderHeader({ deadline: "2026-04-01", team: ["Ada"] });

    expect(screen.queryByRole("region", { name: "Properties" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Note info" })).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Properties" });
    fireEvent.click(toggle);
    const panel = screen.getByRole("region", { name: "Properties" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(panel).getByText("Path").parentElement).toHaveTextContent("/vault/command.md");
    expect(within(panel).queryByRole("textbox", { name: "Path" })).not.toBeInTheDocument();
    expect(within(panel).getByText("01JPMXYZ123")).toBeInTheDocument();
    expect(within(panel).getByLabelText("deadline")).toHaveValue("2026-04-01");
    expect(within(panel).getByLabelText("team")).toHaveValue("Ada");

    fireEvent.click(toggle);
    expect(screen.queryByRole("region", { name: "Properties" })).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("switches editor mode from the unselected Rich or Markdown segment", () => {
    const onToggleMarkdown = vi.fn();
    const view = renderHeader({}, { onToggleMarkdown });

    expect(screen.getByRole("button", { name: "Rich" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Markdown" })).toHaveAttribute(
      "title",
      "Switch to Markdown",
    );
    fireEvent.click(screen.getByRole("button", { name: "Rich" }));
    expect(onToggleMarkdown).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Markdown" }));
    expect(onToggleMarkdown).toHaveBeenCalledTimes(1);

    view.unmount();
    render(
      <PropertyPanel
        frontmatter={makeFrontmatter()}
        markdownMode
        onChange={vi.fn()}
        onToggleMarkdown={onToggleMarkdown}
      />,
    );
    expect(screen.getByRole("button", { name: "Rich" })).toHaveAttribute(
      "title",
      "Switch to editor",
    );
    fireEvent.click(screen.getByRole("button", { name: "Markdown" }));
    expect(onToggleMarkdown).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Rich" }));
    expect(onToggleMarkdown).toHaveBeenCalledTimes(2);
  });

  it("keeps every action keyboard accessible with its existing label", async () => {
    const user = userEvent.setup();
    renderHeader();

    screen.getByLabelText("State").focus();

    for (const name of [...TITLE_ROW_ACTIONS].reverse()) {
      await user.tab({ shift: true });
      const button = screen.getByRole("button", { name });
      expect(button).toHaveFocus();
      expect(button).toBeEnabled();
    }
  });
});

describe("PropertyPanel tags", () => {
  it("removes the last tag from its chip", () => {
    const onChange = vi.fn();
    render(<PropertyPanel frontmatter={makeFrontmatter({ tags: ["work"] })} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove tag work" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ tags: [] });
  });

  it("adds a tag from the header control and strips a leading hash", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [tags, setTags] = useState<string[]>([]);
      return (
        <PropertyPanel
          frontmatter={makeFrontmatter({ tags })}
          onChange={(updates) => {
            if (Array.isArray(updates.tags)) setTags(updates.tags);
          }}
        />
      );
    }
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Add tag" }));
    const input = screen.getByRole("textbox", { name: "New tag" });
    await user.type(input, "#ai-skills/command{Enter}");

    expect(screen.getByText("#ai-skills/command")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "New tag" })).not.toBeInTheDocument();
  });

  it("saves the next tag on blur after Escape cancelled the previous entry", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [tags, setTags] = useState<string[]>([]);
      return (
        <PropertyPanel
          frontmatter={makeFrontmatter({ tags })}
          onChange={(updates) => {
            if (Array.isArray(updates.tags)) setTags(updates.tags);
          }}
        />
      );
    }
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Add tag" }));
    const cancelled = screen.getByRole("textbox", { name: "New tag" });
    await user.type(cancelled, "discard-me");
    // keyDown alone does not blur. Unmounting the focused field must not
    // leave the next entry unable to save on blur.
    fireEvent.keyDown(cancelled, { key: "Escape" });
    expect(screen.queryByText("#discard-me")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "New tag" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add tag" }));
    const next = screen.getByRole("textbox", { name: "New tag" });
    await user.type(next, "kept");
    fireEvent.blur(next);

    expect(screen.getByText("#kept")).toBeInTheDocument();
  });
});

describe("PropertyPanel frontmatter values", () => {
  function openPanel(frontmatter: Partial<NoteFrontmatter> = {}) {
    const onChange = vi.fn();
    render(
      <PropertyPanel
        frontmatter={makeFrontmatter(frontmatter)}
        filePath="/vault/command.md"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Properties" }));
    return { onChange, panel: screen.getByRole("region", { name: "Properties" }) };
  }

  it("renders custom keys that are not part of the known frontmatter", () => {
    const { panel } = openPanel({
      owner: "Ada",
      score: 3,
      meta: { lane: "now" },
    });

    expect(within(panel).getByText("owner")).toBeInTheDocument();
    expect(within(panel).getByRole("textbox", { name: "owner" })).toHaveValue("Ada");
    expect(within(panel).getByRole("textbox", { name: "score" })).toHaveValue("3");
    expect(within(panel).getByRole("textbox", { name: "meta" })).toHaveValue(
      JSON.stringify({ lane: "now" }),
    );
  });

  it("round-trips boolean, array, number, and date values", () => {
    const { onChange, panel } = openPanel({
      deadline: "2026-04-01",
      team: ["Ada"],
      score: 3,
    });

    fireEvent.click(within(panel).getByRole("checkbox", { name: "blocked" }));
    expect(onChange).toHaveBeenCalledWith({ blocked: true });

    const team = within(panel).getByRole("textbox", { name: "team" });
    fireEvent.change(team, { target: { value: "Ada, Grace" } });
    fireEvent.blur(team);
    expect(onChange).toHaveBeenCalledWith({ team: ["Ada", "Grace"] });

    const score = within(panel).getByRole("textbox", { name: "score" });
    fireEvent.change(score, { target: { value: "4" } });
    fireEvent.keyDown(score, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith({ score: 4 });
    expect(onChange.mock.calls.some((call) => typeof call[0].score === "number")).toBe(true);

    const deadline = within(panel).getByLabelText("deadline");
    fireEvent.change(deadline, { target: { value: "2026-05-02" } });
    fireEvent.blur(deadline);
    expect(onChange).toHaveBeenCalledWith({ deadline: "2026-05-02" });
  });

  it("leaves id, created, updated, and path as text", () => {
    const { panel } = openPanel();

    expect(within(panel).queryByRole("textbox", { name: "id" })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("textbox", { name: "created" })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("textbox", { name: "updated" })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("textbox", { name: "Path" })).not.toBeInTheDocument();
    expect(within(panel).getByText("01JPMXYZ123")).toBeInTheDocument();
    expect(within(panel).getByText("/vault/command.md")).toBeInTheDocument();
    expect(within(panel).getAllByTitle("2026-07-10")).toHaveLength(2);
  });

  it("disables every properties input when the note is locked", () => {
    render(
      <PropertyPanel
        frontmatter={makeFrontmatter({ locked: true, deadline: "2026-04-01", score: 3 })}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Properties" }));
    const panel = screen.getByRole("region", { name: "Properties" });

    for (const control of panel.querySelectorAll("input, select, textarea")) {
      expect(control).toBeDisabled();
    }
    expect(screen.getByRole("switch", { name: "Locked" })).toBeEnabled();
    expect(screen.getByRole("switch", { name: "Locked" })).toHaveAttribute("aria-checked", "true");
  });

  it("rejects an invalid object and keeps the stored value", () => {
    const onChange = vi.fn();
    render(
      <PropertyPanel
        frontmatter={makeFrontmatter({ meta: { lane: "now" } })}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Properties" }));
    const meta = screen.getByRole("textbox", { name: "meta" });
    fireEvent.change(meta, { target: { value: "{not json" } });
    fireEvent.blur(meta);

    expect(onChange).not.toHaveBeenCalled();
    expect(meta).toHaveValue(JSON.stringify({ lane: "now" }));
    expect(
      useToastStore
        .getState()
        .toasts.some((toast) => toast.message.includes("Could not save meta")),
    ).toBe(true);
  });

  it("keeps the header state select in step with the properties select", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <PropertyPanel frontmatter={makeFrontmatter({ state: "Prepare" })} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Properties" }));
    const header = screen.getByRole("combobox", { name: "State" });
    const panelState = screen.getByRole("combobox", { name: "state" });

    fireEvent.change(panelState, { target: { value: "Done" } });
    expect(onChange).toHaveBeenCalledWith({ state: "Done" });

    rerender(
      <PropertyPanel frontmatter={makeFrontmatter({ state: "Done" })} onChange={onChange} />,
    );
    expect(header).toHaveValue("Done");
    expect(panelState).toHaveValue("Done");
  });
});
