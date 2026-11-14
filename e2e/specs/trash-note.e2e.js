import assert from "node:assert/strict";
import { $, browser, expect } from "@wdio/globals";
import { noteExists } from "../support/files.js";
import { armNativeAccept } from "../support/native.js";
import { openNote, prepareWindow } from "../support/ui.js";

describe("trash", () => {
  before(async () => {
    await prepareWindow();
    await openNote("Alpha");
  });

  it("moves a note to Trash, restores it, and can delete it permanently", async () => {
    const accepted = armNativeAccept("Move to Trash");
    await $('button[aria-label="Delete note"]').click();
    await accepted;
    await browserWaitGone();
    assert.equal(noteExists("alpha.md"), false);

    await $('button[aria-label="Trash"]').click();
    await $("button*=Alpha").click();
    await expect($("body")).toHaveText(expect.stringContaining("This note is in Trash."));
    await $("button=Restore").click();
    await browserFileBack();
    assert.equal(noteExists("alpha.md"), true);

    const again = armNativeAccept("Move to Trash");
    await $('button[aria-label="Delete note"]').click();
    await again;
    await $('button[aria-label="Trash"]').click();
    await $("button*=Alpha").click();
    const permanent = armNativeAccept("Delete");
    await browserClickBannerDelete();
    await permanent;
    assert.equal(noteExists("alpha.md"), false);
  });
});

async function browserClickBannerDelete() {
  const clicked = await browser.execute(() => {
    const label = [...document.querySelectorAll("span")].find(
      (node) => node.textContent === "This note is in Trash.",
    );
    const button = label?.parentElement?.querySelector("button:last-of-type");
    if (!(button instanceof HTMLButtonElement) || button.textContent?.trim() !== "Delete") {
      return false;
    }
    button.click();
    return true;
  });
  if (!clicked) throw new Error("the trash banner Delete button was not found");
}

async function browserWaitGone() {
  await browser.waitUntil(async () => !noteExists("alpha.md"), {
    timeout: 10000,
    timeoutMsg: "the note file was not deleted",
  });
}

async function browserFileBack() {
  await browser.waitUntil(async () => noteExists("alpha.md"), {
    timeout: 10000,
    timeoutMsg: "restore did not write the file back",
  });
}
