import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../lib/settings";
import { useNoteStore } from "../../store/notes";
import { useSettingsStore } from "../../store/settings";
import { useUIStore } from "../../store/ui";
import type { Note, VaultConfig } from "../../types/note";
import { MainPanel } from "./MainPanel";

vi.mock("../../lib/tauri-commands", () => ({
  tauriCommands: {
    writeNote: vi.fn().mockResolvedValue(undefined),
    snapshotNote: vi.fn().mockResolvedValue(undefined),
    deleteNote: vi.fn().mockResolvedValue(undefined),
    deleteAsset: vi.fn().mockResolvedValue(undefined),
    listNoteHistory: vi.fn().mockResolvedValue([]),
    readNote: vi.fn().mockResolvedValue(""),
    renameNote: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://${p}`,
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn().mockResolvedValue(true),
}));

import { tauriCommands } from "../../lib/tauri-commands";

const VAULT: VaultConfig = { id: "v1", name: "Vault", path: "/vault" };

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "01JPMXYZ123",
    filePath: "/vault/test.md",
    fileName: "test.md",
    content: "Test content",
    vaultId: "v1",
    frontmatter: {
      id: "01JPMXYZ123",
      title: "Test Note",
      created: "2026-03-13",
      updated: "2026-03-13",
      tags: [],
      urgent: false,
      important: false,
      state: "Doing",
      blocked: false,
      links: [],
    },
    ...overrides,
  };
}

function setup(note: Note, markdownMode: boolean) {
  useSettingsStore.setState({
    settings: { ...DEFAULT_SETTINGS, defaultNoteView: markdownMode ? "markdown" : "editor" },
  });
  useNoteStore.setState({
    notes: [note],
    selectedNoteId: note.id,
    vaults: [VAULT],
    activeVaultId: VAULT.id,
  });
  useUIStore.setState({ activeView: "notes", markdownMode });
  return render(<MainPanel />);
}

describe("MainPanel.handleSave — no-op when content is unchanged", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not write the note when the markdown textarea is blurred without edits", () => {
    setup(makeNote(), true);
    const textarea = screen.getByDisplayValue("Test content");

    fireEvent.focus(textarea);
    fireEvent.blur(textarea);

    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
    expect(tauriCommands.snapshotNote).not.toHaveBeenCalled();
    expect(useNoteStore.getState().notes[0].frontmatter.updated).toBe("2026-03-13");
  });

  it("treats content differing only by leading/trailing newlines as unchanged", () => {
    setup(makeNote({ content: "Test content" }), true);
    const textarea = screen.getByDisplayValue("Test content");

    // gray-matter reintroduces a leading \n when parsing a file back, so the
    // editor's round-tripped content routinely differs only at the edges.
    fireEvent.change(textarea, { target: { value: "\nTest content\n\n" } });
    fireEvent.blur(textarea);

    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
    expect(useNoteStore.getState().notes[0].frontmatter.updated).toBe("2026-03-13");
  });

  it("does not write the note when the rich editor is blurred without edits", () => {
    setup(makeNote(), false);
    const editorEl = document.querySelector(".ProseMirror");
    expect(editorEl).toBeTruthy();

    fireEvent.blur(editorEl as Element);

    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
    expect(useNoteStore.getState().notes[0].frontmatter.updated).toBe("2026-03-13");
  });

  it("still saves and bumps `updated` for a genuine content edit", async () => {
    setup(makeNote(), true);
    const textarea = screen.getByDisplayValue("Test content");

    fireEvent.change(textarea, { target: { value: "Test content plus a real edit" } });
    await act(async () => {
      fireEvent.blur(textarea);
    });

    expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1);
    const [filePath, serialized] = vi.mocked(tauriCommands.writeNote).mock.calls[0];
    expect(filePath).toBe("/vault/test.md");
    expect(serialized).toContain("Test content plus a real edit");

    const today = new Date().toISOString().split("T")[0];
    expect(useNoteStore.getState().notes[0].frontmatter.updated).toBe(today);
    expect(tauriCommands.snapshotNote).toHaveBeenCalledTimes(1);
  });

  it("still bumps `updated` for an explicit frontmatter edit", async () => {
    setup(makeNote(), true);

    const urgentToggle = screen.getByLabelText("Urgent");
    await act(async () => {
      fireEvent.click(urgentToggle);
    });

    expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1);
    const today = new Date().toISOString().split("T")[0];
    expect(useNoteStore.getState().notes[0].frontmatter.updated).toBe(today);
    expect(useNoteStore.getState().notes[0].frontmatter.urgent).toBe(true);
  });
});

const MARKDOWN_CONTENT = "# Title\n\nSome **bold** words here.";

/**
 * The restore runs inside a requestAnimationFrame so it lands after layout.
 * Frames are captured and flushed by hand rather than waiting on a real one.
 * jsdom also implements none of the geometry ProseMirror reads when it reveals
 * the caret, so the empty list / zero rect a browser returns for an unlaid-out
 * node is supplied — otherwise the real code path throws instead of running.
 */
let frames: FrameRequestCallback[] = [];
const originalElementRects = Element.prototype.getClientRects;
const originalRangeRects = Range.prototype.getClientRects;
const originalRangeBox = Range.prototype.getBoundingClientRect;
const emptyRectList = () => Object.assign([], { item: () => null });
const zeroRect = () =>
  ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0 }) as DOMRect;

function installFrameHarness() {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  Element.prototype.getClientRects = emptyRectList as unknown as typeof originalElementRects;
  Range.prototype.getClientRects = emptyRectList as unknown as typeof originalRangeRects;
  Range.prototype.getBoundingClientRect = zeroRect as unknown as typeof originalRangeBox;
}

function removeFrameHarness() {
  vi.unstubAllGlobals();
  Element.prototype.getClientRects = originalElementRects;
  Range.prototype.getClientRects = originalRangeRects;
  Range.prototype.getBoundingClientRect = originalRangeBox;
}

function flushFrames() {
  // Restoring can schedule follow-up work, so drain until quiet.
  for (let guard = 0; guard < 10 && frames.length > 0; guard++) {
    const pending = frames;
    frames = [];
    act(() => {
      for (const cb of pending) cb(0);
    });
  }
}

// TipTap re-renders asynchronously once the editor mounts and takes focus, so the
// toggles are wrapped to keep React's act() bookkeeping quiet.
function clickToggleToEditor() {
  act(() => {
    fireEvent.click(screen.getByTitle("Switch to editor"));
  });
}

function clickToggleToMarkdown() {
  act(() => {
    fireEvent.click(screen.getByTitle("Switch to Markdown"));
  });
}

// Most tests want the whole restore to have happened; the scroll tests need to
// supply layout numbers to the incoming surface first, so they flush by hand.
function toggleToEditor() {
  clickToggleToEditor();
  flushFrames();
}

function toggleToMarkdown() {
  clickToggleToMarkdown();
  flushFrames();
}

// getByDisplayValue collapses whitespace, so it cannot match multi-line markdown.
function textarea(): HTMLTextAreaElement {
  const el = document.querySelector("textarea");
  if (!el) throw new Error("markdown textarea is not mounted");
  return el;
}

describe("MainPanel — cursor position survives the markdown/editor toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installFrameHarness();
  });

  afterEach(removeFrameHarness);

  it("returns the caret to the same word after a markdown → editor → markdown round trip", () => {
    setup(makeNote({ content: MARKDOWN_CONTENT }), true);
    const start = MARKDOWN_CONTENT.indexOf("words");

    const before = textarea();
    before.focus();
    before.setSelectionRange(start, start);

    toggleToEditor();
    expect(document.querySelector(".ProseMirror")).toBeTruthy();

    toggleToMarkdown();
    const after = textarea();
    expect(after.selectionStart).toBe(start);
    // The caret has to be usable, not merely correct.
    expect(document.activeElement).toBe(after);
  });

  it("keeps the caret at the end of the document across the toggle", () => {
    setup(makeNote({ content: MARKDOWN_CONTENT }), true);
    const end = MARKDOWN_CONTENT.length;

    const before = textarea();
    before.setSelectionRange(end, end);

    toggleToEditor();
    toggleToMarkdown();

    expect(textarea().selectionStart).toBe(end);
  });

  it("lands after the heading marker, not before it", () => {
    setup(makeNote({ content: MARKDOWN_CONTENT }), true);
    // "# " has no counterpart in the rich-text view, so the editor only knows
    // "start of the heading text". Coming back it must skip the marker.
    const title = MARKDOWN_CONTENT.indexOf("Title");
    textarea().setSelectionRange(title, title);

    toggleToEditor();
    toggleToMarkdown();

    expect(textarea().selectionStart).toBe(title);
  });

  it("focuses the markdown textarea when arriving from the editor", () => {
    setup(makeNote({ content: MARKDOWN_CONTENT }), false);

    toggleToMarkdown();

    const after = textarea();
    expect(document.activeElement).toBe(after);
    expect(after.selectionStart).toBeGreaterThanOrEqual(0);
  });

  it("does not save the note just because the cursor was restored", () => {
    setup(makeNote({ content: MARKDOWN_CONTENT }), true);
    const start = MARKDOWN_CONTENT.indexOf("bold");
    textarea().setSelectionRange(start, start);

    toggleToEditor();
    toggleToMarkdown();

    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
    expect(tauriCommands.snapshotNote).not.toHaveBeenCalled();
    expect(useNoteStore.getState().notes[0].frontmatter.updated).toBe("2026-03-13");
  });

  it("does not restore a stale cursor when the note changes", () => {
    const first = makeNote({ content: MARKDOWN_CONTENT });
    const second = makeNote({
      id: "01JPMXYZ456",
      filePath: "/vault/other.md",
      fileName: "other.md",
      content: "Another note entirely",
      frontmatter: { ...makeNote().frontmatter, id: "01JPMXYZ456", title: "Other" },
    });
    setup(first, true);
    act(() => {
      useNoteStore.setState({ notes: [first, second] });
    });

    const start = MARKDOWN_CONTENT.indexOf("words");
    textarea().setSelectionRange(start, start);
    toggleToEditor();

    act(() => {
      useNoteStore.getState().selectNote(second.id);
    });

    const other = screen.getByDisplayValue("Another note entirely") as HTMLTextAreaElement;
    expect(other.selectionStart).toBe(0);

    // …and coming back to the first note must not resurrect it either.
    act(() => {
      useNoteStore.getState().selectNote(first.id);
    });
    expect(textarea().selectionStart).toBe(0);
  });

  it("keeps a locked note read-only and toggleable", () => {
    const locked = makeNote({ content: MARKDOWN_CONTENT });
    locked.frontmatter.locked = true;
    setup(locked, true);

    const start = MARKDOWN_CONTENT.indexOf("words");
    textarea().setSelectionRange(start, start);

    toggleToEditor();
    expect(document.querySelector(".ProseMirror")).toBeTruthy();

    toggleToMarkdown();
    const after = textarea();
    expect(after.readOnly).toBe(true);
    expect(after.selectionStart).toBe(start);
    expect(tauriCommands.writeNote).not.toHaveBeenCalled();
  });

  it("sets the selection before focusing, so the browser reveals the caret", () => {
    // Focusing a text control reveals its *cached* selection. Focusing first and
    // then moving the caret leaves the view at the top with the caret off-screen
    // — the original bug. jsdom does no layout, so the ordering is the part that
    // can be pinned here; the scrolling itself was verified in a real browser.
    setup(makeNote({ content: MARKDOWN_CONTENT }), false);
    const select = vi.spyOn(HTMLTextAreaElement.prototype, "setSelectionRange");
    const focus = vi.spyOn(HTMLTextAreaElement.prototype, "focus");

    toggleToMarkdown();

    expect(select).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
    expect(select.mock.invocationCallOrder[0]).toBeLessThan(focus.mock.invocationCallOrder[0]);
    select.mockRestore();
    focus.mockRestore();
  });

  it("keeps the find bar working across the toggle", () => {
    setup(makeNote({ content: MARKDOWN_CONTENT }), true);
    fireEvent.keyDown(document, { key: "f", metaKey: true });
    expect(screen.getByPlaceholderText("Find")).toBeTruthy();

    toggleToEditor();
    expect(screen.getByPlaceholderText("Find")).toBeTruthy();

    toggleToMarkdown();
    expect(screen.getByPlaceholderText("Find")).toBeTruthy();
  });
});

/**
 * jsdom performs no layout: every element reports scrollHeight/clientHeight of 0,
 * so nothing ever overflows and no real scrolling can be observed here. What these
 * tests check is the handover *wiring* — that the outgoing surface's position is
 * measured, carried across the toggle, and applied to the incoming surface's
 * scroller using the arithmetic in `src/lib/scroll-fraction.ts`. The layout numbers
 * are supplied by hand. Whether the resulting view looks right to a reader needs a
 * human in the real app.
 */
function stubScroller(
  el: Element,
  { scrollHeight, clientHeight, scrollTop = 0 }: Record<string, number>,
  onScroll?: (value: number) => void,
) {
  let top = scrollTop;
  Object.defineProperty(el, "scrollHeight", { get: () => scrollHeight, configurable: true });
  Object.defineProperty(el, "clientHeight", { get: () => clientHeight, configurable: true });
  Object.defineProperty(el, "scrollTop", {
    get: () => top,
    set: (v: number) => {
      top = v;
      onScroll?.(v);
    },
    configurable: true,
  });
}

// The editor's own wrapper is the scroller, not MainPanel's outer div.
function editorScroller(): Element {
  const el = document.querySelector(".ProseMirror")?.closest(".overflow-y-auto");
  if (!el) throw new Error("editor scroller is not mounted");
  return el;
}

describe("MainPanel — scroll position survives the markdown/editor toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installFrameHarness();
  });

  afterEach(removeFrameHarness);

  it("carries the reading position from the markdown view into the editor", () => {
    setup(makeNote({ content: MARKDOWN_CONTENT }), true);
    // A quarter of the way through the markdown source.
    stubScroller(textarea(), { scrollHeight: 3000, clientHeight: 300, scrollTop: 675 });

    clickToggleToEditor();
    // The rich-text view renders the same document much taller.
    stubScroller(editorScroller(), { scrollHeight: 5100, clientHeight: 300 });
    flushFrames();

    // Same fraction through the document (0.25), not the same pixel offset.
    expect(editorScroller().scrollTop).toBe(1200);
  });

  it("carries the reading position from the editor back into the markdown view", () => {
    setup(makeNote({ content: MARKDOWN_CONTENT }), false);
    stubScroller(editorScroller(), { scrollHeight: 5100, clientHeight: 300, scrollTop: 1200 });

    clickToggleToMarkdown();
    stubScroller(textarea(), { scrollHeight: 3000, clientHeight: 300 });
    flushFrames();

    expect(textarea().scrollTop).toBe(675);
  });

  it("leaves the incoming view alone when the outgoing content did not overflow", () => {
    setup(makeNote({ content: MARKDOWN_CONTENT }), true);
    // Content fits: there is no reading position worth restoring.
    stubScroller(textarea(), { scrollHeight: 300, clientHeight: 300, scrollTop: 0 });

    clickToggleToEditor();
    stubScroller(editorScroller(), { scrollHeight: 5100, clientHeight: 300, scrollTop: 0 });
    flushFrames();

    expect(editorScroller().scrollTop).toBe(0);
  });

  it("restores the view before placing the caret, so the caret reveal wins", () => {
    // The invariant depends on this order: the view is put back first, then the
    // caret is placed, so the browser/ProseMirror only scrolls if the restored
    // view does not already show the caret. Reversing it is what left the user
    // looking at the top of the note with the caret at the bottom.
    setup(makeNote({ content: MARKDOWN_CONTENT }), false);
    stubScroller(editorScroller(), { scrollHeight: 5100, clientHeight: 300, scrollTop: 1200 });

    clickToggleToMarkdown();
    const ta = textarea();
    const order: string[] = [];
    // Record against the element's own scrollTop, which is what the stub defines.
    stubScroller(ta, { scrollHeight: 3000, clientHeight: 300 }, (v) =>
      order.push(`scrollTop=${v}`),
    );
    const select = vi
      .spyOn(HTMLTextAreaElement.prototype, "setSelectionRange")
      .mockImplementation(() => {
        order.push("setSelectionRange");
      });
    const focus = vi.spyOn(HTMLTextAreaElement.prototype, "focus").mockImplementation(() => {
      order.push("focus");
    });

    flushFrames();

    expect(order).toEqual(["scrollTop=675", "setSelectionRange", "focus"]);
    select.mockRestore();
    focus.mockRestore();
  });

  it("does not carry a scroll position across a note switch", () => {
    const first = makeNote({ content: MARKDOWN_CONTENT });
    const second = makeNote({
      id: "01JPMXYZ456",
      filePath: "/vault/other.md",
      fileName: "other.md",
      content: "Another note entirely",
      frontmatter: { ...makeNote().frontmatter, id: "01JPMXYZ456", title: "Other" },
    });
    setup(first, true);
    act(() => {
      useNoteStore.setState({ notes: [first, second] });
    });
    stubScroller(textarea(), { scrollHeight: 3000, clientHeight: 300, scrollTop: 675 });
    clickToggleToEditor();

    act(() => {
      useNoteStore.getState().selectNote(second.id);
    });
    const other = textarea();
    stubScroller(other, { scrollHeight: 3000, clientHeight: 300, scrollTop: 0 });
    flushFrames();

    expect(other.scrollTop).toBe(0);
  });
});
