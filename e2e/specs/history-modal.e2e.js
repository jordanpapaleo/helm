import { $, browser, expect } from "@wdio/globals";
import { readNoteFile, waitForNoteFile } from "../support/files.js";
import { mainEditor, openNote, prepareWindow, replaceSelection } from "../support/ui.js";

describe("history", () => {
  before(async () => {
    await prepareWindow();
    await openNote("Alpha");
  });

  it("snapshots the previous body and can restore it", async () => {
    const editor = await mainEditor();
    await editor.click();
    await replaceSelection("Second body");
    await waitForNoteFile(
      "alpha.md",
      (note) => note.content.includes("Second body"),
      "the edit was not saved",
    );
    await $('button[aria-label="Note history"]').click();
    const snapshot = await $('button[aria-label^="Snapshot from"]');
    await snapshot.waitForDisplayed();
    await snapshot.click();
    await expect($("body")).toHaveText(expect.stringContaining("Original body"));
    await $("button=Restore this version").click();
    await browser.waitUntil(
      async () => readNoteFile("alpha.md").content.includes("Original body"),
      { timeout: 10000, timeoutMsg: "restore did not write the previous body" },
    );
    await expect($("button*=.helm-history")).not.toBeExisting();
  });
});
