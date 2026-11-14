import { $, expect } from "@wdio/globals";
import { goToView, prepareWindow } from "../support/ui.js";

describe("views nav", () => {
  before(async () => {
    await prepareWindow();
  });

  it("opens Dashboard, Eisenhower, Kanban, and the link graph", async () => {
    await expect($("h2=Dashboard")).toBeDisplayed();
    await goToView("Eisenhower");
    await expect($("h2=Eisenhower Matrix")).toBeDisplayed();
    await goToView("Kanban");
    await expect($("h2=Kanban")).toBeDisplayed();
    await goToView("Link");
    await expect($("body")).toHaveText(expect.stringContaining("Drag node"));
    await goToView("Dashboard");
    await expect($("h2=Dashboard")).toBeDisplayed();
  });
});
