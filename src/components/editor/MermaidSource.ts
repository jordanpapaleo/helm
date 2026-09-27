import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import {
  type EditorState,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
  type Transaction,
} from "@tiptap/pm/state";
import { isMermaidLanguage } from "../../lib/mermaid";

/**
 * Which mermaid diagram, if any, has its source open for editing.
 *
 * Diagrams show only the rendered image; their source is hidden until the
 * user opens it (the block's "Edit source" button, or clicking the diagram),
 * and closes again on Escape, blur, or when the caret leaves the block.
 * A caret is never allowed to rest inside hidden source, where typing would
 * silently edit text the user cannot see.
 */
const mermaidSourceKey = new PluginKey<number | null>("mermaidSource");

type Meta = { open: number } | { close: true };

function isDiagram(node: PMNode | null | undefined): node is PMNode {
  return !!node && node.type.name === "codeBlock" && isMermaidLanguage(node.attrs.language);
}

/** The diagram with (hideable) source containing `pos`, if any. */
function diagramAround(doc: PMNode, pos: number): { pos: number; node: PMNode } | null {
  const $pos = doc.resolve(pos);
  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d);
    if (isDiagram(node) && node.textContent.trim()) return { pos: $pos.before(d), node };
  }
  return null;
}

/** First text position from `pos` in `dir` that is not inside a hidden diagram. */
function visiblePosFrom(doc: PMNode, pos: number, dir: 1 | -1): number | null {
  let from = pos;
  for (;;) {
    const found = Selection.findFrom(doc.resolve(from), dir, true);
    if (!found) return null;
    const hidden = diagramAround(doc, found.head);
    if (!hidden) return found.head;
    from = dir === 1 ? hidden.pos + hidden.node.nodeSize : hidden.pos;
  }
}

export function mermaidSourceOpenAt(state: EditorState, pos: number): boolean {
  return mermaidSourceKey.getState(state) === pos;
}

export function openMermaidSource(tr: Transaction, pos: number): Transaction {
  const meta: Meta = { open: pos };
  return tr.setSelection(TextSelection.create(tr.doc, pos + 1)).setMeta(mermaidSourceKey, meta);
}

export function closeMermaidSource(tr: Transaction): Transaction {
  const meta: Meta = { close: true };
  return tr.setMeta(mermaidSourceKey, meta);
}

/**
 * A transaction taking the caret out of hidden diagram source, or null when
 * it is not in any. Falls back to opening the diagram when the document has
 * no other text position (a note that is only a diagram).
 */
function rescueSelection(state: EditorState, dir: 1 | -1): Transaction | null {
  const { selection, doc } = state;
  const hidden = diagramAround(doc, selection.head);
  if (!hidden) return null;
  if (mermaidSourceOpenAt(state, hidden.pos)) return null;

  const end = hidden.pos + hidden.node.nodeSize;
  const target =
    dir === 1
      ? (visiblePosFrom(doc, end, 1) ?? visiblePosFrom(doc, hidden.pos, -1))
      : (visiblePosFrom(doc, hidden.pos, -1) ?? visiblePosFrom(doc, end, 1));
  if (target === null) return openMermaidSource(state.tr, hidden.pos);
  const anchor = selection.empty ? target : selection.anchor;
  return state.tr.setSelection(TextSelection.create(doc, anchor, target));
}

export const MermaidSourceExtension = Extension.create({
  name: "mermaidSource",

  addKeyboardShortcuts() {
    return {
      Escape: ({ editor }) => {
        const open = mermaidSourceKey.getState(editor.state);
        if (open === null || open === undefined) return false;
        editor.view.dispatch(closeMermaidSource(editor.state.tr));
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<number | null>({
        key: mermaidSourceKey,
        state: {
          init: () => null,
          apply(tr, open, _old, next) {
            const meta = tr.getMeta(mermaidSourceKey) as Meta | undefined;
            if (meta && "close" in meta) return null;
            const pos =
              meta && "open" in meta ? meta.open : open === null ? null : tr.mapping.map(open, 1);
            if (pos === null) return null;
            const node = next.doc.nodeAt(pos);
            if (!isDiagram(node)) return null;
            const { from, to } = next.selection;
            return from > pos && to < pos + node.nodeSize ? pos : null;
          },
        },
        appendTransaction(_trs, oldState, newState) {
          return rescueSelection(
            newState,
            newState.selection.head >= oldState.selection.head ? 1 : -1,
          );
        },
        props: {
          handleDOMEvents: {
            // Focus can return to a caret left inside source that has since closed.
            focus(view) {
              const tr = rescueSelection(view.state, 1);
              if (tr) view.dispatch(tr);
              return false;
            },
            blur(view) {
              if (mermaidSourceKey.getState(view.state) !== null) {
                view.dispatch(closeMermaidSource(view.state.tr));
              }
              return false;
            },
          },
        },
      }),
    ];
  },
});
