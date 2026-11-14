import assert from "node:assert/strict";
import { $, browser } from "@wdio/globals";
import { closeSettings, localValue, openSettings, prepareWindow } from "../support/ui.js";

describe("typography", () => {
  before(async () => {
    await prepareWindow();
  });

  it("saves the note font and size, then Restore Defaults puts them back", async () => {
    await openSettings("Typography");
    await $("#note-font").selectByAttribute("value", "mono");
    const size = await $('input[type="range"]');
    await browser.execute((input) => {
      const prototype = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      prototype?.set?.call(input, "20");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, size);
    const stored = JSON.parse((await localValue("helm-settings")) ?? "{}");
    assert.equal(stored.noteFont, "mono");
    assert.equal(stored.fontSize, 20);
    await $("button=Restore Defaults").click();
    const restored = JSON.parse((await localValue("helm-settings")) ?? "{}");
    assert.equal(restored.noteFont, "system");
    assert.equal(restored.fontSize, 16);
    await closeSettings();
  });
});
