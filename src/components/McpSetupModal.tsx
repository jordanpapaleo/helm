import { useState } from "react";
import { useNoteStore } from "../store/notes";

interface Props {
  onClose: () => void;
}

export function McpSetupModal({ onClose }: Props) {
  const vaults = useNoteStore((s) => s.vaults);
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);

  // Build the env block depending on single vs multi-vault
  const envBlock =
    vaults.length === 1
      ? `        "HELM_VAULT": "${vaults[0]?.path ?? "/path/to/your/notes"}"`
      : `        "HELM_VAULTS": "${vaults.map((v) => v.path).join(",")}"`;

  const mcpServerPath = "/path/to/helm/mcp-server/index.ts";

  const configJson = `{
  "mcpServers": {
    "helm": {
      "command": "node",
      "args": [
        "--import", "tsx/esm",
        "${mcpServerPath}"
      ],
      "env": {
${envBlock}
      }
    }
  }
}`;

  const configFile = `~/Library/Application Support/Claude/claude_desktop_config.json`;

  function copyConfig() {
    navigator.clipboard.writeText(configJson);
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 2000);
  }

  function copyConfigPath() {
    navigator.clipboard.writeText(configFile);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 2000);
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop captures clicks outside the dialog
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="relative flex flex-col w-[680px] max-h-[85vh] overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text)]">MCP Setup</h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              Connect Claude or any MCP-compatible AI to your Helm vault
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-6 p-6">
          {/* Step 1 */}
          <section>
            <StepHeader n={1} title="Install dependencies (once)" />
            <p className="mb-2 text-sm text-[var(--color-text-muted)]">
              In the <code className="code">mcp-server/</code> folder of the Helm project:
            </p>
            <CodeBlock code="cd /path/to/helm/mcp-server && npm install" />
          </section>

          {/* Step 2 */}
          <section>
            <StepHeader n={2} title="Edit the Claude Desktop config" />
            <p className="mb-1 text-sm text-[var(--color-text-muted)]">
              Open this file (create it if it doesn't exist):
            </p>
            <div className="flex items-center gap-2 mb-3">
              <code className="flex-1 rounded-md bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-text)] font-mono break-all">
                {configFile}
              </code>
              <button
                type="button"
                onClick={copyConfigPath}
                className="shrink-0 rounded-md border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
              >
                {copiedPath ? "Copied!" : "Copy"}
              </button>
            </div>

            <p className="mb-2 text-sm text-[var(--color-text-muted)]">
              Paste in the following config.{" "}
              <span className="text-amber-400">
                Update the <code className="code">args</code> path to point to your Helm mcp-server
                folder.
              </span>
              {vaults.length > 0 && (
                <span className="text-green-400">
                  {" "}
                  Your vault {vaults.length === 1 ? "path has" : "paths have"} been pre-filled.
                </span>
              )}
            </p>

            <div className="relative">
              <pre className="overflow-x-auto rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] p-4 text-xs text-[var(--color-text)] font-mono leading-relaxed whitespace-pre">
                {configJson}
              </pre>
              <button
                type="button"
                onClick={copyConfig}
                className="absolute right-3 top-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
              >
                {copiedConfig ? "Copied!" : "Copy"}
              </button>
            </div>
          </section>

          {/* Step 3 */}
          <section>
            <StepHeader n={3} title="Restart Claude Desktop" />
            <p className="text-sm text-[var(--color-text-muted)]">
              Fully quit Claude Desktop (<kbd className="kbd">⌘Q</kbd>) and reopen it. You should
              see a <span className="text-[var(--color-text)]">🔨 hammer icon</span> in the chat
              input — that means Helm is connected.
            </p>
          </section>

          {/* Step 4 */}
          <section>
            <StepHeader n={4} title="Try it out" />
            <p className="mb-3 text-sm text-[var(--color-text-muted)]">
              Paste one of these into Claude to get started:
            </p>
            <div className="flex flex-col gap-2">
              {[
                "Use get_rules to learn my Helm vault, then give me a daily standup.",
                "Search my Helm notes for anything related to [topic] and summarize what you find.",
                "Run a weekly_review of my Helm vault.",
                "Create a note in Helm: [your idea here]",
              ].map((prompt) => (
                <PromptChip key={prompt} text={prompt} />
              ))}
            </div>
          </section>

          {/* Vaults detected */}
          {vaults.length > 0 && (
            <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] opacity-60">
                Detected vaults
              </p>
              {vaults.map((v) => (
                <div key={v.id} className="flex items-center gap-2 py-1">
                  <span className="text-sm">📁</span>
                  <span className="text-sm font-medium text-[var(--color-text)]">{v.name}</span>
                  <span className="text-xs text-[var(--color-text-muted)] font-mono">{v.path}</span>
                </div>
              ))}
            </section>
          )}

          {/* Other AI tools */}
          <section>
            <StepHeader n={5} title="Other AI tools" />
            <p className="text-sm text-[var(--color-text-muted)]">
              Any MCP-compatible client works — not just Claude Desktop. For Claude Code, add the
              server to your <code className="code">.mcp.json</code> or run{" "}
              <code className="code">claude mcp add</code>. For other tools, check their MCP
              configuration docs and use the same <code className="code">command</code> and{" "}
              <code className="code">env</code> values from the config above.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function StepHeader({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-xs font-bold text-white">
        {n}
      </span>
      <h3 className="font-semibold text-[var(--color-text)]">{title}</h3>
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] px-4 py-3 text-xs text-[var(--color-text)] font-mono">
        {code}
      </pre>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="absolute right-3 top-2 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

function PromptChip({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-left text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-accent)]/50 transition-colors group"
    >
      <span className="flex-1 font-mono text-xs">{text}</span>
      <span className="shrink-0 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
        {copied ? "Copied!" : "Copy"}
      </span>
    </button>
  );
}
