import { useCallback, useEffect, useState } from "react";
import { tauriCommands } from "../../lib/tauri-commands";
import { useToolsStore } from "../../store/tools";
import { useWriterStore } from "../../store/writer";
import type { WriterConnection } from "../../tools/writer";
import { ApiConnection } from "./ApiConnection";
export function ToolsTab() {
  const { writerEnabled, provider, mode, subscriptionModels, configure } = useToolsStore();
  const running = useWriterStore((state) => state.running);
  const [connections, setConnections] = useState<WriterConnection[]>([]);
  const [busy, setBusy] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setConnections(await tauriCommands.writerConnections());
    } catch {
      setError("Connection checks are available in the native Helm app.");
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    if (mode === "subscription") void check();
  }, [check, mode]);
  async function login() {
    setSigningIn(true);
    setError(null);
    try {
      await tauriCommands.writerLogin(provider);
      await check();
    } catch (failure) {
      setError(
        typeof failure === "string"
          ? failure
          : "Could not start sign-in. Use the Terminal command below.",
      );
    } finally {
      setSigningIn(false);
    }
  }
  const connection = connections.find((item) => item.provider === provider);
  return (
    <div className="flex flex-col gap-5">
      <label className="flex items-center justify-between gap-4">
        <span>
          <span className="block font-medium">Writer</span>
          <span className="text-sm opacity-60">A companion for thinking through notes</span>
        </span>
        <input
          type="checkbox"
          className="toggle toggle-sm"
          checked={writerEnabled}
          onChange={(event) => {
            if (!event.target.checked) void useWriterStore.getState().stop();
            configure({ writerEnabled: event.target.checked });
          }}
        />
      </label>
      <label className="flex flex-col gap-2 text-sm">
        Provider
        <select
          className="select w-full"
          disabled={signingIn || running !== null}
          value={provider}
          onChange={(event) =>
            configure({ provider: event.target.value === "claude" ? "claude" : "codex" })
          }
        >
          <option value="codex">OpenAI / Codex</option>
          <option value="claude">Claude / Claude Code</option>
        </select>
      </label>
      <label className="flex flex-col gap-2 text-sm">
        Connection
        <select
          className="select w-full"
          value={mode}
          disabled={signingIn || running !== null}
          onChange={(event) =>
            configure({ mode: event.target.value === "api" ? "api" : "subscription" })
          }
        >
          <option value="subscription">Subscription</option>
          <option value="api">API key · API billing</option>
        </select>
      </label>
      {mode === "api" ? (
        <ApiConnection key={provider} provider={provider} />
      ) : (
        <>
          <div className="rounded-lg border border-base-300 p-4 text-sm">
            {!connection?.connected && connection?.installed && (
              <button
                type="button"
                className="btn btn-ghost btn-sm mb-3"
                disabled={signingIn || busy}
                onClick={() => void login()}
              >
                {signingIn
                  ? "Complete sign-in in your browser…"
                  : provider === "codex"
                    ? "Sign in with ChatGPT"
                    : "Sign in with Claude"}
              </button>
            )}
            <p role="status">
              {busy
                ? "Checking installed clients…"
                : (connection?.detail ?? "Check your subscription connection below.")}
            </p>
            {!connection?.connected && (
              <p className="mt-3 opacity-70">
                Install the selected command-line client and sign in in Terminal with{" "}
                <code>{provider === "codex" ? "codex login" : "claude auth login"}</code>. Then
                check again.
              </p>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm mt-3"
              disabled={busy || signingIn}
              onClick={() => void check()}
            >
              Check connection
            </button>
            {error && (
              <p role="alert" className="mt-2 text-error">
                {error}
              </p>
            )}
          </div>
          <label className="flex flex-col gap-2 text-sm">
            Subscription model (optional)
            <input
              className="input w-full"
              placeholder="Use client default"
              maxLength={160}
              disabled={!!running || signingIn}
              value={subscriptionModels[provider]}
              onChange={(event) =>
                configure({
                  subscriptionModels: {
                    ...subscriptionModels,
                    [provider]: event.target.value.trim(),
                  },
                })
              }
            />
          </label>
          <p className="text-sm opacity-65">
            Helm uses the selected client's subscription sign-in. It does not copy your credentials
            or fall back to API-key billing. Provider usage limits apply. Leave the model blank to
            use the client’s default, or enter a model ID available to your subscription.
          </p>
        </>
      )}
      <p className="text-sm opacity-65">
        Messages and the open note’s latest draft are submitted when you send. Turn off “Use open
        note” in Writer for conversation-only chat. Writer cannot read files or edit notes. Chats
        are kept in memory for this app session.
      </p>
    </div>
  );
}
