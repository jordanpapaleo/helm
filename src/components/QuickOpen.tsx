import { Icon } from "@iconify/react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isArchived } from "../lib/archive";
import { quickOpenFolder, quickOpenResults } from "../lib/quick-open";
import { useNoteStore } from "../store/notes";
import { useSettingsStore } from "../store/settings";
import { useUIStore } from "../store/ui";
import type { Note, VaultConfig } from "../types/note";

const LISTBOX_ID = "quick-open-results";
const optionId = (index: number) => `quick-open-option-${index}`;

/** ⌘P on macOS, Ctrl+P elsewhere — the same key the File ▸ Go to Note… accelerator uses. */
export function isQuickOpenShortcut(event: KeyboardEvent, macOS: boolean): boolean {
  const primary = macOS ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  return primary && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "p";
}

/**
 * The ⌘P note palette for the main window. Listens in the capture phase so the
 * shortcut works while the editor has focus, and so the webview never opens
 * its own print dialog.
 */
export function QuickOpen() {
  const open = useUIStore((s) => s.quickOpenOpen);
  const setOpen = useUIStore((s) => s.setQuickOpenOpen);

  useEffect(() => {
    const macOS = /Mac/.test(navigator.platform);
    function handleKeyDown(event: KeyboardEvent) {
      if (!isQuickOpenShortcut(event, macOS)) return;
      event.preventDefault();
      setOpen(true);
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [setOpen]);

  if (!open) return null;
  return <QuickOpenDialog onClose={() => setOpen(false)} />;
}

function QuickOpenDialog({ onClose }: { onClose: () => void }) {
  const notes = useNoteStore((s) => s.notes);
  const index = useNoteStore((s) => s.searchIndex);
  const vaults = useNoteStore((s) => s.vaults);
  const showArchived = useSettingsStore((s) => s.settings.showArchivedNotes);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () => quickOpenResults({ notes, index, query, showArchived }),
    [notes, index, query, showArchived],
  );
  const activeIndex = Math.min(active, results.length - 1);

  useEffect(() => {
    const previous = document.activeElement;
    inputRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);

  function choose(note: Note) {
    const { selectedGrouping, openNote } = useUIStore.getState();
    onClose();
    // The Trash grouping only shows deleted notes, so leave it for a live note.
    openNote(note.id, selectedGrouping.type === "trash" ? { type: "all", id: null } : undefined);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    const count = results.length;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (count) setActive((activeIndex + 1) % count);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (count) setActive((activeIndex - 1 + count) % count);
        break;
      case "Enter":
        event.preventDefault();
        if (activeIndex >= 0) choose(results[activeIndex]);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        onClose();
        break;
      case "Tab":
        // The input is the only focus stop; keep focus inside the dialog.
        event.preventDefault();
        break;
    }
  }

  return (
    <div className="modal modal-open motion-reduce:transition-none">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Go to note"
        className="modal-box flex max-h-[70vh] w-[640px] max-w-[92vw] flex-col gap-0 border border-base-300 bg-base-200 p-0 motion-reduce:transition-none"
      >
        <label className="input input-ghost m-2 flex w-auto items-center gap-2 bg-base-100">
          <Icon icon="uil:search" className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label="Search notes by title or content"
            aria-expanded="true"
            aria-controls={LISTBOX_ID}
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
            placeholder="Go to note…"
            spellCheck={false}
            autoComplete="off"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={handleKeyDown}
            className="min-w-0 grow"
          />
        </label>
        <p className="px-4 pb-1 text-xs font-semibold uppercase tracking-wide opacity-50">
          {query.trim() ? "Matching notes" : "Recently updated"}
        </p>
        {results.length === 0 ? (
          <p role="status" className="px-4 py-6 text-center text-sm opacity-60">
            {query.trim() ? "No matching notes" : "No notes yet"}
          </p>
        ) : (
          <div
            id={LISTBOX_ID}
            role="listbox"
            aria-label="Notes"
            className="min-h-0 flex-1 overflow-y-auto"
          >
            <ul role="none" className="menu w-full flex-nowrap px-2 pt-0">
              {results.map((note, i) => (
                <ResultRow
                  key={note.id}
                  note={note}
                  index={i}
                  active={i === activeIndex}
                  vaults={vaults}
                  onHover={() => setActive(i)}
                  onChoose={() => choose(note)}
                />
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-base-300 px-4 py-2 text-xs opacity-70">
          <span className="flex items-center gap-1">
            <kbd className="kbd kbd-xs">↑</kbd>
            <kbd className="kbd kbd-xs">↓</kbd>
            to navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="kbd kbd-xs">↵</kbd>
            to open
          </span>
          <span className="flex items-center gap-1">
            <kbd className="kbd kbd-xs">esc</kbd>
            to close
          </span>
        </div>
      </div>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close note search"
        className="modal-backdrop"
        onClick={onClose}
      />
    </div>
  );
}

function ResultRow({
  note,
  index,
  active,
  vaults,
  onHover,
  onChoose,
}: {
  note: Note;
  index: number;
  active: boolean;
  vaults: VaultConfig[];
  onHover: () => void;
  onChoose: () => void;
}) {
  const { title, state, unmanaged, tags } = note.frontmatter;
  const folder = quickOpenFolder(note, vaults);
  return (
    <li role="none">
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: the combobox input owns keyboard selection through aria-activedescendant */}
      <div
        id={optionId(index)}
        role="option"
        tabIndex={-1}
        aria-selected={active}
        aria-labelledby={`${optionId(index)}-title`}
        aria-describedby={folder ? `${optionId(index)}-folder` : undefined}
        onMouseMove={active ? undefined : onHover}
        // Keep focus in the input so typing continues after a click.
        onMouseDown={(event) => event.preventDefault()}
        onClick={onChoose}
        className={`flex min-w-0 items-center gap-3 ${active ? "menu-active" : ""}`}
      >
        <Icon icon="uil:file-alt" className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
        <span
          id={`${optionId(index)}-title`}
          className="min-w-0 shrink truncate text-sm font-medium"
        >
          {title || "Untitled"}
        </span>
        {folder && (
          <span
            id={`${optionId(index)}-folder`}
            className="max-w-[45%] shrink-0 truncate text-xs opacity-60"
          >
            {folder}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {isArchived(note.frontmatter) && (
            <span className="badge badge-outline badge-xs">Archived</span>
          )}
          {!unmanaged && state && <span className="badge badge-outline badge-xs">{state}</span>}
          {tags[0] && <span className="max-w-32 truncate text-xs opacity-70">#{tags[0]}</span>}
        </span>
      </div>
    </li>
  );
}
