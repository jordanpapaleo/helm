import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { tauriCommands } from "../../lib/tauri-commands";
import {
  EMPTY_CHAT,
  useExtensionsStore,
  validateExtensionPreferences,
} from "../../store/extensions";
import { ToolsTab } from "./ToolsTab";

vi.mock("../../lib/tauri-commands", () => ({
  tauriCommands: {
    writerConnections: vi.fn(),
    writerLogin: vi.fn(),
    writerSend: vi.fn(),
  },
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network"));
  useExtensionsStore.setState({
    ...validateExtensionPreferences(null),
    connected: { "openai-assistant": true, "claude-assistant": false },
    chats: { "openai-assistant": EMPTY_CHAT, "claude-assistant": EMPTY_CHAT },
  });
});

it("lists the built-in assistants and leaves install disabled", () => {
  render(<ToolsTab />);
  expect(screen.getByRole("heading", { name: "Tools" })).toBeInTheDocument();
  expect(
    screen.getByText(
      "Extensions that add tools to the side panel. Turn a tool on to show its icon in the toolbar.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByText("2 installed")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "OpenAI Assistant, built-in" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Claude Assistant, built-in" })).toBeInTheDocument();
  expect(screen.getAllByText("Built-in")).toHaveLength(2);
  expect(screen.getByText("Think through notes with OpenAI.")).toBeInTheDocument();
  expect(screen.getByText("Think through notes with Claude.")).toBeInTheDocument();
  for (const name of ["Show OpenAI Assistant in toolbar", "Show Claude Assistant in toolbar"]) {
    const toggle = screen.getByRole("checkbox", { name });
    expect(toggle).toHaveClass("toggle");
    expect(toggle).not.toBeChecked();
  }
  const install = screen.getByRole("button", { name: /Install extension/ });
  expect(install).toBeDisabled();
  expect(install).toHaveTextContent("Soon");
  expect(screen.getByText(/Each tool’s gear holds its configuration/)).toBeInTheDocument();
  expect(screen.getByText("Build and install your own tools")).toBeInTheDocument();
});

it("turns a tool on with setEnabled and keeps its settings when turned off", () => {
  useExtensionsStore.getState().configure("openai-assistant", { model: "gpt-test", mode: "api" });
  render(<ToolsTab />);
  const toggle = screen.getByRole("checkbox", { name: "Show OpenAI Assistant in toolbar" });
  fireEvent.click(toggle);
  expect(screen.getByText("Showing in toolbar")).toBeInTheDocument();
  expect(useExtensionsStore.getState().enabled).toEqual(["openai-assistant"]);
  fireEvent.click(toggle);
  expect(screen.queryByText("Showing in toolbar")).not.toBeInTheDocument();
  expect(useExtensionsStore.getState().enabled).toEqual([]);
  expect(useExtensionsStore.getState().settings["openai-assistant"]).toEqual({
    mode: "api",
    model: "gpt-test",
  });
  const saved = JSON.parse(localStorage.getItem("helm-extensions") ?? "null");
  expect(saved.settings["openai-assistant"].model).toBe("gpt-test");
  expect(saved).not.toHaveProperty("connected");
});

it("opens a tool page from the card or the gear", async () => {
  const user = userEvent.setup();
  render(<ToolsTab />);
  await user.click(screen.getByRole("button", { name: "OpenAI Assistant settings" }));
  expect(screen.getByRole("button", { name: "‹ All tools" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "OpenAI Assistant" })).toBeInTheDocument();
  expect(screen.getByText("Built-in")).toBeInTheDocument();
  expect(screen.getByText("Think through notes with OpenAI.")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Show in toolbar" })).toHaveClass("toggle");
  expect(screen.getByRole("heading", { name: "Connection" })).toBeInTheDocument();
  expect(screen.getByText("Connected")).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Subscription" })).toBeChecked();
  expect(screen.getByText(/Helm uses your ChatGPT subscription sign-in/)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Model" })).toBeInTheDocument();
  expect(screen.getByText(/Leave blank to use the client’s default/)).toBeInTheDocument();
  expect(screen.getByPlaceholderText("Use client default")).toHaveValue("");
  expect(screen.getByText(/Every installed tool gets this page/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Check connection" }));
  expect(screen.getByRole("status")).toHaveTextContent("Connected");
  expect(tauriCommands.writerConnections).not.toHaveBeenCalled();
  expect(tauriCommands.writerLogin).not.toHaveBeenCalled();
  expect(globalThis.fetch).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("checkbox", { name: "Show in toolbar" }));
  expect(useExtensionsStore.getState().enabled).toEqual(["openai-assistant"]);

  await user.click(screen.getByRole("button", { name: "‹ All tools" }));
  await user.click(screen.getByRole("button", { name: "Claude Assistant, built-in" }));
  expect(screen.getByRole("heading", { name: "Claude Assistant" })).toBeInTheDocument();
  expect(screen.getByText("Not connected")).toBeInTheDocument();
  expect(screen.getByText(/Helm uses your Claude subscription sign-in/)).toBeInTheDocument();

  const subscription = screen.getByRole("radio", { name: "Subscription" });
  subscription.focus();
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("radio", { name: "API key" })).toHaveFocus();
  expect(useExtensionsStore.getState().settings["claude-assistant"].mode).toBe("api");
  expect(screen.getByText(/does not collect or store a key/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Check connection" }));
  expect(screen.getByRole("status")).toHaveTextContent("Not connected");
  expect(tauriCommands.writerConnections).not.toHaveBeenCalled();
  expect(globalThis.fetch).not.toHaveBeenCalled();

  fireEvent.change(screen.getByPlaceholderText("Use client default"), {
    target: { value: "claude-sonnet" },
  });
  expect(useExtensionsStore.getState().settings["claude-assistant"].model).toBe("claude-sonnet");
  fireEvent.click(screen.getByRole("button", { name: "‹ All tools" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Show Claude Assistant in toolbar" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Show Claude Assistant in toolbar" }));
  expect(useExtensionsStore.getState().settings["claude-assistant"]).toEqual({
    mode: "api",
    model: "claude-sonnet",
  });
});
