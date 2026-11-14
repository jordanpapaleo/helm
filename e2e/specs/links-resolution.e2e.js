import { $, browser, expect } from "@wdio/globals";
import { readNoteFile, waitForNoteFile } from "../support/files.js";
import { openNote, openProperties, prepareWindow, setField } from "../support/ui.js";

describe("link resolution", () => {
  before(async () => {
    await prepareWindow();
  });

  it("resolves a title to the note, keeps an archived target openable, and rewrites only unlocked copies", async () => {
    await openNote("Solo");
    await expect($("body")).not.toHaveText(expect.stringContaining("Backlinks"));

    await openNote("Alpha");
    const panel = await openProperties();
    await expect(panel).toHaveText(expect.stringContaining("Beta"));
    await $("button*=Beta").click();
    await browser.waitUntil(async () => (await $("h1").getText()) === "Beta");

    await openNote("Alpha");
    await $('button[aria-label="Edit title"]').click();
    await setField('input[aria-label="Note title"]', "Alpha Prime");
    const saved = await browser.execute(() => {
      const button = document.querySelector('button[aria-label="Save title"]');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    });
    if (!saved) throw new Error("Save title was not clicked");
    await waitForNoteFile(
      "mention.md",
      (note) => note.content.includes("[[Alpha Prime]]"),
      "the unlocked mention was not rewritten",
    );
    const locked = readNoteFile("locked.md");
    if (!locked.content.includes("[[Alpha]]") || locked.content.includes("Alpha Prime")) {
      throw new Error("the locked mention was rewritten");
    }
  });
});
