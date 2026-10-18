import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { tauriCommands } from "../../lib/tauri-commands";
import { useToolsStore } from "../../store/tools";
import { ToolsTab } from "./ToolsTab";

vi.mock("../../lib/tauri-commands", () => ({
  tauriCommands: { writerConnections: vi.fn(), writerLogin: vi.fn() },
}));
it("launches provider sign-in explicitly and validates availability separately", async () => {
  useToolsStore.setState({ writerEnabled: false, provider: "codex" });
  vi.mocked(tauriCommands.writerConnections).mockResolvedValue([
    { provider: "codex", installed: true, connected: false, detail: "Sign in first" },
  ]);
  vi.mocked(tauriCommands.writerLogin).mockResolvedValue();
  render(<ToolsTab />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Sign in with ChatGPT" })).toBeEnabled(),
  );
  expect(tauriCommands.writerLogin).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox"));
  expect(useToolsStore.getState().writerEnabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Sign in with ChatGPT" }));
  await waitFor(() => expect(tauriCommands.writerLogin).toHaveBeenCalledWith("codex"));
});
