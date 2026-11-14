import { $, browser, expect } from "@wdio/globals";
import { waitForNoteFile } from "../support/files.js";
import { mainEditor, openNote, pageText, prepareWindow, setField } from "../support/ui.js";

describe("find and replace", () => {
  before(async () => {
    await prepareWindow();
    await openNote("Alpha");
  });

  it("opens find, then replace, and replaces every match", async () => {
    const editor = await mainEditor();
    await editor.click();
    await browser.keys(["Control", "f"]);
    const find = await $('input[placeholder="Find"]');
    await find.waitForDisplayed();
    await setField('input[placeholder="Find"]', "alpha");
    await browser.waitUntil(async () => (await pageText()).includes("of 2"), {
      timeoutMsg: "find did not report both matches",
    });
    await $('button[aria-label="Expand replace"]').click();
    const replace = await $('input[placeholder="Replace"]');
    await replace.waitForDisplayed();
    await setField('input[placeholder="Replace"]', "beta");
    await $("button=Replace All").click();
    await find.click();
    await browser.keys("Escape");
    await expect($('input[placeholder="Find"]')).not.toBeExisting();
    await waitForNoteFile(
      "alpha.md",
      (note) => note.content.includes("beta beta") && !note.content.includes("alpha"),
      "replace all did not save",
    );
  });
});
