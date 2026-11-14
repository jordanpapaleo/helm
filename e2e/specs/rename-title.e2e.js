import assert from "node:assert/strict";
import { $, browser, expect } from "@wdio/globals";
import { noteExists, readNoteFile, waitForFile } from "../support/files.js";
import { editTitle, openNote, prepareWindow } from "../support/ui.js";

describe("title edit", () => {
  before(async () => {
    await prepareWindow();
    await openNote("Alpha");
  });

  it("renames the file and keeps the id, and ignores an empty title, Escape, and a collision", async () => {
    await editTitle("", "Enter");
    await expect($("h1")).toHaveText("Alpha");
    assert.equal(noteExists("alpha.md"), true);

    await editTitle("Temporary", "Escape");
    await expect($("h1")).toHaveText("Alpha");
    assert.equal(noteExists("temporary.md"), false);

    await editTitle("Taken", "Enter");
    await expect($("h1")).toHaveText("Alpha");
    assert.equal(readNoteFile("taken.md").content.trim(), "Already here.");

    await editTitle("Renamed Title", "Enter");
    await waitForFile("renamed-title.md", "the title rename did not create renamed-title.md");
    assert.equal(noteExists("alpha.md"), false);
    assert.equal(readNoteFile("renamed-title.md").data.id, "e2e-alpha");
    // The new file exists before the watcher finishes with the old path.
    await browser.pause(1000);
    const heading = await $("h1");
    assert.equal(
      (await heading.isExisting()) ? await heading.getText() : "",
      "Renamed Title",
      "the renamed note should stay open",
    );
  });
});
