import { browser, expect } from "@wdio/globals";
import { mainEditor, openNote, prepareWindow } from "../support/ui.js";

describe("editor keyboard fixes", () => {
  before(async () => {
    await prepareWindow();
    await openNote("Alpha");
  });

  it("turns a heading into a paragraph when Backspace is pressed at its start", async () => {
    const editor = await mainEditor();
    const heading = await editor.$("h1");
    await heading.waitForDisplayed();
    await browser.execute((node) => {
      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.setStart(node, 0);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }, heading);
    await heading.click();
    await browser.keys("Home");
    await browser.keys("Backspace");
    await expect(editor.$("h1")).not.toBeExisting();
    await expect(editor.$("p")).toHaveText("Heading line");
  });
});
