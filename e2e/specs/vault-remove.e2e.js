import assert from "node:assert/strict";
import { $, browser, expect } from "@wdio/globals";
import { noteExists } from "../support/files.js";
import { armNativeAccept } from "../support/native.js";
import { prepareWindow, selectVault } from "../support/ui.js";
import { VAULT_NAME } from "../support/vault.js";

describe("vaults", () => {
  before(async () => {
    await prepareWindow();
  });

  it("deselects the open vault and removes it without deleting the files", async () => {
    await selectVault();
    await expect($("button*=All Notes")).toBeDisplayed();
    const selected = await browser.execute((name) => {
      const button = [...document.querySelectorAll("button")].find((node) =>
        node.textContent?.includes(name),
      );
      return button?.parentElement?.className.includes("bg-base-300") ?? false;
    }, VAULT_NAME);
    if (!selected) throw new Error("clicking the vault did not select it");
    await selectVault();
    const deselected = await browser.execute((name) => {
      const button = [...document.querySelectorAll("button")].find((node) =>
        node.textContent?.includes(name),
      );
      return button?.parentElement?.className.includes("bg-base-300") ?? false;
    }, VAULT_NAME);
    if (deselected) throw new Error("clicking the active vault did not deselect it");
    await expect($('input[aria-label="Search notes"]')).toBeDisplayed();

    await selectVault();
    const row = await $(`button*=${VAULT_NAME}`);
    await row.moveTo();
    const accepted = armNativeAccept("Remove Vault");
    await $('button[title="Remove vault"]').click();
    await accepted;
    await browser.waitUntil(async () => !(await $(`button*=${VAULT_NAME}`).isExisting()), {
      timeout: 10000,
      timeoutMsg: "the vault stayed in the sidebar",
    });
    assert.equal(noteExists("alpha.md"), true);
  });
});
