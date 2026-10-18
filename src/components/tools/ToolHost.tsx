import { Icon } from "@iconify/react";
import { useEffect, useRef, useState } from "react";
import { readEditorDraft } from "../../lib/editor-draft";
import { useGitSyncStore } from "../../store/git-sync";
import { useNoteStore } from "../../store/notes";
import { reportError, useToastStore } from "../../store/toast";
import { useToolsStore } from "../../store/tools";
import { useUIStore } from "../../store/ui";
import { EMPTY_WRITER_SESSION, useWriterStore } from "../../store/writer";

export function ToolHost() {
  const { writerEnabled, provider, mode, apiModels, subscriptionModels, showToolsSettings } =
    useToolsStore();
  const { activeVaultId, selectedNoteId, notes } = useNoteStore();
  const { activeView, selectedGrouping } = useUIStore();
  const scope = `${activeVaultId ?? "all"}:${provider}:${mode}`;
  const { sessions, running, patch, clear, send, stop } = useWriterStore();
  const session = sessions[scope] ?? EMPTY_WRITER_SESSION;
  const [preview, setPreview] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const followReply = useRef(true);
  const attached = notes.find(
    (note) =>
      session.followNote &&
      activeView === "notes" &&
      selectedGrouping.type !== "trash" &&
      note.id === selectedNoteId,
  );
  const busy = running !== null;
  const content = attached
    ? (readEditorDraft(attached.id) ??
      useGitSyncStore.getState().heldDraft(attached.id) ??
      attached.content)
    : "";
  const settings = () => {
    showToolsSettings();
    useUIStore.getState().setSettingsOpen(true);
  };
  useEffect(() => {
    if (!writerEnabled) void stop();
  }, [writerEnabled, stop]);
  // Scroll only the chat's own message list, never the note editor or app page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: message updates trigger scrolling of the chat container
  useEffect(() => {
    if (followReply.current && end.current?.parentElement)
      end.current.parentElement.scrollTop = end.current.parentElement.scrollHeight;
  }, [session.messages]);
  async function submit() {
    if (mode === "api" && !apiModels[provider]) {
      patch(scope, { error: "Choose an API model in Connection settings before sending." });
      return;
    }
    const snapshot = attached
      ? {
          title: attached.frontmatter.title,
          content:
            readEditorDraft(attached.id) ??
            useGitSyncStore.getState().heldDraft(attached.id) ??
            attached.content,
        }
      : undefined;
    followReply.current = true;
    await send(
      scope,
      provider,
      snapshot,
      mode,
      mode === "api" ? apiModels[provider] : subscriptionModels[provider],
    );
  }
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col text-sm">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-base-300 px-2">
        {writerEnabled && (
          <>
            <Icon icon="uil:comment-alt-lines" className="h-4 w-4" aria-hidden="true" />
            <span className="font-medium">Writer</span>
          </>
        )}
        <span className="flex-1" />
        {writerEnabled && (
          <button
            type="button"
            className="workspace-toolbar-button"
            title="New chat"
            aria-label="New chat"
            disabled={busy}
            onClick={() => {
              clear(scope);
              setPreview(false);
              followReply.current = true;
              composer.current?.focus();
              useToastStore.getState().showToast("New chat started", "info");
            }}
          >
            <Icon icon="uil:plus" className="h-5 w-5" />
          </button>
        )}
        <button
          type="button"
          className="workspace-toolbar-button"
          aria-label="Manage tools"
          title="Manage tools"
          onClick={settings}
        >
          <Icon icon="uil:setting" className="h-4 w-4" />
        </button>
      </div>
      {!writerEnabled ? (
        <div className="p-4">
          <p className="font-medium">No tools enabled</p>
          <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={settings}>
            Manage tools
          </button>
        </div>
      ) : (
        <>
          <div className="border-b border-base-300 px-3 py-2">
            <div className="flex flex-wrap items-center gap-1 text-xs opacity-75">
              <span>
                {mode === "api"
                  ? `${provider === "codex" ? "OpenAI" : "Claude"} · API billing`
                  : provider === "codex"
                    ? "Codex · ChatGPT plan"
                    : "Claude Code · Claude plan"}
              </span>
              <button type="button" className="btn btn-ghost btn-xs" onClick={settings}>
                Connection
              </button>
            </div>
            <p className="mt-1 break-words text-xs opacity-60">
              Model:{" "}
              {mode === "api"
                ? apiModels[provider] || "Choose in Connection settings"
                : subscriptionModels[provider] || "Client default"}
            </p>
            <label className="mt-2 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="checkbox checkbox-xs"
                checked={session.followNote}
                onChange={(event) => {
                  patch(scope, { followNote: event.target.checked });
                  setPreview(false);
                }}
              />
              Use open note
            </label>
            <button
              type="button"
              className="mt-2 block w-full truncate text-left text-xs opacity-75"
              disabled={!attached}
              onClick={() => setPreview(!preview)}
              title={attached ? `Preview context: ${attached.frontmatter.title}` : undefined}
            >
              {attached
                ? `Using: ${attached.frontmatter.title}`
                : session.followNote
                  ? "No note open"
                  : "Note context off"}
            </button>
            <p className="mt-1 text-xs opacity-50">Conversation continues when you switch notes.</p>
            {preview && attached && (
              <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words text-xs opacity-70">
                {content}
              </pre>
            )}
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3"
            role="log"
            aria-label="Writer conversation"
            onScroll={(event) => {
              const element = event.currentTarget;
              followReply.current =
                element.scrollHeight - element.scrollTop - element.clientHeight < 80;
            }}
          >
            {session.messages.length === 0 && (
              <div className="space-y-3 py-4">
                <p className="font-medium">Think it through together.</p>
                <p className="opacity-60">
                  Ask a question or explore an idea. The open note is included when you send.
                </p>
                {["Help me outline this", "What is missing?", "Make this clearer"].map((prompt) => (
                  <button
                    type="button"
                    key={prompt}
                    className="block text-left opacity-70 hover:opacity-100"
                    onClick={() => patch(scope, { draft: prompt })}
                  >
                    {prompt} →
                  </button>
                ))}
              </div>
            )}
            {session.messages.map((message) => (
              <div
                key={message.id}
                className={`mb-5 ${message.role === "user" ? "rounded-lg bg-base-200 p-3" : ""}`}
              >
                <p className="mb-1 text-xs opacity-50">
                  {message.role === "user" ? "You" : "Writer"}
                </p>
                <p className="whitespace-pre-wrap break-words">
                  {message.content || (busy ? "Thinking…" : "No reply received.")}
                </p>
                {message.role === "assistant" && message.content && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs mt-1"
                    onClick={() => {
                      navigator.clipboard
                        .writeText(message.content)
                        .catch((error) => reportError("Could not copy reply", error));
                    }}
                  >
                    Copy
                  </button>
                )}
              </div>
            ))}
            {session.error && (
              <p role="alert" className="mb-3 break-words text-error">
                {session.error}
              </p>
            )}
            <div ref={end} />
          </div>
          <form
            className="shrink-0 border-t border-base-300 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label htmlFor="writer-message" className="sr-only">
              Message Writer
            </label>
            <textarea
              ref={composer}
              id="writer-message"
              className="textarea min-h-20 w-full resize-y text-sm"
              placeholder="Work through an idea…"
              value={session.draft}
              onChange={(event) => patch(scope, { draft: event.target.value })}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  event.keyCode !== 229
                ) {
                  event.preventDefault();
                  if (!busy) void submit();
                }
              }}
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs opacity-50">
                {attached ? "Open note included on send" : "Conversation only"}
              </span>
              {busy ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void stop()}>
                  Stop reply
                </button>
              ) : (
                <button
                  type="submit"
                  className="btn btn-ghost btn-sm"
                  disabled={!session.draft.trim() || (mode === "api" && !apiModels[provider])}
                >
                  Send ↑
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </div>
  );
}
