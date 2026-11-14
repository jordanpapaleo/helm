import assert from "node:assert/strict";
import { $, browser, expect } from "@wdio/globals";
import { localValue, prepareWindow, showAllNotes } from "../support/ui.js";

describe("panels", () => {
  before(async () => {
    await prepareWindow();
    await showAllNotes();
  });

  it("resizes the note list from the keyboard and collapses the left panel to a rail", async () => {
    const separator = await $('[aria-label="Resize note list panel"]');
    await separator.click();
    const before = Number(await separator.getAttribute("aria-valuenow"));
    await browser.execute((el) => el.focus(), separator);
    await browser.keys("ArrowRight");
    const after = Number(await separator.getAttribute("aria-valuenow"));
    assert.equal(after, before + 10);
    const layout = await localValue("helm-layout");
    assert.match(layout ?? "", new RegExp(String(after)));

    await $('button[aria-label="Toggle left panel"]').click();
    await expect($('[aria-label="Sidebar"]')).toBeDisplayed();
  });
});
