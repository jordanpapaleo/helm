import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
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
  it("renders tag chips on the header and keeps the properties field", () => {
    render(
      <PropertyPanel
        frontmatter={makeFrontmatter({ tags: ["ai-skills/skill", "work"] })}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("#ai-skills/skill")).toBeInTheDocument();
    expect(screen.getByText("#work")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add tag" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Properties/ }));
    expect(screen.getByDisplayValue("ai-skills/skill, work")).toBeInTheDocument();
  });
});

describe("PropertyPanel unmanaged notes", () => {
  it("shows the workflow controls for a managed note", () => {
    render(<PropertyPanel frontmatter={makeFrontmatter()} onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "State" })).toHaveTextContent("Prepare");
    expect(screen.getByRole("button", { name: "Urgent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Important" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Properties" }));
    expect(screen.getByLabelText("Blocked")).toBeInTheDocument();
  });

  it("hides State / Urgent / Important / Blocked when the note is unmanaged", () => {
    render(<PropertyPanel frontmatter={makeFrontmatter({ unmanaged: true })} onChange={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "State" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Urgent" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Important" })).not.toBeInTheDocument();

    expect(screen.getByLabelText("Pinned")).toBeInTheDocument();
    expect(screen.getByLabelText("Locked")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Properties" }));
    expect(screen.queryByLabelText("Blocked")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Unmanaged")).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "Properties" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Properties" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Properties" }));
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

const TITLE_ROW_ACTIONS = [
  "Copy file path",
  "Pin to side",
  "Note history",
  "Export to PDF",
  "Rich",
  "Markdown",
  "Properties",
  "Archive note",
  "Delete note",
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
    expect(screen.queryByRole("button", { name: "Note info" })).not.toBeInTheDocument();

    const state = screen.getByRole("button", { name: "State" });
    expect(metaRow).toContainElement(state);
    expect(state).toHaveTextContent("Maintain");
    expect(screen.getByTestId("state-dot").className).toContain("bg-[var(--color-success)]");

    const urgent = screen.getByRole("button", { name: "Urgent" });
    const important = screen.getByRole("button", { name: "Important" });
    expect(metaRow).toContainElement(urgent);
    expect(metaRow).toContainElement(important);
    expect(urgent).toHaveAttribute("data-selected", "false");
    expect(urgent.className).toContain("bg-transparent");
    expect(important).toHaveAttribute("data-selected", "true");
    expect(important.className).toContain("bg-[var(--color-accent)]");

    expect(metaRow).toContainElement(screen.getByRole("switch", { name: "Pinned" }));
    expect(metaRow).toContainElement(screen.getByRole("switch", { name: "Locked" }));
    expect(metaRow).toContainElement(screen.getByText("#ai-skills/command"));
    expect(metaRow).toContainElement(screen.getByRole("button", { name: "Add tag" }));
    expect(titleRow).not.toContainElement(state);
  });

  it("toggles urgent and important from the segmented control", () => {
    const onChange = vi.fn();
    renderHeader({}, { onChange });

    fireEvent.click(screen.getByRole("button", { name: "Urgent" }));
    fireEvent.click(screen.getByRole("button", { name: "Important" }));

    expect(onChange).toHaveBeenNthCalledWith(1, { urgent: true });
    expect(onChange).toHaveBeenNthCalledWith(2, { important: false });
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
  function openTags(frontmatter = makeFrontmatter({ tags: ["work"] })) {
    const onChange = vi.fn();
    render(<PropertyPanel frontmatter={frontmatter} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Properties/ }));
    const input = screen.getByPlaceholderText("work, work/project");
    return { input, onChange };
  }

  it("commits an empty list when the last tag is cleared", () => {
    const { input, onChange } = openTags();
    expect(input).toHaveValue("work");

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith({ tags: [] });
  });

  it("stays empty after the empty list is saved", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [tags, setTags] = useState(["work"]);
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
    await user.click(screen.getByRole("button", { name: /Properties/ }));
    const input = screen.getByPlaceholderText("work, work/project");
    await user.clear(input);
    await user.tab();

    expect(input).toHaveValue("");
    await user.click(screen.getByRole("button", { name: /Properties/ }));
    expect(screen.queryByText("#work")).not.toBeInTheDocument();
  });

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
