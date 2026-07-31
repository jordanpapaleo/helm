import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NOTE_STATES } from "../../lib/constants";
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
