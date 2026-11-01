import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { tauriCommands } from "../../lib/tauri-commands";
import {
  EMPTY_CHAT,
  useExtensionsStore,
  validateExtensionPreferences,
} from "../../store/extensions";
import { useNoteStore } from "../../store/notes";
import { usePinnedPanelStore } from "../../store/pinned-panel";
import { useToolsStore } from "../../store/tools";
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
  useUIStore.setState({
    settingsOpen: false,
    activeView: "notes",
    selectedGrouping: { type: "all", id: null },
  });
  useToolsStore.setState({ settingsSection: "typography", settingsTool: null });
  usePinnedPanelStore.setState({ noteIds: [], activeId: "openai-assistant" });
});

function panelHeader(name: string): HTMLElement {
  return screen.getByRole("heading", { name }).closest(".border-b") as HTMLElement;
}

function statusLine(name: string): HTMLElement {
  return screen.getByRole("heading", { name }).nextElementSibling as HTMLElement;
}

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
  expect(statusLine("OpenAI Assistant")).toHaveTextContent(
    "Connected · Subscription · client default model",
  );
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
  expect(statusLine("Claude Assistant")).toHaveTextContent(
    "Not connected · Subscription · client default model",
  );
  expect(panel.querySelector(".badge")).toBeNull();
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
  expect(statusLine("Claude Assistant")).toHaveTextContent(
    "Connected · Subscription · claude-test",
  );
  expect(statusLine("Claude Assistant").querySelector(".status")).toHaveClass("status-success");
  expect(
    within(panel).getByRole("textbox", { name: "Message Claude Assistant" }),
  ).toBeInTheDocument();
  expectNoModelCall();
});

it("gives OpenAI and Claude the same header chrome with a DaisyUI status dot", () => {
  const store = useExtensionsStore.getState();
  store.setEnabled("openai-assistant", true);
  store.setEnabled("claude-assistant", true);
  render(<RightPanel />);

  const openai = panelHeader("OpenAI Assistant");
  const openaiShape = {
    header: openai.className,
    title: screen.getByRole("heading", { name: "OpenAI Assistant" }).className,
    status: statusLine("OpenAI Assistant").className,
  };
  expect(statusLine("OpenAI Assistant").querySelector(".status")).toHaveClass(
    "status",
    "status-success",
  );
  expect(
    within(openai).getByRole("button", { name: "OpenAI Assistant options" }),
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: "Claude Assistant" }));
  const claude = panelHeader("Claude Assistant");
  expect({
    header: claude.className,
    title: screen.getByRole("heading", { name: "Claude Assistant" }).className,
    status: statusLine("Claude Assistant").className,
  }).toEqual(openaiShape);
  expect(statusLine("Claude Assistant").querySelector(".status")).toHaveClass(
    "status",
    "status-neutral",
  );
  expect(
    within(claude).getByRole("button", { name: "Claude Assistant options" }),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
});

it("opens a tool's settings or hides it from the header menu", () => {
  useExtensionsStore.getState().setEnabled("claude-assistant", true);
  render(<RightPanel />);
  const options = screen.getByRole("button", { name: "Claude Assistant options" });
  expect(options).toHaveAttribute("aria-haspopup", "menu");

  fireEvent.click(options);
  expect(options).toHaveAttribute("aria-expanded", "true");
  const menu = screen.getByRole("menu");
  expect(
    within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.textContent),
  ).toEqual(["Tool settings", "Hide from toolbar"]);
  expect(within(menu).getByRole("menuitem", { name: "Tool settings" })).toHaveFocus();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(options).toHaveFocus();

  fireEvent.click(options);
  fireEvent.click(screen.getByRole("menuitem", { name: "Tool settings" }));
  expect(useUIStore.getState().settingsOpen).toBe(true);
  expect(useToolsStore.getState()).toMatchObject({
    settingsSection: "tools",
    settingsTool: "claude-assistant",
  });

  fireEvent.click(screen.getByRole("button", { name: "Claude Assistant options" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Hide from toolbar" }));
  expect(useExtensionsStore.getState().enabled).toEqual([]);
  expect(screen.queryByRole("tab", { name: "Claude Assistant" })).not.toBeInTheDocument();
  expect(screen.getByText("No tools enabled")).toBeInTheDocument();
});
