import assert from "node:assert/strict";
import { $, expect } from "@wdio/globals";
import {
  closeSettings,
  localValue,
  openNote,
  openSettings,
  pageText,
  prepareWindow,
  settingsCheckbox,
} from "../support/ui.js";

describe("general settings", () => {
  before(async () => {
    await prepareWindow();
  });

  it("persists the window toggles and shows archived notes when that toggle is on", async () => {
    await openSettings("General");
    const archived = await settingsCheckbox("Show archived notes");
    await archived.click();
    const projects = await settingsCheckbox("Enable Projects");
    await projects.click();
    await closeSettings();
    const stored = JSON.parse(await localValue("helm-settings"));
    assert.equal(stored.showArchivedNotes, true);
    assert.equal(stored.enableProjects, true);

    assert.match(await pageText(), /Old Note/);
    await openNote("Old Note");
    await expect($("h1")).toHaveText("Old Note");
  });
});
