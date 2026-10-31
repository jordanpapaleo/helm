import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { tauriCommands } from "../../lib/tauri-commands";
import {
  EMPTY_CHAT,
  useExtensionsStore,
  validateExtensionPreferences,
} from "../../store/extensions";
import { useNoteStore } from "../../store/notes";
import { useUIStore } from "../../store/ui";
import type { Note } from "../../types/note";
import { RightPanel } from "../layout/RightPanel";

vi.mock("../../lib/tauri-commands", () => ({
  tauriCommands: { writerSend: vi.fn(), writerCancel: vi.fn(), writerConnections: vi.fn() },
}));

const note = {
  id: "n",
  vaultId: "v",
  content: "Saved content",
  frontmatter: { title: "Compass" },
} as Note;

const fetchSpy = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal("fetch", fetchSpy);
  useExtensionsStore.setState({
    ...validateExtensionPreferences(null),
    connected: { "openai-assistant": true, "claude-assistant": false },
    chats: { "openai-assistant": EMPTY_CHAT, "claude-assistant": EMPTY_CHAT },
  });
  useNoteStore.setState({
    notes: [note],
    selectedNoteId: "n",
    activeVaultId: null,
    vaults: [{ id: "v", name: "helm-notes", path: "/vault" }],
  });
  useUIStore.setState({ activeView: "notes", selectedGrouping: { type: "all", id: null } });
});

function expectNoModelCall() {
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(tauriCommands.writerSend).not.toHaveBeenCalled();
  expect(tauriCommands.writerConnections).not.toHaveBeenCalled();
}

it("says no tools are enabled when every tool is off", () => {
  render(<RightPanel />);
  expect(screen.getByText("No tools enabled")).toBeInTheDocument();
  expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
});

it("shows the connected OpenAI Assistant and records a message without calling a model", () => {
  useExtensionsStore.getState().setEnabled("openai-assistant", true);
  render(<RightPanel />);
  const panel = screen.getByRole("tabpanel");
  expect(within(panel).getByRole("heading", { name: "OpenAI Assistant" })).toBeInTheDocument();
  expect(
    within(panel).getByText("Connected · Subscription · client default model"),
  ).toBeInTheDocument();
  expect(within(panel).getByText("Think through helm-notes")).toBeInTheDocument();
  const composer = within(panel).getByRole("textbox", { name: "Message OpenAI Assistant" });
  expect(composer).toHaveAttribute("placeholder", "Message OpenAI Assistant…");
  const useOpenNote = within(panel).getByRole("checkbox", { name: "Use open note" });
  expect(useOpenNote).toBeChecked();
  expect(within(panel).getByText("Using: Compass")).toBeInTheDocument();
  const send = within(panel).getByRole("button", { name: "Send" });
  expect(send).toBeDisabled();

  fireEvent.change(composer, { target: { value: "What is missing?" } });
  fireEvent.click(send);
  const log = within(panel).getByRole("log", { name: "OpenAI Assistant conversation" });
  expect(log).toHaveTextContent("What is missing?");
  expect(log).toHaveTextContent("with Compass");
  expect(log).toHaveTextContent("Nothing was sent.");
  expect(composer).toHaveValue("");

  fireEvent.click(useOpenNote);
  expect(within(panel).getByText("Conversation only")).toBeInTheDocument();
  fireEvent.change(composer, { target: { value: "Just talk" } });
  fireEvent.keyDown(composer, { key: "Enter" });
  expect(useExtensionsStore.getState().chats["openai-assistant"].messages[1]).toMatchObject({
    content: "Just talk",
    noteTitle: undefined,
  });
  expectNoModelCall();
});

it("shows Claude's setup form until Connect, without touching the network", () => {
  useExtensionsStore.getState().setEnabled("claude-assistant", true);
  render(<RightPanel />);
  const panel = screen.getByRole("tabpanel");
  expect(within(panel).getByRole("heading", { name: "Claude Assistant" })).toBeInTheDocument();
  expect(within(panel).getByText("Think through notes with Claude.")).toBeInTheDocument();
  expect(within(panel).getByText("Not connected")).toBeInTheDocument();
  const connection = within(panel).getByRole("combobox", { name: "Connection" });
  expect(connection).toHaveValue("subscription");
  expect(
    within(connection)
      .getAllByRole("option")
      .map((option) => option.textContent),
  ).toEqual(["Subscription", "API key"]);
  expect(within(panel).getByText(/Uses your Claude plan/)).toBeInTheDocument();
  expect(within(panel).getByText(/Claude can’t read files or edit notes/)).toHaveTextContent(
    "Messages and the open note’s latest draft are sent when you send. Claude can’t read files or edit notes. Chats stay in memory for this session.",
  );

  fireEvent.change(connection, { target: { value: "api" } });
  expect(useExtensionsStore.getState().settings["claude-assistant"].mode).toBe("api");
  expect(within(panel).getByText(/Bills to your Anthropic API key/)).toBeInTheDocument();
  fireEvent.change(connection, { target: { value: "subscription" } });

  fireEvent.click(within(panel).getByRole("button", { name: "Check connection" }));
  expect(within(panel).getByRole("status")).toHaveTextContent("Not connected yet.");

  const model = within(panel).getByRole("textbox", { name: "Model (optional)" });
  expect(model).toHaveAttribute("placeholder", "Use client default");
  fireEvent.change(model, { target: { value: "claude-test" } });

  fireEvent.click(within(panel).getByRole("button", { name: "Connect" }));
  expect(within(panel).queryByText("Not connected")).not.toBeInTheDocument();
  expect(within(panel).getByText("Connected · Subscription · claude-test")).toBeInTheDocument();
  expect(
    within(panel).getByRole("textbox", { name: "Message Claude Assistant" }),
  ).toBeInTheDocument();
  expectNoModelCall();
});
