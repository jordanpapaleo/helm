import assert from "node:assert/strict";
import { $, browser } from "@wdio/globals";
import { documentTheme, localValue, openSettings, prepareWindow } from "../support/ui.js";

describe("themes", () => {
  before(async () => {
    await prepareWindow();
  });

  it("applies the chosen theme to the document and remembers it", async () => {
    await openSettings("Themes");
    await $('button[data-theme="dark"]').click();
    await browserTheme("dark");
    assert.equal(await localValue("helm-theme"), "dark");
  });
});

async function browserTheme(theme) {
  await browser.waitUntil(async () => (await documentTheme()) === theme, {
    timeout: 5000,
    timeoutMsg: `document theme did not become ${theme}`,
  });
}
