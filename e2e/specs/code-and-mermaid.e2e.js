import { expect } from "@wdio/globals";
import { mainEditor, openNote, prepareWindow } from "../support/ui.js";

describe("code blocks and mermaid", () => {
  before(async () => {
    await prepareWindow();
    await openNote("Diagrams");
  });

  it("shows the language and keeps mermaid source behind Edit source", async () => {
    const editor = await mainEditor();
    await expect(editor.$("button=javascript")).toBeDisplayed();
    const edit = await editor.$("button=Edit source");
    await edit.click();
    await expect(editor).toHaveText(expect.stringContaining("graph TD"));
    await expect(editor.$("button=Hide source")).toBeDisplayed();
  });
});
