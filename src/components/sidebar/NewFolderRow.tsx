import { Icon } from "@iconify/react";
import { useEffect, useRef } from "react";

export const NEW_FOLDER_INPUT_ID = "helm-new-folder-name";

let commitOpenFolder: ((name: string) => void) | null = null;

/** Move the caret into the name field while the opening click is still active. */
export function focusNewFolderInput(): void {
  const input = document.getElementById(NEW_FOLDER_INPUT_ID);
  if (input instanceof HTMLInputElement) input.focus();
}

/**
 * Create the folder when the open field has a name.
 * Returns false when the field is missing or blank, so the caller can close it.
 * The New folder button prevents mousedown focus changes, so clicking it again
 * does not blur the field and would otherwise drop a typed name.
 */
export function commitOpenFolderName(): boolean {
  const input = document.getElementById(NEW_FOLDER_INPUT_ID);
  if (!(input instanceof HTMLInputElement) || !commitOpenFolder) return false;
  const name = input.value.trim();
  if (!name) return false;
  commitOpenFolder(name);
  return true;
}

/**
 * Inline name field for a folder that does not exist yet.
 * An empty blur leaves the field open: the click that shows it, and the
 * context menu closing, both move focus and would otherwise cancel the create.
 * Escape cancels. Enter, leaving the field with a name, or clicking New folder
 * again with a name creates it.
 */
export function NewFolderRow({ onCommit }: { onCommit: (name: string) => void }) {
  const committed = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function commit(name: string) {
    if (committed.current) return;
    committed.current = true;
    onCommit(name);
  }

  const commitRef = useRef(commit);
  commitRef.current = commit;

  useEffect(() => {
    commitOpenFolder = (name) => commitRef.current(name);
    return () => {
      commitOpenFolder = null;
    };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
    // The context menu unmounts after the click and can take the caret back.
    const id = window.setTimeout(() => {
      if (!committed.current) inputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="flex items-center gap-1.5 py-1" style={{ paddingLeft: 28 }}>
      <Icon icon="uil:folder" className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
      <input
        ref={inputRef}
        id={NEW_FOLDER_INPUT_ID}
        aria-label="Folder name"
        placeholder="folder name"
        className="flex-1 rounded bg-base-100 px-1 text-sm outline outline-1 outline-accent"
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(e.currentTarget.value.trim());
          if (e.key === "Escape") commit("");
          e.stopPropagation();
        }}
        onBlur={(e) => {
          const name = e.currentTarget.value.trim();
          if (name) commit(name);
        }}
      />
    </div>
  );
}
