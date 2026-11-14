import assert from "node:assert/strict";
import { $, browser, expect } from "@wdio/globals";
import { clearField, prepareWindow, showAllNotes } from "../support/ui.js";

describe("note list", () => {
  before(async () => {
    await prepareWindow();
    await showAllNotes();
  });

  it("floats the pinned note, searches the body, and opens the row", async () => {
    const titles = await browserTitles();
    assert.ok(titles[0]?.includes("Pinned Older"), titles.join(" | "));
    await expect($('[aria-label="Pinned"]')).toBeExisting();

    const search = await $('input[aria-label="Search notes"]');
    await search.setValue("saffron");
    await expect($("button*=Newer Plain")).toBeDisplayed();
    await expect($("button*=Pinned Older")).not.toBeDisplayed();

    await clearField(search);
    await $("button*=Newer Plain").click();
    await expect($("h1")).toHaveText("Newer Plain");
  });
});

async function browserTitles() {
  return browser.execute(() =>
    [...document.querySelectorAll('button[aria-haspopup="menu"]')]
      .map((node) => node.textContent ?? "")
      .filter((title) => title.includes("Pinned Older") || title.includes("Newer Plain")),
  );
}
