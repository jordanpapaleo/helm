import assert from "node:assert/strict";
import { $, expect } from "@wdio/globals";
import { readNoteFile, waitForNoteFile } from "../support/files.js";
import { mainEditor, openNote, openProperties, prepareWindow } from "../support/ui.js";

describe("locked note", () => {
  before(async () => {
    await prepareWindow();
    await openNote("Alpha");
  });

  it("drops heading writes and makes the editor and properties read-only until it is unlocked", async () => {
    await $('button[aria-label="Locked"]').click();
    await waitForNoteFile("alpha.md", (note) => note.data.locked === true, "locking did not write");
    await expect($('button[aria-label="Archive note"]')).not.toBeExisting();
    await expect($('button[aria-label="Delete note"]')).not.toBeExisting();
    await expect($('button[aria-label="Edit title"]')).not.toBeExisting();

    const state = await $('select[aria-label="State"]');
    await state.selectByAttribute("value", "Done");
    await expect(state).toHaveValue("Prepare");
    assert.equal(readNoteFile("alpha.md").data.state, "Prepare");

    const editor = await mainEditor();
    await expect(editor).toHaveAttribute("contenteditable", "false");

    const panel = await openProperties();
    await expect(panel.$("fieldset[disabled]")).toBeExisting();
    await expect(panel.$("span[title='2026-03-13T09:14:22Z']")).toBeDisplayed();

    await $('button[aria-label="Locked"]').click();
    await waitForNoteFile(
      "alpha.md",
      (note) => note.data.locked === false,
      "unlocking did not write",
    );
    await $('select[aria-label="State"]').selectByAttribute("value", "Maintain");
    const saved = await waitForNoteFile(
      "alpha.md",
      (note) => note.data.state === "Maintain",
      "an unlocked note did not save its state",
    );
    assert.equal(saved.data.locked, false);
  });
});
