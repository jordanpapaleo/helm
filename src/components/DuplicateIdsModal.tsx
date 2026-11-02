import { Icon } from "@iconify/react";
import { useEffect, useRef, useState } from "react";
import type { DuplicateGroup } from "../lib/duplicate-ids";
import { normalizeContent } from "../lib/note-parser";
import { giveNoteNewId, trashDuplicateCopy } from "../lib/resolve-duplicates";
import { useNoteStore } from "../store/notes";
import { reportError } from "../store/toast";
import { useUIStore } from "../store/ui";
import type { Note } from "../types/note";

const PREVIEW_CHARS = 600;

function formatUpdated(updated: string): string {
  const date = new Date(updated);
  if (!updated || Number.isNaN(date.getTime())) return updated || "unknown";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function preview(content: string): string {
  const text = content.trim();
  if (!text) return "(empty note)";
  return text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS)}…` : text;
}

async function revealFile(filePath: string): Promise<void> {
  try {
    const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
    await revealItemInDir(filePath);
  } catch (e) {
    reportError("Failed to show the file", e);
  }
}

interface CopyCardProps {
  note: Note;
  keeper: Note;
  busy: boolean;
  onOpen: (note: Note) => void;
  onRun: (note: Note, action: (note: Note) => Promise<unknown>) => void;
}

function CopyCard({ note, keeper, busy, onOpen, onRun }: CopyCardProps) {
  const isKeeper = note === keeper;
  const sameContent = normalizeContent(note.content) === normalizeContent(keeper.content);
  const title = note.frontmatter.title || "Untitled";

  return (
    <li className="rounded-lg border border-base-300 bg-base-100 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 break-words font-medium">{title}</p>
        {isKeeper ? (
          <span className="badge badge-success badge-sm">Keeps this ID</span>
        ) : (
          <span className={`badge badge-sm ${sameContent ? "badge-ghost" : "badge-warning"}`}>
            {sameContent ? "Same content as the kept copy" : "Content differs from the kept copy"}
          </span>
        )}
      </div>
      <p className="mt-1 break-all font-mono text-xs opacity-70">{note.filePath}</p>
      <p className="text-xs opacity-70">Updated {formatUpdated(note.frontmatter.updated)}</p>
      <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md bg-base-200 p-2 text-xs">
        {preview(note.content)}
      </pre>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          disabled={busy}
          onClick={() => onOpen(note)}
        >
          <Icon icon={isKeeper ? "uil:external-link-alt" : "uil:folder-open"} aria-hidden="true" />
          {isKeeper ? "Open" : "Show in folder"}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-xs"
          disabled={busy}
          aria-label={`Give ${title} at ${note.filePath} a new ID`}
          onClick={() => onRun(note, giveNoteNewId)}
        >
          <Icon icon="uil:sync" aria-hidden="true" />
          Give this copy a new ID
        </button>
        <button
          type="button"
          className="btn btn-error btn-outline btn-xs"
          disabled={busy || note.frontmatter.locked === true}
          title={note.frontmatter.locked ? "Unlock the note before moving it to Trash" : undefined}
          aria-label={`Move ${title} at ${note.filePath} to Trash`}
          onClick={() => onRun(note, trashDuplicateCopy)}
        >
          <Icon icon="uil:trash-alt" aria-hidden="true" />
          Move to Trash
        </button>
      </div>
    </li>
  );
}

function GroupSection({
  group,
  busy,
  onOpen,
  onRun,
}: {
  group: DuplicateGroup<Note>;
  busy: boolean;
  onOpen: (note: Note) => void;
  onRun: (note: Note, action: (note: Note) => Promise<unknown>) => void;
}) {
  const headingId = `duplicate-${group.id}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="text-sm font-semibold">
        {group.copies.length + 1} files share ID <code className="font-mono">{group.id}</code>
      </h3>
      <ul className="flex flex-col gap-2">
        {[group.keeper, ...group.copies].map((note) => (
          <CopyCard
            key={note.filePath}
            note={note}
            keeper={group.keeper}
            busy={busy}
            onOpen={onOpen}
            onRun={onRun}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * Lists every frontmatter id held by more than one file and offers a fix per
 * copy. Every action writes through the normal atomic paths; the store then
 * regroups, so a resolved group simply drops off the list.
 */
export function DuplicateIdsModal({ onClose }: { onClose: () => void }) {
  const groups = useNoteStore((s) => s.duplicateGroups);
  const [busyId, setBusyId] = useState<string | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement;
    closeButton.current?.focus();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  function handleOpen(note: Note) {
    const keeper = groups.find((group) => group.keeper === note);
    if (!keeper) {
      void revealFile(note.filePath);
      return;
    }
    useUIStore.getState().navigate({
      view: "notes",
      selectedNoteId: note.id,
      selectedGrouping: { type: "all", id: null },
    });
    onClose();
  }

  function handleRun(note: Note, action: (note: Note) => Promise<unknown>) {
    setBusyId(note.id);
    void action(note).finally(() => setBusyId(null));
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop captures clicks outside the dialog
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-16"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="duplicate-ids-title"
        className="flex w-[760px] max-w-[92vw] flex-col rounded-2xl border border-base-300 bg-base-200 shadow-2xl"
        style={{ maxHeight: "85vh" }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-base-300 px-6 py-4">
          <h2 id="duplicate-ids-title" className="text-base font-semibold">
            Duplicate note IDs
          </h2>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm btn-circle"
            aria-label="Close duplicate note IDs"
          >
            <Icon icon="uil:times" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto p-6 text-sm">
          <p className="opacity-80">
            Each ID below is used by more than one file. Helm uses the copy marked “Keeps this ID”
            for search, links, tabs, and the graph, and sets the others aside until you resolve
            them. Frontmatter links in other notes store IDs, so they keep pointing at the copy that
            keeps the ID. Give a copy a new ID to keep it as its own note (its content is
            unchanged), or move it to Trash.
          </p>
          {groups.length === 0 ? (
            <p role="status" className="alert alert-success">
              <Icon icon="uil:check-circle" aria-hidden="true" />
              All duplicate IDs are resolved.
            </p>
          ) : (
            groups.map((group) => (
              <GroupSection
                key={group.id}
                group={group}
                busy={busyId === group.id}
                onOpen={handleOpen}
                onRun={handleRun}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
