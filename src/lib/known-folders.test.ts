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

    expect(
      nextKnownFolderPaths(
        started,
        ["/vault/parent"],
        [{ path: "/vault", listing: ["/vault/parent"] }],
      ),
    ).toBeNull();
    expect(useNoteStore.getState().knownFolderPaths).toEqual(["/vault/parent", "/vault/recipes"]);
  });

  it("keeps a vault's folders when its listing fails", () => {
    const started = currentFolderListEpoch();
    expect(
      nextKnownFolderPaths(
        started,
        ["/vault/parent", "/vault/recipes"],
        [{ path: "/vault", listing: null }],
      ),
    ).toEqual(["/vault/parent", "/vault/recipes"]);
  });

  it("keeps the failed vault's folders and applies the vault that listed", () => {
    const started = currentFolderListEpoch();
    expect(
      nextKnownFolderPaths(
        started,
        ["/notes/old", "/photos/trip", "/removed/x"],
        [
          { path: "/notes", listing: ["/notes/fresh"] },
          { path: "/photos", listing: null },
        ],
      ),
    ).toEqual(["/photos/trip", "/notes/fresh"]);
  });

  it("assigns a nested folder to the longer vault path", () => {
    const started = currentFolderListEpoch();
    expect(
      nextKnownFolderPaths(
        started,
        ["/vault/nested/child", "/vault/top"],
        [
          { path: "/vault", listing: null },
          { path: "/vault/nested", listing: ["/vault/nested/kept"] },
        ],
      ),
    ).toEqual(["/vault/top", "/vault/nested/kept"]);
  });

  it("replaces the sidebar when every vault listed successfully", () => {
    const started = currentFolderListEpoch();
    expect(
      nextKnownFolderPaths(
        started,
        ["/vault/a/old"],
        [
          { path: "/vault/a/", listing: ["/vault/a/new"] },
          { path: "/other", listing: ["/other/b"] },
        ],
      ),
    ).toEqual(["/vault/a/new", "/other/b"]);
  });

  it("does not record the same folder twice", () => {
    rememberCreatedFolder("/vault/recipes/");
    rememberCreatedFolder("/vault/recipes");

    expect(
      useNoteStore.getState().knownFolderPaths.filter((path) => path.includes("recipes")),
    ).toEqual(["/vault/recipes"]);
  });
});
