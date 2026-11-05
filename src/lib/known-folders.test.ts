import { beforeEach, describe, expect, it } from "vitest";
import { useNoteStore } from "../store/notes";
import {
  currentFolderListEpoch,
  nextKnownFolderPaths,
  rememberCreatedFolder,
} from "./known-folders";

describe("known folder listings", () => {
  beforeEach(() => {
    useNoteStore.setState({ knownFolderPaths: ["/vault/parent"] });
  });

  it("keeps a folder created while a listing was in flight", () => {
    const started = currentFolderListEpoch();
    rememberCreatedFolder("/vault/recipes");

    expect(nextKnownFolderPaths(started, [["/vault/parent"]])).toBeNull();
    expect(useNoteStore.getState().knownFolderPaths).toEqual(["/vault/parent", "/vault/recipes"]);
  });

  it("does not replace the sidebar when a vault listing fails", () => {
    const started = currentFolderListEpoch();
    expect(nextKnownFolderPaths(started, [null])).toBeNull();
  });

  it("replaces the sidebar when every vault listed successfully", () => {
    const started = currentFolderListEpoch();
    expect(nextKnownFolderPaths(started, [["/vault/a"], ["/other/b"]])).toEqual([
      "/vault/a",
      "/other/b",
    ]);
  });

  it("does not record the same folder twice", () => {
    rememberCreatedFolder("/vault/recipes/");
    rememberCreatedFolder("/vault/recipes");

    expect(
      useNoteStore.getState().knownFolderPaths.filter((path) => path.includes("recipes")),
    ).toEqual(["/vault/recipes"]);
  });
});
