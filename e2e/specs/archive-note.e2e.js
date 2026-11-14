import assert from "node:assert/strict";
import { $, expect } from "@wdio/globals";
import { waitForNoteFile } from "../support/files.js";
import { openNote, prepareWindow } from "../support/ui.js";

describe("archive", () => {
  before(async () => {
    await prepareWindow();
    await openNote("Alpha");
  });

  it("archives in place and lists the note under Archive", async () => {
    await $('button[aria-label="Archive note"]').click();
    await expect($(".badge=Archived")).toBeDisplayed();
    const saved = await waitForNoteFile(
      "alpha.md",
      (note) => note.data.archived === true,
      "archive did not write archived: true",
    );
    assert.equal(saved.data.id, "e2e-alpha");
    assert.equal(saved.data.state, "Prepare");

    await $('button[aria-label="Archive"]').click();
    await expect($("button*=Alpha")).toBeDisplayed();
  });
});
