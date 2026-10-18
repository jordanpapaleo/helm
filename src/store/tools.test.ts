import { expect, it } from "vitest";
import { useToolsStore, validateToolPreferences } from "./tools";

it("validates persisted preferences without enabling tools by accident", () => {
  expect(validateToolPreferences(null)).toEqual({
    writerEnabled: false,
    provider: "codex",
    mode: "subscription",
    apiModels: { codex: "", claude: "" },
    subscriptionModels: { codex: "", claude: "" },
  });
  expect(validateToolPreferences({ writerEnabled: "true", provider: "sh" })).toEqual({
    writerEnabled: false,
    provider: "codex",
    mode: "subscription",
    apiModels: { codex: "", claude: "" },
    subscriptionModels: { codex: "", claude: "" },
  });
  expect(validateToolPreferences({ writerEnabled: true, provider: "claude" })).toEqual({
    writerEnabled: true,
    provider: "claude",
    mode: "subscription",
    apiModels: { codex: "", claude: "" },
    subscriptionModels: { codex: "", claude: "" },
  });
});
it("persists availability separately from layout and settings navigation", () => {
  useToolsStore.getState().configure({ writerEnabled: true, provider: "claude" });
  expect(JSON.parse(localStorage.getItem("helm-tools") ?? "null")).toEqual({
    writerEnabled: true,
    provider: "claude",
    mode: "subscription",
    apiModels: { codex: "", claude: "" },
    subscriptionModels: { codex: "", claude: "" },
  });
  useToolsStore.getState().showToolsSettings();
  expect(localStorage.getItem("helm-tools")).not.toContain("settingsSection");
});
it("keeps API mode explicit and validates model preferences", () => {
  expect(
    validateToolPreferences({
      provider: "claude",
      mode: "typo",
      apiModels: { codex: "model with spaces", claude: 42 },
    }),
  ).toMatchObject({ mode: "subscription", apiModels: { codex: "", claude: "" } });
  useToolsStore
    .getState()
    .configure({ mode: "api", apiModels: { codex: "gpt-test", claude: "claude-test" } });
  expect(JSON.parse(localStorage.getItem("helm-tools") ?? "null")).toMatchObject({
    mode: "api",
    apiModels: { codex: "gpt-test", claude: "claude-test" },
  });
});
