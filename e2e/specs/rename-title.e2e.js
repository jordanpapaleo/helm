import assert from "node:assert/strict";
import { $, expect } from "@wdio/globals";
import { noteExists, readNoteFile, waitForFile } from "../support/files.js";
import { commitInput, openNote, prepareWindow } from "../support/ui.js";

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
    await expect($("h1")).toHaveText("Renamed Title");
    await waitForFile("renamed-title.md", "the title rename did not create renamed-title.md");
    assert.equal(noteExists("alpha.md"), false);
    assert.equal(readNoteFile("renamed-title.md").data.id, "e2e-alpha");
  });
});

async function editTitle(value, key) {
  await $('button[aria-label="Edit title"]').click();
  await commitInput('input[aria-label="Note title"]', value, key);
}
