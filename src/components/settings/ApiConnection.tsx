import { useEffect, useState } from "react";
import { tauriCommands } from "../../lib/tauri-commands";
import { useToolsStore } from "../../store/tools";
import { useWriterStore } from "../../store/writer";
import type { WriterProvider } from "../../tools/writer";

export function ApiConnection({ provider }: { provider: WriterProvider }) {
  const { apiModels, configure } = useToolsStore();
  const running = useWriterStore((state) => state.running);
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(true);
  const [models, setModels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    tauriCommands
      .writerKeyStatus(provider)
      .then((value) => {
        if (active) setSaved(value);
      })
      .catch(() => {
        if (active) setError("Could not access the system credential store.");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [provider]);
  async function action(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (failure) {
      setError(typeof failure === "string" ? failure : "Could not configure API connection.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="opacity-70">
        API usage is billed by {provider === "codex" ? "OpenAI" : "Anthropic"} through your API
        account. This connection never falls back to your subscription.
      </p>
      <label className="flex flex-col gap-2">
        {saved ? "Replace API key" : "API key"}
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          className="input w-full"
          value={key}
          disabled={busy || !!running}
          placeholder={saved ? "Key saved in system credential store" : "Paste your API key"}
          onChange={(event) => setKey(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy || !!running || !key.trim()}
          onClick={() => {
            const value = key.trim();
            setKey("");
            void action(async () => {
              await tauriCommands.writerKeySet(provider, value);
              setSaved(true);
              setModels([]);
            });
          }}
        >
          Save key
        </button>
        {saved && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy || !!running}
            onClick={() =>
              void action(async () => {
                await tauriCommands.writerKeyRemove(provider);
                setSaved(false);
                setModels([]);
              })
            }
          >
            Remove key
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={!saved || busy || !!running}
          onClick={() =>
            void action(async () => {
              setModels(await tauriCommands.writerApiModels(provider));
            })
          }
        >
          {busy ? "Working…" : "Load available models"}
        </button>
      </div>
      <label className="flex flex-col gap-2">
        API model
        <input
          className="input w-full"
          list="writer-api-models"
          value={apiModels[provider]}
          placeholder="Load models or enter a text-model ID"
          disabled={busy || !!running}
          maxLength={160}
          onChange={(event) =>
            configure({ apiModels: { ...apiModels, [provider]: event.target.value.trim() } })
          }
        />
        <datalist id="writer-api-models">
          {models.map((model) => (
            <option key={model} value={model} />
          ))}
        </datalist>
      </label>
      <p role="status" className="opacity-60">
        {saved ? "API key saved" : "No API key saved"}
        {models.length > 0 ? ` · ${models.length} models loaded` : ""}
      </p>
      <p className="text-xs opacity-60">
        Choose a text-generation model. A catalog entry does not guarantee that your account can use
        it. Loading the catalog sends no note text.
      </p>
      {error && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}
    </div>
  );
}
