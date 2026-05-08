/**
 * TipTap extension for wiki link support.
 * Enables [[Note Title]] syntax with visual styling and autocomplete.
 * Links are stored as ULIDs in the frontmatter on save.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import type { Note } from "../../types/note";

/**
 * Configuration options for the wiki link extension.
 */
export interface WikiLinkOptions {
  /** TipTap Suggestion plugin options, configured by NoteEditor */
  suggestion: Partial<SuggestionOptions<Note>>;
}

/**
 * TipTap extension that adds wiki link support to the editor.
 * - Renders [[Note Title]] with the "wikilink-ref" CSS class for styling
 * - Provides autocomplete when user types [[
 * - Delegates autocomplete rendering and insertion to the parent NoteEditor
 *
 * @example
 * editor.registerExtension(WikiLinkExtension.configure({
 *   suggestion: { render: () => { ... }, onUpdate: () => { ... } }
 * }))
 */
export const WikiLinkExtension = Extension.create<WikiLinkOptions>({
  name: "wikilink",

  addOptions() {
    return { suggestion: {} };
  },

  addProseMirrorPlugins() {
    return [
      // Decoration plugin: visually style [[link]] text
      new Plugin({
        key: new PluginKey("wikilink-deco"),
        props: {
          /**
           * Apply CSS class to all [[...]] patterns found in the document.
           */
          decorations(state) {
            const decos: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              const regex = /\[\[([^\]]+)\]\]/g;
              let match = regex.exec(node.text);
              while (match !== null) {
                decos.push(
                  Decoration.inline(pos + match.index, pos + match.index + match[0].length, {
                    class: "wikilink-ref",
                  }),
                );
                match = regex.exec(node.text);
              }
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),

      // Suggestion plugin: handle [[word autocomplete
      Suggestion<Note>({
        editor: this.editor,
        char: "[[",
        allowSpaces: true,
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).insertContent(`[[${props.label}]] `).run();
        },
        ...this.options.suggestion,
      }),
    ];
  },
});
