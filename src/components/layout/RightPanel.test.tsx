import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { registerEditorDraft } from "../../lib/editor-draft";
import { useExtensionsStore, validateExtensionPreferences } from "../../store/extensions";
import { useGitSyncStore } from "../../store/git-sync";
import { useNoteStore } from "../../store/notes";
import { usePinnedPanelStore, WRITER_TAB } from "../../store/pinned-panel";
import { useToolsStore } from "../../store/tools";
import { useUIStore } from "../../store/ui";
import type { Note } from "../../types/note";
import { RightPanel } from "./RightPanel";

vi.mock("../../lib/tauri-commands", () => ({
  tauriCommands: { writerSend: vi.fn(), writerCancel: vi.fn() },
}));
vi.mock("../../lib/mermaid", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/mermaid")>()),
  renderMermaid: vi.fn().mockResolvedValue("<svg></svg>"),
}));

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

const todo = makeNote("todo", "Todo", "- [ ] Buy milk\n- [x] Outline the chapter");
const reference = makeNote("reference", "Reference", "The vault password hint is the first ship.");
const draft = makeNote("draft", "Draft", "Working draft.");

beforeEach(() => {
  localStorage.clear();
  usePinnedPanelStore.setState({ noteIds: [], activeId: WRITER_TAB });
  useNoteStore.setState({ notes: [todo, reference, draft], selectedNoteId: "draft" });
  useToolsStore.setState({ writerEnabled: false, settingsSection: "typography" });
  useExtensionsStore.setState(validateExtensionPreferences(null));
  useGitSyncStore.setState({ heldDrafts: {} });
  useUIStore.setState({ activeView: "notes", selectedGrouping: { type: "all", id: null } });
});

it("keeps the tool host, with a pin action, when nothing is pinned", () => {
  render(<RightPanel />);
  expect(screen.getByText("No tools enabled")).toBeInTheDocument();
  expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Pin to side" })).toBeEnabled();
});

it("pins notes as tabs and keeps the pinned note while another note changes", async () => {
  render(<RightPanel />);
  fireEvent.click(screen.getByRole("button", { name: "Pin to side" }));
  expect(await screen.findByRole("tab", { name: "Draft" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  act(() => useNoteStore.setState({ selectedNoteId: "todo" }));
  fireEvent.click(screen.getByRole("button", { name: "Pin to side" }));
  expect(screen.getByRole("tab", { name: "Todo" })).toHaveAttribute("aria-selected", "true");
  expect(await screen.findByRole("article", { name: "Pinned note Todo" })).toHaveTextContent(
    "Buy milk",
  );
  expect(useNoteStore.getState().selectedNoteId).toBe("todo");

  fireEvent.click(screen.getByRole("tab", { name: "Draft" }));
  expect(screen.getByRole("article", { name: "Pinned note Draft" })).toHaveTextContent(
    "Working draft.",
  );
  expect(useNoteStore.getState().selectedNoteId).toBe("todo");

  act(() => {
    useNoteStore.setState({
      notes: [todo, reference, { ...draft, content: "A sentence typed in the editor." }],
      selectedNoteId: "draft",
    });
  });
  fireEvent.click(screen.getByRole("tab", { name: "Todo" }));
  const pinned = screen.getByRole("article", { name: "Pinned note Todo" });
  expect(pinned).toHaveTextContent("Buy milk");
  expect(pinned).toHaveTextContent("Outline the chapter");
  expect(pinned).not.toHaveTextContent("A sentence typed in the editor.");
});

it("shows a pinned note's unsaved draft and not another note's draft", async () => {
  const unregisterPinned = registerEditorDraft("reference", () => "Unsaved hint about the ship");
  usePinnedPanelStore.setState({ noteIds: ["reference", "todo"], activeId: "reference" });
  render(<RightPanel />);
  expect(await screen.findByRole("article", { name: "Pinned note Reference" })).toHaveTextContent(
    "Unsaved hint about the ship",
  );
  unregisterPinned();
  const unregisterOther = registerEditorDraft("draft", () => "Typed into a different note");
  await waitFor(() =>
    expect(screen.getByRole("article", { name: "Pinned note Reference" })).toHaveTextContent(
      "The vault password hint is the first ship.",
    ),
  );
  expect(screen.queryByText("Typed into a different note")).not.toBeInTheDocument();
  unregisterOther();
});

it("moves between tabs from the keyboard and unpins back to the tool host", async () => {
  usePinnedPanelStore.setState({ noteIds: ["todo", "reference"], activeId: "todo" });
  render(<RightPanel />);
  const todoTab = await screen.findByRole("tab", { name: "Todo" });
  todoTab.focus();
  fireEvent.keyDown(todoTab, { key: "ArrowRight" });
  const referenceTab = screen.getByRole("tab", { name: "Reference" });
  expect(referenceTab).toHaveFocus();
  expect(referenceTab).toHaveAttribute("aria-selected", "true");
  await waitFor(() =>
    expect(screen.getByRole("article", { name: "Pinned note Reference" })).toHaveTextContent(
      "first ship",
    ),
  );

  fireEvent.click(screen.getByRole("button", { name: "Unpin Reference" }));
  expect(screen.queryByRole("tab", { name: "Reference" })).not.toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Todo" })).toHaveAttribute("aria-selected", "true");
  fireEvent.click(screen.getByRole("button", { name: "Unpin Todo" }));
  expect(screen.getByText("No tools enabled")).toBeInTheDocument();
  expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
});

it("does not pin a leftover selection outside the notes editor", () => {
  useUIStore.setState({ activeView: "dashboard" });
  const { unmount } = render(<RightPanel />);
  const pin = screen.getByRole("button", { name: "Pin to side" });
  expect(pin).toBeDisabled();
  fireEvent.click(pin);
  expect(usePinnedPanelStore.getState().noteIds).toEqual([]);
  unmount();

  useUIStore.setState({ activeView: "notes", selectedGrouping: { type: "trash", id: null } });
  render(<RightPanel />);
  expect(screen.getByRole("button", { name: "Pin to side" })).toBeDisabled();
});

it("disables the tab-strip pin when Kanban leaves the editor", () => {
  usePinnedPanelStore.setState({ noteIds: ["todo"], activeId: "todo" });
  useUIStore.setState({ activeView: "kanban" });
  render(<RightPanel />);
  const pin = screen.getByRole("button", { name: "Pin to side" });
  expect(pin).toBeDisabled();
  fireEvent.click(pin);
  expect(usePinnedPanelStore.getState().noteIds).toEqual(["todo"]);
});

it("shows a preserved sync draft instead of the externally loaded note", async () => {
  usePinnedPanelStore.setState({ noteIds: ["reference"], activeId: "reference" });
  useNoteStore.setState({
    notes: [todo, { ...reference, content: "External rewrite" }, draft],
    selectedNoteId: "draft",
  });
  const unregister = registerEditorDraft("reference", () => "Live keystrokes");
  render(<RightPanel />);
  expect(await screen.findByRole("article", { name: "Pinned note Reference" })).toHaveTextContent(
    "Live keystrokes",
  );
  act(() => {
    useGitSyncStore.getState().preserveHeldDraft("reference", "Local edits that must stay");
  });
  unregister();
  await waitFor(() =>
    expect(screen.getByRole("article", { name: "Pinned note Reference" })).toHaveTextContent(
      "Local edits that must stay",
    ),
  );
  expect(screen.queryByText("External rewrite")).not.toBeInTheDocument();
  act(() => useGitSyncStore.getState().clearHeldDraft("reference"));
  await waitFor(() =>
    expect(screen.getByRole("article", { name: "Pinned note Reference" })).toHaveTextContent(
      "External rewrite",
    ),
  );
});

function toolbarLabels() {
  const toolbar = screen.getByRole("tablist", { name: "Right panel" }).parentElement as HTMLElement;
  return [...toolbar.querySelectorAll<HTMLElement>('[role="tab"], button')]
    .map((element) => element.getAttribute("aria-label") ?? element.textContent)
    .filter((label) => !label?.startsWith("Unpin "));
}

it("shows an enabled tool's icon and hides it again when disabled", () => {
  render(<RightPanel />);
  expect(screen.queryByRole("tab", { name: "OpenAI Assistant" })).not.toBeInTheDocument();

  act(() => useExtensionsStore.getState().setEnabled("openai-assistant", true));
  expect(screen.getByRole("tab", { name: "OpenAI Assistant" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByRole("heading", { name: "OpenAI Assistant" })).toBeInTheDocument();
  expect(screen.queryByText("No tools enabled")).not.toBeInTheDocument();

  act(() => useExtensionsStore.getState().setEnabled("openai-assistant", false));
  expect(screen.queryByRole("tab", { name: "OpenAI Assistant" })).not.toBeInTheDocument();
  expect(screen.getByText("No tools enabled")).toBeInTheDocument();
});

it("keeps a tool's settings when it is disabled and enabled again", () => {
  const store = useExtensionsStore.getState();
  store.setEnabled("claude-assistant", true);
  store.configure("claude-assistant", { mode: "api", model: "claude-test" });
  store.setEnabled("claude-assistant", false);
  store.setEnabled("claude-assistant", true);
  expect(useExtensionsStore.getState().settings["claude-assistant"]).toEqual({
    mode: "api",
    model: "claude-test",
  });
});

it("orders the toolbar as OpenAI, Claude, pinned note, then the pin and wrench actions", async () => {
  useExtensionsStore.getState().setEnabled("claude-assistant", true);
  useExtensionsStore.getState().setEnabled("openai-assistant", true);
  usePinnedPanelStore.setState({ noteIds: ["todo"], activeId: "todo" });
  render(<RightPanel />);
  await screen.findByRole("article", { name: "Pinned note Todo" });
  expect(toolbarLabels()).toEqual([
    "OpenAI Assistant",
    "Claude Assistant",
    "Todo",
    "Pin to side",
    "Manage tools",
  ]);
});

it("shows one tool panel at a time and keeps pinned notes beside the tools", async () => {
  useExtensionsStore.getState().setEnabled("openai-assistant", true);
  useExtensionsStore.getState().setEnabled("claude-assistant", true);
  usePinnedPanelStore.setState({ noteIds: ["todo"], activeId: "todo" });
  render(<RightPanel />);
  expect(await screen.findByRole("article", { name: "Pinned note Todo" })).toBeInTheDocument();
  expect(screen.getAllByRole("tabpanel")).toHaveLength(1);

  const openai = screen.getByRole("tab", { name: "OpenAI Assistant" });
  fireEvent.click(openai);
  expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  expect(screen.getByRole("heading", { name: "OpenAI Assistant" })).toBeInTheDocument();
  expect(screen.queryByRole("article", { name: "Pinned note Todo" })).not.toBeInTheDocument();

  openai.focus();
  fireEvent.keyDown(openai, { key: "ArrowRight" });
  expect(screen.getByRole("tab", { name: "Claude Assistant" })).toHaveFocus();
  expect(screen.getByRole("heading", { name: "Claude Assistant" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "OpenAI Assistant" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: "Todo" }));
  expect(screen.getByRole("article", { name: "Pinned note Todo" })).toHaveTextContent("Buy milk");
  expect(useNoteStore.getState().selectedNoteId).toBe("draft");
});

it("opens Tools settings from the wrench", () => {
  useUIStore.setState({ settingsOpen: false });
  render(<RightPanel />);
  const [wrench, emptyStateButton] = screen.getAllByRole("button", { name: "Manage tools" });
  expect(emptyStateButton).toHaveTextContent("Manage tools");
  fireEvent.click(wrench);
  expect(useUIStore.getState().settingsOpen).toBe(true);
  expect(useToolsStore.getState().settingsSection).toBe("tools");
});
