import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { registerEditorDraft } from "../../lib/editor-draft";
import { tauriCommands } from "../../lib/tauri-commands";
import { useNoteStore } from "../../store/notes";
import { useToolsStore } from "../../store/tools";
import { useUIStore } from "../../store/ui";
import { useWriterStore } from "../../store/writer";
import type { Note } from "../../types/note";
import { ToolHost } from "./ToolHost";

vi.mock("../../lib/tauri-commands", () => ({
  tauriCommands: { writerSend: vi.fn(), writerCancel: vi.fn() },
}));
const note = {
  id: "n",
  vaultId: "v",
  content: "Saved content",
  frontmatter: { title: "Compass" },
} as Note;
beforeEach(() => {
  vi.clearAllMocks();
  useToolsStore.setState({
    writerEnabled: false,
    provider: "codex",
    mode: "subscription",
    apiModels: { codex: "", claude: "" },
    settingsSection: "typography",
  });
  useWriterStore.setState({ sessions: {}, running: null });
  useNoteStore.setState({ notes: [note], selectedNoteId: "n", activeVaultId: "v" });
  useUIStore.setState({
    settingsOpen: false,
    activeView: "notes",
    selectedGrouping: { type: "all", id: null },
  });
});
it("keeps an empty host reachable and opens Tools settings", () => {
  render(<ToolHost />);
  expect(screen.getByText("No tools enabled")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Manage tools", { selector: "button" }));
  expect(useUIStore.getState().settingsOpen).toBe(true);
  expect(useToolsStore.getState().settingsSection).toBe("tools");
});
it("follows the open note, preserving earlier note context and conversation history", async () => {
  let request = "";
  vi.mocked(tauriCommands.writerSend).mockImplementation(async (id, _provider, prompt, events) => {
    request = prompt;
    events({ requestId: id, kind: "completed", text: "" });
  });
  useToolsStore.setState({ writerEnabled: true });
  const unregister = registerEditorDraft("n", () => "Current unsaved text");
  const { unmount } = render(<ToolHost />);
  fireEvent.change(screen.getByRole("textbox", { name: "Message Writer" }), {
    target: { value: "Help" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send ↑" }));
  await waitFor(() => expect(useWriterStore.getState().running).toBeNull());
  expect(JSON.parse(request).attachedNote?.markdown).toBe("Current unsaved text");
  const second = {
    ...note,
    id: "second",
    content: "Second note",
    frontmatter: { ...note.frontmatter, title: "Next idea" },
  };
  act(() => useNoteStore.setState({ notes: [note, second], selectedNoteId: "second" }));
  expect(screen.getByText("Using: Next idea")).toBeInTheDocument();
  expect(tauriCommands.writerSend).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByRole("textbox", { name: "Message Writer" }), {
    target: { value: "Feedback" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send ↑" }));
  await waitFor(() => expect(JSON.parse(request).attachedNote?.markdown).toBe("Second note"));
  expect(JSON.parse(request).messages[0].noteContext.markdown).toBe("Current unsaved text");
  expect(JSON.parse(request).messages[2].content).toBe("Feedback");
  fireEvent.click(screen.getByRole("checkbox", { name: "Use open note" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Message Writer" }), {
    target: { value: "Continue without a note" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send ↑" }));
  await waitFor(() => expect(JSON.parse(request).attachedNote).toBeNull());
  expect(JSON.parse(request).messages[0].noteContext.markdown).toBe("Current unsaved text");
  expect(useNoteStore.getState().notes[0].content).toBe("Saved content");
  unregister();
  unmount();
});
it("keeps draft across panel mounting and cancels when disabled", async () => {
  useToolsStore.setState({ writerEnabled: true });
  const first = render(<ToolHost />);
  fireEvent.change(screen.getByRole("textbox", { name: "Message Writer" }), {
    target: { value: "My idea" },
  });
  first.unmount();
  render(<ToolHost />);
  expect(screen.getByRole("textbox", { name: "Message Writer" })).toHaveValue("My idea");
  act(() => useWriterStore.setState({ running: { id: "request", scope: "v:codex" } }));
  act(() => useToolsStore.setState({ writerEnabled: false }));
  await waitFor(() => expect(tauriCommands.writerCancel).toHaveBeenCalledWith("request"));
});
it("sends on Enter while allowing Shift+Enter and input composition", async () => {
  useToolsStore.setState({ writerEnabled: true });
  vi.mocked(tauriCommands.writerSend).mockImplementation(async (id, _provider, _prompt, events) => {
    events({ requestId: id, kind: "completed", text: "" });
  });
  render(<ToolHost />);
  const composer = screen.getByRole("textbox", { name: "Message Writer" });
  fireEvent.change(composer, { target: { value: "An idea" } });
  expect(fireEvent.keyDown(composer, { key: "Enter", shiftKey: true })).toBe(true);
  expect(fireEvent.keyDown(composer, { key: "Enter", isComposing: true })).toBe(true);
  expect(tauriCommands.writerSend).not.toHaveBeenCalled();
  expect(fireEvent.keyDown(composer, { key: "Enter" })).toBe(false);
  await waitFor(() => expect(tauriCommands.writerSend).toHaveBeenCalledTimes(1));
});
