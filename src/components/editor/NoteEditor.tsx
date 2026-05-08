import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { EditorContent, Extension, InputRule, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import taskListPlugin from "markdown-it-task-lists";
import { Markdown } from "tiptap-markdown";

// tiptap-markdown calls parse.setup(md) on every parse() call (initial load, paste, setContent).
// We use this to register markdown-it-task-lists once on the md instance.
// setup runs inside parser.parse() so the md instance already exists.
const TaskListMarkdown = TaskList.extend({
  addInputRules() {
    return [
      // When "[ ] " or "[x] " is typed at the start of a bulletList item, convert it
      // to a taskList item. The "- " prefix already created a bulletList via StarterKit's
      // input rule, so we match only the checkbox portion here.
      new InputRule({
        find: /^\[([xX ]?)\]\s$/,
        handler: ({ state, match }) => {
          const checked = match[1]?.toLowerCase() === "x";
          const { $from } = state.selection;
          const taskListType = state.schema.nodes.taskList;
          const taskItemType = state.schema.nodes.taskItem;
          const listItemType = state.schema.nodes.listItem;
          if (!taskListType || !taskItemType || !listItemType) return;

          // Only fire when inside a bulletList listItem
          let listItemDepth = -1;
          for (let d = $from.depth; d >= 0; d--) {
            if ($from.node(d).type === listItemType) {
              listItemDepth = d;
              break;
            }
          }
          if (listItemDepth < 0) return;

          const { tr } = state;
          // Replace the entire bulletList in one operation to avoid intermediate invalid state
          const bulletListStart = $from.before(listItemDepth - 1);
          const bulletListEnd = $from.after(listItemDepth - 1);
          const paragraph = state.schema.nodes.paragraph?.create();
          const taskItem = taskItemType.create({ checked }, paragraph ?? undefined);
          const taskList = taskListType.create(null, taskItem);
          tr.replaceWith(bulletListStart, bulletListEnd, taskList);
        },
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        serialize(state: any, node: any) {
          state.renderList(node, "  ", () => "- ");
        },
        parse: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setup(md: any) {
            if (!md.__taskListsAdded) {
              // Normalize escaped task list brackets \[ \] → [ ] before task list plugin runs.
              // This fixes content that was previously serialized without task list support
              // (tiptap-markdown escapes [ and ] in plain text, producing \[ \]).
              md.core.ruler.before("block", "unescape-task-list", (state: any) => {
                state.src = state.src.replace(/^([-*+])\s+\\\[([xX ]?)\\\]/gm, "$1 [$2]");
              });
              md.use(taskListPlugin);
              md.__taskListsAdded = true;
            }
          },
          // updateDOM converts markdown-it-task-lists output classes to tiptap data-type attrs
          updateDOM(element: Element) {
            [...element.querySelectorAll(".contains-task-list")].forEach((list) => {
              list.setAttribute("data-type", "taskList");
            });
          },
        },
      },
    };
  },
});

const TaskItemMarkdown = TaskItem.extend({
  addStorage() {
    return {
      markdown: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        serialize(state: any, node: any) {
          state.write(node.attrs.checked ? "[x] " : "[ ] ");
          state.renderContent(node);
        },
        parse: {
          updateDOM(element: Element) {
            [...element.querySelectorAll(".task-list-item")].forEach((item) => {
              const input = item.querySelector("input");
              item.setAttribute("data-type", "taskItem");
              if (input) {
                item.setAttribute("data-checked", String((input as HTMLInputElement).checked));
                input.remove();
              }
            });
          },
        },
      },
    };
  },
});

// Clear all marks when pressing Enter outside of lists/code blocks
// so new lines never inherit bold, italic, etc.
const ClearMarksOnEnter = Extension.create({
  name: "clearMarksOnEnter",
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (
          editor.isActive("listItem") ||
          editor.isActive("taskItem") ||
          editor.isActive("codeBlock")
        ) {
          return false;
        }
        return editor.chain().splitBlock().unsetAllMarks().run();
      },
    };
  },
});

import { convertFileSrc } from "@tauri-apps/api/core";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { tauriCommands } from "../../lib/tauri-commands";
import { useNoteStore } from "../../store/notes";
import { useSettingsStore } from "../../store/settings";
import type { Note } from "../../types/note";
import { WikiLinkExtension } from "./WikiLink";

const lowlight = createLowlight(common);

interface SuggestionPopup {
  items: Note[];
  selectedIndex: number;
  rect: DOMRect;
  command: (props: { label: string }) => void;
}

export interface NoteEditorHandle {
  focus: () => void;
}

interface NoteEditorProps {
  note: Note;
  onSave: (content: string) => void;
  locked?: boolean;
}

export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(
  ({ note, onSave, locked = false }, ref) => {
    const { vaults, notes } = useNoteStore();
    const { settings } = useSettingsStore();
    const vaultPath = vaults.find((v) => v.id === note.vaultId)?.path ?? null;
    const [popup, setPopup] = useState<SuggestionPopup | null>(null);

    // Refs prevent stale closures inside the TipTap extension config
    const notesRef = useRef(notes);
    const autocompleteRef = useRef(settings.autocompleteWikiLinks);
    autocompleteRef.current = settings.autocompleteWikiLinks;
    const autoSaveRef = useRef(settings.autoSaveOnEdit);
    autoSaveRef.current = settings.autoSaveOnEdit;
    notesRef.current = notes;
    const noteIdRef = useRef(note.id);
    noteIdRef.current = note.id;
    const popupRef = useRef(popup);
    popupRef.current = popup;
    const setPopupRef = useRef(setPopup);
    setPopupRef.current = setPopup;
    // Tracks the last content we wrote to disk so we can distinguish our own
    // saves from external file changes (e.g. from Claude Code or MCP server).
    const lastSavedContentRef = useRef(note.content);

    const editor = useEditor({
      extensions: [
        StarterKit.configure({ codeBlock: false }),
        Placeholder.configure({ placeholder: "Start writing…" }),
        Highlight.configure({ multicolor: false }),
        CodeBlockLowlight.configure({ lowlight }),
        TaskListMarkdown,
        TaskItemMarkdown.configure({ nested: true }),
        ClearMarksOnEnter,
        Image.configure({ inline: false, allowBase64: false }),
        WikiLinkExtension.configure({
          suggestion: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            items: ({ query }: any) =>
              !autocompleteRef.current
                ? []
                : notesRef.current
                    .filter(
                      (n) =>
                        n.id !== noteIdRef.current &&
                        n.frontmatter.title.toLowerCase().includes(query.toLowerCase()),
                    )
                    .slice(0, 8),
            render: () => ({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onStart(props: any) {
                const rect = props.clientRect?.();
                if (!rect) return;
                setPopupRef.current({
                  items: props.items,
                  selectedIndex: 0,
                  rect,
                  command: props.command,
                });
              },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onUpdate(props: any) {
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
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onKeyDown({ event }: any) {
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
        Markdown.configure({
          html: false,
          transformPastedText: true,
          transformCopiedText: true,
        }),
      ],
      content: note.content,
      editorProps: {
        attributes: {
          class: "prose max-w-none w-full outline-none min-h-[300px] text-[var(--color-text)]",
          style: [
            "font-size: var(--editor-font-size)",
            "line-height: var(--editor-line-height)",
          ].join("; "),
        },
        handlePaste(view, event) {
          const items = event.clipboardData?.items;

          // Handle image paste
          if (items && vaultPath) {
            for (const item of Array.from(items)) {
              if (!item.type.startsWith("image/")) continue;
              event.preventDefault();
              const file = item.getAsFile();
              if (!file) continue;
              const ext = item.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
              const filename = `${Date.now()}.${ext}`;
              file.arrayBuffer().then(async (buf) => {
                const data = Array.from(new Uint8Array(buf));
                try {
                  const absPath = await tauriCommands.writeAsset(vaultPath, filename, data);
                  const src = convertFileSrc(absPath);
                  view.dispatch(
                    view.state.tr.replaceSelectionWith(
                      view.state.schema.nodes.image.create({ src, alt: filename }),
                    ),
                  );
                } catch (e) {
                  console.error("Failed to save image:", e);
                }
              });
              return true;
            }
          }

          // Force tiptap-markdown's clipboardTextParser to handle plain text,
          // bypassing ProseMirror's default which would prefer text/html
          const text = event.clipboardData?.getData("text/plain");
          if (text) {
            event.preventDefault();
            let handled = false;
            view.someProp("clipboardTextParser", (f) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const slice = (f as any)(text, (view.state as any).$from, false, view);
              if (slice) {
                view.dispatch(view.state.tr.replaceSelection(slice));
                handled = true;
              }
              return !!slice;
            });
            if (!handled) {
              view.dispatch(view.state.tr.insertText(text));
            }
            return true;
          }

          return false;
        },
      },
    });

    useImperativeHandle(
      ref,
      () => ({
        focus: () => editor?.commands.focus("end"),
      }),
      [editor],
    );

    // Reset editor when switching to a different note
    useEffect(() => {
      if (editor) {
        editor.commands.setContent(note.content);
        lastSavedContentRef.current = note.content;
      }
    }, [note.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Reload editor when the file is updated externally (e.g. by Claude Code or MCP).
    // We distinguish external changes from our own saves by tracking lastSavedContentRef.
    useEffect(() => {
      if (!editor) return;
      if (note.content === lastSavedContentRef.current) return;
      // Cancel any pending auto-save so it doesn't overwrite the external change
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      editor.commands.setContent(note.content);
      lastSavedContentRef.current = note.content;
    }, [note.content]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
      if (editor) editor.setEditable(!locked);
    }, [editor, locked]);

    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const triggerSave = useCallback(() => {
      if (!editor) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const md = (editor.storage as any).markdown?.getMarkdown?.() ?? editor.getText();
      lastSavedContentRef.current = md; // mark as our own save so the file watcher doesn't reload
      onSave(md);
    }, [editor, onSave]);

    // Auto-save 1s after the user stops typing
    useEffect(() => {
      if (!editor) return;
      const handler = () => {
        if (!autoSaveRef.current) return;
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(triggerSave, 1000);
      };
      editor.on("update", handler);
      return () => {
        editor.off("update", handler);
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      };
    }, [editor, triggerSave]);

    const handleBlur = useCallback(() => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      triggerSave();
    }, [triggerSave]);

    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: onBlur bubbles from TipTap's focusable editor content
      <div
        onBlur={locked ? undefined : handleBlur}
        className={`relative flex-1 overflow-y-auto px-12 py-6 ${locked ? "opacity-75 cursor-not-allowed select-none" : ""}`}
      >
        <EditorContent editor={editor} />

        {/* Wiki-link suggestion popup */}
        {popup && popup.items.length > 0 && (
          <div
            className="fixed z-50 min-w-[220px] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl"
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
                <span className="truncate">{n.frontmatter.title || "Untitled"}</span>
                {n.frontmatter.tags.length > 0 && (
                  <span className="ml-auto shrink-0 text-xs opacity-50">
                    {n.frontmatter.tags[0]}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  },
);
