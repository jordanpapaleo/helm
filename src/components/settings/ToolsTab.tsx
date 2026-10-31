import { Icon } from "@iconify/react";
import { useState } from "react";
import {
  EXTENSION_IDS,
  type ExtensionConnectionMode,
  type ExtensionId,
  useExtensionsStore,
} from "../../store/extensions";

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
