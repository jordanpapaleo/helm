import assert from "node:assert/strict";
import { $, browser, expect } from "@wdio/globals";
import { readNoteFile } from "../support/files.js";
import { openNote, prepareWindow } from "../support/ui.js";

describe("heading action row", () => {
  before(async () => {
    await prepareWindow();
    await openNote("Alpha");
  });

  it("exposes the heading actions, swaps the copy icon, and pins without setting pinned", async () => {
    for (const label of [
      "Copy file path",
      "Pin to side",
      "Note history",
      "Export to PDF",
      "Rich text",
      "Markdown",
      "Archive note",
      "Delete note",
      "Properties",
    ]) {
      await expect($(`button[aria-label="${label}"]`)).toBeDisplayed();
    }

    const copy = await $('button[aria-label="Copy file path"]');
    const before = await copy.getHTML();
    await copy.click();
    await browser.waitUntil(async () => (await copy.getHTML()) !== before, {
      timeout: 5000,
      timeoutMsg: "copying the path did not show the check icon",
    });

    await $('button[aria-label="Pin to side"]').click();
    await $('[aria-label="Alpha content"]').waitForDisplayed({ timeout: 10000 });
    assert.equal(readNoteFile("alpha.md").data.pinned, undefined);
  });
});
