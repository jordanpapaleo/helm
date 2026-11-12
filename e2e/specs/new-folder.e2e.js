import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { prepareWindow, selectVault } from "../support/ui.js";

function vaultPath() {
  const vault = process.env.HELM_E2E_VAULT;
  if (!vault) throw new Error("HELM_E2E_VAULT is not set");
  return vault;
}

function folderNames() {
  return readdirSync(vaultPath())
    .filter((name) => !name.startsWith("."))
    .sort();
}

async function openNameField() {
  const button = await $('button[aria-label="New folder"]');
  await button.waitForClickable();
  await button.click();
  const input = await $('input[aria-label="Folder name"]');
  await input.waitForDisplayed();
  await browser.waitUntil(async () => input.isFocused(), {
    timeout: 5000,
    timeoutMsg: "the folder name field did not take focus",
  });
  return input;
}

describe("new folder", () => {
  before(async () => {
    await prepareWindow();
    await selectVault();
  });

  it("keeps a blank name field open and creates a folder only once a name is entered", async () => {
    const input = await openNameField();
    await $("button*=Dashboard").click();
    await expect(input).toBeDisplayed();
    assert.deepEqual(folderNames(), []);

    await input.setValue("recipes");
    await browser.keys("Enter");
    await expect($('input[aria-label="Folder name"]')).not.toBeExisting();
    await browser.waitUntil(async () => folderNames().includes("recipes"), {
      timeout: 10000,
      timeoutMsg: "Enter did not create the recipes folder",
    });
    assert.equal(statSync(join(vaultPath(), "recipes")).isDirectory(), true);
    await expect($("span=recipes")).toBeDisplayed();

    const named = await openNameField();
    await named.setValue("pantry");
    await $("button*=All Notes").click();
    await expect($('input[aria-label="Folder name"]')).not.toBeExisting();
    await browser.waitUntil(async () => folderNames().includes("pantry"), {
      timeout: 10000,
      timeoutMsg: "leaving the field with a name did not create the pantry folder",
    });
    assert.deepEqual(folderNames(), ["pantry", "recipes"]);
  });
});
