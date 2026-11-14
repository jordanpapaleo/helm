import { $, expect } from "@wdio/globals";
import { closeSettings, openSettings, prepareWindow } from "../support/ui.js";

describe("assistants and writer", () => {
  before(async () => {
    await prepareWindow();
  });

  it("shows the assistant in the right panel and records a message locally", async () => {
    await openSettings("Tools");
    await expect($('input[aria-label="Writer"]')).toBeExisting();
    await $('input[aria-label="Show OpenAI Assistant in toolbar"]').click();
    await closeSettings();

    await $('button[aria-label="Toggle right panel"]').click();
    await expect($("button=Writer")).not.toBeExisting();
    await $('button[aria-label="OpenAI Assistant"]').click();
    const box = await $('textarea[placeholder="Message OpenAI Assistant…"]');
    await box.waitForDisplayed();
    await box.setValue("Hello from the window");
    await $('button[aria-label="Send"]').click();
    await expect($("body")).toHaveText(expect.stringContaining("Hello from the window"));
  });
});
