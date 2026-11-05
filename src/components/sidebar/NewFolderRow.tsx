import { Icon } from "@iconify/react";
import { useEffect, useRef } from "react";

export const NEW_FOLDER_INPUT_ID = "helm-new-folder-name";

/** Move the caret into the name field while the opening click is still active. */
export function focusNewFolderInput(): void {
  const input = document.getElementById(NEW_FOLDER_INPUT_ID);
  if (input instanceof HTMLInputElement) input.focus();
}

/**
 * Inline name field for a folder that does not exist yet.
 * An empty blur leaves the field open: the click that shows it, and the
 * context menu closing, both move focus and would otherwise cancel the create.
 * Escape cancels. Enter, or leaving the field with a name, creates it.
 */
export function NewFolderRow({ onCommit }: { onCommit: (name: string) => void }) {
  const committed = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    // The context menu unmounts after the click and can take the caret back.
    const id = window.setTimeout(() => {
      if (!committed.current) inputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  function commit(name: string) {
    if (committed.current) return;
    committed.current = true;
    onCommit(name);
  }

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
