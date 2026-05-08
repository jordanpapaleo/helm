import { useState } from "react";
import type { TagNode } from "../../store/notes";

interface TagTreeProps {
  tree: Record<string, TagNode>;
  onSelectTag: (fullTag: string) => void;
  activeTag: string | null;
  showCount: boolean;
}

interface TagNodeItemProps {
  tag: string;
  fullPath: string;
  node: TagNode;
  depth?: number;
  onSelectTag: (fullTag: string) => void;
  activeTag: string | null;
  showCount: boolean;
}

function TagNodeItem({
  tag,
  fullPath,
  node,
  depth = 0,
  onSelectTag,
  activeTag,
  showCount,
}: TagNodeItemProps) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = Object.keys(node.children).length > 0;
  const isActive = activeTag === fullPath;
  const totalCount =
    node.notes.length + Object.values(node.children).reduce((s, c) => s + c.notes.length, 0);

  return (
    <div style={{ paddingLeft: `${depth * 12}px` }}>
      <div className="flex items-center">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="p-1 text-[var(--color-text-muted)] opacity-50 hover:opacity-100"
          >
            <span className="text-xs">{expanded ? "▼" : "▶"}</span>
          </button>
        ) : (
          <span className="w-6 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => onSelectTag(fullPath)}
          className={`flex flex-1 items-center gap-1 rounded px-2 py-1 text-sm transition-colors ${
            isActive
              ? "bg-[var(--color-surface)] text-[var(--color-text)]"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          }`}
        >
          <span>#{tag}</span>
          {showCount && <span className="ml-auto text-xs opacity-40">{totalCount}</span>}
        </button>
      </div>

      {expanded && hasChildren && (
        <div>
          {Object.entries(node.children).map(([childTag, childNode]) => (
            <TagNodeItem
              key={childTag}
              tag={childTag}
              fullPath={`${fullPath}/${childTag}`}
              node={childNode}
              depth={depth + 1}
              onSelectTag={onSelectTag}
              activeTag={activeTag}
              showCount={showCount}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TagTree({ tree, onSelectTag, activeTag, showCount }: TagTreeProps) {
  return (
    <div>
      {Object.entries(tree)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([tag, node]) => (
          <TagNodeItem
            key={tag}
            tag={tag}
            fullPath={tag}
            node={node}
            onSelectTag={onSelectTag}
            activeTag={activeTag}
            showCount={showCount}
          />
        ))}
    </div>
  );
}
