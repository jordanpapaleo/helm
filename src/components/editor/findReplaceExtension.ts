import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node } from "@tiptap/pm/model";

export interface FindReplacePluginState {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  matches: Array<{ from: number; to: number }>;
  activeMatchIndex: number;
  isOpen: boolean;
}

type FindReplaceAction =
  | { type: "OPEN" }
  | { type: "CLOSE" }
  | { type: "FIND"; query: string; caseSensitive: boolean; wholeWord: boolean }
  | { type: "NAVIGATE"; direction: 1 | -1 };

export const findReplacePluginKey = new PluginKey<FindReplacePluginState>("findReplace");

export function findMatchesInDocument(
  doc: Node,
  query: string,
  caseSensitive: boolean,
  wholeWord: boolean,
): Array<{ from: number; to: number }> {
  const matches: Array<{ from: number; to: number }> = [];
  if (!query) return matches;
  const q = caseSensitive ? query : query.toLowerCase();
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const text = node.text ?? "";
    const haystack = caseSensitive ? text : text.toLowerCase();
    let start = 0;
    let idx: number;
    while ((idx = haystack.indexOf(q, start)) !== -1) {
      if (wholeWord) {
        const before = idx > 0 ? text[idx - 1] : "";
        const after = idx + query.length < text.length ? text[idx + query.length] : "";
        if (/\w/.test(before) || /\w/.test(after)) {
          start = idx + 1;
          continue;
        }
      }
      matches.push({ from: pos + idx, to: pos + idx + query.length });
      start = idx + query.length;
    }
    return true;
  });
  return matches;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    findReplace: {
      openFind: () => ReturnType;
      closeFind: () => ReturnType;
      setFindQuery: (query: string, caseSensitive: boolean, wholeWord: boolean) => ReturnType;
      findNext: () => ReturnType;
      findPrevious: () => ReturnType;
      replaceCurrent: (replacement: string) => ReturnType;
      replaceAllMatches: (replacement: string) => ReturnType;
    };
  }
}

export const FindReplaceExtension = Extension.create({
  name: "findReplace",

  addProseMirrorPlugins() {
    return [
      new Plugin<FindReplacePluginState>({
        key: findReplacePluginKey,
        state: {
          init: (): FindReplacePluginState => ({
            query: "",
            caseSensitive: false,
            wholeWord: false,
            matches: [],
            activeMatchIndex: -1,
            isOpen: false,
          }),
          apply(tr, prev) {
            const action = tr.getMeta(findReplacePluginKey) as FindReplaceAction | undefined;
            if (!action) {
              if (!tr.docChanged || prev.matches.length === 0) return prev;
              const mapped = prev.matches
                .map((m) => ({
                  from: tr.mapping.map(m.from),
                  to: tr.mapping.map(m.to, -1),
                }))
                .filter((m) => m.from < m.to);
              return { ...prev, matches: mapped };
            }
            switch (action.type) {
              case "OPEN":
                return { ...prev, isOpen: true };
              case "CLOSE":
                return { ...prev, isOpen: false, query: "", matches: [], activeMatchIndex: -1 };
              case "FIND": {
                const { query, caseSensitive, wholeWord } = action;
                const matches = query
                  ? findMatchesInDocument(tr.doc, query, caseSensitive, wholeWord)
                  : [];
                return {
                  ...prev,
                  query,
                  caseSensitive,
                  wholeWord,
                  matches,
                  activeMatchIndex: matches.length > 0 ? 0 : -1,
                };
              }
              case "NAVIGATE": {
                if (prev.matches.length === 0) return prev;
                let idx = prev.activeMatchIndex + action.direction;
                if (idx < 0) idx = prev.matches.length - 1;
                if (idx >= prev.matches.length) idx = 0;
                return { ...prev, activeMatchIndex: idx };
              }
            }
          },
        },
        props: {
          decorations(state) {
            const s = findReplacePluginKey.getState(state);
            if (!s?.isOpen || !s.query || s.matches.length === 0) return DecorationSet.empty;
            const decos = s.matches.map((m, i) =>
              Decoration.inline(m.from, m.to, {
                class:
                  i === s.activeMatchIndex
                    ? "find-replace-highlight find-replace-highlight-active"
                    : "find-replace-highlight",
              }),
            );
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      openFind:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(findReplacePluginKey, { type: "OPEN" } as FindReplaceAction);
            dispatch(tr);
          }
          return true;
        },

      closeFind:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(findReplacePluginKey, { type: "CLOSE" } as FindReplaceAction);
            dispatch(tr);
          }
          return true;
        },

      setFindQuery:
        (query, caseSensitive, wholeWord) =>
        ({ tr, dispatch, state }) => {
          const s = findReplacePluginKey.getState(state);
          if (!s?.isOpen) return false;
          if (dispatch) {
            tr.setMeta(findReplacePluginKey, {
              type: "FIND",
              query,
              caseSensitive,
              wholeWord,
            } as FindReplaceAction);
            dispatch(tr);
          }
          return true;
        },

      findNext:
        () =>
        ({ tr, dispatch, state }) => {
          const s = findReplacePluginKey.getState(state);
          if (!s?.isOpen || s.matches.length === 0) return false;
          if (dispatch) {
            tr.setMeta(findReplacePluginKey, { type: "NAVIGATE", direction: 1 } as FindReplaceAction);
            dispatch(tr);
            setTimeout(() => {
              document
                .querySelector(".find-replace-highlight-active")
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 0);
          }
          return true;
        },

      findPrevious:
        () =>
        ({ tr, dispatch, state }) => {
          const s = findReplacePluginKey.getState(state);
          if (!s?.isOpen || s.matches.length === 0) return false;
          if (dispatch) {
            tr.setMeta(findReplacePluginKey, { type: "NAVIGATE", direction: -1 } as FindReplaceAction);
            dispatch(tr);
            setTimeout(() => {
              document
                .querySelector(".find-replace-highlight-active")
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 0);
          }
          return true;
        },

      replaceCurrent:
        (replacement) =>
        ({ tr, state, dispatch }) => {
          const s = findReplacePluginKey.getState(state);
          if (!s || s.activeMatchIndex < 0) return false;
          const match = s.matches[s.activeMatchIndex];
          if (!match) return false;
          if (dispatch) {
            tr.insertText(replacement, match.from, match.to);
            tr.setMeta(findReplacePluginKey, {
              type: "FIND",
              query: s.query,
              caseSensitive: s.caseSensitive,
              wholeWord: s.wholeWord,
            } as FindReplaceAction);
            dispatch(tr);
          }
          return true;
        },

      replaceAllMatches:
        (replacement) =>
        ({ tr, state, dispatch }) => {
          const s = findReplacePluginKey.getState(state);
          if (!s || s.matches.length === 0) return false;
          if (dispatch) {
            [...s.matches].reverse().forEach(({ from, to }) => tr.insertText(replacement, from, to));
            tr.setMeta(findReplacePluginKey, {
              type: "FIND",
              query: s.query,
              caseSensitive: s.caseSensitive,
              wholeWord: s.wholeWord,
            } as FindReplaceAction);
            dispatch(tr);
          }
          return true;
        },
    };
  },
});
