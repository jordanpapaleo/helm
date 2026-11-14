import assert from "node:assert/strict";
import { $, browser } from "@wdio/globals";
import { waitForNoteFile } from "../support/files.js";
import { elementText, mainEditor, openNote, prepareWindow } from "../support/ui.js";

describe("wiki links become ids", () => {
  before(async () => {
    await prepareWindow();
    await openNote("Alpha");
  });

  it("writes the other note's id into links and leaves this note out", async () => {
    const editor = await mainEditor();
    await editor.click();
    await browser.keys("Enter");
    await browser.keys("[");
    await browser.keys("[");
    const menu = await $('section[aria-label="Note links"]');
    await menu.waitForDisplayed();
    assert.match(await elementText(menu), /Beta/);
    await menu.$("button*=Beta").click();
    const saved = await waitForNoteFile(
      "alpha.md",
      (note) => Array.isArray(note.data.links) && note.data.links.includes("e2e-beta"),
      "the wiki title was not saved as an id",
    );
    assert.equal(saved.data.links.includes("e2e-alpha"), false);
    assert.match(saved.content, /\[\[Beta\]\]/);
  });
});
