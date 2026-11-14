import { $, browser, expect } from "@wdio/globals";
import { openNote, prepareWindow } from "../support/ui.js";

describe("right panel", () => {
  before(async () => {
    await prepareWindow();
    await openNote("Alpha");
  });

  it("pins a note as a tab and unpins it", async () => {
    await $('button[aria-label="Toggle right panel"]').click();
    await expect($("p=No tools enabled")).toBeDisplayed();
    await $('button[aria-label="Pin to side"]').click();
    const tab = await $('button[aria-label="Unpin Alpha"]');
    await tab.waitForDisplayed();
    await expect($('[aria-label="Alpha content"]')).toBeDisplayed();
    await browser.keys("ArrowRight");
    await tab.click();
    await expect($('[aria-label="Alpha content"]')).not.toBeDisplayed();
    await expect($("p=No tools enabled")).toBeDisplayed();
  });
});
