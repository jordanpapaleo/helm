import { Icon } from "@iconify/react";
import { useCallback, useEffect, useState } from "react";
import { tauriCommands } from "../../lib/tauri-commands";
import {
  EXTENSION_IDS,
  type ExtensionConnectionMode,
  type ExtensionId,
  useExtensionsStore,
} from "../../store/extensions";
import { useToolsStore } from "../../store/tools";
import { useWriterStore } from "../../store/writer";
import type { WriterConnection } from "../../tools/writer";
import { ApiConnection } from "./ApiConnection";

interface BuiltInTool {
  id: ExtensionId;
  name: string;
  description: string;
  icon: string;
  subscriptionCopy: string;
}

const TOOLS: readonly BuiltInTool[] = [
  {
    id: "openai-assistant",
    name: "OpenAI Assistant",
    description: "Think through notes with OpenAI.",
    icon: "uil:chat",
    subscriptionCopy:
      "Helm uses your ChatGPT subscription sign-in. It does not copy your credentials or fall back to API-key billing.",
  },
  {
    id: "claude-assistant",
    name: "Claude Assistant",
    description: "Think through notes with Claude.",
    icon: "uil:asterisk",
    subscriptionCopy:
      "Helm uses your Claude subscription sign-in. It does not copy your credentials or fall back to API-key billing.",
  },
];

const API_KEY_COPY =
  "API key billing is not available in this preview. Helm does not collect or store a key.";

const MODES: readonly { value: ExtensionConnectionMode; label: string }[] = [
  { value: "subscription", label: "Subscription" },
  { value: "api", label: "API key" },
];

function toolById(id: ExtensionId): BuiltInTool {
  const tool = TOOLS.find((item) => item.id === id);
  if (!tool) throw new Error(`Unknown tool ${id}`);
  return tool;
}

function ToolIcon({ icon }: { icon: string }) {
  return <Icon icon={icon} className="h-5 w-5 shrink-0" aria-hidden="true" />;
}

function AssistantCard({ id, onOpen }: { id: ExtensionId; onOpen: (id: ExtensionId) => void }) {
  const tool = toolById(id);
  const enabled = useExtensionsStore((state) => state.enabled.includes(id));
  const descriptionId = `tool-description-${id}`;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-base-300 bg-base-100 p-4">
      <ToolIcon icon={tool.icon} />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          aria-label={`${tool.name}, built-in`}
          aria-describedby={descriptionId}
          className="w-full rounded-md text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
          onClick={() => onOpen(id)}
        >
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{tool.name}</span>
            <span className="badge badge-sm badge-ghost">Built-in</span>
          </span>
          <span id={descriptionId} className="mt-1 block text-sm opacity-60">
            {tool.description}
          </span>
        </button>
        {enabled && <p className="mt-1 text-xs opacity-70">Showing in toolbar</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-square"
          aria-label={`${tool.name} settings`}
          onClick={() => onOpen(id)}
        >
          <Icon icon="uil:cog" className="h-4 w-4" aria-hidden="true" />
        </button>
        <input
          type="checkbox"
          className="toggle toggle-sm"
          aria-label={`Show ${tool.name} in toolbar`}
          checked={enabled}
          onChange={(event) => useExtensionsStore.getState().setEnabled(id, event.target.checked)}
        />
      </div>
    </div>
  );
}

function ConnectionMode({ id }: { id: ExtensionId }) {
  const mode = useExtensionsStore((state) => state.settings[id].mode);
  return (
    <fieldset className="join border-0 p-0">
      <legend className="sr-only">Connection</legend>
      {MODES.map((option) => (
        <input
          key={option.value}
          className="btn btn-sm join-item"
          type="radio"
          name={`tool-connection-${id}`}
          aria-label={option.label}
          checked={mode === option.value}
          onChange={() => useExtensionsStore.getState().configure(id, { mode: option.value })}
        />
      ))}
    </fieldset>
  );
}

function CheckConnection({ id }: { id: ExtensionId }) {
  const connected = useExtensionsStore((state) => state.connected[id]);
  const [result, setResult] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setResult(connected ? "Connected" : "Not connected")}
      >
        Check connection
      </button>
      {result && (
        <p role="status" className="mt-2 text-sm opacity-70">
          {result}
        </p>
      )}
    </div>
  );
}

function ToolDetail({ id, onBack }: { id: ExtensionId; onBack: () => void }) {
  const tool = toolById(id);
  const enabled = useExtensionsStore((state) => state.enabled.includes(id));
  const connected = useExtensionsStore((state) => state.connected[id]);
  const mode = useExtensionsStore((state) => state.settings[id].mode);
  const model = useExtensionsStore((state) => state.settings[id].model);
  const fieldId = `tool-model-${id}`;
  return (
    <div className="flex flex-col gap-5">
      <button type="button" className="btn btn-ghost btn-sm -ml-2 self-start" onClick={onBack}>
        ‹ All tools
      </button>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <ToolIcon icon={tool.icon} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold">{tool.name}</h3>
              <span className="badge badge-sm badge-ghost">Built-in</span>
            </div>
            <p className="mt-1 text-sm opacity-60">{tool.description}</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          Show in toolbar
          <input
            type="checkbox"
            className="toggle toggle-sm"
            checked={enabled}
            onChange={(event) => useExtensionsStore.getState().setEnabled(id, event.target.checked)}
          />
        </label>
      </div>
      <section className="flex flex-col gap-3 rounded-xl border border-base-300 bg-base-100 p-4">
        <h4 className="font-medium">Connection</h4>
        <p className="flex items-center gap-2 text-sm">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: connected ? "var(--color-success)" : "var(--color-text-muted)" }}
            aria-hidden="true"
          />
          {connected ? "Connected" : "Not connected"}
        </p>
        <ConnectionMode id={id} />
        <p className="text-sm opacity-70">
          {mode === "subscription" ? tool.subscriptionCopy : API_KEY_COPY}
        </p>
        <CheckConnection id={id} />
      </section>
      <section className="flex flex-col gap-3 rounded-xl border border-base-300 bg-base-100 p-4">
        <h4 className="font-medium">Model</h4>
        <p className="text-sm opacity-70">Leave blank to use the client’s default model.</p>
        <label htmlFor={fieldId} className="sr-only">
          Model
        </label>
        <input
          id={fieldId}
          className="input input-bordered w-full"
          placeholder="Use client default"
          maxLength={160}
          value={model}
          onChange={(event) =>
            useExtensionsStore.getState().configure(id, { model: event.target.value.trim() })
          }
        />
      </section>
      <p className="text-sm opacity-65">
        Every installed tool gets this page. What’s on it is up to the extension — the assistants
        use it for connection and model.
      </p>
    </div>
  );
}

/** Existing Writer controls stay until we decide whether Writer keeps this section. */
function WriterSection() {
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
    <section className="flex flex-col gap-5 border-t border-base-300 pt-5">
      <label className="flex items-center justify-between gap-4">
        <span>
          <span className="block font-medium">Writer</span>
          <span className="text-sm opacity-60">A companion for thinking through notes</span>
        </span>
        <input
          type="checkbox"
          className="toggle toggle-sm"
          aria-label="Writer"
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
    </section>
  );
}

function ToolList({ onOpen }: { onOpen: (id: ExtensionId) => void }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-base font-semibold">Tools</h3>
        <p className="mt-1 text-sm opacity-60">
          Extensions that add tools to the side panel. Turn a tool on to show its icon in the
          toolbar.
        </p>
        <p className="mt-3 text-sm font-medium">{EXTENSION_IDS.length} installed</p>
      </div>
      <div className="flex flex-col gap-3">
        {TOOLS.map((tool) => (
          <AssistantCard key={tool.id} id={tool.id} onOpen={onOpen} />
        ))}
      </div>
      <WriterSection />
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">More extensions</h3>
        <div className="rounded-xl border border-dashed border-base-300 p-4">
          <p className="font-medium">Build and install your own tools</p>
          <p className="mt-1 text-sm opacity-60">
            Extensions will be installable here. The assistants above are the first ones.
          </p>
          <button type="button" className="btn btn-sm mt-3" disabled>
            Install extension
            <span className="badge badge-sm">Soon</span>
          </button>
        </div>
      </div>
      <p className="text-sm opacity-65">
        Each tool’s gear holds its configuration. Turning a tool off hides it but keeps its
        settings.
      </p>
    </div>
  );
}

export function ToolsTab() {
  const [openId, setOpenId] = useState<ExtensionId | null>(null);
  if (openId) return <ToolDetail key={openId} id={openId} onBack={() => setOpenId(null)} />;
  return <ToolList onOpen={setOpenId} />;
}
