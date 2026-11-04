import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readEditorDraft, registerEditorDraft } from "../../lib/editor-draft";
import { saveNoteContent } from "../../lib/save-note";
import { DEFAULT_SETTINGS } from "../../lib/settings";
import { useGitSyncStore } from "../../store/git-sync";
import { useNoteStore } from "../../store/notes";
import { usePinnedPanelStore } from "../../store/pinned-panel";
import { useSettingsStore } from "../../store/settings";
import { useToastStore } from "../../store/toast";
import { useToolsStore } from "../../store/tools";
import { useUIStore } from "../../store/ui";
import type { Note } from "../../types/note";
import { NoteEditor } from "../editor/NoteEditor";
import { MarkdownTextarea } from "./MainPanel";
import { RightPanel } from "./RightPanel";

vi.mock("../../lib/tauri-commands", () => ({
  tauriCommands: {
    writeNote: vi.fn().mockResolvedValue(undefined),
    snapshotNote: vi.fn().mockResolvedValue(undefined),
    deleteAsset: vi.fn().mockResolvedValue(undefined),
    writerSend: vi.fn(),
    writerCancel: vi.fn(),
  },
}));
vi.mock("../../lib/mermaid", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/mermaid")>()),
  renderMermaid: vi.fn().mockResolvedValue("<svg></svg>"),
}));
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://${p}`,
  invoke: vi.fn().mockResolvedValue(undefined),
}));

import { tauriCommands } from "../../lib/tauri-commands";

function makeNote(id: string, title: string, content: string): Note {
  return {
    id,
    filePath: `/vault/${id}.md`,
    fileName: `${id}.md`,
    content,
    vaultId: "vault",
    frontmatter: {
      id,
      title,
      created: "2026-10-20T00:00:00Z",
      updated: "2026-10-20T00:00:00Z",
      tags: [],
      urgent: false,
      important: false,
      state: "Prepare",
      blocked: false,
      links: [],
    },
  };
}

const reference = makeNote("reference", "Reference", "The vault password hint is the first ship.");

function pinnedEditor(): Editor {
  const dom = document.querySelector(".ProseMirror");
  if (!dom) throw new Error("pinned editor is not on screen");
  let node: Node | null = dom;
  while (node) {
    const fiberKey = Object.keys(node).find((key) => key.startsWith("__reactFiber$"));
    if (fiberKey) {
      let fiber: Fiber | null | undefined = (node as unknown as Record<string, Fiber | undefined>)[
        fiberKey
      ];
      while (fiber) {
        const editor = fiber.memoizedProps?.editor;
        if (editor?.view) return editor;
        fiber = fiber.return;
      }
    }
    node = node.parentNode;
  }
  throw new Error("pinned editor instance was not found");
}

interface Fiber {
  return: Fiber | null;
  memoizedProps?: { editor?: Editor };
}

function selectText(editor: Editor, needle: string): { from: number; to: number } {
  let from = -1;
  editor.state.doc.descendants((node, pos) => {
    if (from === -1 && node.isText && node.text?.includes(needle)) {
      from = pos + (node.text.indexOf(needle) ?? 0);
    }
  });
  const to = from + needle.length;
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)),
  );
  return { from, to };
}

function insertAtEnd(editor: Editor, text: string) {
  let pos = editor.state.doc.content.size;
  editor.state.doc.descendants((node, nodePos) => {
    if (node.isText && node.text) pos = nodePos + node.text.length;
  });
  editor.view.dispatch(editor.state.tr.insertText(text, pos));
}

function pressKey(editor: Editor, key: string, keyCode: number) {
  const event = new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true });
  Object.defineProperty(event, "keyCode", { value: keyCode });
  editor.view.someProp("handleKeyDown", (handler) => handler(editor.view, event));
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  usePinnedPanelStore.setState({ noteIds: ["reference"], activeId: "reference" });
  useNoteStore.setState({
    notes: [reference],
    selectedNoteId: "reference",
    vaults: [{ id: "vault", name: "Vault", path: "/vault" }],
    activeVaultId: "vault",
  });
  useToolsStore.setState({ writerEnabled: false });
  useGitSyncStore.setState({ byVaultId: {}, barrierPaths: [], heldNoteIds: [], heldDrafts: {} });
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS } });
  useToastStore.setState({ toasts: [] });
  useUIStore.setState({ activeView: "notes", selectedGrouping: { type: "all", id: null } });
  vi.mocked(tauriCommands.writeNote).mockClear();
  vi.mocked(tauriCommands.snapshotNote).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

it("edits with the keyboard and leaves the main editor chrome off the panel", async () => {
  render(<RightPanel />);
  const article = screen.getByRole("article", { name: "Pinned note Reference" });
  const editor = pinnedEditor();
  expect(editor.isEditable).toBe(true);
  expect(article.querySelector(".ProseMirror")).toHaveAttribute("contenteditable", "true");

  for (const label of [
    "State",
    "Urgent",
    "Important",
    "Blocked",
    "Locked",
    "Unmanaged",
    "Template",
    "Properties",
  ]) {
    expect(screen.queryByText(label)).not.toBeInTheDocument();
  }
  expect(screen.queryByRole("checkbox", { name: "Pinned" })).not.toBeInTheDocument();
  expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Bold" })).not.toBeInTheDocument();

  const { from, to } = selectText(editor, "vault");
  pressKey(editor, "b", 66);
  expect(editor.state.doc.rangeHasMark(from, to, editor.state.schema.marks.bold)).toBe(true);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1100);
  });

  expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1);
  const [filePath, serialized] = vi.mocked(tauriCommands.writeNote).mock.calls[0];
  expect(filePath).toBe("/vault/reference.md");
  expect(serialized).toContain("**vault**");
  expect(tauriCommands.snapshotNote).toHaveBeenCalledTimes(1);
  expect(useNoteStore.getState().selectedNoteId).toBe("reference");
});

it("saves a typed edit without dropping frontmatter tags", async () => {
  const tagged = {
    ...reference,
    frontmatter: { ...reference.frontmatter, tags: ["panel-only"] },
  };
  useNoteStore.setState({ notes: [tagged], selectedNoteId: tagged.id });
  render(<RightPanel />);
  const editor = pinnedEditor();
  insertAtEnd(editor, " Edited.");

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1100);
  });

  expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1);
  const [, serialized] = vi.mocked(tauriCommands.writeNote).mock.calls[0];
  expect(serialized).toContain("Edited.");
  expect(serialized).toContain("panel-only");
  expect(useNoteStore.getState().notes[0].frontmatter.tags).toEqual(["panel-only"]);
});

it("keeps a sibling draft and does not replace that draft reader", async () => {
  const unregister = registerEditorDraft("reference", () => "Unsaved hint about the ship");
  try {
    render(<RightPanel />);
    expect(screen.getByRole("article", { name: "Pinned note Reference" })).toHaveTextContent(
      "Unsaved hint about the ship",
    );
    expect(readEditorDraft("reference")).toBe("Unsaved hint about the ship");

    insertAtEnd(pinnedEditor(), "!");
    expect(screen.getByRole("article", { name: "Pinned note Reference" })).toHaveTextContent(
      "Unsaved hint about the ship!",
    );
    expect(readEditorDraft("reference")).toBe("Unsaved hint about the ship");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    const [, serialized] = vi.mocked(tauriCommands.writeNote).mock.calls[0];
    expect(serialized).toContain("Unsaved hint about the ship!");
    expect(screen.getByRole("article", { name: "Pinned note Reference" })).toHaveTextContent(
      "Unsaved hint about the ship!",
    );
  } finally {
    unregister();
  }
});

it("does not write a locked note", async () => {
  const locked = {
    ...reference,
    frontmatter: { ...reference.frontmatter, locked: true },
  };
  useNoteStore.setState({ notes: [locked], selectedNoteId: locked.id });
  render(<RightPanel />);
  const editor = pinnedEditor();
  expect(editor.isEditable).toBe(false);
  expect(editor.view.dom).toHaveAttribute("contenteditable", "false");
  const before = editor.state.doc.textContent;
  pressKey(editor, "b", 66);
  expect(editor.state.doc.textContent).toBe(before);
  expect(editor.state.doc.rangeHasMark(1, 2, editor.state.schema.marks.bold)).toBe(false);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1100);
  });
  fireEvent.blur(editor.view.dom);
  expect(tauriCommands.writeNote).not.toHaveBeenCalled();
});

it("reports a failed save", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(tauriCommands.writeNote).mockRejectedValueOnce(new Error("disk full"));
  render(<RightPanel />);
  insertAtEnd(pinnedEditor(), " more");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1100);
  });
  expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain(
    "Failed to save note: disk full",
  );
});

it("saves on blur when auto-save is off", async () => {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, autoSaveOnEdit: false } });
  render(<RightPanel />);
  const editor = pinnedEditor();
  insertAtEnd(editor, " later");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(tauriCommands.writeNote).not.toHaveBeenCalled();
  fireEvent.blur(editor.view.dom);
  expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1);
  expect(vi.mocked(tauriCommands.writeNote).mock.calls[0][1]).toContain("later");
});

it("drops a recovered held draft once a later edit saves", async () => {
  const other = makeNote("other", "Other", "Second note");
  useNoteStore.setState({
    notes: [reference, other],
    selectedNoteId: reference.id,
    vaults: [{ id: "vault", name: "Vault", path: "/vault" }],
    activeVaultId: "vault",
  });
  usePinnedPanelStore.setState({ noteIds: ["reference", "other"], activeId: "reference" });
  useGitSyncStore.getState().beginBarrier("/vault");
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(<RightPanel />);

  insertAtEnd(pinnedEditor(), " draft-a");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1100);
  });
  expect(tauriCommands.writeNote).not.toHaveBeenCalled();
  expect(useGitSyncStore.getState().heldDraft("reference")).toContain("draft-a");
  expect(useGitSyncStore.getState().heldDraft("reference")).not.toContain("draft-b");

  useGitSyncStore.getState().endBarrier("/vault");
  insertAtEnd(pinnedEditor(), " draft-b");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1100);
  });

  expect(useGitSyncStore.getState().heldDraft("reference")).toBeUndefined();
  expect(vi.mocked(tauriCommands.writeNote).mock.calls[0][1]).toContain("draft-b");

  fireEvent.click(screen.getByRole("tab", { name: "Other" }));
  fireEvent.click(screen.getByRole("tab", { name: "Reference" }));
  const restored = pinnedEditor();
  expect(restored.getText()).toContain("draft-a");
  expect(restored.getText()).toContain("draft-b");

  const writes = vi.mocked(tauriCommands.writeNote).mock.calls.length;
  fireEvent.blur(restored.view.dom);
  expect(tauriCommands.writeNote).toHaveBeenCalledTimes(writes);
  expect(vi.mocked(tauriCommands.writeNote).mock.calls[0][1]).toContain("draft-b");
});

function editorIn(root: ParentNode): Editor {
  const surface = root.querySelector(".ProseMirror");
  if (!surface) throw new Error("editor is not on screen");
  let node: Node | null = surface;
  while (node) {
    const fiberKey = Object.keys(node).find((key) => key.startsWith("__reactFiber$"));
    if (fiberKey) {
      let fiber: Fiber | null | undefined = (node as unknown as Record<string, Fiber | undefined>)[
        fiberKey
      ];
      while (fiber) {
        const editor = fiber.memoizedProps?.editor;
        if (editor?.view) return editor;
        fiber = fiber.return;
      }
    }
    node = node.parentNode;
  }
  throw new Error("editor instance was not found");
}

function OpenReference() {
  const note = useNoteStore((state) => state.notes.find((item) => item.id === "reference"));
  if (!note) return null;
  return (
    <NoteEditor
      note={note}
      onSave={async (content) => {
        const current = useNoteStore.getState().notes.find((item) => item.id === note.id) ?? note;
        await saveNoteContent(current, content);
      }}
    />
  );
}

it("keeps a side-panel edit of the note that is open in the main editor", async () => {
  render(
    <>
      <OpenReference />
      <RightPanel />
    </>,
  );
  const article = screen.getByRole("article", { name: "Pinned note Reference" });
  const pinned = editorIn(article);
  expect(pinned.isEditable).toBe(true);
  insertAtEnd(pinned, " from the side");

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1100);
  });

  const main = editorIn(document.body);
  expect(main).not.toBe(pinned);
  expect(main.getText()).toContain("from the side");
  expect(article).toHaveTextContent("from the side");

  await act(async () => {
    insertAtEnd(main, " main");
  });
  expect(main.getText()).toContain("from the side");
  expect(article).toHaveTextContent("from the side");
});

it("keeps a side-panel edit when the open note is in markdown mode", async () => {
  function OpenMarkdown() {
    const note = useNoteStore((state) => state.notes.find((item) => item.id === "reference"));
    if (!note) return null;
    return (
      <MarkdownTextarea
        noteId={note.id}
        vaultPath="/vault"
        content={note.content}
        onSave={async (content) => {
          const current = useNoteStore.getState().notes.find((item) => item.id === note.id) ?? note;
          await saveNoteContent(current, content);
        }}
      />
    );
  }
  render(
    <>
      <OpenMarkdown />
      <RightPanel />
    </>,
  );
  const article = screen.getByRole("article", { name: "Pinned note Reference" });
  insertAtEnd(editorIn(article), " from the side");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1100);
  });
  const textarea = screen.getByRole("textbox");
  expect((textarea as HTMLTextAreaElement).value).toContain("from the side");
  await act(async () => {
    fireEvent.change(textarea, {
      target: { value: `${(textarea as HTMLTextAreaElement).value} main` },
    });
  });
  expect(article).toHaveTextContent("from the side");
});

async function typeAtEnd(editor: Editor, text: string) {
  await act(async () => {
    editor.chain().focus("end").insertContent(text).run();
    await Promise.resolve();
  });
}

function pressPlain(editor: Editor, key: string) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true });
  editor.view.someProp("handleKeyDown", (handler) => handler(editor.view, event));
}

function noteLinks() {
  return screen.getByRole("region", { name: "Note links" });
}

function archivedNote(id: string, title: string): Note {
  const note = makeNote(id, title, "stale");
  return { ...note, frontmatter: { ...note.frontmatter, archived: true } };
}

it("opens the note-link dropdown in the pinned pane and inserts the chosen note", async () => {
  const ship = makeNote("ship", "Ship Log", "The log.");
  const extras = Array.from({ length: 8 }, (_, index) =>
    makeNote(`extra-${index + 1}`, `Extra ${index + 1}`, "extra"),
  );
  const archived = archivedNote("old", "Old Log");
  useNoteStore.setState({
    notes: [reference, ship, archived, ...extras],
    selectedNoteId: reference.id,
    vaults: [{ id: "vault", name: "Vault", path: "/vault" }],
    activeVaultId: "vault",
  });
  render(<RightPanel />);
  await typeAtEnd(pinnedEditor(), " [[");

  const menu = noteLinks();
  const labels = within(menu)
    .getAllByRole("button")
    .map((button) => button.textContent);
  expect(labels).toEqual([
    "Ship Log",
    "Extra 1",
    "Extra 2",
    "Extra 3",
    "Extra 4",
    "Extra 5",
    "Extra 6",
    "Extra 7",
  ]);
  expect(within(menu).queryByRole("button", { name: "Reference" })).not.toBeInTheDocument();
  expect(within(menu).queryByRole("button", { name: /Old Log/ })).not.toBeInTheDocument();
  expect(within(menu).queryByRole("button", { name: "Extra 8" })).not.toBeInTheDocument();

  fireEvent.mouseDown(within(menu).getByRole("button", { name: "Ship Log" }));
  expect(pinnedEditor().getText()).toContain("[[Ship Log]]");
  expect(screen.queryByRole("region", { name: "Note links" })).not.toBeInTheDocument();
});

it("labels archived notes in the pinned dropdown when show archived is on", async () => {
  const archived = archivedNote("old", "Old Log");
  useNoteStore.setState({
    notes: [reference, archived],
    selectedNoteId: reference.id,
    vaults: [{ id: "vault", name: "Vault", path: "/vault" }],
    activeVaultId: "vault",
  });
  useSettingsStore.setState({
    settings: { ...DEFAULT_SETTINGS, showArchivedNotes: true },
  });
  render(<RightPanel />);
  await typeAtEnd(pinnedEditor(), " [[");
  expect(
    within(noteLinks()).getByRole("button", { name: "Old Log (archived)" }),
  ).toBeInTheDocument();
});

it("does not open the pinned dropdown when autocomplete is off", async () => {
  const ship = makeNote("ship", "Ship Log", "The log.");
  useNoteStore.setState({
    notes: [reference, ship],
    selectedNoteId: reference.id,
    vaults: [{ id: "vault", name: "Vault", path: "/vault" }],
    activeVaultId: "vault",
  });
  useSettingsStore.setState({
    settings: { ...DEFAULT_SETTINGS, autocompleteWikiLinks: false },
  });
  render(<RightPanel />);
  await typeAtEnd(pinnedEditor(), " [[");
  expect(screen.queryByRole("region", { name: "Note links" })).not.toBeInTheDocument();
});

it("inserts the highlighted note when Enter is pressed in the pinned dropdown", async () => {
  const alpha = makeNote("alpha", "Alpha", "a");
  const beta = makeNote("beta", "Beta", "b");
  useNoteStore.setState({
    notes: [reference, alpha, beta],
    selectedNoteId: reference.id,
    vaults: [{ id: "vault", name: "Vault", path: "/vault" }],
    activeVaultId: "vault",
  });
  render(<RightPanel />);
  const editor = pinnedEditor();
  await typeAtEnd(editor, " [[");
  expect(within(noteLinks()).getByRole("button", { name: "Alpha" })).toBeInTheDocument();
  await act(async () => {
    pressPlain(editor, "ArrowDown");
  });
  await act(async () => {
    pressPlain(editor, "Enter");
  });
  expect(editor.getText()).toContain("[[Beta]]");
  expect(screen.queryByRole("region", { name: "Note links" })).not.toBeInTheDocument();
});

function showDashboard() {
  useUIStore.setState({
    activeView: "dashboard",
    selectedGrouping: { type: "all", id: null },
    navHistory: [
      {
        view: "dashboard",
        selectedNoteId: "reference",
        selectedGrouping: { type: "all", id: null },
      },
    ],
    navIndex: 0,
  });
}

function pinLinked(content: string, others: Note[] = []) {
  const linked = makeNote("reference", "Reference", content);
  useNoteStore.setState({
    notes: [linked, ...others],
    selectedNoteId: linked.id,
    vaults: [{ id: "vault", name: "Vault", path: "/vault" }],
    activeVaultId: "vault",
  });
  showDashboard();
  render(<RightPanel />);
  return screen.getByRole("article", { name: "Pinned note Reference" });
}

it("clicking a wiki link in the pinned pane sets the main note to that note", () => {
  window.getSelection()?.removeAllRanges();
  const ship = makeNote("ship", "Ship Log", "The log.");
  const archived = archivedNote("old", "Old Log");
  const article = pinLinked("See [[ ship log ]] and [[old log]] today.", [ship, archived]);
  const links = article.querySelectorAll(".wikilink-ref");
  expect(links).toHaveLength(2);

  fireEvent.click(links[0]);
  expect(useNoteStore.getState().selectedNoteId).toBe("ship");
  expect(useUIStore.getState().activeView).toBe("notes");
  expect(screen.getByRole("article", { name: "Pinned note Reference" })).toBeInTheDocument();

  showDashboard();
  useNoteStore.setState({ selectedNoteId: "reference" });
  fireEvent.click(links[1]);
  expect(useNoteStore.getState().selectedNoteId).toBe("old");
  expect(useUIStore.getState().activeView).toBe("notes");
});

it("clicking a wiki link still sets the main note when the pinned pane is locked", () => {
  window.getSelection()?.removeAllRanges();
  const ship = makeNote("ship", "Ship Log", "The log.");
  const linked = makeNote("reference", "Reference", "See [[Ship Log]] today.");
  linked.frontmatter = { ...linked.frontmatter, locked: true };
  useNoteStore.setState({
    notes: [linked, ship],
    selectedNoteId: linked.id,
    vaults: [{ id: "vault", name: "Vault", path: "/vault" }],
    activeVaultId: "vault",
  });
  showDashboard();
  render(<RightPanel />);
  const article = screen.getByRole("article", { name: "Pinned note Reference" });
  expect(article.querySelector(".ProseMirror")).toHaveAttribute("contenteditable", "false");
  const link = article.querySelector(".wikilink-ref");
  expect(link).not.toBeNull();
  fireEvent.click(link as Element);
  expect(useNoteStore.getState().selectedNoteId).toBe("ship");
  expect(useUIStore.getState().activeView).toBe("notes");
});

it("leaves the main note unchanged when the pinned wiki link matches nothing", () => {
  window.getSelection()?.removeAllRanges();
  const article = pinLinked("See [[Missing Note]] today.");
  const link = article.querySelector(".wikilink-ref");
  expect(link).not.toBeNull();
  fireEvent.click(link as Element);
  expect(useNoteStore.getState().selectedNoteId).toBe("reference");
  expect(useUIStore.getState().activeView).toBe("dashboard");
});

it("does not follow a pinned wiki link while its text is selected", () => {
  window.getSelection()?.removeAllRanges();
  const ship = makeNote("ship", "Ship Log", "The log.");
  const article = pinLinked("See [[Ship Log]] today.", [ship]);
  const link = article.querySelector(".wikilink-ref");
  expect(link).not.toBeNull();
  const range = document.createRange();
  range.selectNodeContents(link as Node);
  const selection = window.getSelection();
  selection?.addRange(range);
  fireEvent.click(link as Element);
  expect(useNoteStore.getState().selectedNoteId).toBe("reference");
  expect(useUIStore.getState().activeView).toBe("dashboard");
});

it("moves the block with the block-command shortcut", () => {
  const blocks = makeNote("blocks", "Blocks", "Alpha\n\nBeta");
  useNoteStore.setState({ notes: [blocks], selectedNoteId: blocks.id });
  usePinnedPanelStore.setState({ noteIds: ["blocks"], activeId: "blocks" });
  render(<RightPanel />);
  const editor = pinnedEditor();
  selectText(editor, "Beta");
  const event = new KeyboardEvent("keydown", {
    key: "ArrowUp",
    altKey: true,
    bubbles: true,
  });
  editor.view.someProp("handleKeyDown", (handler) => handler(editor.view, event));
  const paragraphs: string[] = [];
  editor.state.doc.forEach((node) => {
    paragraphs.push(node.textContent);
  });
  expect(paragraphs.filter((text) => text.length > 0)).toEqual(["Beta", "Alpha"]);
});
