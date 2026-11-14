import assert from "node:assert/strict";
import { browser } from "@wdio/globals";
import { readNoteFile, waitForNoteFile } from "../support/files.js";
import { mainEditor, openNote, prepareWindow, replaceSelection } from "../support/ui.js";

describe("autosave", () => {
  before(async () => {
    await prepareWindow();
    await openNote("Alpha");
  });

  it("does not write when a note opens, and saves after an edit", async () => {
    await browser.waitUntil(
      async () => readNoteFile("alpha.md").data.updated === "2026-03-13T09:14:22Z",
      { timeout: 3000, timeoutMsg: "opening the note wrote it" },
    );
    const editor = await mainEditor();
    await editor.click();
    await replaceSelection("Updated body text");
    const saved = await waitForNoteFile(
      "alpha.md",
      (note) => note.content.includes("Updated body text"),
      "the edit was not saved",
    );
    assert.notEqual(saved.data.updated, "2026-03-13T09:14:22Z");
  });
});
