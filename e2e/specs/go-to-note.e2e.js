import assert from "node:assert/strict";
import { $, browser, expect } from "@wdio/globals";
import { openNote, pageText, prepareWindow } from "../support/ui.js";

describe("go to note", () => {
  before(async () => {
    await prepareWindow();
    await openNote("Alpha");
  });

  it("opens the palette with Ctrl+P and jumps to the matching title", async () => {
    await browser.keys(["Control", "p"]);
    const search = await $('input[aria-label="Search notes by title or content"]');
    await search.waitForDisplayed();
    await search.setValue("Beta");
    assert.match(await pageText(), /Matching titles/);
    await browser.keys("Enter");
    await expect($("h1")).toHaveText("Beta");
    await expect(search).not.toBeExisting();
  });
});
