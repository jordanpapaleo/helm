import assert from "node:assert/strict";
import { $, browser } from "@wdio/globals";
import { noteExists } from "../support/files.js";
import { armNativeAccept } from "../support/native.js";
import { prepareWindow, rightClick, showAllNotes } from "../support/ui.js";

describe("folders", () => {
  before(async () => {
    await prepareWindow();
    await showAllNotes();
  });

  it("renames a folder with its raw name and deletes it after confirmation", async () => {
    await rightClick(await $("span=recipes"));
    await $('[role="menuitem"]=Rename').click();
    await browser.keys("meals");
    await browser.keys("Enter");
    await browser.waitUntil(
      async () => noteExists("meals/soup.md") && !noteExists("recipes/soup.md"),
      {
        timeout: 10000,
        timeoutMsg: "the folder was not renamed to meals",
      },
    );

    await rightClick(await $("span=meals"));
    const accepted = armNativeAccept("Delete Folder");
    await $('[role="menuitem"]=Delete').click();
    await accepted;
    await browser.waitUntil(async () => !noteExists("meals/soup.md"), {
      timeout: 10000,
      timeoutMsg: "the folder was not deleted",
    });
    assert.equal(noteExists("meals/soup.md"), false);
  });
});
