import { $, expect } from "@wdio/globals";
import { openNote, prepareWindow } from "../support/ui.js";

describe("markdown notes", () => {
  before(async () => {
    await prepareWindow();
  });

  it("shows the frontmatter title, then an H1, then the filename", async () => {
    await openNote("Titled Note");
    await expect($(".ProseMirror")).toHaveText(expect.stringContaining("Hello titled."));
    await openNote("Heading From Body");
    await expect($("h1")).toHaveText("Heading From Body");
    await openNote("Recipe Notes");
    await expect($("h1")).toHaveText("Recipe Notes");
  });
});
