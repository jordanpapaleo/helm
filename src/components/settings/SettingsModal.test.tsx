import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Settings } from "../../lib/settings";
import { useSettingsStore } from "../../store/settings";
import { SettingsModal } from "./SettingsModal";

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
});

function openGeneralTab() {
  render(<SettingsModal onClose={() => {}} />);
  fireEvent.click(screen.getByRole("tab", { name: "General" }));
}

describe("SettingsModal General tab toggles", () => {
  it("renders each setting as a labeled DaisyUI toggle at its default", () => {
    openGeneralTab();

    const rows: Array<{ name: string; checked: boolean }> = [
      { name: "Autocomplete WikiLinks", checked: true },
      { name: "Auto-save on edit", checked: true },
      { name: "Pinned notes float to top", checked: true },
      { name: "Show note count on tags", checked: true },
      { name: "Show archived notes", checked: false },
      { name: "Enable Projects", checked: false },
      { name: "Default to Markdown view", checked: false },
    ];

    for (const row of rows) {
      const toggle = screen.getByRole("checkbox", { name: row.name });
      expect(toggle).toHaveClass("toggle");
      expect(toggle).toHaveProperty("checked", row.checked);
    }
  });

  it("persists each toggle through the same settings fields", () => {
    openGeneralTab();

    fireEvent.click(screen.getByRole("checkbox", { name: "Autocomplete WikiLinks" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Auto-save on edit" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Pinned notes float to top" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Show note count on tags" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Show archived notes" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Enable Projects" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Default to Markdown view" }));

    const settings = useSettingsStore.getState().settings;
    expect(settings).toMatchObject({
      autocompleteWikiLinks: false,
      autoSaveOnEdit: false,
      pinnedNotesFloat: false,
      showNoteCountOnTags: false,
      showArchivedNotes: true,
      enableProjects: true,
      defaultNoteView: "markdown",
    } satisfies Partial<Settings>);
    expect(JSON.parse(localStorage.getItem("helm-settings") ?? "{}")).toMatchObject({
      autocompleteWikiLinks: false,
      autoSaveOnEdit: false,
      pinnedNotesFloat: false,
      showNoteCountOnTags: false,
      showArchivedNotes: true,
      enableProjects: true,
      defaultNoteView: "markdown",
    });

    fireEvent.click(screen.getByRole("checkbox", { name: "Default to Markdown view" }));
    expect(useSettingsStore.getState().settings.defaultNoteView).toBe("editor");
  });

  it("toggles a setting from the keyboard", async () => {
    const user = userEvent.setup();
    openGeneralTab();

    const toggle = screen.getByRole("checkbox", { name: "Show archived notes" });
    toggle.focus();
    expect(toggle).toHaveFocus();
    await user.keyboard(" ");
    expect(useSettingsStore.getState().settings.showArchivedNotes).toBe(true);
    expect(toggle).toBeChecked();
  });
});
