# Right-panel tools and a writing companion

Investigation for [issue #52](https://github.com/jordanpapaleo/helm/issues/52), 2026-10-17.

Status: original investigation. Superseded in part by the subscription prototype begun on 2026-10-18; see the implementation note below. Based on local `main` at `ae855ca` (v1.4.0), which includes the workspace panels and Git sync work. Existing package/Cargo lockfile changes were left untouched.

## Recommendation

Build a small, first-party tool host inside the right panel. Start with one tool, **Writer**, a simple text chat for thinking through a note. Settings → Tools controls which tools are available. A compact icon strip in the panel header selects among enabled tools; a gear opens Settings → Tools. Keep the app-level right-panel toggle where it is.

Ship the host and one real chat provider in a bounded first version. A TypeScript registry is enough; no extension loader, marketplace, agent runtime, MCP client, or arbitrary code execution is needed. In this proposal, a “tool” means a user-visible panel feature, not model function calling.

Proposed initial provider: OpenAI with the user's own API key. This is a recommendation pending product choice, not an assumption about the user's account. Keep the transport behind an adapter so local Ollama can be added next. Do not ship a developer-owned shared key or build a billing server for v1.

## User experience

### Settings → Tools

- A new Tools tab alongside Typography, Themes, General, and Sync.
- Writer toggle, off by default. Enabling adds its icon to the panel header; it does not send anything or force the panel open.
- An enabled but unconfigured Writer remains visible and opens a setup state.
- Configuration: provider, model, masked API-key replacement/removal, and a connection test. The connection test is explicit and sends no note text; explain if it makes a small billable provider request.
- “Configured” and “Enabled” are independent. Disabling cancels an in-flight request and removes the tool from the strip, while preserving chats and configuration. Removing credentials is a separate explicit action.
- Store tool preferences separately from typography settings: the existing Restore Defaults button should not unexpectedly reset tools or erase credentials.
- Settings can be deep-linked to Tools. Add an optional `initialTab` prop or a typed Settings section in the UI store; keep the existing native-menu behavior.

### Right panel

- Header: compact enabled-tool icons, active tool name, and Manage tools gear. Quiet hover and a small underline/label for selection; no bright filled squares.
- With no tools enabled: “No tools enabled” and “Manage tools.” Preserve the ability to open the empty panel.
- With one enabled tool: show Writer directly; the strip can grow naturally when additional tools exist.
- With several tools: show one at a time. At narrow widths, keep the active tool and overflow the remainder into a named menu rather than squeezing icon targets.
- Hiding the right panel affects layout only. Draft messages, active conversation, and an in-progress stream survive hiding/reopening it. Switching tools preserves each tool's state too.
- Tool availability never changes note navigation history. Opening a tool from an eventual app-level shortcut explicitly opens the right panel through its existing priority rules.

### Writer

- A normal conversation: user messages, streamed assistant replies, composer, Send/Stop, Retry, New chat, and a small recent-chat selector.
- Starter prompts: “Help me outline this,” “What is missing?” and “Make this clearer.” They fill the composer; they do not send immediately.
- Context is explicit: “No note,” “Attach current note,” or a named attached note chip. Default is no attachment. Showing a note in the editor must never silently transmit it.
- Freeze the attached note identity within a conversation. Selecting another note does not silently swap its context. Offer “Use current note” as a deliberate action; warn that earlier messages can still contain context from the previous attachment, or start a new chat to separate them.
- Before Send, capture the current **in-memory draft** of the attached open note, including unsaved edits in either editor mode. Display the attached note title and a preview of the actual context being sent. Do not force a disk save just to read context.
- An attachment stays attached for subsequent sends until removed; the UI makes that continuing choice visible. Snapshot its current contents separately for each request. No background sends while typing.
- No attachments means conversation text only. Never implicitly include the vault, backlinks, filesystem paths, image bytes, or all frontmatter. Initial note context is title + Markdown body, with images treated as text references rather than uploaded assets.
- Copy reply is the initial handoff into writing. The user pastes through the existing editor workflow. A direct “Insert into note” feature can follow with an editor transaction, undo, selection/revision checks, and sync-hold support; it is deliberately not part of the first chat slice.
- Respect locked notes: attaching a note to discuss it does not alter it. No automatic note edits or metadata changes from chat.
- At 240–320px panel widths, composer and actions wrap. Independently scroll messages and keep the composer reachable. Preserve the existing narrow-window panel priorities.

## What the repository already provides

| Area | Existing code | Implication |
| --- | --- | --- |
| Panel geometry/visibility | `src/components/layout/AppShell.tsx`, `src/store/layout.ts`, `src/lib/workspace-layout.ts` | Replace the empty aside contents; keep the layout store authoritative. |
| Settings | `src/components/settings/SettingsModal.tsx`, `src/store/settings.ts` | Add Tools and deep-linking. Keep nonsecret tool preferences in their own validated store. |
| UI state | `src/store/ui.ts` | Existing settings-open state can gain a section; don't add tool switches to note history. |
| Native bridge | `src/lib/tauri-commands.ts`, `src-tauri/src/lib.rs` | Typed commands and Rust services already match app conventions. |
| Editor drafts | `src/components/layout/MainPanel.tsx`, `src/components/editor/NoteEditor.tsx` | Rich-text and Markdown own live state; note-store content may lag by the save debounce. |
| Saving / Git sync | `MainPanel.handleSave`, pending-save registry, `useGitSyncStore` | Chat should not bypass snapshots, write blocking, or preserved drafts. Copy-first avoids a new write path. |
| Themes | theme variables, bundled icons | Reuse current surfaces/quiet controls; keep tool icons bundled. |

Important finding: the selected note in the Zustand note store is not a reliable snapshot of the current draft. Both editor modes keep unsaved state locally, and Git sync can deliberately retain an unsaved held draft. Simply reading `notes.find(...).content` would send stale text.

Proposed seam: a small editor bridge exposing `getDraftSnapshot(noteId)` and (later) guarded `applyEdit`. Register the mounted editor's getter, return plain Markdown plus a revision identifier, and clear it on unmount. The bridge reads the current editor; it does not place a TipTap instance in persisted global state. If the attached note is not open, capture the loaded note-store body and label it as that saved/loaded snapshot. Disable sending if the note was deleted or its vault removed, rather than silently substituting another note.

## Architecture

```text
Settings → validated tool preferences → ToolHost / tool strip
                                         ↓
                                Writer UI + Zustand session state
                                         ↓
                                explicit draft-context snapshot
                                         ↓
                               typed Tauri chat commands
                                         ↓
                         Rust request lifecycle + credential access
                                         ↓
                              provider HTTP streaming adapter
                                         ↓
                            Tauri Channel → Writer session state
```

### Small tool registry

A proposed `ToolDefinition` includes `id`, `label`, bundled icon, panel component, and optional settings component. Only compiled first-party entries are registered. `ToolHost` derives its visible tools from validated enabled IDs; unknown persisted IDs are ignored. If the selected tool is disabled, select the first enabled tool or the empty state. Keep `selectedToolId` separate from panel visibility.

Suggested files:

- `src/tools/registry.ts` — registry and tool types.
- `src/store/tools.ts` — enabled IDs and selected-tool preference; validated persistence.
- `src/components/tools/ToolHost.tsx`, `ToolStrip.tsx` — panel UI.
- `src/components/settings/ToolsTab.tsx` — toggles and provider setup.
- `src/tools/writer/WriterPanel.tsx`, `store.ts`, `types.ts` — conversations and request states.
- `src/lib/editor-bridge.ts` — read current note draft without saving.
- `src/lib/tauri-commands.ts` — typed chat/settings/history wrappers.
- `src-tauri/src/chat/{mod.rs,provider.rs,openai.rs,storage.rs,credentials.rs}` — network, lifecycle, local data, secrets.

Names and file granularity can be simplified during implementation. This is an implementation map, not a requirement to create every file up front.

### Streaming and lifecycle

Use Rust HTTP requests and `tauri::ipc::Channel` for stream events. Tauri explicitly recommends channels for streamed HTTP responses. No provider credentials in frontend network requests, no CORS proxy, and no embedded remote web app.

Every request is keyed by `requestId`, `conversationId`, and originating vault identity. Stream a normalized event union: `started`, `textDelta`, `completed`, `cancelled`, `failed`; include usage when the provider supplies it. Verify IDs before applying events so stale chunks cannot reach a different chat.

A Rust-owned cancellation map handles Stop, disabling Writer, deleting a conversation, and app shutdown. Hiding the panel does not cancel. One request per conversation in v1; retain a partially streamed reply as interrupted after Stop or failure. Do not automatically retry a billable request; Retry is explicit. Handle connection timeouts, lost streams, authentication failures, model errors, rate limits, oversized inputs, and context-window exhaustion with useful messages.

Parse SSE incrementally across arbitrary network chunk boundaries; don't assume one chunk equals one event. Persist completed/interrupted message transitions atomically, not every token. On startup mark abandoned `streaming` messages as interrupted. Serialize transcript writes so a late write cannot resurrect a deleted conversation. Discard late provider events after cancellation.

### Storage boundaries

- Tool enabled state, selected tool, nonsecret provider/model choices: validated local preferences, app-wide.
- API key: OS credential store, accessed by Rust. The UI gets “configured/missing” metadata and can replace/delete a key, not read it back. On Linux, an unavailable or locked credential service produces a recoverable setup error; never fall back silently to plaintext.
- Conversations: versioned JSON in app-local data outside vaults, partitioned by vault identity; a separate scope for no-vault chat. Atomic writes, explicit deletion, bounded history, and corruption recovery are needed. This history does not automatically Git-sync with notes.
- Live drafts, context snapshots, request IDs, and buffers: memory; only necessary transcript data persists.
- Never put keys in localStorage, note frontmatter, vault files, logs, or exported transcripts. Don't log prompt bodies or raw credential-bearing provider errors.
- Removing a note attachment stops including its current body in future requests, but earlier messages/replies may still contain that information. A new chat is the clean way to reset context. Deleting a chat removes the local transcript, not provider-side retention.

A credential-store crate is a candidate dependency to evaluate for macOS Keychain and Linux Secret Service. Platform feature flags and behavior must be tested before committing to a particular crate/version. Likely additional Rust dependencies include an HTTP client with Rustls/stream support and cancellation/stream utilities. No new React framework is necessary.

## Provider decision

| Choice | What it gives us | Work / limits |
| --- | --- | --- |
| OpenAI + own key (proposed first) | Hosted text quality, Responses streaming, no model installation | Key setup, usage charges, internet, provider data disclosure. Model choice remains configurable and must be validated against current access. |
| Local Ollama (next adapter) | Can keep inference on the user's machine | Requires a running local server and installed model; quality/latency depend on hardware. Use native `/api/chat` rather than assuming every “OpenAI-compatible” endpoint implements Responses. |
| Anthropic / more hosted providers | Additional provider choice | Each needs its own transport/error/stream tests. Add after one end-to-end implementation is sound. |

The OpenAI Responses API streams typed text events. Use `store: false`, keep conversation state locally, and send the required history explicitly; do not use hosted conversation objects for this version. That setting is **not** a promise of zero provider retention: abuse-monitoring and other documented exceptions still apply. Explain the selected provider beside the composer and in setup. Update README language that currently says Helm never touches a server: core notes remain local; cloud Writer sends explicitly submitted messages/context to the configured provider.

If local-only operation is a product requirement, implement Ollama first instead; the proposed host and chat state model stay the same. Do not implement both adapters before settling this product choice.

## Scope and delivery

1. **Tool host + Settings:** registry, preferences, panel header, empty/configuration states, lifecycle boundaries. No network yet.
2. **One real chat provider:** credential setup, streaming/cancellation, basic local conversation history, clear errors, Copy, no-context chat. Verify a real request with an explicitly configured test account; automated tests use a fake provider.
3. **Note-aware companion:** draft snapshot bridge for both editor modes, explicit context chip/preview, bounded input, starter prompts, vault/note-switch behavior. Update privacy/help text and test with Git sync holds.

Rough planning estimate: 4–7 focused engineering days for a polished single-provider version, assuming the credential-store integration and provider test account are available. Tool host is the small part; reliable streaming, cross-platform credentials, and editor-context correctness dominate. Treat this as a sizing estimate to refine during implementation, not a delivery commitment.

Out of v1: autonomous editing, whole-vault retrieval/embeddings, web browsing, model function calling, MCP connections, arbitrary extensions, image uploads, voice, billing/accounts, and cross-device chat sync. Future tools can still be non-AI: outline, word count, related notes, etc., using the same host.

## Acceptance checks

- Tools tab enables/disables Writer and persists safely across missing/invalid/older settings. No tool or API request exists by default.
- Enabled-but-unconfigured Writer is discoverable. All-disabled host still has Manage tools. Disabling selected Writer cancels it and leaves a coherent host.
- Panel/tool hiding and reopening preserve chat draft, transcript, and in-flight request; no note navigation/history changes.
- At 800 × 600 and 240px effective panel width: usable composer, scrolling, tool controls, Settings, no page overflow.
- Streaming text, Stop, explicit Retry, refusal/incomplete output, timeouts, 401/429 errors, malformed SSE, fragmented UTF-8/event boundaries, and late chunks are tested with a fake provider.
- Request IDs prevent responses from landing in the wrong conversation after switching chats/vaults; new requests cannot use a removed vault's context.
- No note context without an explicit attachment. Sent context matches the latest rich-text or Markdown draft, including Git-held drafts, without changing saved timestamps.
- Inputs are bounded. Oversized note/history is clearly flagged; no silent truncation of the user's text. Prefer explicit context removal/history trimming to hidden summarization requests in v1.
- Chat Markdown is sanitized; raw HTML and dangerous URL schemes are rejected; remote images are not auto-loaded. No model response can invoke a tool or write a file.
- Conversation history survives restart, handles corruption, and does not enter note search or Git sync. Clear/delete behavior is explicit.
- Credential errors recover safely and secrets never appear in frontend state returned by Rust, localStorage, logs, or vault files after setup.
- Existing note editing/autosave, locked notes, undo, selection, and Git sync holds keep working.
- Repository checks: `npm test`, `npm run test:types`, `npm run lint`, `cargo test`, plus real macOS and Linux credential/network smoke checks.

## Decisions to confirm before production implementation

Recommended defaults are included so the investigation does not depend on a reply:

1. **Provider:** OpenAI with own key first; Ollama first if local-only inference is a requirement.
2. **Transcript history:** local app data, per vault, outside note sync; no automatic export to notes.
3. **Note context:** explicit attachment, no context by default; Copy-first instead of direct editor mutation.
4. **Tool UI:** compact icon strip inside the right panel; Tools settings controls availability independently of whether the panel is open.

## Sources checked

- [Tauri: calling Rust / channels](https://v2.tauri.app/develop/calling-rust/) — streaming transport.
- [OpenAI: streaming responses](https://developers.openai.com/api/docs/guides/streaming-responses) — Responses stream lifecycle.
- [OpenAI: data controls](https://developers.openai.com/api/docs/guides/your-data) — `store` and retention distinctions.
- [Ollama: generate a chat message](https://docs.ollama.com/api/chat) — native chat/stream interface.

No provider requests were made, no credentials were accessed, and no production behavior was changed during this investigation.


## Implementation note — 2026-10-18

The first usable slice is on `codex/writer-tool`: Tools settings, an enabled/disabled Writer host, Codex and Claude CLI subscription adapters, explicit provider sign-in/check, in-memory conversations scoped by active vault/provider, explicit note attachments reading live drafts, Copy, Stop, and bounded requests. The installed CLI owns credentials; Helm never copies tokens. A synthetic Codex subscription request succeeded through the Rust/Tauri channel bridge. Claude is installed but not signed in on the development machine, so its authenticated request path still needs a live check.

This intentionally uses installed command-line clients for the first subscription proof instead of implementing a new OAuth client or an API-key HTTP service. Codex's JSON exec mode returns completed assistant messages; Claude's stream-json yields partial text. Recent CLI versions with the supported isolation flags are required. The provider UI describes this distinction.

Remaining after the prototype: persistent transcripts/recent-chat selection, model selection, a reusable multi-tool registry once a second tool exists, Codex token streaming via app-server, broader CLI-version/platform coverage, and full native interactive QA. The original 4–7 day estimate was for the more polished API-provider design and is not a commitment for this changed scope.


### Dual connections — 2026-10-18

Added explicit Subscription/API key mode per provider, system credential storage, native direct API transports for OpenAI Responses and Anthropic Messages, provider catalog lookup, and separate remembered API/subscription model IDs. API streams share the cancellation/lifecycle protocol with the CLI bridge and never fall back to another billing mode. The composer identifies API billing. Keys are only sent through typed native credential commands and are not returned to React; the password field clears immediately on save. Live API and Linux credential-service verification remain manual follow-up with configured accounts.
