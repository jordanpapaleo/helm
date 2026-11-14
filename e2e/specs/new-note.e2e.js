import assert from "node:assert/strict";
import { $, expect } from "@wdio/globals";
import { addedMarkdown, visibleMarkdown, waitForNoteFile } from "../support/files.js";
import { prepareWindow, showAllNotes } from "../support/ui.js";

describe("new note", () => {
  before(async () => {
    await prepareWindow();
    await showAllNotes();
  });

  it("creates a blank note titled Untitled in Prepare", async () => {
    const before = visibleMarkdown();
    await $('button[aria-label="New note"]').click();
    const menu = await $('[role="menu"][aria-label="New note"]');
    await menu.waitForDisplayed();
    await menu.$("button=Blank").click();
    await expect($("h1")).toHaveText("Untitled");
    const [created] = addedMarkdown(before);
    assert.ok(created, "no new file was created");
    const saved = await waitForNoteFile(
      created,
      (note) => note.data.title === "Untitled" && note.data.state === "Prepare",
      "the blank note was not written",
    );
    assert.equal(saved.data.template, undefined);
  });
});
