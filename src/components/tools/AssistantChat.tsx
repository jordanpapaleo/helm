import { Icon } from "@iconify/react";
import { openEditorNote } from "../../lib/open-editor-note";
import { useExtensionsStore } from "../../store/extensions";
import { useNoteStore } from "../../store/notes";
import { useUIStore } from "../../store/ui";
import type { ToolExtension } from "./extensions";

function useVaultName(noteVaultId: string | undefined): string {
  const vaults = useNoteStore((state) => state.vaults);
  const activeVaultId = useNoteStore((state) => state.activeVaultId);
  const vault =
    vaults.find((item) => item.id === (noteVaultId ?? activeVaultId)) ??
    (vaults.length === 1 ? vaults[0] : undefined);
  return vault?.name ?? "your notes";
}

/** Chat surface for a connected assistant. Sending records the message; no model is called. */
export function AssistantChat({ extension }: { extension: ToolExtension }) {
  const { id, name } = extension;
  const settings = useExtensionsStore((state) => state.settings[id]);
  const chat = useExtensionsStore((state) => state.chats[id]);
  const patchChat = useExtensionsStore((state) => state.patchChat);
  const send = useExtensionsStore((state) => state.send);
  const notes = useNoteStore((state) => state.notes);
  const selectedNoteId = useNoteStore((state) => state.selectedNoteId);
  const activeView = useUIStore((state) => state.activeView);
  const selectedGrouping = useUIStore((state) => state.selectedGrouping);
  const openNote = openEditorNote(notes, selectedNoteId, activeView, selectedGrouping);
  const vaultName = useVaultName(openNote?.vaultId);
  const attached = chat.useOpenNote ? openNote : undefined;
  const composerId = `${id}-message`;
  const toggleId = `${id}-use-open-note`;

  function submit() {
    send(id, attached?.frontmatter.title || (attached ? "Untitled" : undefined));
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col text-sm">
      <div className="shrink-0 border-b border-base-300 px-3 py-2">
        <h2 className="font-medium">{name}</h2>
        <p className="mt-0.5 break-words text-xs opacity-60">
          Connected · {settings.mode === "api" ? "API key" : "Subscription"} ·{" "}
          {settings.model || "client default model"}
        </p>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3"
        role="log"
        aria-label={`${name} conversation`}
      >
        {chat.messages.length === 0 ? (
          <div className="space-y-2 py-4">
            <p className="break-words font-medium">Think through {vaultName}</p>
            <p className="opacity-60">Ask a question or explore an idea.</p>
          </div>
        ) : (
          <>
            {chat.messages.map((message) => (
              <div key={message.id} className="mb-4 rounded-lg bg-base-200 p-3">
                <p className="mb-1 text-xs opacity-50">
                  You{message.noteTitle ? ` · with ${message.noteTitle}` : ""}
                </p>
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              </div>
            ))}
            <p className="text-xs opacity-50">Replies aren’t available yet. Nothing was sent.</p>
          </>
        )}
      </div>
      <form
        className="shrink-0 border-t border-base-300 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label htmlFor={composerId} className="sr-only">
          Message {name}
        </label>
        <textarea
          id={composerId}
          className="textarea min-h-20 w-full resize-y text-sm"
          placeholder={`Message ${name}…`}
          value={chat.draft}
          onChange={(event) => patchChat(id, { draft: event.target.value })}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              event.keyCode !== 229
            ) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={toggleId} className="flex min-w-0 items-center gap-2 text-xs">
            <input
              id={toggleId}
              type="checkbox"
              className="toggle toggle-xs shrink-0"
              checked={chat.useOpenNote}
              onChange={(event) => patchChat(id, { useOpenNote: event.target.checked })}
            />
            <span className="shrink-0">Use open note</span>
          </label>
          <button
            type="submit"
            className="btn btn-ghost btn-sm"
            disabled={!chat.draft.trim()}
            aria-label="Send"
            title="Send"
          >
            <Icon icon="uil:arrow-up" className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-1 truncate text-xs opacity-50" title={attached?.frontmatter.title}>
          {attached
            ? `Using: ${attached.frontmatter.title || "Untitled"}`
            : chat.useOpenNote
              ? "No note open"
              : "Conversation only"}
        </p>
      </form>
    </div>
  );
}
