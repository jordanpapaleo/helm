import assert from "node:assert/strict";
import { $, expect } from "@wdio/globals";
import { waitForNoteFile } from "../support/files.js";
import { openNote, prepareWindow } from "../support/ui.js";

describe("workflow controls", () => {
  before(async () => {
    await prepareWindow();
    await openNote("Alpha");
  });

  it("writes state, urgent, and important, and has no blocked control in the heading", async () => {
    await expect($('button[aria-label="Blocked"]')).not.toBeExisting();
    const state = await $('select[aria-label="State"]');
    await state.selectByAttribute("value", "Done");
    const urgent = await $('button[aria-label="Urgent"]');
    await urgent.click();
    await expect(urgent).toHaveAttribute("aria-pressed", "true");
    const important = await $('button[aria-label="Important"]');
    await important.click();
    await expect(important).toHaveAttribute("aria-pressed", "true");
    const saved = await waitForNoteFile(
      "alpha.md",
      (note) =>
        note.data.state === "Done" && note.data.urgent === true && note.data.important === true,
      "the heading workflow controls did not write the note",
    );
    assert.equal(saved.data.blocked, false);
  });
});
