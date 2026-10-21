import { fireEvent, render, screen } from "@testing-library/react";
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

describe("PropertyPanel title sync", () => {
  it("fires onTitleInput live on each keystroke, and onChange only on blur", () => {
    const onTitleInput = vi.fn();
    const onChange = vi.fn();
    render(
      <PropertyPanel
        frontmatter={makeFrontmatter()}
        onChange={onChange}
        onTitleInput={onTitleInput}
      />,
    );

    const input = screen.getByPlaceholderText("Untitled");
    fireEvent.change(input, { target: { value: "My" } });
    fireEvent.change(input, { target: { value: "My Untitled" } });

    // Live sync to the store happens on every keystroke...
    expect(onTitleInput).toHaveBeenCalledWith("My");
    expect(onTitleInput).toHaveBeenLastCalledWith("My Untitled");
    // ...while the persisting onChange has NOT fired yet (no blur).
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith({ title: "My Untitled" });
  });

  it("resyncs the field when the title changes in the store (e.g. renamed from the list)", () => {
    const { rerender } = render(
      <PropertyPanel frontmatter={makeFrontmatter({ title: "Old" })} onChange={vi.fn()} />,
    );
    const input = screen.getByDisplayValue("Old");

    // Same note (same id), title changed externally in the store.
    rerender(<PropertyPanel frontmatter={makeFrontmatter({ title: "New" })} onChange={vi.fn()} />);
    expect(input).toHaveValue("New");
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

  it("renders a blank option so an empty state shows as empty", () => {
    // A note that was unmanaged and got flipped back to managed still has state: "".
    render(<PropertyPanel frontmatter={makeFrontmatter({ state: "" })} onChange={vi.fn()} />);

    const select = screen.getByLabelText("State") as HTMLSelectElement;
    expect(select.value).toBe("");
    // The blank option exists alongside the four real states.
    expect(select.options).toHaveLength(NOTE_STATES.length + 1);
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
    expect(screen.getByText("Archived")).toBeInTheDocument();
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
