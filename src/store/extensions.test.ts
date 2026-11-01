import { beforeEach, expect, it } from "vitest";
import { useExtensionsStore, validateExtensionPreferences } from "./extensions";

beforeEach(() => {
  localStorage.clear();
  useExtensionsStore.setState(validateExtensionPreferences(null));
});

it("starts with every tool off and ignores unknown or malformed preferences", () => {
  const defaults = {
    enabled: [],
    settings: {
      "openai-assistant": { mode: "subscription", model: "" },
      "claude-assistant": { mode: "subscription", model: "" },
    },
  };
  expect(validateExtensionPreferences(null)).toEqual(defaults);
  expect(
    validateExtensionPreferences({
      enabled: ["shell", 4, "claude-assistant", "openai-assistant"],
      settings: { "claude-assistant": { mode: "typo", model: "has spaces" } },
    }),
  ).toEqual({ ...defaults, enabled: ["openai-assistant", "claude-assistant"] });
});

it("persists enabled tools in toolbar order and keeps settings when a tool is disabled", () => {
  const store = useExtensionsStore.getState();
  store.setEnabled("claude-assistant", true);
  store.setEnabled("openai-assistant", true);
  store.configure("openai-assistant", { mode: "api", model: "gpt-test" });
  expect(JSON.parse(localStorage.getItem("helm-extensions") ?? "null")).toMatchObject({
    enabled: ["openai-assistant", "claude-assistant"],
  });
  store.setEnabled("openai-assistant", false);
  const saved = JSON.parse(localStorage.getItem("helm-extensions") ?? "null");
  expect(saved.enabled).toEqual(["claude-assistant"]);
  expect(saved.settings["openai-assistant"]).toEqual({ mode: "api", model: "gpt-test" });
  expect(saved).not.toHaveProperty("connected");
  expect(saved).not.toHaveProperty("chats");
});
