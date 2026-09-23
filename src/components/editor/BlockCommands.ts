import { type CommandProps, Extension } from "@tiptap/core";
import type { ResolvedPos } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

/**
 * Depth of the node a block command should act on.
 *
 * Inside a list the useful unit is the whole item — duplicating the paragraph
 * within a list item would stack two paragraphs in one bullet instead of making
 * a new bullet. Everywhere else the caret's own parent block is the unit.
 */
function blockDepth($pos: ResolvedPos): number {
  for (let d = $pos.depth; d >= 1; d--) {
    const name = $pos.node(d).type.name;
    if (name === "listItem" || name === "taskItem") return d;
  }
  return $pos.depth;
}

/**
 * Swap the caret's block with the sibling on the given side, carrying the caret
 * along so repeated presses keep moving the same block.
 *
 * Returns false at the edges (no sibling to swap with) so the keybinding falls
 * through to whatever else is listening.
 */
function moveBlock(
  { state, tr, dispatch }: Pick<CommandProps, "state" | "tr" | "dispatch">,
  side: "up" | "down",
): boolean {
  const { $from } = state.selection;
  const depth = blockDepth($from);
  const parent = $from.node(depth - 1);
  const index = $from.index(depth - 1);

  const atEdge = side === "up" ? index === 0 : index === parent.childCount - 1;
  if (atEdge) return false;

  const start = $from.before(depth);
  const end = $from.after(depth);
  const block = $from.node(depth);
  // Moving up, the block lands where its previous sibling starts. Moving down,
  // the removal shifts the next sibling back to `start`, so the slot past that
  // sibling is one sibling-width along.
  const target =
    side === "up"
      ? start - parent.child(index - 1).nodeSize
      : start + parent.child(index + 1).nodeSize;

  if (dispatch) {
    const caretOffset = $from.pos - start;
    tr.delete(start, end);
    tr.insert(target, block);
    tr.setSelection(TextSelection.near(tr.doc.resolve(target + caretOffset)));
  }
  return true;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    blockCommands: {
      /** Insert a copy of the block holding the caret directly below it. */
      duplicateBlock: () => ReturnType;
      /** Swap the block holding the caret with its previous sibling. */
      moveBlockUp: () => ReturnType;
      /** Swap the block holding the caret with its next sibling. */
      moveBlockDown: () => ReturnType;
      /** Remove the block holding the caret. */
      deleteBlock: () => ReturnType;
    };
  }
}

export const BlockCommands = Extension.create({
  name: "blockCommands",

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-d": () => this.editor.commands.duplicateBlock(),
      "Mod-Shift-k": () => this.editor.commands.deleteBlock(),
      "Alt-ArrowUp": () => this.editor.commands.moveBlockUp(),
      "Alt-ArrowDown": () => this.editor.commands.moveBlockDown(),
    };
  },

  addCommands() {
    return {
      duplicateBlock:
        () =>
        ({ state, tr, dispatch }) => {
          const { $from } = state.selection;
          const depth = blockDepth($from);
          const block = $from.node(depth);
          if (dispatch) tr.insert($from.after(depth), block.copy(block.content));
          return true;
        },

      moveBlockUp: () => (props) => moveBlock(props, "up"),

      moveBlockDown: () => (props) => moveBlock(props, "down"),

      deleteBlock:
        () =>
        ({ state, tr, dispatch }) => {
          const { $from } = state.selection;
          const depth = blockDepth($from);
          const start = $from.before(depth);
          const end = $from.after(depth);

          if (dispatch) {
            tr.delete(start, end);
            // Deleting the document's only block leaves nothing to type on, so
            // put a fresh paragraph in its place.
            if (tr.doc.childCount === 0) {
              tr.insert(0, state.schema.nodes.paragraph.create());
            }
            tr.setSelection(
              TextSelection.near(tr.doc.resolve(Math.min(start, tr.doc.content.size))),
            );
          }
          return true;
        },
    };
  },
});
