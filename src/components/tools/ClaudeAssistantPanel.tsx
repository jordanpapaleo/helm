import { useState } from "react";
import { type ExtensionConnectionMode, useExtensionsStore } from "../../store/extensions";
import { AssistantChat } from "./AssistantChat";
import type { ToolExtension } from "./extensions";

const MODES: { value: ExtensionConnectionMode; label: string }[] = [
  { value: "subscription", label: "Subscription" },
  { value: "api", label: "API key" },
];

/** Setup form until Claude is connected. Neither Check connection nor Connect touches the network. */
function ClaudeConnect({ extension }: { extension: ToolExtension }) {
  const { id, name, description } = extension;
  const settings = useExtensionsStore((state) => state.settings[id]);
  const configure = useExtensionsStore((state) => state.configure);
  const connect = useExtensionsStore((state) => state.connect);
  const [checked, setChecked] = useState(false);
  const modelId = `${id}-model`;
  const modeId = `${id}-mode`;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-y-auto p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">{name}</h2>
        <span className="badge badge-ghost badge-sm shrink-0">Not connected</span>
      </div>
      <p className="mt-1 opacity-60">{description}</p>

      <label htmlFor={modeId} className="mt-4 text-xs font-medium">
        Connection
      </label>
      <select
        id={modeId}
        className="select select-sm mt-1 w-full"
        value={settings.mode}
        onChange={(event) =>
          configure(id, { mode: event.target.value === "api" ? "api" : "subscription" })
        }
      >
        {MODES.map((mode) => (
          <option key={mode.value} value={mode.value}>
            {mode.label}
          </option>
        ))}
      </select>
      <p className="mt-2 opacity-65">
        {settings.mode === "subscription"
          ? "Uses your Claude plan through the Claude Code sign-in. Helm doesn’t copy your credentials or fall back to API billing. Plan usage limits apply."
          : "Bills to your Anthropic API key. Key setup is coming soon."}
      </p>

      <div className="mt-3">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setChecked(true)}>
          Check connection
        </button>
        <p role="status" className="mt-1 text-xs opacity-60">
          {checked ? "Not connected yet." : ""}
        </p>
      </div>

      <label htmlFor={modelId} className="mt-3 text-xs font-medium">
        Model (optional)
      </label>
      <input
        id={modelId}
        className="input input-sm mt-1 w-full"
        placeholder="Use client default"
        maxLength={160}
        value={settings.model}
        onChange={(event) => configure(id, { model: event.target.value.trim() })}
      />

      <button
        type="button"
        className="btn btn-primary btn-sm mt-4 self-start"
        onClick={() => connect(id)}
      >
        Connect
      </button>

      <p className="mt-4 text-xs opacity-60">
        Messages and the open note’s latest draft are sent when you send. Claude can’t read files or
        edit notes. Chats stay in memory for this session.
      </p>
    </div>
  );
}

export function ClaudeAssistantPanel({ extension }: { extension: ToolExtension }) {
  const connected = useExtensionsStore((state) => state.connected[extension.id]);
  return connected ? (
    <AssistantChat extension={extension} />
  ) : (
    <ClaudeConnect extension={extension} />
  );
}
