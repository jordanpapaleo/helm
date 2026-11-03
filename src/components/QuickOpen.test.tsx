import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../lib/settings";
import { useNoteStore } from "../store/notes";
import { useSettingsStore } from "../store/settings";
import { useUIStore } from "../store/ui";
import type { Note } from "../types/note";
import { isQuickOpenShortcut, QuickOpen } from "./QuickOpen";

function note(
  id: string,
  title: string,
  extra: { content?: string; updated?: string; folder?: string; archived?: boolean } = {},
): Note {
  const dir = extra.folder ? `/vault/${extra.folder}` : "/vault";
  return {
    id,
    filePath: `${dir}/${id}.md`,
    fileName: `${id}.md`,
    content: extra.content ?? "",
    vaultId: "v1",
    frontmatter: {
      id,
      title,
      created: "2026-01-01T00:00:00Z",
      updated: extra.updated ?? "2026-01-01T00:00:00Z",
      tags: ["work"],
      urgent: false,
      important: false,
      state: "Doing",
      blocked: false,
      links: [],
      archived: extra.archived,
    },
  };
}

const roadmap = note("roadmap", "Roadmap", { updated: "2026-03-01T00:00:00Z", folder: "plans" });
const review = note("review", "Weekly review", {
  content: "roadmap follow-ups",
  updated: "2026-04-01T00:00:00Z",
});
const groceries = note("groceries", "Groceries", { updated: "2026-02-01T00:00:00Z" });
const oldPlan = note("old", "Old roadmap", { archived: true, updated: "2026-05-01T00:00:00Z" });

function pressShortcut(target: Element | Window = window, init: KeyboardEventInit = {}) {
  fireEvent.keyDown(target, { key: "p", ctrlKey: true, ...init });
}

function titleOf(option: HTMLElement) {
  return document.getElementById(option.getAttribute("aria-labelledby") ?? "")?.textContent;
}

function optionTitles() {
  return within(screen.getByRole("listbox")).getAllByRole("option").map(titleOf);
}

function selectedTitle() {
  return titleOf(within(screen.getByRole("listbox")).getByRole("option", { selected: true }));
}

beforeEach(() => {
  vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");
  useNoteStore.getState().setNotes([roadmap, review, groceries, oldPlan]);
  useNoteStore.setState({
    selectedNoteId: null,
    vaults: [{ id: "v1", name: "Vault", path: "/vault" }],
  });
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
  useUIStore.setState({
    quickOpenOpen: false,
    activeView: "dashboard",
    selectedGrouping: { type: "all", id: null },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isQuickOpenShortcut", () => {
  const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", { key: "p", ...init });

  it("uses ⌘P on macOS and Ctrl+P elsewhere", () => {
    expect(isQuickOpenShortcut(key({ metaKey: true }), true)).toBe(true);
    expect(isQuickOpenShortcut(key({ ctrlKey: true }), true)).toBe(false);
    expect(isQuickOpenShortcut(key({ ctrlKey: true }), false)).toBe(true);
    expect(isQuickOpenShortcut(key({ metaKey: true }), false)).toBe(false);
  });

  it("ignores other modifiers and keys", () => {
    expect(isQuickOpenShortcut(key({ ctrlKey: true, shiftKey: true }), false)).toBe(false);
    expect(isQuickOpenShortcut(key({ ctrlKey: true, altKey: true }), false)).toBe(false);
    expect(isQuickOpenShortcut(key({ key: "o", ctrlKey: true }), false)).toBe(false);
    expect(isQuickOpenShortcut(key({ key: "P", ctrlKey: true }), false)).toBe(true);
  });
});

describe("QuickOpen", () => {
  it("opens from the shortcut while the editor has focus and focuses the search", () => {
    render(
      <>
        <div contentEditable data-testid="editor" suppressContentEditableWarning />
        <QuickOpen />
      </>,
    );
    const editor = screen.getByTestId("editor");
    editor.focus();
    const event = new KeyboardEvent("keydown", {
      key: "p",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      editor.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByRole("dialog", { name: "Go to note" })).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveFocus();
  });

  it("opens with ⌘P on macOS", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    render(<QuickOpen />);
    pressShortcut(window, { ctrlKey: false, metaKey: true });
    expect(screen.getByRole("dialog", { name: "Go to note" })).toBeInTheDocument();
  });

  it("opens from the File menu event", () => {
    render(<QuickOpen />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    act(() => useUIStore.getState().setQuickOpenOpen(true));
    expect(screen.getByRole("dialog", { name: "Go to note" })).toBeInTheDocument();
  });

  it("lists recently updated notes, hiding archived ones, before typing", () => {
    render(<QuickOpen />);
    pressShortcut();
    expect(screen.getByText("Recently updated")).toBeInTheDocument();
    expect(optionTitles()).toEqual(["Weekly review", "Roadmap", "Groceries"]);
  });

  it("shows the folder beside the title, with a state and tag hint", () => {
    render(<QuickOpen />);
    pressShortcut();
    const row = screen.getByRole("option", { name: "Roadmap" });
    const title = within(row).getByText("Roadmap");
    const path = within(row).getByText("plans");
    expect(path.parentElement).toBe(title.parentElement);
    expect(path.className).toContain("opacity-60");
    expect(within(row).queryByText("roadmap.md")).not.toBeInTheDocument();
    expect(within(row).getByText("Doing")).toBeInTheDocument();
    expect(within(row).getByText("#work")).toBeInTheDocument();
  });

  it("distinguishes two notes that share a title by their folders", () => {
    useNoteStore
      .getState()
      .setNotes([
        note("stand-work", "Standup", { folder: "work/meetings", updated: "2026-06-01T00:00:00Z" }),
        note("stand-home", "Standup", { folder: "personal", updated: "2026-06-02T00:00:00Z" }),
      ]);
    render(<QuickOpen />);
    pressShortcut();
    const rows = screen.getAllByRole("option", { name: "Standup" });
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("personal")).toBeInTheDocument();
    expect(within(rows[1]).getByText("work/meetings")).toBeInTheDocument();
    expect(within(rows[0]).queryByText(/standup\.md/)).not.toBeInTheDocument();
  });

  it("groups title matches ahead of body-only matches", () => {
    render(<QuickOpen />);
    pressShortcut();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "roadm" } });
    expect(screen.getByRole("group", { name: "Matching titles" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Matching content" })).toBeInTheDocument();
    expect(screen.queryByText("Matching notes")).not.toBeInTheDocument();
    expect(screen.queryByText("Recently updated")).not.toBeInTheDocument();
    expect(optionTitles()).toEqual(["Roadmap", "Weekly review"]);
    const titles = screen.getByRole("group", { name: "Matching titles" });
    const content = screen.getByRole("group", { name: "Matching content" });
    expect(within(titles).getByRole("option", { name: "Roadmap" })).toBeInTheDocument();
    expect(within(titles).queryByRole("option", { name: "Weekly review" })).not.toBeInTheDocument();
    expect(within(content).getByRole("option", { name: "Weekly review" })).toBeInTheDocument();
    expect(within(content).getByText("Vault")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "qqqq" } });
    expect(screen.getByRole("status")).toHaveTextContent("No matching notes");
    expect(screen.queryByRole("group", { name: "Matching titles" })).not.toBeInTheDocument();
  });

  it("moves the selection with the arrow keys and wraps", () => {
    render(<QuickOpen />);
    pressShortcut();
    const input = screen.getByRole("combobox");
    expect(selectedTitle()).toBe("Weekly review");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(selectedTitle()).toBe("Roadmap");
    expect(input.getAttribute("aria-activedescendant")).toBe(
      screen.getByRole("option", { name: "Roadmap" }).id,
    );
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(selectedTitle()).toBe("Weekly review");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(selectedTitle()).toBe("Groceries");
  });

  it("Enter makes the selected note the active note in the editor", () => {
    render(<QuickOpen />);
    pressShortcut();
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "roadm" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(useNoteStore.getState().selectedNoteId).toBe("review");
    expect(useUIStore.getState().activeView).toBe("notes");
    expect(useUIStore.getState().selectedGrouping).toEqual({ type: "all", id: null });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the current grouping, as the note list does", () => {
    useUIStore.setState({ selectedGrouping: { type: "tag", id: "work" } });
    render(<QuickOpen />);
    pressShortcut();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(useUIStore.getState().selectedGrouping).toEqual({ type: "tag", id: "work" });
  });

  it("leaves the Trash grouping so the live note is shown", () => {
    useUIStore.setState({ activeView: "notes", selectedGrouping: { type: "trash", id: null } });
    render(<QuickOpen />);
    pressShortcut();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(useNoteStore.getState().selectedNoteId).toBe("review");
    expect(useUIStore.getState().selectedGrouping).toEqual({ type: "all", id: null });
  });

  it("opens a note on click", () => {
    render(<QuickOpen />);
    pressShortcut();
    fireEvent.click(screen.getByRole("option", { name: "Groceries" }));
    expect(useNoteStore.getState().selectedNoteId).toBe("groceries");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Escape closes without changing the note and returns focus", () => {
    useNoteStore.setState({ selectedNoteId: "groceries" });
    render(
      <>
        <button type="button">Before</button>
        <QuickOpen />
      </>,
    );
    const before = screen.getByRole("button", { name: "Before" });
    before.focus();
    pressShortcut(before);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(useNoteStore.getState().selectedNoteId).toBe("groceries");
    expect(before).toHaveFocus();
  });

  it("closes when the backdrop is clicked", () => {
    render(<QuickOpen />);
    pressShortcut();
    fireEvent.click(screen.getByRole("button", { name: "Close note search" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("includes archived notes when Show archived notes is on", () => {
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, showArchivedNotes: true } });
    render(<QuickOpen />);
    pressShortcut();
    const row = screen.getByRole("option", { name: "Old roadmap" });
    expect(within(row).getByText("Archived")).toBeInTheDocument();
  });
});
