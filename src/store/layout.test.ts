import { beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_LAYOUT } from "../lib/workspace-layout";
import { useLayoutStore } from "./layout";

beforeEach(() => {
  localStorage.clear();
  useLayoutStore.setState({ preferences: DEFAULT_LAYOUT, priority: "left" });
});
it("persists user choices and settled widths without navigation state", () => {
  useLayoutStore.getState().toggle("right", false);
  useLayoutStore.getState().resize("navigation", 999);
  const saved = JSON.parse(localStorage.getItem("helm-layout") ?? "null");
  expect(saved).toEqual({
    ...DEFAULT_LAYOUT,
    rightOpen: true,
    widths: { ...DEFAULT_LAYOUT.widths, navigation: 360 },
  });
  expect(useLayoutStore.getState().priority).toBe("right");
});
it("allows reopening a temporarily hidden panel without switching its preference off", () => {
  useLayoutStore.setState({ preferences: { ...DEFAULT_LAYOUT, rightOpen: true } });
  useLayoutStore.getState().toggle("left", false);
  expect(useLayoutStore.getState()).toMatchObject({
    preferences: { leftOpen: true, rightOpen: true },
    priority: "left",
  });
});
it("recovers from corrupt persisted JSON on restart", async () => {
  localStorage.setItem("helm-layout", "{broken");
  vi.resetModules();
  const { useLayoutStore: restarted } = await import("./layout");
  expect(restarted.getState().preferences).toEqual(DEFAULT_LAYOUT);
});
