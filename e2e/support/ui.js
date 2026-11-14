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

export async function rightClick(element) {
  await element.click({ button: "right" });
}

export async function goToView(label) {
  const button = await $(`button=${label}`);
  await button.waitForClickable();
  await button.click();
}

/** Folders, tags, and the note list render only while a vault is selected. */
export async function showAllNotes() {
  await selectVault();
  const all = await $("button*=All Notes");
  await all.waitForClickable();
  await all.click();
}

/** Rendered text, including words WebKit's getText uppercases or skips. */
export async function pageText() {
  return browser.execute(() => document.body.textContent ?? "");
}

export async function openSettings(tab) {
  const button = await $('button[title="Settings"]');
  await button.waitForClickable();
  await button.click();
  await $("h2=Settings").waitForDisplayed();
  if (tab) {
    const tabButton = await $(`button[role="tab"]=${tab}`);
    await tabButton.click();
  }
}

export async function closeSettings() {
  await $('button[aria-label="Close settings"]').click();
  await $("h2=Settings").waitForDisplayed({ reverse: true });
}

export async function openProperties() {
  const button = await $('button[aria-label="Properties"]');
  if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
  const panel = await $('section[aria-label="Properties"]');
  await panel.waitForDisplayed();
  return panel;
}

export async function mainEditor() {
  const editor = await $(".ProseMirror:not([aria-label])");
  await editor.waitForDisplayed();
  return editor;
}

/**
 * Set a controlled input. Webdriver's setValue can hit a stale node after
 * React replaces it, and it does not always deliver the input event.
 */
function writeInput(selector, value, key) {
  return browser.execute(
    (sel, next, keyName) => {
      const input = document.querySelector(sel);
      if (!(input instanceof HTMLInputElement)) return false;
      const prototype = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      prototype?.set?.call(input, next);
      const tracker = input._valueTracker;
      if (tracker) tracker.setValue(next === "" ? " " : "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      if (keyName) {
        input.dispatchEvent(
          new KeyboardEvent("keydown", { key: keyName, bubbles: true, cancelable: true }),
        );
      }
      return input.value === next;
    },
    selector,
    value,
    key,
  );
}

/** Set a controlled input and deliver the change to React. */
export async function setField(selector, value) {
  await $(selector).waitForDisplayed();
  if (!(await writeInput(selector, value, ""))) throw new Error(`could not set ${selector}`);
}

/** Set a controlled input, then Enter or Escape on that input. */
export async function commitInput(selector, value, key) {
  await $(selector).waitForDisplayed();
  if (!(await writeInput(selector, value, key))) throw new Error(`could not edit ${selector}`);
}

/** WebKitWebDriver rejects an empty element/value call, so clear with the keyboard. */
export async function clearField(element) {
  await element.click();
  await browser.keys(["Control", "a"]);
  await browser.keys("Backspace");
}

/** WebKitWebDriver drops a repeated character when both are one keys() call. */
export async function typeText(text) {
  await browser.keys(text);
}

export async function replaceSelection(text) {
  await browser.keys(["Control", "a"]);
  await browser.keys(text);
}

/** The selected wiki row is white on the accent, which WebKit's getText skips. */
export async function elementText(element) {
  return browser.execute((node) => node.textContent ?? "", element);
}

export async function localValue(key) {
  return browser.execute((name) => window.localStorage.getItem(name), key);
}

export async function documentTheme() {
  return browser.execute(() => document.documentElement.getAttribute("data-theme"));
}

/** A settings row is a label wrapping its checkbox. */
export async function settingsCheckbox(label) {
  const row = await $(`label*=${label}`);
  await row.waitForDisplayed();
  return row.$("input[type=checkbox]");
}
