import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_LAYOUT } from "../../lib/workspace-layout";
import { useLayoutStore } from "../../store/layout";
import { useUIStore } from "../../store/ui";
import { AppShell } from "./AppShell";

let mounts = 0;
vi.mock("./MainPanel", async () => {
  const { useEffect } = await import("react");
  return {
    MainPanel: () => {
      useEffect(() => {
        mounts++;
      }, []);
      return <textarea aria-label="Editor" defaultValue="Pending edits" />;
    },
  };
});
vi.mock("./LeftColumn", () => ({ LeftColumn: () => <div>Navigation</div> }));
vi.mock("./NoteListPanel", () => ({ NoteListPanel: () => <div>Note list</div> }));
vi.mock("../settings/SettingsModal", () => ({ SettingsModal: () => <div>Settings dialog</div> }));
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  window.innerWidth = 1600;
  useLayoutStore.setState({ preferences: DEFAULT_LAYOUT, priority: "left" });
  useUIStore.setState({ activeView: "notes", settingsOpen: false });
  mounts = 0;
});
it("preserves center edits and history while toggling all four layouts", () => {
  render(<AppShell />);
  const editor = screen.getByRole("textbox");
  fireEvent.change(editor, { target: { value: "Unsaved content" } });
  const history = useUIStore.getState().navHistory;
  expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  for (const name of [
    "Toggle right panel",
    "Toggle left panel",
    "Toggle right panel",
    "Toggle left panel",
  ]) {
    fireEvent.click(screen.getByRole("button", { name }));
    expect(screen.getByRole("textbox")).toBe(editor);
    expect(editor).toHaveValue("Unsaved content");
  }
  expect(mounts).toBe(1);
  expect(useUIStore.getState().navHistory).toBe(history);
});
it("hosts settings independently of hidden navigation", () => {
  render(<AppShell />);
  fireEvent.click(screen.getByRole("button", { name: "Toggle left panel" }));
  act(() => useUIStore.getState().setSettingsOpen(true));
  expect(screen.getByText("Settings dialog")).toBeInTheDocument();
  expect(screen.queryByText("Navigation")).not.toBeInTheDocument();
});
