import { $, browser, expect } from "@wdio/globals";
import { mainEditor, openNote, prepareWindow } from "../support/ui.js";

describe("editor keyboard shortcuts", () => {
  before(async () => {
    await prepareWindow();
    await openNote("Alpha");
  });

  it("bolds the selection in the rich editor and wraps it in markdown mode", async () => {
    const editor = await mainEditor();
    await editor.click();
    await browser.keys(["Control", "a"]);
    await browser.keys(["Control", "b"]);
    await expect(editor.$("strong")).toBeExisting();

    await $('button[aria-label="Markdown"]').click();
    const source = await $("textarea");
    await source.waitForDisplayed();
    await source.click();
    await browser.keys(["Control", "a"]);
    await browser.keys(["Control", "b"]);
    await expect(source).toHaveValue(expect.stringContaining("**"));
  });
});
