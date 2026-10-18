import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { tauriCommands } from "../../lib/tauri-commands";
import { useToolsStore } from "../../store/tools";
import { useWriterStore } from "../../store/writer";
import { ApiConnection } from "./ApiConnection";

vi.mock("../../lib/tauri-commands", () => ({
  tauriCommands: {
    writerKeyStatus: vi.fn(),
    writerKeySet: vi.fn(),
    writerKeyRemove: vi.fn(),
    writerApiModels: vi.fn(),
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useWriterStore.setState({ running: null });
  useToolsStore.setState({
    writerEnabled: true,
    provider: "codex",
    mode: "api",
    apiModels: { codex: "", claude: "" },
  });
  vi.mocked(tauriCommands.writerKeyStatus).mockResolvedValue(false);
  vi.mocked(tauriCommands.writerKeySet).mockResolvedValue();
  vi.mocked(tauriCommands.writerKeyRemove).mockResolvedValue();
});
it("saves keys only through the native credential command, clears input and loads provider models", async () => {
  vi.mocked(tauriCommands.writerApiModels).mockResolvedValue(["text-model"]);
  render(<ApiConnection provider="codex" />);
  const input = screen.getByLabelText("API key");
  await waitFor(() => expect(input).toBeEnabled());
  fireEvent.change(input, { target: { value: "fake-test-api-key" } });
  fireEvent.click(screen.getByRole("button", { name: "Save key" }));
  expect(input).toHaveValue("");
  await waitFor(() => expect(screen.getByText("API key saved")).toBeInTheDocument());
  expect(tauriCommands.writerKeySet).toHaveBeenCalledWith("codex", "fake-test-api-key");
  fireEvent.click(screen.getByRole("button", { name: "Load available models" }));
  await waitFor(() =>
    expect(screen.getByRole("option", { hidden: true })).toHaveValue("text-model"),
  );
  fireEvent.change(screen.getByLabelText("API model"), { target: { value: "text-model" } });
  expect(useToolsStore.getState().apiModels.codex).toBe("text-model");
  expect(localStorage.getItem("helm-tools")).not.toContain("fake-test-api-key");
  fireEvent.click(screen.getByRole("button", { name: "Remove key" }));
  await waitFor(() => expect(screen.getByText("No API key saved")).toBeInTheDocument());
  expect(tauriCommands.writerKeyRemove).toHaveBeenCalledWith("codex");
});
it("reports credential-store failures without pretending a key was saved", async () => {
  vi.mocked(tauriCommands.writerKeySet).mockRejectedValue("Credential store locked");
  render(<ApiConnection provider="claude" />);
  const input = screen.getByLabelText("API key");
  await waitFor(() => expect(input).toBeEnabled());
  fireEvent.change(input, { target: { value: "fake-test-api-key" } });
  fireEvent.click(screen.getByRole("button", { name: "Save key" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Credential store locked"),
  );
  expect(screen.getByText("No API key saved")).toBeInTheDocument();
  expect(input).toHaveValue("");
});
