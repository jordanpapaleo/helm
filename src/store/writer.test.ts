import { beforeEach, expect, it, vi } from "vitest";
import { tauriCommands } from "../lib/tauri-commands";
import type { WriterEvent } from "../tools/writer";
import { useWriterStore } from "./writer";

vi.mock("../lib/tauri-commands", () => ({
  tauriCommands: { writerSend: vi.fn(), writerCancel: vi.fn() },
}));
beforeEach(() => {
  vi.clearAllMocks();
  useWriterStore.setState({ sessions: {}, running: null });
});
it("scopes streams to their originating chat and ignores stale request IDs", async () => {
  let finish: () => void = () => {};
  vi.mocked(tauriCommands.writerSend).mockImplementation((id, _provider, prompt, onEvent) => {
    expect(JSON.parse(prompt).attachedNote).toBeNull();
    onEvent({ requestId: "other", kind: "text", text: "wrong chat" });
    onEvent({ requestId: id, kind: "text", text: "Hello" });
    return new Promise<void>((resolve) => {
      finish = () => {
        onEvent({ requestId: id, kind: "completed", text: "" });
        resolve();
      };
    });
  });
  useWriterStore.getState().patch("vault-a", { draft: "Help me think" });
  const request = useWriterStore.getState().send("vault-a", "codex");
  useWriterStore.getState().patch("vault-b", { draft: "Other idea" });
  expect(useWriterStore.getState().sessions["vault-a"].messages[1].content).toBe("Hello");
  expect(useWriterStore.getState().sessions["vault-b"].messages).toEqual([]);
  useWriterStore.getState().clear("vault-a");
  expect(useWriterStore.getState().sessions["vault-a"].messages).toHaveLength(2);
  finish();
  await request;
  expect(useWriterStore.getState().running).toBeNull();
});
it("sends only explicitly supplied note context and retains partial text on failure", async () => {
  vi.mocked(tauriCommands.writerSend).mockImplementation(async (id, _provider, prompt, onEvent) => {
    expect(JSON.parse(prompt).attachedNote).toEqual({ title: "Note", markdown: "Unsaved draft" });
    onEvent({ requestId: id, kind: "text", text: "Partial" });
    onEvent({ requestId: id, kind: "failed", text: "Rate limit" });
  });
  useWriterStore.getState().patch("a", { draft: "Feedback" });
  await useWriterStore.getState().send("a", "claude", { title: "Note", content: "Unsaved draft" });
  expect(useWriterStore.getState().sessions.a).toMatchObject({
    error: "Rate limit",
    messages: [{ content: "Feedback" }, { content: "Partial" }],
  });
});
it("preserves oversized drafts and refuses overlapping requests", async () => {
  useWriterStore.getState().patch("a", { draft: "x".repeat(60001) });
  await useWriterStore.getState().send("a", "codex");
  expect(tauriCommands.writerSend).not.toHaveBeenCalled();
  expect(useWriterStore.getState().sessions.a.draft).toHaveLength(60001);
  useWriterStore.setState({ running: { id: "busy", scope: "b" } });
  useWriterStore.getState().patch("a", { draft: "Hi" });
  await useWriterStore.getState().send("a", "codex");
  expect(tauriCommands.writerSend).not.toHaveBeenCalled();
});
it("cancels the native request and doesn't accept events after completion", async () => {
  let callback: (event: WriterEvent) => void = () => {};
  let id = "";
  vi.mocked(tauriCommands.writerSend).mockImplementation(
    async (requestId, _provider, _prompt, onEvent) => {
      id = requestId;
      callback = onEvent;
      await useWriterStore.getState().stop();
      onEvent({ requestId, kind: "cancelled", text: "" });
    },
  );
  useWriterStore.getState().patch("a", { draft: "Hi" });
  await useWriterStore.getState().send("a", "codex");
  expect(tauriCommands.writerCancel).toHaveBeenCalledWith(id);
  callback({ requestId: id, kind: "text", text: "late" });
  expect(useWriterStore.getState().sessions.a.messages[1].content).toBe("");
});
it("passes the selected billing mode and model without any fallback", async () => {
  vi.mocked(tauriCommands.writerSend).mockRejectedValue("API key missing");
  useWriterStore.getState().patch("api-chat", { draft: "Hello" });
  await useWriterStore.getState().send("api-chat", "codex", undefined, "api", "text-model");
  expect(tauriCommands.writerSend).toHaveBeenCalledTimes(1);
  expect(tauriCommands.writerSend).toHaveBeenCalledWith(
    expect.any(String),
    "codex",
    expect.any(String),
    expect.any(Function),
    "api",
    "text-model",
  );
  expect(useWriterStore.getState().sessions["api-chat"].error).toBe("API key missing");
});
