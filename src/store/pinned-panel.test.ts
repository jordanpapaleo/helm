import { beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_LAYOUT } from "../lib/workspace-layout";
import { useLayoutStore } from "./layout";
import {
  MAX_PINNED_NOTES,
  pinNoteToSide,
  unpinNoteFromSide,
  usePinnedPanelStore,
  WRITER_TAB,
} from "./pinned-panel";

beforeEach(() => {
  localStorage.clear();
  usePinnedPanelStore.setState({ noteIds: [], activeId: WRITER_TAB });
  useLayoutStore.setState({ preferences: DEFAULT_LAYOUT, priority: "left" });
});

it("pins notes as tabs, selects the newest, and ignores duplicates", () => {
  const { pin } = usePinnedPanelStore.getState();
  pin("todo");
  pin("reference");
  pin("todo");
  pin("");
  pin(WRITER_TAB);
  expect(usePinnedPanelStore.getState()).toMatchObject({
    noteIds: ["todo", "reference"],
    activeId: "todo",
  });
  const saved = JSON.parse(localStorage.getItem("helm-pinned-panel") ?? "null");
  expect(saved).toEqual({ noteIds: ["todo", "reference"], activeId: "todo" });
});

it("drops the oldest pin once the tab strip is full", () => {
  const { pin } = usePinnedPanelStore.getState();
  for (let index = 0; index < MAX_PINNED_NOTES + 1; index++) pin(`note-${index}`);
  const { noteIds, activeId } = usePinnedPanelStore.getState();
  expect(noteIds).toHaveLength(MAX_PINNED_NOTES);
  expect(noteIds[0]).toBe("note-1");
  expect(noteIds.at(-1)).toBe(`note-${MAX_PINNED_NOTES}`);
  expect(activeId).toBe(`note-${MAX_PINNED_NOTES}`);
});

it("selects a neighbor when the active tab is unpinned", () => {
  const { pin, unpin, select } = usePinnedPanelStore.getState();
  pin("todo");
  pin("reference");
  pin("draft");
  select("todo");
  unpin("todo");
  expect(usePinnedPanelStore.getState()).toMatchObject({
    noteIds: ["reference", "draft"],
    activeId: "reference",
  });
  unpin("draft");
  expect(usePinnedPanelStore.getState().activeId).toBe("reference");
  unpin("missing");
  unpin("reference");
  expect(usePinnedPanelStore.getState()).toMatchObject({ noteIds: [], activeId: WRITER_TAB });
});

it("opens the right panel when a note is pinned and leaves it open on unpin", () => {
  pinNoteToSide("todo");
  expect(useLayoutStore.getState()).toMatchObject({
    preferences: { rightOpen: true },
    priority: "right",
  });
  useLayoutStore.setState({ priority: "left" });
  pinNoteToSide("reference");
  expect(useLayoutStore.getState()).toMatchObject({
    preferences: { rightOpen: true },
    priority: "right",
  });
  unpinNoteFromSide("todo");
  expect(useLayoutStore.getState().preferences.rightOpen).toBe(true);
  expect(usePinnedPanelStore.getState().noteIds).toEqual(["reference"]);
});

it("recovers from corrupt persisted JSON on restart", async () => {
  localStorage.setItem("helm-pinned-panel", "{broken");
  vi.resetModules();
  const restarted = await import("./pinned-panel");
  expect(restarted.usePinnedPanelStore.getState()).toMatchObject({
    noteIds: [],
    activeId: WRITER_TAB,
  });
});

it("drops invalid saved ids", async () => {
  localStorage.setItem(
    "helm-pinned-panel",
    JSON.stringify({
      noteIds: ["todo", "", 4, "todo", WRITER_TAB, "reference"],
      activeId: "reference",
    }),
  );
  vi.resetModules();
  const restarted = await import("./pinned-panel");
  expect(restarted.usePinnedPanelStore.getState()).toMatchObject({
    noteIds: ["todo", "reference"],
    activeId: "reference",
  });
});
