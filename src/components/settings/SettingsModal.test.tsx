import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../lib/settings";
import { useSettingsStore } from "../../store/settings";
import { SettingsModal } from "./SettingsModal";

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
});

describe("SettingsModal show archived notes", () => {
  it("defaults off and persists the toggle", () => {
    render(<SettingsModal onClose={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "General" }));

    const checkbox = screen.getByRole("checkbox", { name: "Show archived notes" });
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(useSettingsStore.getState().settings.showArchivedNotes).toBe(true);
    expect(JSON.parse(localStorage.getItem("helm-settings") ?? "{}").showArchivedNotes).toBe(true);
  });
});
