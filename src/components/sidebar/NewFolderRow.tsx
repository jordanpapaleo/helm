import { Icon } from "@iconify/react";
import { useEffect, useRef } from "react";

/** Inline name field for a folder that does not exist yet. Empty commits cancel. */
export function NewFolderRow({ onCommit }: { onCommit: (name: string) => void }) {
  const committed = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  return (
    <div className="flex items-center gap-1.5 py-1" style={{ paddingLeft: 28 }}>
      <Icon icon="uil:folder" className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
      <input
        ref={inputRef}
        placeholder="folder name"
        className="flex-1 rounded bg-base-100 px-1 text-sm outline outline-1 outline-accent"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            committed.current = true;
            onCommit((e.target as HTMLInputElement).value.trim());
          }
          if (e.key === "Escape") {
            committed.current = true;
            onCommit("");
          }
          e.stopPropagation();
        }}
        onBlur={(e) => {
          if (!committed.current) onCommit(e.target.value.trim());
        }}
      />
    </div>
  );
}
