import assert from "node:assert/strict";
import { $, browser, expect } from "@wdio/globals";
import { readNoteFile, waitForNoteFile } from "../support/files.js";
import { openNote, prepareWindow } from "../support/ui.js";

describe("header tags", () => {
  before(async () => {
    await prepareWindow();
    await openNote("Recipe Note");
  });

  it("adds a tag without the hash, ignores a duplicate, and removes the inline tag", async () => {
    await $('button[aria-label="Add tag"]').click();
    const input = await $('input[aria-label="New tag"]');
    await input.setValue("#kitchen");
    await browser.keys("Enter");
    await waitForNoteFile(
      "recipes.md",
      (note) => Array.isArray(note.data.tags) && note.data.tags.includes("kitchen"),
      "adding #kitchen did not write the tag",
    );

    await $('button[aria-label="Add tag"]').click();
    await $('input[aria-label="New tag"]').setValue("recipes");
    await browser.keys("Enter");
    await expect($('button[aria-label="Remove tag recipes"]')).toBeDisplayed();
    const tags = readNoteFile("recipes.md").data.tags;
    assert.equal(tags.filter((tag) => tag === "recipes").length, 1);

    await $('button[aria-label="Remove tag recipes"]').click();
    const saved = await waitForNoteFile(
      "recipes.md",
      (note) => Array.isArray(note.data.tags) && !note.data.tags.includes("recipes"),
      "removing the tag did not update the file",
    );
    assert.equal(saved.content.includes("#recipes"), false);
    assert.equal(saved.data.tags.includes("kitchen"), true);
  });
});
