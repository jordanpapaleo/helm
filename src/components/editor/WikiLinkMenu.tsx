import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { type Dispatch, type SetStateAction, useMemo, useRef, useState } from "react";
import { wikiLinkCandidates } from "../../lib/archive";
import { useNoteStore } from "../../store/notes";
import { useSettingsStore } from "../../store/settings";
import type { Note } from "../../types/note";
import { WikiLinkExtension } from "./WikiLink";

interface WikiLinkPopupState {
  items: Note[];
  selectedIndex: number;
  rect: DOMRect;
  command: (props: { label: string }) => void;
}

/**
 * Note-link dropdown shared by the main editor and a note pinned in the side
 * panel. Candidates, the archived label, and the autocomplete setting all come
 * from the same place, so one surface cannot drift from the other.
 */
export function useWikiLinkMenu(noteId: string) {
  const notes = useNoteStore((state) => state.notes);
  const autocomplete = useSettingsStore((state) => state.settings.autocompleteWikiLinks);
  const showArchived = useSettingsStore((state) => state.settings.showArchivedNotes);
  const [popup, setPopup] = useState<WikiLinkPopupState | null>(null);

  const notesRef = useRef(notes);
  const autocompleteRef = useRef(autocomplete);
  const showArchivedRef = useRef(showArchived);
  const noteIdRef = useRef(noteId);
  const popupRef = useRef(popup);
  const setPopupRef = useRef(setPopup);
  notesRef.current = notes;
  autocompleteRef.current = autocomplete;
  showArchivedRef.current = showArchived;
  noteIdRef.current = noteId;
  popupRef.current = popup;
  setPopupRef.current = setPopup;

  const extension = useMemo(
    () =>
      WikiLinkExtension.configure({
        suggestion: {
          items: ({ query }: { query: string }) =>
            !autocompleteRef.current
              ? []
              : wikiLinkCandidates(
                  notesRef.current,
                  noteIdRef.current,
                  query,
                  showArchivedRef.current,
                ),
          render: () => ({
            onStart(props: SuggestionProps<Note>) {
              const rect = props.clientRect?.();
              if (!rect) return;
              setPopupRef.current({
                items: props.items,
                selectedIndex: 0,
                rect,
                command: props.command,
              });
            },
            onUpdate(props: SuggestionProps<Note>) {
              const rect = props.clientRect?.();
              setPopupRef.current((prev) =>
                prev
                  ? {
                      ...prev,
                      items: props.items,
                      rect: rect ?? prev.rect,
                      command: props.command,
                    }
                  : null,
              );
            },
            onKeyDown({ event }: SuggestionKeyDownProps) {
              const curr = popupRef.current;
              if (!curr || curr.items.length === 0) return false;
              if (event.key === "Escape") {
                setPopupRef.current(null);
                return true;
              }
              if (event.key === "ArrowDown") {
                setPopupRef.current({
                  ...curr,
                  selectedIndex: (curr.selectedIndex + 1) % curr.items.length,
                });
                return true;
              }
              if (event.key === "ArrowUp") {
                setPopupRef.current({
                  ...curr,
                  selectedIndex: (curr.selectedIndex - 1 + curr.items.length) % curr.items.length,
                });
                return true;
              }
              if (event.key === "Enter") {
                const n = curr.items[curr.selectedIndex];
                if (n) curr.command({ label: n.frontmatter.title });
                setPopupRef.current(null);
                return true;
              }
              return false;
            },
            onExit() {
              setPopupRef.current(null);
            },
          }),
        },
      }),
    [],
  );

  return { extension, popup, setPopup };
}

export function WikiLinkMenu({
  popup,
  setPopup,
}: {
  popup: WikiLinkPopupState | null;
  setPopup: Dispatch<SetStateAction<WikiLinkPopupState | null>>;
}) {
  if (!popup || popup.items.length === 0) return null;
  return (
    <section
      aria-label="Note links"
      className="fixed z-50 m-0 min-w-[220px] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl"
      style={{ top: popup.rect.bottom + 6, left: popup.rect.left }}
    >
      {popup.items.map((n, i) => (
        <button
          type="button"
          key={n.id}
          className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
            i === popup.selectedIndex
              ? "bg-[var(--color-accent)] text-white"
              : "text-[var(--color-text)] hover:bg-[var(--color-border)]/50"
          }`}
          onMouseDown={(e) => {
            e.preventDefault(); // keep editor focus
            popup.command({ label: n.frontmatter.title });
            setPopup(null);
          }}
        >
          <span className="truncate">
            {n.frontmatter.title || "Untitled"}
            {n.frontmatter.archived ? " (archived)" : ""}
          </span>
          {n.frontmatter.tags.length > 0 && (
            <span className="ml-auto shrink-0 text-xs opacity-50">{n.frontmatter.tags[0]}</span>
          )}
        </button>
      ))}
    </section>
  );
}
