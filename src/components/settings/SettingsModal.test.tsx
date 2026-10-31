import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../lib/settings";
import { useSettingsStore } from "../../store/settings";
import { SettingsModal } from "./SettingsModal";

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
});

describe("SettingsModal note font", () => {
  it("round-trips the choice and Restore Defaults clears it", () => {
    render(<SettingsModal onClose={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Typography" }));

    const font = screen.getByLabelText("Font");
    expect(font.tagName).toBe("SELECT");
    font.focus();
    expect(font).toHaveFocus();
    expect(font).toHaveValue("system");

    fireEvent.change(font, { target: { value: "serif" } });
    expect(useSettingsStore.getState().settings.noteFont).toBe("serif");
    expect(JSON.parse(localStorage.getItem("helm-settings") ?? "{}").noteFont).toBe("serif");
    expect(document.documentElement.style.getPropertyValue("--editor-font-family")).toContain(
      "Georgia",
    );

    fireEvent.change(font, { target: { value: "papyrus" } });
    expect(useSettingsStore.getState().settings.noteFont).toBe("serif");

    fireEvent.click(screen.getByRole("button", { name: "Restore Defaults" }));
    expect(useSettingsStore.getState().settings.noteFont).toBe(DEFAULT_SETTINGS.noteFont);
    expect(font).toHaveValue("system");
    expect(JSON.parse(localStorage.getItem("helm-settings") ?? "{}").noteFont).toBe("system");
    expect(document.documentElement.style.getPropertyValue("--editor-font-family")).toBe(
      "var(--font-sans)",
    );
  });
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

  it("defaults Projects off and persists Enable Projects", () => {
    render(<SettingsModal onClose={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "General" }));

    const checkbox = screen.getByRole("checkbox", { name: "Enable Projects" });
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(useSettingsStore.getState().settings.enableProjects).toBe(true);
    expect(JSON.parse(localStorage.getItem("helm-settings") ?? "{}").enableProjects).toBe(true);
  });
});
