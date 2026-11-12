import { $, browser } from "@wdio/globals";
import { VAULT_NAME } from "./vault.js";

/** Give the sidebar, the note list, and a pinned pane room to stay open together. */
export async function prepareWindow() {
  await browser.setWindowSize(1440, 900);
  await waitForVault();
}

export async function waitForVault() {
  let visible = "";
  await browser.waitUntil(
    async () => {
      visible = await $("body").getText();
      if (visible.startsWith("Error:")) throw new Error(visible);
      const loading = await $("p=Loading vault...");
      if (await loading.isExisting()) return false;
      const vault = await $(`button*=${VAULT_NAME}`);
      return vault.isDisplayed();
    },
    {
      timeout: 30000,
      timeoutMsg: `Helm did not show the ${VAULT_NAME} vault. Last screen:\n${visible}`,
    },
  );
}

export async function selectVault() {
  const button = await $(`button*=${VAULT_NAME}`);
  await button.waitForClickable();
  await button.click();
}

/** Open a note from the dashboard list. The heading is the note that is on screen. */
export async function openNote(title) {
  const button = await $(`button*=${title}`);
  await button.waitForClickable({ timeout: 15000 });
  await button.click();
  await browser.waitUntil(async () => (await $("h1").getText()) === title, {
    timeout: 15000,
    timeoutMsg: `${title} did not open in the editor`,
  });
}
